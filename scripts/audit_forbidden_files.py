"""Impide publicar audios, secretos locales, bases y artefactos generados."""
from __future__ import annotations
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN_SUFFIXES = {".mp3", ".m4a", ".flac", ".wav", ".ogg", ".opus", ".aac", ".aiff", ".alac", ".sqlite3", ".db", ".pem", ".key", ".pfx", ".p12"}
FORBIDDEN_NAMES = {"settings.json", "wishlist.json", "playlists.json"}
FORBIDDEN_PARTS = {"node_modules", "__pycache__", ".venv", "venv", "dist", "build"}

def tracked_files() -> list[Path]:
    output = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT, stderr=subprocess.STDOUT)
    return [ROOT / item.decode("utf-8") for item in output.split(b"\0") if item]

def reason(path: Path) -> str | None:
    lowered_parts = {part.lower() for part in path.relative_to(ROOT).parts}
    name = path.name.lower()
    if name == ".env" or (name.startswith(".env.") and name != ".env.example"):
        return "configuración local"
    if path.suffix.lower() in FORBIDDEN_SUFFIXES:
        return "audio, base de datos o clave privada"
    if name in FORBIDDEN_NAMES:
        return "datos locales de la aplicación"
    if lowered_parts & FORBIDDEN_PARTS:
        return "dependencia o artefacto generado"
    return None

def main() -> int:
    files = tracked_files()
    violations = [(path, reason(path)) for path in files if reason(path)]
    for path, message in violations:
        print(f"PROHIBIDO: {path.relative_to(ROOT).as_posix()} ({message})", file=sys.stderr)
    if violations:
        return 1
    print(f"Auditoría correcta: {len(files)} archivos versionados permitidos.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
