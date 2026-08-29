import sys
import time
from pathlib import Path

import download_service


def test_spotdl_progress_is_forwarded_before_process_finishes(monkeypatch):
    updates = []
    monkeypatch.setattr(
        download_service,
        "_set_progress",
        lambda item_id, progress, stage: updates.append((progress, stage, time.monotonic())),
    )
    started = time.monotonic()
    command = [
        sys.executable,
        "-u",
        "-c",
        "import time; print('Downloading', flush=True); time.sleep(.8); print('Converting', flush=True)",
    ]

    return_code, _ = download_service.run_spotdl_with_progress(command, "test-item", timeout=3)

    assert return_code == 0
    assert any(progress == 40 for progress, _, _ in updates)
    assert any(progress == 72 for progress, _, _ in updates)
    assert updates[0][2] - started < .65


def test_spotdl_completion_does_not_wait_for_inherited_output_pipe(monkeypatch):
    monkeypatch.setattr(download_service, "_set_progress", lambda *args, **kwargs: None)
    child = "import time; time.sleep(3)"
    parent = (
        "import subprocess,sys; "
        f"subprocess.Popen([sys.executable, '-c', {child!r}], stdout=sys.stdout, stderr=sys.stderr); "
        "print('Downloading', flush=True)"
    )
    started = time.monotonic()

    return_code, _ = download_service.run_spotdl_with_progress(
        [sys.executable, "-u", "-c", parent], "test-item", timeout=3
    )

    assert return_code == 0
    assert time.monotonic() - started < 2


def test_party_download_moves_file_and_publishes_guest_completion(tmp_path, monkeypatch):
    downloads = tmp_path / "descargas"
    party = tmp_path / "ModoFiesta"
    import download_jobs
    monkeypatch.setattr(download_jobs, "DB_PATH", str(tmp_path / "jobs.sqlite3"))
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
    monkeypatch.setattr(download_service, "DOWNLOADS_DIR", str(downloads))
    monkeypatch.setattr(download_service, "PARTY_DOWNLOADS_DIR", str(party))
    monkeypatch.setattr(download_service, "SPOTDL_COMMAND", ["spotdl"])
    original_complete = download_jobs.complete_item
    monkeypatch.setattr(download_service, "update_item", download_jobs.update_item)
    monkeypatch.setattr(download_service, "complete_item", lambda item_id, request, song: (completed_events.append((item_id, request, song)), original_complete(item_id, request, song)))

    def fake_spotdl(command, item_id, timeout):
        Path(downloads / "Artista - Tema.mp3").write_bytes(b"audio")
        return 0, "Downloading 65% Converting"

    monkeypatch.setattr(download_service, "run_spotdl_with_progress", fake_spotdl)
    item["addedAt"] = "2026-01-01T00:00:00+00:00"
    assert download_jobs.add_wishlist_item(item, preferred_party=True)
    download_jobs.enqueue([item], "party", True)

    count, requests = download_service.run_downloads([item], use_party_directory=True)

    assert count == 1
    assert (party / "Artista - Tema.mp3").exists()
    assert not (downloads / "Artista - Tema.mp3").exists()
    assert download_jobs.list_wishlist() == []
    assert requests == [{"partyRequestId": "request-1", "title": "Tema", "artist": "Artista"}]
    assert completed_events[0][0] == "wish-1"
    assert completed_events[0][1]["partyRequestId"] == "request-1"
    assert completed_events[0][2]["path"] == str(party / "Artista - Tema.mp3")


def test_local_download_moves_file_into_current_library_and_publishes_song(tmp_path, monkeypatch):
    downloads = tmp_path / "descargas"
    library = tmp_path / "Biblioteca"
    downloads.mkdir()
    library.mkdir()
    import download_jobs
    monkeypatch.setattr(download_jobs, "DB_PATH", str(tmp_path / "jobs.sqlite3"))
    monkeypatch.setattr(download_service, "DOWNLOADS_DIR", str(downloads))
    monkeypatch.setattr(download_service, "SPOTDL_COMMAND", ["spotdl"])
    monkeypatch.setattr(download_service, "update_item", download_jobs.update_item)
    monkeypatch.setattr(download_service, "complete_item", download_jobs.complete_item)
    item = {
        "id": "local-wish-1", "query": "Artista - Tema local", "title": "Tema local",
        "artist": "Artista", "source": "local", "partyRequestId": "",
        "status": "pending", "targetDirectory": str(library),
        "addedAt": "2026-01-01T00:00:00+00:00",
    }

    def fake_spotdl(command, item_id, timeout):
        Path(downloads / "Artista - Tema local.mp3").write_bytes(b"audio")
        return 0, "Downloading 100%"

    monkeypatch.setattr(download_service, "run_spotdl_with_progress", fake_spotdl)
    assert download_jobs.add_wishlist_item(item, preferred_party=False, target_directory=str(library))
    download_jobs.enqueue([item], "library", False, str(library))

    count, requests = download_service.run_downloads([item], False, str(library))
    _, states = download_jobs.snapshot()
    completed_song = __import__("json").loads(states[item["id"]]["completed_song"])

    assert count == 1
    assert requests == []
    assert (library / "Artista - Tema local.mp3").exists()
    assert not (downloads / "Artista - Tema local.mp3").exists()
    assert completed_song["path"] == str(library / "Artista - Tema local.mp3")
    assert completed_song["librarySource"] == "library"
