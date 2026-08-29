import download_jobs


def test_batch_is_claimed_once_and_completed_transactionally(tmp_path, monkeypatch):
    monkeypatch.setattr(download_jobs, "DB_PATH", str(tmp_path / "jobs.sqlite3"))
    item = {"id": "item-1", "query": "Artista - Tema"}
    batch_id, created = download_jobs.enqueue([item], "library", False)
    duplicate_id, duplicate_created = download_jobs.enqueue([item], "library", False)

    claimed = download_jobs.claim_next()
    second_claim = download_jobs.claim_next()
    download_jobs.update_item("item-1", "downloading")
    download_jobs.complete_batch(batch_id, 1, [])
    snapshot, items = download_jobs.snapshot()

    assert created is True
    assert duplicate_created is False and duplicate_id == batch_id
    assert claimed["id"] == batch_id and second_claim is None
    assert snapshot["status"] == "completed" and snapshot["completed_count"] == 1
    assert items["item-1"]["status"] == "completed"


def test_interrupted_batch_returns_to_queue(tmp_path, monkeypatch):
    monkeypatch.setattr(download_jobs, "DB_PATH", str(tmp_path / "jobs.sqlite3"))
    download_jobs.enqueue([{"id": "item-2", "query": "Tema"}], "party", True)
    download_jobs.claim_next()
    download_jobs.update_item("item-2", "moving_to_library")

    download_jobs.recover_interrupted()
    batch, items = download_jobs.snapshot()

    assert batch["status"] == "queued"
    assert items["item-2"]["status"] == "pending"


def test_progress_and_individual_completion_are_visible_before_batch_ends(tmp_path, monkeypatch):
    monkeypatch.setattr(download_jobs, "DB_PATH", str(tmp_path / "jobs.sqlite3"))
    batch_id, _ = download_jobs.enqueue([{"id": "item-live", "query": "Tema"}], "party", True)
    download_jobs.claim_next()
    download_jobs.update_item("item-live", "downloading", progress=64, stage="Descargando")

    batch, items = download_jobs.snapshot()
    assert batch["status"] == "running"
    assert items["item-live"]["progress"] == 64
    assert items["item-live"]["stage"] == "Descargando"

    request = {"partyRequestId": "request-1", "title": "Tema", "artist": "Artista"}
    song = {"path": "C:/ModoFiesta/Tema.mp3", "title": "Tema", "artist": "Artista"}
    download_jobs.complete_item("item-live", request, song)
    event, _ = download_jobs.snapshot(consume_events=True)
    consumed, _ = download_jobs.snapshot()

    assert event["needs_reindex"] == 1
    assert event["completed_count"] == 1
    assert event["completed_requests"] == [request]
    assert event["completed_songs"] == [song]
    assert consumed["needs_reindex"] == 0
