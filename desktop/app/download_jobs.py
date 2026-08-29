import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "download_jobs.sqlite3")


@contextmanager
def connection():
    db = sqlite3.connect(DB_PATH, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("""CREATE TABLE IF NOT EXISTS download_batches(
        id TEXT PRIMARY KEY, status TEXT NOT NULL, destination TEXT NOT NULL,
        payload TEXT NOT NULL, completed_count INTEGER NOT NULL DEFAULT 0,
        completed_requests TEXT NOT NULL DEFAULT '[]', needs_reindex INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS download_items(
        item_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, status TEXT NOT NULL,
        error_msg TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)""")
    item_columns = {row[1] for row in db.execute("PRAGMA table_info(download_items)")}
    for column, definition in {
        "progress": "INTEGER NOT NULL DEFAULT 0",
        "stage": "TEXT NOT NULL DEFAULT ''",
        "needs_reindex": "INTEGER NOT NULL DEFAULT 0",
        "completed_request": "TEXT NOT NULL DEFAULT '{}'",
        "completed_song": "TEXT NOT NULL DEFAULT '{}'",
    }.items():
        if column not in item_columns:
            db.execute(f"ALTER TABLE download_items ADD COLUMN {column} {definition}")
    try:
        yield db
        db.commit()
    finally:
        db.close()


def enqueue(items, destination, use_party_directory):
    now = datetime.now(timezone.utc).isoformat()
    with connection() as db:
        active = db.execute("SELECT id FROM download_batches WHERE status IN ('queued','running') LIMIT 1").fetchone()
        if active:
            return active["id"], False
        batch_id = str(uuid.uuid4())
        payload = json.dumps({"items": items, "use_party_directory": use_party_directory}, ensure_ascii=False)
        db.execute("INSERT INTO download_batches(id,status,destination,payload,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                   (batch_id, "queued", destination, payload, now, now))
        db.executemany("INSERT OR REPLACE INTO download_items(item_id,batch_id,status,error_msg,updated_at) VALUES(?,?,?,?,?)",
                       [(item["id"], batch_id, "pending", "", now) for item in items])
        return batch_id, True


def claim_next():
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT * FROM download_batches WHERE status='queued' ORDER BY created_at LIMIT 1").fetchone()
        if not row:
            return None
        now = datetime.now(timezone.utc).isoformat()
        db.execute("UPDATE download_batches SET status='running',updated_at=? WHERE id=?", (now, row["id"]))
        return {**dict(row), "payload": json.loads(row["payload"])}


def recover_interrupted():
    """Return batches interrupted with the desktop app to the durable queue."""
    with connection() as db:
        now = datetime.now(timezone.utc).isoformat()
        db.execute("UPDATE download_batches SET status='queued',updated_at=? WHERE status='running'", (now,))
        db.execute("UPDATE download_items SET status='pending',error_msg='',updated_at=? WHERE status IN ('searching','downloading','moving_to_library')", (now,))


def update_item(item_id, status, error_msg="", progress=None, stage=None):
    with connection() as db:
        fields = ["status=?", "error_msg=?", "updated_at=?"]
        values = [status, error_msg, datetime.now(timezone.utc).isoformat()]
        if progress is not None:
            fields.append("progress=?")
            values.append(max(0, min(100, int(progress))))
        if stage is not None:
            fields.append("stage=?")
            values.append(str(stage)[:80])
        values.append(item_id)
        db.execute(f"UPDATE download_items SET {','.join(fields)} WHERE item_id=?", values)


def complete_item(item_id, completed_request=None, completed_song=None):
    """Publish one durable completion event without waiting for the whole batch."""
    with connection() as db:
        db.execute(
            """UPDATE download_items SET status='completed',progress=100,stage='Disponible',
               needs_reindex=1,completed_request=?,completed_song=?,updated_at=? WHERE item_id=?""",
            (
                json.dumps(completed_request or {}, ensure_ascii=False),
                json.dumps(completed_song or {}, ensure_ascii=False),
                datetime.now(timezone.utc).isoformat(),
                item_id,
            ),
        )


def complete_batch(batch_id, completed_count, completed_requests):
    with connection() as db:
        db.execute("UPDATE download_batches SET status='completed',completed_count=?,completed_requests=?,needs_reindex=0,updated_at=? WHERE id=?",
                   (completed_count, json.dumps(completed_requests), datetime.now(timezone.utc).isoformat(), batch_id))
        db.execute("UPDATE download_items SET status='completed',updated_at=? WHERE batch_id=? AND status!='error'",
                   (datetime.now(timezone.utc).isoformat(), batch_id))


def fail_batch(batch_id, message):
    with connection() as db:
        db.execute("UPDATE download_batches SET status='error',updated_at=? WHERE id=?",
                   (datetime.now(timezone.utc).isoformat(), batch_id))


def snapshot(consume_events=False):
    with connection() as db:
        batch = db.execute("SELECT * FROM download_batches ORDER BY created_at DESC LIMIT 1").fetchone()
        items = {row["item_id"]: dict(row) for row in db.execute("SELECT * FROM download_items")}
        if not batch:
            return None, items
        result = dict(batch)
        event_items = [item for item in items.values() if item.get("needs_reindex")]
        item_completed_requests = [
            payload for payload in (json.loads(item.get("completed_request") or "{}") for item in event_items) if payload
        ]
        result["completed_requests"] = item_completed_requests or json.loads(result.get("completed_requests") or "[]")
        result["completed_songs"] = [
            payload for payload in (json.loads(item.get("completed_song") or "{}") for item in event_items) if payload
        ]
        result["completed_count"] = len(event_items) if event_items else int(result.get("completed_count", 0))
        result["needs_reindex"] = int(bool(event_items))
        if consume_events and result["needs_reindex"]:
            db.executemany(
                "UPDATE download_items SET needs_reindex=0,completed_request='{}',completed_song='{}' WHERE item_id=?",
                [(item["item_id"],) for item in event_items],
            )
        return result, items
