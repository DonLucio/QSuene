import sys
import time
from pathlib import Path

import server


def test_spotdl_progress_is_forwarded_before_process_finishes(monkeypatch):
    updates = []
    monkeypatch.setattr(
        server,
        "_set_item_progress",
        lambda item_id, progress, stage: updates.append((progress, stage, time.monotonic())),
    )
    started = time.monotonic()
    command = [
        sys.executable,
        "-u",
        "-c",
        "import time; print('Downloading', flush=True); time.sleep(.35); print('Converting', flush=True)",
    ]

    return_code, _ = server._run_spotdl_with_progress(command, "test-item", timeout=3)

    assert return_code == 0
    assert any(progress == 40 for progress, _, _ in updates)
    assert any(progress == 72 for progress, _, _ in updates)
    assert updates[0][2] - started < .3


def test_spotdl_completion_does_not_wait_for_inherited_output_pipe(monkeypatch):
    monkeypatch.setattr(server, "_set_item_progress", lambda *args, **kwargs: None)
    child = "import time; time.sleep(3)"
    parent = (
        "import subprocess,sys; "
        f"subprocess.Popen([sys.executable, '-c', {child!r}], stdout=sys.stdout, stderr=sys.stderr); "
        "print('Downloading', flush=True)"
    )
    started = time.monotonic()

    return_code, _ = server._run_spotdl_with_progress(
        [sys.executable, "-u", "-c", parent], "test-item", timeout=3
    )

    assert return_code == 0
    assert time.monotonic() - started < 2


def test_party_download_moves_file_and_publishes_guest_completion(tmp_path, monkeypatch):
    downloads = tmp_path / "descargas"
    party = tmp_path / "ModoFiesta"
    wishlist_file = tmp_path / "wishlist.json"
    downloads.mkdir()
    completed_events = []
    item = {
        "id": "wish-1",
        "query": "Artista - Tema",
        "title": "Tema",
        "artist": "Artista",
        "source": "party_guest",
        "partyRequestId": "request-1",
        "status": "pending",
    }
    monkeypatch.setattr(server, "DOWNLOADS_DIR", str(downloads))
    monkeypatch.setattr(server, "PARTY_DOWNLOADS_DIR", str(party))
    monkeypatch.setattr(server, "WISHLIST_FILE", str(wishlist_file))
    monkeypatch.setattr(server, "SPOTDL_COMMAND", ["spotdl"])
    monkeypatch.setattr(server, "update_download_item", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        server,
        "complete_download_item",
        lambda item_id, request, song: completed_events.append((item_id, request, song)),
    )

    def fake_spotdl(command, item_id, timeout):
        Path(downloads / "Artista - Tema.mp3").write_bytes(b"audio")
        return 0, "Downloading 65% Converting"

    monkeypatch.setattr(server, "_run_spotdl_with_progress", fake_spotdl)
    server._download_state.clear()
    server.save_wishlist([item])

    count, requests = server._run_spotdl_downloads([item], use_party_directory=True)

    assert count == 1
    assert (party / "Artista - Tema.mp3").exists()
    assert not (downloads / "Artista - Tema.mp3").exists()
    assert server.load_wishlist() == []
    assert requests == [{"partyRequestId": "request-1", "title": "Tema", "artist": "Artista"}]
    assert completed_events[0][0] == "wish-1"
    assert completed_events[0][1]["partyRequestId"] == "request-1"
    assert completed_events[0][2]["path"] == str(party / "Artista - Tema.mp3")
