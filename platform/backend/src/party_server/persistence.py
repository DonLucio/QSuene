import json
from contextlib import asynccontextmanager
from datetime import datetime

import asyncpg

from .models import Participant, QueueItem, QueueSource, Role, Room


def room_to_state(room: Room) -> dict:
    return {
        "id": room.id, "code": room.code, "name": room.name,
        "limit_per_guest": room.limit_per_guest, "dj_id": room.dj_id,
        "cyclic_requests": room.cyclic_requests, "is_public": room.is_public,
        "version": room.version, "open": room.open,
        "participants": [
            {"id": p.id, "name": p.name, "role": p.role.value,
             "device_id": p.device_id, "connected": p.connected,
             "requests_made": p.requests_made, "blocked": p.blocked,
             "disconnected_at": p.disconnected_at.isoformat() if p.disconnected_at else None}
            for p in room.participants.values()
        ],
        "catalog": room.catalog,
        "queue": [item.public_dict() for item in room.queue],
        "wishlist_requests": room.wishlist_requests,
        "wishlist_available": room.wishlist_available,
        "playback": room.playback,
        "up_next_notified_item_id": room.up_next_notified_item_id,
        "created_at": room.created_at.isoformat(),
        "last_activity_at": room.last_activity_at.isoformat(),
        "dj_last_seen_at": room.dj_last_seen_at.isoformat(),
    }


def room_from_state(state: dict) -> Room:
    participants = {
        item["id"]: Participant(
            id=item["id"], name=item["name"], role=Role(item["role"]),
            device_id=item.get("device_id", ""), connected=bool(item.get("connected")),
            requests_made=int(item.get("requests_made", 0)), blocked=bool(item.get("blocked")),
            disconnected_at=(datetime.fromisoformat(item["disconnected_at"])
                             if item.get("disconnected_at") else None),
        ) for item in state.get("participants", [])
    }
    queue = [
        QueueItem(
            id=item["id"], song_id=item["song_id"], title=item["title"],
            artist=item.get("artist", ""), source=QueueSource(item["source"]),
            requested_by=item["requested_by"], requested_by_name=item["requested_by_name"],
            created_at=datetime.fromisoformat(item["created_at"]),
        ) for item in state.get("queue", [])
    ]
    return Room(
        id=state["id"], code=state["code"], name=state["name"],
        limit_per_guest=int(state["limit_per_guest"]), dj_id=state["dj_id"],
        cyclic_requests=bool(state.get("cyclic_requests")), is_public=bool(state.get("is_public")),
        version=int(state.get("version", 1)), open=bool(state.get("open", True)),
        participants=participants, catalog=dict(state.get("catalog", {})), queue=queue,
        wishlist_requests=list(state.get("wishlist_requests", [])),
        wishlist_available=list(state.get("wishlist_available", [])),
        playback=dict(state.get("playback", {})),
        up_next_notified_item_id=state.get("up_next_notified_item_id"),
        created_at=datetime.fromisoformat(state["created_at"]),
        last_activity_at=datetime.fromisoformat(state["last_activity_at"]),
        dj_last_seen_at=datetime.fromisoformat(state.get("dj_last_seen_at", state["last_activity_at"])),
    )


class PostgresRoomRepository:
    """JSONB-backed aggregate store with a cross-process transaction lock."""

    def __init__(self, database_url: str):
        self.database_url = database_url
        self.pool = None

    async def initialize(self):
        self.pool = await asyncpg.create_pool(self.database_url, min_size=1, max_size=10)
        async with self.pool.acquire() as connection:
            await connection.execute("""
                CREATE TABLE IF NOT EXISTS party_rooms (
                    id UUID PRIMARY KEY,
                    code VARCHAR(6) UNIQUE NOT NULL,
                    state JSONB NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)

    async def close(self):
        if self.pool:
            await self.pool.close()

    @asynccontextmanager
    async def transaction(self):
        if not self.pool:
            raise RuntimeError("Repositorio PostgreSQL no inicializado")
        async with self.pool.acquire() as connection:
            async with connection.transaction():
                await connection.execute("SELECT pg_advisory_xact_lock(hashtext('que-suene-room-state'))")
                rows = await connection.fetch("SELECT state FROM party_rooms")
                decoded = [json.loads(row["state"]) if isinstance(row["state"], str) else dict(row["state"]) for row in rows]
                states = {str(state["id"]): state for state in decoded}
                yield states
                for state in states.values():
                    await connection.execute(
                        """INSERT INTO party_rooms(id, code, state, updated_at)
                           VALUES($1::uuid, $2, $3::jsonb, NOW())
                           ON CONFLICT(id) DO UPDATE SET code=EXCLUDED.code,
                           state=EXCLUDED.state, updated_at=NOW()""",
                        state["id"], state["code"], json.dumps(state),
                    )

    async def ping(self) -> bool:
        if not self.pool:
            return False
        async with self.pool.acquire() as connection:
            return await connection.fetchval("SELECT TRUE")
