"""Comprueba que los eventos Socket.IO usados estén documentados en el contrato v1."""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "platform/contracts/socket-events.v1.json"
SOURCES = (ROOT / "desktop/frontend/src", ROOT / "platform/guest-web/src", ROOT / "platform/backend/src")
SOCKET_PATTERN = re.compile(r"(?:socket(?:\.timeout\([^)]*\))?|activeSocket|sio)\s*\.\s*(?:emit|on)\(\s*['\"]([^'\"]+)['\"]|@sio\.on\(\s*['\"]([^'\"]+)['\"]")
BUILT_INS = {"connect", "disconnect", "connect_error"}

def main() -> int:
    document = json.loads(CONTRACT.read_text(encoding="utf-8"))
    if document.get("version") != 1 or not isinstance(document.get("events"), dict):
        print("El contrato Socket.IO v1 no tiene una estructura válida.", file=sys.stderr)
        return 1
    declared = set(document["events"])
    used: dict[str, set[str]] = {}
    for source_dir in SOURCES:
        for path in source_dir.rglob("*"):
            if path.suffix not in {".py", ".js", ".jsx"}:
                continue
            for match in SOCKET_PATTERN.finditer(path.read_text(encoding="utf-8")):
                event = match.group(1) or match.group(2)
                if event not in BUILT_INS:
                    used.setdefault(event, set()).add(path.relative_to(ROOT).as_posix())
    missing = sorted(set(used) - declared)
    malformed = sorted(event for event, metadata in document["events"].items() if not isinstance(metadata, dict) or not {"sender", "recipient", "priority", "ack", "required"} <= set(metadata) or not isinstance(metadata["ack"], bool) or not isinstance(metadata["required"], list))
    for event in missing:
        print(f"Evento sin contrato: {event} ({', '.join(sorted(used[event]))})", file=sys.stderr)
    if malformed:
        print(f"Eventos con metadatos incompletos: {', '.join(malformed)}", file=sys.stderr)
    if missing or malformed:
        return 1
    print(f"Contrato Socket.IO v1 válido: {len(declared)} eventos; {len(used)} usados en código.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
