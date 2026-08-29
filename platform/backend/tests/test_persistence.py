from datetime import datetime, timezone

from party_server.models import Participant, QueueItem, QueueSource, Role, Room
from party_server.persistence import room_from_state, room_to_state


def test_room_aggregate_round_trip_preserves_operational_state():
    guest = Participant(
        id="guest-1", name="Ana", role=Role.GUEST, connected=False,
        requests_made=2, disconnected_at=datetime.now(timezone.utc),
    )
    room = Room(id="room-1", code="ABC123", name="Fiesta", limit_per_guest=3, dj_id="dj-1")
    room.participants[guest.id] = guest
    room.catalog["song-1"] = {"song_id": "song-1", "title": "Tema", "artist": "Artista"}
    room.queue.append(QueueItem(
        id="queue-1", song_id="song-1", title="Tema", artist="Artista",
        source=QueueSource.GUEST, requested_by=guest.id, requested_by_name=guest.name,
    ))
    room.wishlist_available.append({"request_id": "wish-1", "requested_by": guest.id})

    restored = room_from_state(room_to_state(room))

    assert restored.code == room.code
    assert restored.catalog == room.catalog
    assert restored.queue[0].id == "queue-1"
    assert restored.participants[guest.id].disconnected_at is not None
    assert restored.wishlist_available == room.wishlist_available
