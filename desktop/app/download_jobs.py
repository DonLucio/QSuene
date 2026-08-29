import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

DATA_DIR = os.environ.get(
    "QUE_SUENE_DATA_DIR",
    os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "QSuene"),
)
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "download_jobs.sqlite3")


@contextmanager
def connection():
    db = sqlite3.connect(DB_PATH, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA busy_timeout=30000")
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("""CREATE TABLE IF NOT EXISTS download_batches(
        id TEXT PRIMARY KEY, status TEXT NOT NULL, destination TEXT NOT NULL,
        payload TEXT NOT NULL, completed_count INTEGER NOT NULL DEFAULT 0,
        completed_requests TEXT NOT NULL DEFAULT '[]', needs_reindex INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS download_items(
        item_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, status TEXT NOT NULL,
        error_msg TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS wishlist_items(
        id TEXT PRIMARY KEY, query TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
        artist TEXT NOT NULL DEFAULT '', added_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', error_msg TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'local', requested_by TEXT NOT NULL DEFAULT '',
        party_request_id TEXT NOT NULL DEFAULT '', progress INTEGER NOT NULL DEFAULT 0,
        stage TEXT NOT NULL DEFAULT '', preferred_party INTEGER NOT NULL DEFAULT 0,
        target_directory TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL)""")
    wishlist_columns = {row[1] for row in db.execute("PRAGMA table_info(wishlist_items)")}
    if "target_directory" not in wishlist_columns:
        db.execute("ALTER TABLE wishlist_items ADD COLUMN target_directory TEXT NOT NULL DEFAULT ''")
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


def enqueue(items, destination, use_party_directory, target_directory=""):
    now = datetime.now(timezone.utc).isoformat()
    with connection() as db:
        # Serialize the active-batch check and insert. Flask and the worker are
        # separate processes and can both try to enqueue the next batch.
        db.execute("BEGIN IMMEDIATE")
        active = db.execute("SELECT id FROM download_batches WHERE status IN ('queued','running') LIMIT 1").fetchone()
        if active:
            return active["id"], False
        batch_id = str(uuid.uuid4())
        payload = json.dumps({
            "items": items,
            "use_party_directory": use_party_directory,
            "target_directory": target_directory,
        }, ensure_ascii=False)
        db.execute("INSERT INTO download_batches(id,status,destination,payload,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                   (batch_id, "queued", destination, payload, now, now))
        db.executemany("INSERT OR REPLACE INTO download_items(item_id,batch_id,status,error_msg,updated_at) VALUES(?,?,?,?,?)",
                       [(item["id"], batch_id, "pending", "", now) for item in items])
        db.executemany(
            "UPDATE wishlist_items SET status='queued',error_msg='',progress=0,stage='En cola',updated_at=? WHERE id=?",
            [(now, item["id"]) for item in items],
        )
        return batch_id, True


def _wishlist_dict(row):
    return {
        "id": row["id"], "query": row["query"], "title": row["title"],
        "artist": row["artist"], "addedAt": row["added_at"],
        "status": row["status"], "errorMsg": row["error_msg"],
        "source": row["source"], "requestedBy": row["requested_by"],
        "partyRequestId": row["party_request_id"], "progress": row["progress"],
        "stage": row["stage"], "preferredParty": bool(row["preferred_party"]),
        "targetDirectory": row["target_directory"],
    }


def list_wishlist(include_completed=False):
    with connection() as db:
        where = "" if include_completed else "WHERE status!='completed'"
        rows = db.execute(f"SELECT * FROM wishlist_items {where} ORDER BY added_at DESC").fetchall()
        return [_wishlist_dict(row) for row in rows]


def add_wishlist_item(item, preferred_party=False, target_directory=""):
    now = datetime.now(timezone.utc).isoformat()
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        duplicate = db.execute(
            "SELECT id FROM wishlist_items WHERE lower(query)=lower(?) AND status!='completed' LIMIT 1",
            (item["query"],),
        ).fetchone()
        if duplicate:
            return False
        db.execute(
            """INSERT INTO wishlist_items(
                id,query,title,artist,added_at,status,error_msg,source,requested_by,
                party_request_id,progress,stage,preferred_party,target_directory,updated_at
            ) VALUES(?,?,?,?,?,'pending','',?,?,?,0,'',?,?,?)""",
            (
                item["id"], item["query"], item.get("title", ""), item.get("artist", ""),
                item["addedAt"], item.get("source", "local"), item.get("requestedBy", ""),
                item.get("partyRequestId", ""), int(bool(preferred_party)),
                target_directory or item.get("targetDirectory", ""), now,
            ),
        )
        return True


def migrate_legacy_wishlist(items):
    with connection() as db:
        if db.execute("SELECT COUNT(*) FROM wishlist_items").fetchone()[0]:
            return False
    for item in items:
        if item.get("id") and item.get("query"):
            add_wishlist_item(
                item,
                bool(item.get("preferredParty")),
                item.get("targetDirectory", ""),
            )
    return bool(items)


def remove_wishlist_item(item_id):
    with connection() as db:
        cursor = db.execute(
            "DELETE FROM wishlist_items WHERE id=? AND status IN ('pending','error')",
            (item_id,),
        )
        return cursor.rowcount > 0


def clear_pending_wishlist():
    with connection() as db:
        cursor = db.execute("DELETE FROM wishlist_items WHERE status IN ('pending','error')")
        return cursor.rowcount


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
        db.execute("UPDATE wishlist_items SET status='queued',error_msg='',stage='En cola',updated_at=? WHERE status IN ('searching','downloading','moving_to_library')", (now,))


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
        wishlist_fields = list(fields)
        wishlist_values = list(values)
        db.execute(f"UPDATE wishlist_items SET {','.join(wishlist_fields)} WHERE id=?", wishlist_values)


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
        db.execute(
            "UPDATE wishlist_items SET status='completed',progress=100,stage='Disponible',updated_at=? WHERE id=?",
            (datetime.now(timezone.utc).isoformat(), item_id),
        )


def acknowledge_completion_events(item_ids):
    """Clear completion events only after the desktop client applied them."""
    normalized_ids = [str(item_id) for item_id in item_ids if str(item_id).strip()]
    if not normalized_ids:
        return 0
    with connection() as db:
        placeholders = ",".join("?" for _ in normalized_ids)
        cursor = db.execute(
            f"""UPDATE download_items
                SET needs_reindex=0,completed_request='{{}}',completed_song='{{}}'
                WHERE needs_reindex=1 AND item_id IN ({placeholders})""",
            normalized_ids,
        )
        return cursor.rowcount


def complete_batch(batch_id, completed_count, completed_requests):
    with connection() as db:
        db.execute("UPDATE download_batches SET status='completed',completed_count=?,completed_requests=?,needs_reindex=0,updated_at=? WHERE id=?",
                   (completed_count, json.dumps(completed_requests), datetime.now(timezone.utc).isoformat(), batch_id))
        # Individual items reach `completed` only through complete_item(),
        # after a real output file was moved and indexed. Never manufacture a
        # successful item merely because the batch process ended.


def fail_batch(batch_id, message):
    with connection() as db:
        now = datetime.now(timezone.utc).isoformat()
        db.execute("UPDATE download_batches SET status='error',updated_at=? WHERE id=?", (now, batch_id))
        item_ids = [row[0] for row in db.execute("SELECT item_id FROM download_items WHERE batch_id=?", (batch_id,))]
        db.execute(
            "UPDATE download_items SET status='error',error_msg=?,updated_at=? WHERE batch_id=? AND status!='completed'",
            (message, now, batch_id),
        )
        if item_ids:
            placeholders = ",".join("?" for _ in item_ids)
            db.execute(
                f"UPDATE wishlist_items SET status='error',error_msg=?,stage='Error',updated_at=? WHERE id IN ({placeholders}) AND status!='completed'",
                [message, now, *item_ids],
            )


def snapshot(consume_events=False):
    with connection() as db:
        batch = db.execute("SELECT * FROM download_batches ORDER BY created_at DESC LIMIT 1").fetchone()
        items = {row["item_id"]: dict(row) for row in db.execute("SELECT * FROM download_items")}
        if not batch:
            return None, items
        result = dict(batch)
        event_items = [item for item in items.values() if item.get("needs_reindex")]
        result["completion_events"] = [
            {
                "item_id": item["item_id"],
                "request": json.loads(item.get("completed_request") or "{}"),
                "song": json.loads(item.get("completed_song") or "{}"),
            }
            for item in event_items
        ]
        item_completed_requests = [
            payload for payload in (json.loads(item.get("completed_request") or "{}") for item in event_items) if payload
        ]
        result["completed_requests"] = item_completed_requests or json.loads(result.get("completed_requests") or "[]")
        result["completed_songs"] = [
            payload for payload in (json.loads(item.get("completed_song") or "{}") for item in event_items) if payload
        ]
        result["completed_count"] = len(event_items) if event_items else int(result.get("completed_count", 0))
        result["needs_reindex"] = int(bool(event_items))
        # `consume_events` se conserva por compatibilidad de firma, pero leer
        # nunca elimina eventos. La entrega se confirma explícitamente por ACK.
        return result, items
