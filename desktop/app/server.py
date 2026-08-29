import os
import re
import sys
import uuid
import threading
import subprocess
import unicodedata
import json
import queue
import time
from download_jobs import complete_item as complete_download_item, enqueue as enqueue_download_batch, snapshot as download_snapshot, update_item as update_download_item
from urllib.parse import urlparse
from flask import Flask, jsonify, request, send_file, send_from_directory, render_template
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, TIT2, TPE1, TALB, TYER, TCON, TRCK, POPM

_source_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_bundle_root = getattr(sys, "_MEIPASS", _source_root)
frontend_dir = os.path.join(_bundle_root, 'frontend', 'dist')
app = Flask(__name__, 
            static_folder=os.path.join(frontend_dir, 'assets'),
            template_folder=frontend_dir)

@app.after_request
def add_header(response):
    if 'Cache-Control' not in response.headers:
        response.cache_control.no_store = True
    return response

# Portable default. A custom library can be supplied without baking a local
# drive path into the release.
DEFAULT_MUSIC_DIR = os.environ.get(
    "QUE_SUENE_MUSIC_DIR",
    os.path.join(os.path.expanduser("~"), "Music"),
)
if not os.path.isdir(DEFAULT_MUSIC_DIR):
    DEFAULT_MUSIC_DIR = os.path.abspath("descargas")

selected_dir = DEFAULT_MUSIC_DIR
party_server_url = os.environ.get("QUE_SUENE_PARTY_SERVER_URL", "http://127.0.0.1:8000").rstrip("/")
party_mode_active = False
party_queue = []

SETTINGS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "settings.json")
PLAYLISTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "playlists.json")
WISHLIST_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wishlist.json")

# Base directory of the project (parent of /app)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# SpotDL executable in the project's virtual environment
SPOTDL_EXE = os.path.join(BASE_DIR, ".venv", "Scripts", "spotdl.exe")
SPOTDL_COMMAND = [sys.executable, "--qsuene-spotdl"] if getattr(sys, "frozen", False) else [SPOTDL_EXE]
# Output folder for downloaded songs
DOWNLOADS_DIR = os.path.join(BASE_DIR, "descargas")
PARTY_DOWNLOADS_DIR = os.path.join(BASE_DIR, "ModoFiesta")

# In-memory download state { item_id: { status, errorMsg } }
_download_state = {}
_download_lock = threading.Lock()
_download_batch_active = False

def load_settings():
    global selected_dir, party_server_url
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                folder = data.get("last_folder")
                if folder and os.path.exists(folder):
                    selected_dir = os.path.normpath(folder)
                configured_party_url = str(data.get("party_server_url", "")).strip().rstrip("/")
                if configured_party_url:
                    party_server_url = configured_party_url
        except Exception:
            pass

def save_settings():
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "last_folder": selected_dir,
                "party_server_url": party_server_url,
            }, f, indent=4)
    except Exception:
        pass

# Load saved directory settings
load_settings()

def normalize_string(s):
    if not s:
        return ""
    s = s.lower()
    s = ''.join(c for c in unicodedata.normalize('NFD', s)
                if unicodedata.category(c) != 'Mn')
    return s.strip()

def get_mp3_metadata(file_path):
    filename = os.path.basename(file_path)
    title = ""
    artist = ""
    album = ""
    year = ""
    genre = ""
    track = ""
    rating = 0
    
    # Fallback from filename
    name_sin_ext, _ = os.path.splitext(filename)
    if " - " in name_sin_ext:
        parts = name_sin_ext.split(" - ", 1)
        artist_fallback = parts[0].strip()
        title_fallback = parts[1].strip()
    else:
        artist_fallback = "Desconocido"
        title_fallback = name_sin_ext.strip()
        
    duration = 0
    bitrate = 0
    size_mb = os.path.getsize(file_path) / (1024 * 1024)
    
    try:
        audio = MP3(file_path)
        duration = audio.info.length
        bitrate = audio.info.bitrate / 1000
        
        # Read ID3 tags
        tags = audio.tags
        if tags:
            if 'TIT2' in tags:
                title = tags['TIT2'].text[0]
            if 'TPE1' in tags:
                artist = tags['TPE1'].text[0]
            if 'TALB' in tags:
                album = tags['TALB'].text[0]
            if 'TYER' in tags:
                year = tags['TYER'].text[0]
            elif 'TDRC' in tags:
                year = str(tags['TDRC'].text[0])
            if 'TCON' in tags:
                genre = tags['TCON'].text[0]
            if 'TRCK' in tags:
                track = tags['TRCK'].text[0]
                
            # Read POPM rating
            for key in tags.keys():
                if key.startswith('POPM'):
                    rating_raw = tags[key].rating
                    if rating_raw > 0:
                        # Use the closest value from the same scale written by
                        # /api/rate_song. The previous thresholds interpreted
                        # the stored value 32 (one star) as two stars.
                        rating_scale = {1: 32, 2: 64, 3: 128, 4: 196, 5: 255}
                        rating = min(rating_scale, key=lambda stars: abs(rating_scale[stars] - rating_raw))
                    break
    except Exception:
        pass
        
    if not title:
        title = title_fallback
    if not artist:
        artist = artist_fallback
        
    return {
        "path": file_path,
        "filename": filename,
        "title": title,
        "artist": artist,
        "album": album or "Desconocido",
        "year": year or "",
        "genre": genre or "Desconocido",
        "track": track or "",
        "duration": duration,
        "bitrate": round(bitrate),
        "size_mb": round(size_mb, 2),
        "rating": rating
    }

@app.route('/')
def index():
    return render_template("index.html")


@app.route('/logo.svg')
def logo():
    """Serve the brand mark from the Vite build root (Flask serves assets separately)."""
    return send_from_directory(frontend_dir, 'logo.svg', mimetype='image/svg+xml')

@app.route('/api/select_folder', methods=['POST'])
def select_folder():
    global selected_dir
    import tkinter as tk
    from tkinter import filedialog
    
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    
    try:
        folder_path = filedialog.askdirectory(
            parent=root,
            title="Seleccionar Carpeta de Música",
            initialdir=selected_dir
        )
        root.destroy()
        if folder_path:
            selected_dir = os.path.normpath(folder_path)
            save_settings()
            return jsonify({"folder_path": selected_dir})
        return jsonify({"folder_path": selected_dir})
    except Exception as e:
        root.destroy()
        return jsonify({"error": str(e)}), 500

@app.route('/api/current_folder', methods=['GET'])
def get_current_folder():
    return jsonify({"folder_path": selected_dir})


def active_library_roots(include_party=False):
    """Return the physical roots that compose the current virtual library."""
    roots = []
    if selected_dir and os.path.isdir(selected_dir):
        roots.append((os.path.realpath(selected_dir), "library"))
    if (party_mode_active or include_party) and os.path.isdir(PARTY_DOWNLOADS_DIR):
        party_root = os.path.realpath(PARTY_DOWNLOADS_DIR)
        if all(os.path.normcase(root) != os.path.normcase(party_root) for root, _ in roots):
            roots.append((party_root, "party"))
    return roots

@app.route('/api/songs', methods=['GET'])
def list_songs():
    # The frontend can warm the composite party library while normal mode is
    # still active, avoiding a filesystem scan when the DJ presses the switch.
    include_party = str(request.args.get("include_party", "")).lower() in {"1", "true", "yes"}
    roots = active_library_roots(include_party=include_party)
    if not roots:
        return jsonify({"songs": [], "error": f"El directorio '{selected_dir}' no existe."})
        
    songs = []
    seen_paths = set()
    try:
        for library_root, source in roots:
            for root, _, files in os.walk(library_root):
                for f in files:
                    if f.lower().endswith(".mp3"):
                        full_path = os.path.realpath(os.path.join(root, f))
                        normalized_path = os.path.normcase(full_path)
                        if normalized_path in seen_paths:
                            continue
                        seen_paths.add(normalized_path)
                        metadata = get_mp3_metadata(full_path)
                        metadata["librarySource"] = source
                        songs.append(metadata)
        # Sort alphabetically by title
        songs.sort(key=lambda x: normalize_string(x["title"]))
    except Exception as e:
        return jsonify({"songs": [], "error": str(e)}), 500
        
    return jsonify({"songs": songs})

@app.route('/api/save_metadata', methods=['POST'])
def save_metadata():
    data = request.json or {}
    file_path = data.get("path")
    if not file_path or not os.path.exists(file_path):
        return jsonify({"error": "Archivo no encontrado"}), 404
        
    title = data.get("title", "").strip()
    artist = data.get("artist", "").strip()
    album = data.get("album", "").strip()
    year = data.get("year", "").strip()
    genre = data.get("genre", "").strip()
    track = data.get("track", "").strip()
    
    try:
        # Load or initialize ID3 tags
        try:
            audio = MP3(file_path)
            if audio.tags is None:
                audio.add_tags()
            tags = audio.tags
        except Exception:
            tags = ID3(file_path)
            
        # Set tags
        tags.add(TIT2(encoding=3, text=title))
        tags.add(TPE1(encoding=3, text=artist))
        tags.add(TALB(encoding=3, text=album))
        tags.add(TYER(encoding=3, text=year))
        tags.add(TCON(encoding=3, text=genre))
        tags.add(TRCK(encoding=3, text=track))
        
        tags.save(file_path)
        
        # Get refreshed metadata info
        info = get_mp3_metadata(file_path)
        return jsonify({"success": True, "metadata": info})
    except Exception as e:
        return jsonify({"error": f"Error al guardar metadatos: {str(e)}"}), 500

@app.route('/api/stream')
def stream_audio():
    path = request.args.get('path')
    if not path or not os.path.exists(path):
        return "Archivo no encontrado", 404
    # Flask send_file supports HTTP Range Requests natively for seeking
    return send_file(path, mimetype="audio/mpeg")

@app.route('/api/rate_song', methods=['POST'])
def rate_song():
    data = request.json or {}
    file_path = data.get("path")
    rating = data.get("rating")
    
    if not file_path or not os.path.exists(file_path):
        return jsonify({"error": "Archivo no encontrado"}), 404
        
    try:
        rating = int(rating)
        if not (0 <= rating <= 5):
            return jsonify({"error": "Valor de calificación inválido (debe ser entre 0 y 5)"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "Calificación debe ser un número entero"}), 400
        
    # Map star rating to POPM value
    # 1 star = 32, 2 stars = 64, 3 stars = 128, 4 stars = 196, 5 stars = 255, 0 stars = 0
    rating_map = {0: 0, 1: 32, 2: 64, 3: 128, 4: 196, 5: 255}
    rating_val = rating_map[rating]
    
    try:
        try:
            audio = MP3(file_path)
            if audio.tags is None:
                audio.add_tags()
            tags = audio.tags
        except Exception:
            tags = ID3(file_path)
            
        # Remove existing POPM tags
        for key in list(tags.keys()):
            if key.startswith('POPM'):
                del tags[key]
                
        if rating_val > 0:
            tags.add(POPM(email='no@email', rating=rating_val))
            
        tags.save(file_path)
        
        info = get_mp3_metadata(file_path)
        return jsonify({"success": True, "metadata": info})
    except Exception as e:
        return jsonify({"error": f"Error al guardar calificación: {str(e)}"}), 500

@app.route('/api/delete_song', methods=['POST'])
def delete_song():
    data = request.json or {}
    file_path = data.get("path")
    if not file_path or not os.path.exists(file_path):
        return jsonify({"error": "Archivo no encontrado en el disco"}), 404

    file_path = is_allowed_library_song(file_path)
    if not file_path:
        return jsonify({"error": "El archivo no pertenece a la biblioteca"}), 403
        
    import gc
    import time
    
    deleted = False
    last_err = ""
    for attempt in range(4):
        try:
            os.remove(file_path)
            deleted = True
            break
        except PermissionError as pe:
            last_err = str(pe)
            gc.collect()
            time.sleep(0.15)
        except Exception as e:
            return jsonify({"error": f"Error al eliminar archivo: {str(e)}"}), 500
            
    if not deleted:
        return jsonify({"error": "No se pudo eliminar el archivo porque está en uso por el reproductor o el sistema. Detén la canción e intenta de nuevo."}), 409
        
    # Also clean up from any playlist that referenced this file
    playlists = load_playlists()
    changed = False
    norm_target = os.path.normcase(os.path.realpath(file_path))
    for pl_name in list(playlists.keys()):
        orig_len = len(playlists[pl_name])
        playlists[pl_name] = [p for p in playlists[pl_name] if os.path.normcase(os.path.realpath(p)) != norm_target]
        if len(playlists[pl_name]) != orig_len:
            changed = True
    if changed:
        save_playlists(playlists)
        
    return jsonify({"success": True, "playlists": playlists})

def load_playlists():
    if os.path.exists(PLAYLISTS_FILE):
        try:
            with open(PLAYLISTS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                cleaned = {}
                for pl_name, paths in data.items():
                    seen = set()
                    unique_paths = []
                    for p in paths:
                        norm = os.path.normpath(p).lower()
                        if norm not in seen:
                            seen.add(norm)
                            unique_paths.append(p)
                    cleaned[pl_name] = unique_paths
                return cleaned
        except Exception:
            pass
    return {}

def save_playlists(playlists):
    try:
        with open(PLAYLISTS_FILE, "w", encoding="utf-8") as f:
            json.dump(playlists, f, indent=4)
    except Exception:
        pass


def is_allowed_library_song(file_path):
    """Return a canonical MP3 path only when it belongs to app-managed data."""
    if not file_path:
        return None

    canonical_path = os.path.realpath(file_path)
    if not os.path.isfile(canonical_path) or os.path.splitext(canonical_path)[1].lower() != ".mp3":
        return None

    normalized_target = os.path.normcase(canonical_path)
    for root, _source in active_library_roots():
        library_root = os.path.normcase(root)
        try:
            if os.path.commonpath([normalized_target, library_root]) == library_root:
                return canonical_path
        except ValueError:
            continue

    playlist_paths = {
        os.path.normcase(os.path.realpath(path))
        for paths in load_playlists().values()
        for path in paths
    }
    return canonical_path if normalized_target in playlist_paths else None


@app.route('/api/party/config', methods=['GET', 'POST'])
def party_config():
    global party_server_url
    if request.method == 'POST':
        data = request.json or {}
        candidate = str(data.get("server_url", "")).strip().rstrip("/")
        parsed = urlparse(candidate)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return jsonify({"error": "La URL debe comenzar por http:// o https://"}), 400
        party_server_url = candidate
        save_settings()
    return jsonify({"server_url": party_server_url})


@app.route('/api/party/state', methods=['GET', 'POST'])
def party_state():
    global party_mode_active
    if request.method == 'POST':
        data = request.json or {}
        party_mode_active = bool(data.get("active", False))
    return jsonify({
        "active": party_mode_active,
        "enabled": party_mode_active,
        "queue": party_queue,
        "download_directory": PARTY_DOWNLOADS_DIR if party_mode_active else selected_dir,
    })

@app.route('/api/party/status', methods=['GET'])
def party_status():
    """Compatibility endpoint used by the DJ UI polling loop."""
    return jsonify({"enabled": party_mode_active, "queue": party_queue})

@app.route('/api/party/dequeue', methods=['POST'])
def party_dequeue():
    """Advance the local fallback queue when a track finishes."""
    if party_queue:
        return jsonify({"success": True, "song": party_queue.pop(0), "queue": party_queue})
    return jsonify({"success": False, "song": None, "queue": []})


@app.route('/api/bulk_genre', methods=['POST'])
def bulk_genre():
    data = request.json or {}
    genre = data.get("genre", "").strip()
    paths = data.get("paths", [])
    
    if not genre:
        return jsonify({"error": "El género no puede estar vacío"}), 400
    if not paths:
        return jsonify({"error": "No se especificaron canciones para actualizar"}), 400
        
    updated_count = 0
    errors = []
    
    for path in paths:
        if os.path.exists(path):
            try:
                try:
                    audio = MP3(path)
                    if audio.tags is None:
                        audio.add_tags()
                    tags = audio.tags
                except Exception:
                    tags = ID3(path)
                    
                tags.add(TCON(encoding=3, text=genre))
                tags.save(path)
                updated_count += 1
            except Exception as e:
                errors.append(f"{os.path.basename(path)}: {str(e)}")
                
    return jsonify({
        "success": True, 
        "updated_count": updated_count, 
        "errors": errors
    })

@app.route('/api/playlists', methods=['GET'])
def get_playlists():
    playlists = load_playlists()
    return jsonify({"playlists": playlists})

@app.route('/api/playlists', methods=['POST'])
def create_playlist():
    data = request.json or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "El nombre de la lista de reproducción no puede estar vacío"}), 400
        
    playlists = load_playlists()
    if name in playlists:
        return jsonify({"error": "Ya existe una lista de reproducción con este nombre"}), 400
        
    playlists[name] = []
    save_playlists(playlists)
    return jsonify({"success": True, "playlists": playlists})

@app.route('/api/playlists', methods=['DELETE'])
def delete_playlist():
    data = request.json or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Nombre de lista no especificado"}), 400
        
    playlists = load_playlists()
    if name in playlists:
        del playlists[name]
        save_playlists(playlists)
        return jsonify({"success": True, "playlists": playlists})
    return jsonify({"error": "Lista no encontrada"}), 404

@app.route('/api/playlists/rename', methods=['POST'])
def rename_playlist():
    data = request.json or {}
    old_name = data.get("old_name", "").strip()
    new_name = data.get("new_name", "").strip()
    
    if not old_name or not new_name:
        return jsonify({"error": "Nombres de lista requeridos"}), 400
        
    if old_name == new_name:
        return jsonify({"success": True, "playlists": load_playlists()})
        
    playlists = load_playlists()
    if old_name not in playlists:
        return jsonify({"error": "Lista de reproducción no encontrada"}), 404
        
    if new_name in playlists:
        return jsonify({"error": "Ya existe una lista con este nombre"}), 400
        
    updated = {}
    for k, v in playlists.items():
        if k == old_name:
            updated[new_name] = v
        else:
            updated[k] = v
            
    save_playlists(updated)
    return jsonify({"success": True, "playlists": updated})

@app.route('/api/playlists/songs', methods=['GET'])

def get_playlist_songs():
    playlist_name = request.args.get("name", "").strip()
    if not playlist_name:
        return jsonify({"error": "Nombre de lista no especificado"}), 400
        
    playlists = load_playlists()
    if playlist_name not in playlists:
        return jsonify({"error": "Lista de reproducción no encontrada", "songs": []}), 404
        
    paths = playlists[playlist_name]
    songs = []
    for p in paths:
        if os.path.exists(p):
            try:
                meta = get_mp3_metadata(p)
                songs.append(meta)
            except Exception:
                pass
                
    return jsonify({"success": True, "songs": songs, "name": playlist_name})

@app.route('/api/playlists/add', methods=['POST'])
def add_to_playlist():
    data = request.json or {}
    playlist_name = data.get("playlist_name", "").strip()
    song_path = data.get("song_path", "").strip()
    
    if not playlist_name or not song_path:
        return jsonify({"error": "Faltan parámetros requeridos"}), 400
        
    playlists = load_playlists()
    if playlist_name not in playlists:
        playlists[playlist_name] = []
        
    norm_song_path = os.path.normpath(song_path)
    existing_norms = [os.path.normpath(p).lower() for p in playlists[playlist_name]]
    if norm_song_path.lower() in existing_norms:
        return jsonify({
            "error": f"La canción ya pertenece a la lista '{playlist_name}'",
            "already_exists": True,
            "playlists": playlists
        }), 409
        
    playlists[playlist_name].append(norm_song_path)
    save_playlists(playlists)
        
    return jsonify({"success": True, "playlists": playlists})

@app.route('/api/playlists/remove', methods=['POST'])
def remove_from_playlist():
    data = request.json or {}
    playlist_name = data.get("playlist_name", "").strip()
    song_path = data.get("song_path", "").strip()
    
    if not playlist_name or not song_path:
        return jsonify({"error": "Faltan parámetros requeridos"}), 400
        
    playlists = load_playlists()
    if playlist_name not in playlists:
        return jsonify({"error": "Lista de reproducción no encontrada"}), 404
        
    norm_song_path = os.path.normpath(song_path).lower()
    playlists[playlist_name] = [p for p in playlists[playlist_name] if os.path.normpath(p).lower() != norm_song_path]
    save_playlists(playlists)
        
    return jsonify({"success": True, "playlists": playlists})


# ─────────────────────────────────────────────
#  WISHLIST  —  helpers
# ─────────────────────────────────────────────

def load_wishlist():
    if os.path.exists(WISHLIST_FILE):
        try:
            with open(WISHLIST_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []

def save_wishlist(items):
    try:
        with open(WISHLIST_FILE, "w", encoding="utf-8") as f:
            json.dump(items, f, indent=4, ensure_ascii=False)
    except Exception:
        pass

def _merge_download_state(items):
    """Merge in-memory download status into persisted items list."""
    with _download_lock:
        for item in items:
            state = _download_state.get(item.get("id"))
            if state:
                item["status"] = state["status"]
                item["errorMsg"] = state.get("errorMsg", "")
                item["progress"] = state.get("progress", item.get("progress", 0))
                item["stage"] = state.get("stage", item.get("stage", ""))
    return items

def _set_item_status(item_id, status, error_msg="", progress=None, stage=None):
    """Helper: update in-memory state and persist to disk atomically."""
    with _download_lock:
        previous = _download_state.get(item_id, {})
        _download_state[item_id] = {
            "status": status,
            "errorMsg": error_msg,
            "progress": previous.get("progress", 0) if progress is None else progress,
            "stage": previous.get("stage", "") if stage is None else stage,
        }
    all_items = load_wishlist()
    for w in all_items:
        if w.get("id") == item_id:
            w["status"] = status
            w["errorMsg"] = error_msg
            if progress is not None:
                w["progress"] = progress
            if stage is not None:
                w["stage"] = stage
    save_wishlist(all_items)
    update_download_item(item_id, status, error_msg, progress, stage)


def _set_item_progress(item_id, progress, stage="Descargando"):
    """Update live progress without rewriting the wishlist JSON on every tick."""
    normalized = max(0, min(99, int(progress)))
    with _download_lock:
        state = _download_state.setdefault(item_id, {"status": "downloading", "errorMsg": ""})
        state.update({"status": "downloading", "progress": normalized, "stage": stage})
    update_download_item(item_id, "downloading", "", normalized, stage)


def _audio_file_snapshot(directory):
    """Return exact file signatures so an old download is never moved by mistake."""
    try:
        return {
            name: (os.stat(os.path.join(directory, name)).st_mtime_ns, os.path.getsize(os.path.join(directory, name)))
            for name in os.listdir(directory)
            if os.path.isfile(os.path.join(directory, name))
            and name.lower().endswith(('.mp3', '.m4a', '.flac', '.ogg'))
        }
    except OSError:
        return {}


def _move_new_files(before_files, dest_dir):
    """
    Compare DOWNLOADS_DIR contents before/after spotdl run.
    Move any new or modified audio files to dest_dir. Returns final file paths.
    """
    if not dest_dir or not os.path.exists(dest_dir):
        return []
    norm_dest = os.path.normpath(dest_dir).lower()
    norm_dl = os.path.normpath(DOWNLOADS_DIR).lower()
    try:
        after_files = _audio_file_snapshot(DOWNLOADS_DIR)
        target_files = {
            name for name, signature in after_files.items()
            if before_files.get(name) != signature
        }

        if norm_dest == norm_dl:
            return [os.path.realpath(os.path.join(DOWNLOADS_DIR, name)) for name in target_files]

        os.makedirs(dest_dir, exist_ok=True)
        import shutil
        final_paths = []
        for fname in target_files:
            src = os.path.join(DOWNLOADS_DIR, fname)
            dst = os.path.join(dest_dir, fname)
            try:
                if os.path.exists(dst):
                    try:
                        os.remove(dst)
                    except Exception:
                        pass
                shutil.move(src, dst)
                final_paths.append(os.path.realpath(dst))
            except Exception:
                try:
                    shutil.copy2(src, dst)
                    os.remove(src)
                    final_paths.append(os.path.realpath(dst))
                except Exception:
                    pass
        return final_paths
    except Exception:
        return []


def _run_spotdl_with_progress(cmd, item_id, timeout=300):
    """Run SpotDL while consuming Rich progress output instead of buffering it."""
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=0,
        cwd=BASE_DIR,
    )
    chunks = queue.Queue()

    def read_output():
        while True:
            raw_chunk = os.read(process.stdout.fileno(), 256)
            if not raw_chunk:
                break
            chunks.put(raw_chunk.decode("utf-8", errors="replace"))
        chunks.put(None)

    threading.Thread(target=read_output, daemon=True).start()
    deadline = time.monotonic() + timeout
    output_tail = ""
    last_progress = 0
    reader_done = False
    phase_markers = (
        ("searching", 18, "Buscando fuente"),
        ("downloading", 40, "Descargando audio"),
        ("converting", 72, "Procesando audio"),
        ("embedding", 90, "Guardando metadatos"),
        ("saving", 94, "Finalizando archivo"),
    )
    while process.poll() is None:
        if time.monotonic() >= deadline and process.poll() is None:
            process.kill()
            raise subprocess.TimeoutExpired(cmd, timeout)
        try:
            chunk = chunks.get(timeout=.2)
        except queue.Empty:
            continue
        if chunk is None:
            reader_done = True
            continue
        output_tail = (output_tail + chunk)[-4000:]
        percentages = re.findall(r"(?<!\d)(\d{1,3}(?:\.\d+)?)\s*%", output_tail)
        if percentages:
            progress = min(99, int(float(percentages[-1])))
            if progress >= last_progress + 2:
                last_progress = progress
                stage = "Finalizando" if progress >= 90 else ("Procesando audio" if progress >= 70 else "Descargando")
                _set_item_progress(item_id, progress, stage)
        # En una tubería sin TTY SpotDL no siempre imprime porcentajes, pero sí
        # sus fases. Ofrecemos un avance conservador y real, nunca un porcentaje
        # sintético basado únicamente en tiempo transcurrido.
        lowered_output = output_tail.lower()
        for marker, phase_progress, phase_stage in phase_markers:
            if marker in lowered_output and phase_progress > last_progress:
                last_progress = phase_progress
                _set_item_progress(item_id, phase_progress, phase_stage)

    # SpotDL ya terminó: no debemos mantener bloqueado el ciclo esperando a
    # que un descendiente que heredó stdout cierre también la tubería. Drenamos
    # únicamente lo que ya esté disponible y continuamos con el movimiento del
    # archivo, la reindexación y las notificaciones.
    drain_deadline = time.monotonic() + 1.0
    while not reader_done and time.monotonic() < drain_deadline:
        try:
            chunk = chunks.get(timeout=.05)
        except queue.Empty:
            continue
        if chunk is None:
            reader_done = True
        else:
            output_tail = (output_tail + chunk)[-4000:]
    return process.returncode, output_tail



def _run_spotdl_downloads(pending_items, use_party_directory=False):
    """
    Background thread: runs spotdl sequentially per item.
    State machine: pending → searching → downloading → moving_to_library → completed | error
    Publishes a library reindex signal after each completed item, then removes
    completed entries from the wishlist when the batch finishes.
    """
    global selected_dir
    os.makedirs(DOWNLOADS_DIR, exist_ok=True)
    batch_destination = PARTY_DOWNLOADS_DIR if use_party_directory else selected_dir
    if not batch_destination or (not use_party_directory and not os.path.exists(batch_destination)):
        batch_destination = DOWNLOADS_DIR
    os.makedirs(batch_destination, exist_ok=True)

    # Output template: {artists} - {title}.{output-ext}
    OUTPUT_TEMPLATE = os.path.join(DOWNLOADS_DIR, "{artists} - {title}.{output-ext}")

    completed_ids = []
    completed_party_requests_result = []

    for item in pending_items:
        item_id = item["id"]
        query = item.get("query", "").strip()
        if not query:
            _set_item_status(item_id, "error", "Sin consulta de búsqueda")
            continue

        # ── SEARCHING ──────────────────────────────────────────────────
        _set_item_status(item_id, "searching", progress=5, stage="Buscando coincidencia")

        # Snapshot DOWNLOADS_DIR before spotdl runs
        before_files = _audio_file_snapshot(DOWNLOADS_DIR)

        # ── DOWNLOADING ────────────────────────────────────────────────
        _set_item_status(item_id, "downloading", progress=10, stage="Preparando descarga")

        try:
            cmd = [
                *SPOTDL_COMMAND, "download", query,
                "--output", OUTPUT_TEMPLATE,
                "--simple-tui",
            ]
            return_code, process_output = _run_spotdl_with_progress(cmd, item_id, timeout=300)

            if return_code == 0:
                # ── MOVING TO LIBRARY ──────────────────────────────────
                _set_item_status(item_id, "moving_to_library", progress=98, stage="Agregando a la biblioteca")

                # Move new files to the batch destination. During a party this
                # is the separate ModoFiesta physical directory.
                final_paths = _move_new_files(before_files, batch_destination)
                destination_is_downloads = (
                    os.path.normcase(os.path.realpath(batch_destination))
                    == os.path.normcase(os.path.realpath(DOWNLOADS_DIR))
                )
                if not final_paths:
                    _set_item_status(
                        item_id,
                        "error",
                        "SpotDL terminó sin producir un archivo de audio nuevo",
                    )
                    continue

                # ── COMPLETED ──────────────────────────────────────────
                completed_song = None
                if final_paths:
                    completed_song = get_mp3_metadata(final_paths[0])
                    completed_song["librarySource"] = "party" if use_party_directory else "library"
                _set_item_status(item_id, "completed", progress=100, stage="Disponible")
                completed_ids.append(item_id)

                # Notify the frontend after every individual library change,
                # instead of waiting for the complete download batch.
                with _download_lock:
                    _download_state["__needsReindex__"] = True
                    _download_state["__completedCount__"] = (
                        int(_download_state.get("__completedCount__", 0)) + 1
                    )
                    completed_party_requests = _download_state.setdefault("__completedPartyRequests__", [])
                    completed_request = None
                    if item.get("source") == "party_guest" and item.get("partyRequestId"):
                        completed_request = {
                            "partyRequestId": item["partyRequestId"],
                            "title": item.get("title") or item.get("query", "Canción solicitada"),
                            "artist": item.get("artist", ""),
                        }
                        completed_party_requests.append(completed_request)
                        completed_party_requests_result.append(completed_request)
                # Durable one-song event: the Flask process sees it on its next
                # poll even though downloads run in a separate worker process.
                complete_download_item(item_id, completed_request, completed_song)

            else:
                err = (process_output or "Error desconocido").strip()[-200:]
                _set_item_status(item_id, "error", err)

        except subprocess.TimeoutExpired:
            _set_item_status(item_id, "error", "Tiempo de espera agotado (5 min)")
        except Exception as e:
            _set_item_status(item_id, "error", str(e)[:200])

    # ── POST-BATCH: remove completed items from the wishlist ─────────
    if completed_ids:
        all_items = load_wishlist()
        # Keep only items that are NOT completed
        remaining = [w for w in all_items if w.get("id") not in completed_ids]
        save_wishlist(remaining)

        # Clean up in-memory state for completed ids
        for cid in completed_ids:
            with _download_lock:
                _download_state.pop(cid, None)
    return len(completed_ids), completed_party_requests_result


def _run_spotdl_downloads_guarded(pending_items, use_party_directory=False):
    """Run one batch and always release the server-side batch lock."""
    global _download_batch_active
    try:
        current_batch = pending_items
        while current_batch:
            _run_spotdl_downloads(current_batch, use_party_directory)
            # Requests may arrive while a batch is running. Preserve the
            # five-song automatic policy without retrying failed items forever.
            newly_pending = [
                item for item in load_wishlist()
                if item.get("status") == "pending"
            ]
            current_batch = newly_pending if len(newly_pending) >= 5 else []
    finally:
        with _download_lock:
            _download_batch_active = False


# ─────────────────────────────────────────────
#  WISHLIST  —  rutas API
# ─────────────────────────────────────────────

@app.route('/api/wishlist', methods=['GET'])
def get_wishlist():
    items = load_wishlist()
    items = _merge_download_state(items)
    # Sort descending by addedAt (most recent first)
    items.sort(key=lambda x: x.get("addedAt", ""), reverse=True)
    return jsonify({"wishlist": items})


@app.route('/api/wishlist/add', methods=['POST'])
def add_to_wishlist():
    data = request.json or {}
    query = data.get("query", "").strip()
    title = data.get("title", "").strip()
    artist = data.get("artist", "").strip()
    source = data.get("source", "local").strip()
    requested_by = data.get("requestedBy", "").strip()[:80]
    party_request_id = data.get("partyRequestId", "").strip()[:80]

    if not query and not title:
        return jsonify({"error": "Se requiere al menos un campo de búsqueda"}), 400

    if not query:
        query = f"{artist} - {title}" if artist else title

    items = load_wishlist()

    # Avoid exact duplicates by query
    existing_queries = [w.get("query", "").lower() for w in items]
    if query.lower() in existing_queries:
        return jsonify({"error": "La canción ya está en la lista de deseos", "wishlist": items}), 409

    from datetime import datetime, timezone
    new_item = {
        "id": str(uuid.uuid4()),
        "query": query,
        "title": title or query,
        "artist": artist,
        "addedAt": datetime.now(timezone.utc).isoformat(),
        "status": "pending",
        "errorMsg": "",
        "source": "party_guest" if source == "party_guest" else "local",
        "requestedBy": requested_by,
        "partyRequestId": party_request_id,
    }
    items.append(new_item)
    save_wishlist(items)
    items.sort(key=lambda x: x.get("addedAt", ""), reverse=True)
    return jsonify({"success": True, "wishlist": items})


@app.route('/api/wishlist/remove', methods=['POST'])
def remove_from_wishlist():
    data = request.json or {}
    item_id = data.get("id", "").strip()
    if not item_id:
        return jsonify({"error": "ID no especificado"}), 400

    items = load_wishlist()
    items = [w for w in items if w.get("id") != item_id]
    save_wishlist(items)
    with _download_lock:
        _download_state.pop(item_id, None)
    items.sort(key=lambda x: x.get("addedAt", ""), reverse=True)
    return jsonify({"success": True, "wishlist": items})


@app.route('/api/wishlist/clear', methods=['POST'])
def clear_wishlist():
    save_wishlist([])
    with _download_lock:
        _download_state.clear()
    return jsonify({"success": True, "wishlist": []})


@app.route('/api/wishlist/download', methods=['POST'])
def download_wishlist():
    """Start a background download for all pending items."""
    if not getattr(sys, "frozen", False) and not os.path.exists(SPOTDL_EXE):
        return jsonify({"error": f"SpotDL no encontrado en: {SPOTDL_EXE}"}), 500

    items = load_wishlist()
    pending = [w for w in items if w.get("status") in ("pending", "error")]

    if not pending:
        return jsonify({"error": "No hay canciones pendientes para descargar"}), 400

    # Snapshot the destination for the whole batch. Party downloads must never
    # leak into the library that happens to be open in the DJ application.
    use_party_directory = bool(party_mode_active)
    destination = "party" if use_party_directory else "library"
    batch_id, created = enqueue_download_batch(pending, destination, use_party_directory)
    return jsonify({
        "success": True,
        "queued": len(pending) if created else 0,
        "alreadyActive": not created,
        "batchId": batch_id,
    }), (200 if created else 202)


@app.route('/api/wishlist/status', methods=['GET'])
def wishlist_status():
    """Polling endpoint — returns current status of all wishlist items."""
    items = load_wishlist()
    items = _merge_download_state(items)
    items.sort(key=lambda x: x.get("addedAt", ""), reverse=True)

    active_statuses = ("searching", "downloading", "moving_to_library")

    worker_batch, worker_items = download_snapshot(consume_events=True)
    for item in items:
        worker_state = worker_items.get(item.get("id"))
        if worker_state:
            item["status"] = worker_state["status"]
            item["errorMsg"] = worker_state.get("error_msg", "")
            item["progress"] = int(worker_state.get("progress", 0) or 0)
            item["stage"] = worker_state.get("stage", "")
    total       = len(items)
    pending     = sum(1 for w in items if w.get("status") == "pending")
    searching   = sum(1 for w in items if w.get("status") == "searching")
    downloading = sum(1 for w in items if w.get("status") == "downloading")
    moving      = sum(1 for w in items if w.get("status") == "moving_to_library")
    error       = sum(1 for w in items if w.get("status") == "error")
    batch_active = bool(worker_batch and worker_batch["status"] in ("queued", "running"))
    is_active = batch_active or any(w.get("status") in active_statuses for w in items)

    # One-shot reindex flag: read and clear atomically
    needs_reindex = False
    completed_count = 0
    completed_party_requests = []
    completed_songs = []
    with _download_lock:
        if _download_state.get("__needsReindex__"):
            needs_reindex = True
            completed_count = _download_state.pop("__completedCount__", 0)
            completed_party_requests = _download_state.pop("__completedPartyRequests__", [])
            _download_state.pop("__needsReindex__", None)
    if worker_batch and worker_batch.get("needs_reindex"):
        needs_reindex = True
        completed_count += int(worker_batch.get("completed_count", 0))
        completed_party_requests.extend(worker_batch.get("completed_requests", []))
        completed_songs.extend(worker_batch.get("completed_songs", []))

    active_items = [item for item in items if item.get("status") in active_statuses]
    current_item = active_items[0] if active_items else None

    return jsonify({
        "wishlist": items,
        "summary": {
            "total": total,
            "pending": pending,
            "searching": searching,
            "downloading": downloading,
            "moving": moving,
            "error": error,
            "isActive": is_active,
            "needsReindex": needs_reindex,
            "completedCount": completed_count,
            "completedPartyRequests": completed_party_requests,
            "completedSongs": completed_songs,
            "currentProgress": int((current_item or {}).get("progress", 0) or 0),
            "currentStage": (current_item or {}).get("stage", ""),
            "currentTitle": (current_item or {}).get("title") or (current_item or {}).get("query", ""),
            "destination": worker_batch.get("destination", "library") if worker_batch else _download_state.get("__batchDestination__", "library"),
        }
    })



if __name__ == '__main__':
    # For testing server standalone
    app.run(host='127.0.0.1', port=5001, debug=True)
