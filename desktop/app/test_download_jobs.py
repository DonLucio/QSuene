import download_jobs
import download_worker


def add_item(item_id, query="Tema", source="local", request_id=""):
    item = {
        "id": item_id, "query": query, "title": query, "artist": "Artista",
        "addedAt": f"2026-01-01T00:00:00+00:00-{item_id}", "source": source,
        "requestedBy": "Invitado" if source == "party_guest" else "",
        "partyRequestId": request_id,
    }
    assert download_jobs.add_wishlist_item(item, preferred_party=source == "party_guest")
    return item


def test_batch_is_claimed_once_and_completed_transactionally(tmp_path, monkeypatch):
    monkeypatch.setattr(download_jobs, "DB_PATH", str(tmp_path / "jobs.sqlite3"))
    item = add_item("item-1", "Artista - Tema")
    batch_id, created = download_jobs.enqueue([item], "library", False)
    duplicate_id, duplicate_created = download_jobs.enqueue([item], "library", False)

    claimed = download_jobs.claim_next()
    second_claim = download_jobs.claim_next()
    download_jobs.update_item("item-1", "downloading")
    download_jobs.complete_item("item-1", {}, {"path": "C:/Music/Tema.mp3"})
    download_jobs.complete_batch(batch_id, 1, [])
    snapshot, items = download_jobs.snapshot()

    assert created is True
    assert duplicate_created is False and duplicate_id == batch_id
    assert claimed["id"] == batch_id and second_claim is None
    assert snapshot["status"] == "completed" and snapshot["completed_count"] == 1
    assert items["item-1"]["status"] == "completed"


def test_interrupted_batch_returns_to_queue(tmp_path, monkeypatch):
    monkeypatch.setattr(download_jobs, "DB_PATH", str(tmp_path / "jobs.sqlite3"))
    item = add_item("item-2")
    download_jobs.enqueue([item], "party", True)
    download_jobs.claim_next()
    download_jobs.update_item("item-2", "moving_to_library")

    download_jobs.recover_interrupted()
    batch, items = download_jobs.snapshot()

    assert batch["status"] == "queued"
    assert items["item-2"]["status"] == "pending"
    assert download_jobs.list_wishlist()[0]["status"] == "queued"


def test_progress_and_individual_completion_are_visible_before_batch_ends(tmp_path, monkeypatch):
    monkeypatch.setattr(download_jobs, "DB_PATH", str(tmp_path / "jobs.sqlite3"))
    item = add_item("item-live", source="party_guest", request_id="request-1")
    batch_id, _ = download_jobs.enqueue([item], "party", True)
    download_jobs.claim_next()
    download_jobs.update_item("item-live", "downloading", progress=64, stage="Descargando")

    batch, items = download_jobs.snapshot()
    assert batch["status"] == "running"
    assert items["item-live"]["progress"] == 64
    assert items["item-live"]["stage"] == "Descargando"

    request = {"partyRequestId": "request-1", "title": "Tema", "artist": "Artista"}
    song = {"path": "C:/ModoFiesta/Tema.mp3", "title": "Tema", "artist": "Artista"}
    download_jobs.complete_item("item-live", request, song)
    event, _ = download_jobs.snapshot()
    repeated, _ = download_jobs.snapshot()

    assert event["needs_reindex"] == 1
    assert event["completed_count"] == 1
    assert event["completed_requests"] == [request]
    assert event["completed_songs"] == [song]
    assert repeated["needs_reindex"] == 1
    assert repeated["completion_events"] == event["completion_events"]

    assert download_jobs.acknowledge_completion_events(["item-live"]) == 1
    consumed, _ = download_jobs.snapshot()
    assert consumed["needs_reindex"] == 0


def test_requests_added_during_a_batch_remain_durable_for_the_next_batch(tmp_path, monkeypatch):
    monkeypatch.setattr(download_jobs, "DB_PATH", str(tmp_path / "jobs.sqlite3"))
    first = add_item("first")
    first_batch, _ = download_jobs.enqueue([first], "party", True)
    download_jobs.claim_next()
    late_items = [add_item(f"late-{index}", f"Tema {index}", "party_guest", f"request-{index}") for index in range(5)]

    download_jobs.complete_item("first", {}, {"path": "C:/ModoFiesta/first.mp3"})
    download_jobs.complete_batch(first_batch, 1, [])
    second_batch, created = download_jobs.enqueue(late_items, "party", True)

    assert created is True and second_batch != first_batch
    assert {item["id"] for item in download_jobs.list_wishlist()} == {item["id"] for item in late_items}


def test_worker_automatically_processes_two_consecutive_batches(tmp_path, monkeypatch):
    monkeypatch.setattr(download_jobs, "DB_PATH", str(tmp_path / "jobs.sqlite3"))
    first_items = [add_item(f"first-{index}", f"Primera {index}") for index in range(5)]
    download_jobs.enqueue(first_items, "library", False, str(tmp_path / "library"))
    calls = []

    def fake_download(items, use_party, target_directory):
        calls.append([item["id"] for item in items])
        for item in items:
            download_jobs.complete_item(item["id"], {}, {"path": f"C:/Music/{item['id']}.mp3"})
        if len(calls) == 1:
            for index in range(5):
                add_item(f"late-auto-{index}", f"Segunda {index}")
        return len(items), []

    monkeypatch.setattr(download_worker, "run_downloads", fake_download)

    assert download_worker.process_next_batch() is True
    queued_batch, _ = download_jobs.snapshot()
    assert queued_batch["status"] == "queued"
    assert download_worker.process_next_batch() is True
    assert len(calls) == 2
    assert all(item["status"] == "completed" for item in download_jobs.list_wishlist(include_completed=True))
