from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum


class Role(str, Enum):
    DJ = "dj"
    GUEST = "guest"


class QueueSource(str, Enum):
    DJ = "dj"
    GUEST = "guest"


@dataclass(slots=True)
class Participant:
    id: str
    name: str
    role: Role
    device_id: str = ""
    connected: bool = False
    requests_made: int = 0
    blocked: bool = False
    disconnected_at: datetime | None = None

    def public_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "role": self.role.value,
            "connected": self.connected,
            "requests_made": self.requests_made,
            "blocked": self.blocked,
        }


@dataclass(slots=True)
class QueueItem:
    id: str
    song_id: str
    title: str
    artist: str
    source: QueueSource
    requested_by: str
    requested_by_name: str
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def public_dict(self) -> dict:
        return {
            "id": self.id,
            "song_id": self.song_id,
            "title": self.title,
            "artist": self.artist,
            "source": self.source.value,
            "requested_by": self.requested_by,
            "requested_by_name": self.requested_by_name,
            "created_at": self.created_at.isoformat(),
        }


@dataclass(slots=True)
class Room:
    id: str
    code: str
    name: str
    limit_per_guest: int
    dj_id: str
    cyclic_requests: bool = False
    is_public: bool = False
    version: int = 1
    open: bool = True
    participants: dict[str, Participant] = field(default_factory=dict)
    catalog: dict[str, dict] = field(default_factory=dict)
    queue: list[QueueItem] = field(default_factory=list)
    guest_song_request_counts: dict[str, int] = field(default_factory=dict)
    wishlist_requests: list[dict] = field(default_factory=list)
    wishlist_available: list[dict] = field(default_factory=list)
    playback: dict = field(default_factory=lambda: {
        "current": None,
        "position_ms": 0,
        "duration_ms": 0,
        "playing": False,
    })
    up_next_notified_item_id: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_activity_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    dj_last_seen_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def snapshot(self) -> dict:
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "version": self.version,
            "open": self.open,
            "limit_per_guest": self.limit_per_guest,
            "cyclic_requests": self.cyclic_requests,
            "is_public": self.is_public,
            "participants": [participant.public_dict() for participant in self.participants.values()],
            "catalog_count": len(self.catalog),
            "queue": [item.public_dict() for item in self.queue],
            "guest_song_request_counts": dict(self.guest_song_request_counts),
            "wishlist_requests": list(self.wishlist_requests),
            "wishlist_available": list(self.wishlist_available),
            "playback": self.playback,
            "created_at": self.created_at.isoformat(),
            "last_activity_at": self.last_activity_at.isoformat(),
            "dj_last_seen_at": self.dj_last_seen_at.isoformat(),
        }

    def public_listing(self) -> dict:
        connected_guests = sum(1 for p in self.participants.values() if p.role is Role.GUEST and p.connected)
        guest_count = sum(1 for p in self.participants.values() if p.role is Role.GUEST)
        dj_name = next((p.name for p in self.participants.values() if p.role is Role.DJ), "DJ")
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "dj_name": dj_name,
            "is_public": self.is_public,
            "connected_guests": connected_guests,
            "guest_count": guest_count,
            "max_public_guests": 10,
            "available_slots": max(0, 10 - guest_count),
            "playback": self.playback,
            "catalog_count": len(self.catalog),
            "open": self.open,
        }
