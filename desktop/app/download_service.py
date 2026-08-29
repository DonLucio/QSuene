"""Isolated SpotDL execution service.

This module deliberately has no Flask, WebView, player, or party-socket
dependencies. The durable worker can import it without constructing a second
copy of the desktop web application.
"""

import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time

from mutagen.mp3 import MP3

from download_jobs import complete_item, update_item

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPOTDL_EXE = os.path.join(BASE_DIR, ".venv", "Scripts", "spotdl.exe")
SPOTDL_COMMAND = [sys.executable, "--qsuene-spotdl"] if getattr(sys, "frozen", False) else [SPOTDL_EXE]
DOWNLOADS_DIR = os.path.join(BASE_DIR, "descargas")
PARTY_DOWNLOADS_DIR = os.path.join(BASE_DIR, "ModoFiesta")


def _set_status(item_id, status, error_msg="", progress=None, stage=None):
    update_item(item_id, status, error_msg, progress, stage)


def _set_progress(item_id, progress, stage="Descargando"):
    update_item(item_id, "downloading", "", max(0, min(99, int(progress))), stage)


def _audio_snapshot(directory):
    try:
        return {
            name: (os.stat(os.path.join(directory, name)).st_mtime_ns, os.path.getsize(os.path.join(directory, name)))
            for name in os.listdir(directory)
            if os.path.isfile(os.path.join(directory, name))
            and name.lower().endswith((".mp3", ".m4a", ".flac", ".ogg"))
        }
    except OSError:
        return {}


def _move_new_files(before_files, destination):
    try:
        after_files = _audio_snapshot(DOWNLOADS_DIR)
        changed = {name for name, signature in after_files.items() if before_files.get(name) != signature}
        if os.path.normcase(os.path.realpath(destination)) == os.path.normcase(os.path.realpath(DOWNLOADS_DIR)):
            return [os.path.realpath(os.path.join(DOWNLOADS_DIR, name)) for name in changed]
        os.makedirs(destination, exist_ok=True)
        final_paths = []
        for name in changed:
            source = os.path.join(DOWNLOADS_DIR, name)
            target = os.path.join(destination, name)
            try:
                os.replace(source, target)
            except OSError:
                shutil.copy2(source, target)
                os.remove(source)
            final_paths.append(os.path.realpath(target))
        return final_paths
    except OSError:
        return []


def run_spotdl_with_progress(command, item_id, timeout=300):
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=0,
        cwd=BASE_DIR,
    )
    chunks = queue.Queue()

    def read_output():
        while True:
            raw = os.read(process.stdout.fileno(), 256)
            if not raw:
                break
            chunks.put(raw.decode("utf-8", errors="replace"))
        chunks.put(None)

    threading.Thread(target=read_output, daemon=True).start()
    deadline = time.monotonic() + timeout
    output_tail = ""
    last_progress = 0
    reader_done = False
    phases = (
        ("searching", 18, "Buscando fuente"),
        ("downloading", 40, "Descargando audio"),
        ("converting", 72, "Procesando audio"),
        ("embedding", 90, "Guardando metadatos"),
        ("saving", 94, "Finalizando archivo"),
    )
    while process.poll() is None:
        if time.monotonic() >= deadline:
            process.kill()
            raise subprocess.TimeoutExpired(command, timeout)
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
                _set_progress(item_id, progress, stage)
        lowered = output_tail.lower()
        for marker, phase_progress, phase_stage in phases:
            if marker in lowered and phase_progress > last_progress:
                last_progress = phase_progress
                _set_progress(item_id, phase_progress, phase_stage)

    drain_deadline = time.monotonic() + 1
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


def _metadata(file_path):
    filename = os.path.basename(file_path)
    stem, _ = os.path.splitext(filename)
    artist_fallback, title_fallback = (stem.split(" - ", 1) if " - " in stem else ("Desconocido", stem))
    result = {
        "path": file_path, "filename": filename, "title": title_fallback.strip(),
        "artist": artist_fallback.strip(), "album": "Desconocido", "year": "",
        "genre": "Desconocido", "track": "", "duration": 0, "bitrate": 0,
        "size_mb": round(os.path.getsize(file_path) / (1024 * 1024), 2), "rating": 0,
    }
    try:
        audio = MP3(file_path)
        result["duration"] = audio.info.length
        result["bitrate"] = round(audio.info.bitrate / 1000)
        tags = audio.tags or {}
        mappings = {"TIT2": "title", "TPE1": "artist", "TALB": "album", "TCON": "genre", "TRCK": "track"}
        for tag, field in mappings.items():
            if tag in tags and tags[tag].text:
                result[field] = str(tags[tag].text[0])
        year_tag = tags.get("TYER") or tags.get("TDRC")
        if year_tag and year_tag.text:
            result["year"] = str(year_tag.text[0])
    except Exception:
        pass
    return result


def run_downloads(items, use_party_directory=False, target_directory=""):
    os.makedirs(DOWNLOADS_DIR, exist_ok=True)
    output_template = os.path.join(DOWNLOADS_DIR, "{artists} - {title}.{output-ext}")
    completed_ids = []
    completed_requests = []
    for item in items:
        item_id = item["id"]
        query = item.get("query", "").strip()
        item_party = bool(item.get("preferredParty", use_party_directory))
        destination = item.get("targetDirectory") or target_directory or (PARTY_DOWNLOADS_DIR if item_party else DOWNLOADS_DIR)
        os.makedirs(destination, exist_ok=True)
        if not query:
            _set_status(item_id, "error", "Sin consulta de búsqueda")
            continue
        _set_status(item_id, "searching", progress=5, stage="Buscando coincidencia")
        before_files = _audio_snapshot(DOWNLOADS_DIR)
        _set_status(item_id, "downloading", progress=10, stage="Preparando descarga")
        try:
            command = [*SPOTDL_COMMAND, "download", query, "--output", output_template, "--simple-tui"]
            return_code, output = run_spotdl_with_progress(command, item_id, timeout=300)
            if return_code != 0:
                _set_status(item_id, "error", (output or "Error desconocido").strip()[-200:])
                continue
            _set_status(item_id, "moving_to_library", progress=98, stage="Agregando a la biblioteca")
            paths = _move_new_files(before_files, destination)
            if not paths:
                _set_status(item_id, "error", "SpotDL terminó sin producir un archivo de audio nuevo")
                continue
            song = _metadata(paths[0])
            song["librarySource"] = "party" if item_party else "library"
            request = None
            if item.get("source") == "party_guest" and item.get("partyRequestId"):
                request = {
                    "partyRequestId": item["partyRequestId"],
                    "title": item.get("title") or query,
                    "artist": item.get("artist", ""),
                }
                completed_requests.append(request)
            complete_item(item_id, request, song)
            completed_ids.append(item_id)
        except subprocess.TimeoutExpired:
            _set_status(item_id, "error", "Tiempo de espera agotado (5 min)")
        except Exception as error:
            _set_status(item_id, "error", str(error)[:200])
    return len(completed_ids), completed_requests
