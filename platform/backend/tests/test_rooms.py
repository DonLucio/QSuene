from datetime import datetime, timedelta, timezone

import pytest

from party_server.models import Role
from party_server.room_service import RoomConflictError, RoomPermissionError, RoomService


@pytest.mark.asyncio
async def test_create_join_and_request_song():
    service = RoomService()
    room, dj = await service.create_room("Cumpleaños", "DJ Andrea", 2)
    room, guest = await service.join_room(room.code, "Laura")
    await service.replace_catalog(room.id, dj.id, [{"song_id": "song-1", "title": "Una canción", "artist": "Artista", "album": "", "duration": 0}])

    assert dj.role is Role.DJ
    assert guest.role is Role.GUEST

    updated = await service.add_request(
        room.id,
        guest.id,
        {"song_id": "song-1", "title": "Una canción", "artist": "Artista"},
    )

    assert updated.queue[0].requested_by == guest.id
    assert updated.queue[0].source.value == "guest"


@pytest.mark.asyncio
async def test_guest_limit_is_enforced():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 1)
    room, guest = await service.join_room(room.code, "Invitado")
    await service.replace_catalog(room.id, dj.id, [
        {"song_id": "1", "title": "Primera", "artist": "", "album": "", "duration": 0},
        {"song_id": "2", "title": "Segunda", "artist": "", "album": "", "duration": 0},
    ])

    await service.add_request(room.id, guest.id, {"song_id": "1", "title": "Primera"})
    with pytest.raises(RoomConflictError):
        await service.add_request(room.id, guest.id, {"song_id": "2", "title": "Segunda"})


@pytest.mark.asyncio
async def test_same_song_cannot_be_queued_by_dj_and_guest():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 3)
    room, guest = await service.join_room(room.code, "Invitado")
    await service.replace_catalog(room.id, dj.id, [
        {"song_id": "same", "title": "Compartida", "artist": "", "album": "", "duration": 0},
    ])

    await service.add_request(room.id, dj.id, {"song_id": "same"})

    with pytest.raises(RoomConflictError, match="ya está programada"):
        await service.add_request(room.id, guest.id, {"song_id": "same"})


@pytest.mark.asyncio
async def test_guest_can_request_a_missing_song_only_once():
    service = RoomService()
    room, _dj = await service.create_room("Sala", "DJ", 3)
    room, guest = await service.join_room(room.code, "Invitado")

    room, request = await service.add_wishlist_request(room.id, guest.id, {
        "title": "Canción ausente",
        "artist": "Artista invitado",
    })

    assert request["requested_by_name"] == "Invitado"
    assert room.wishlist_requests[0]["title"] == "Canción ausente"
    with pytest.raises(RoomConflictError, match="ya fue solicitada"):
        await service.add_wishlist_request(room.id, guest.id, {
            "title": "Canción ausente",
            "artist": "Artista invitado",
        })


@pytest.mark.asyncio
async def test_dj_can_block_and_unblock_guest_requests():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 3)
    room, guest = await service.join_room(room.code, "Invitado", "blocked-device-123")
    await service.replace_catalog(room.id, dj.id, [
        {"song_id": "1", "title": "Primera", "artist": "", "album": "", "duration": 0},
    ])

    room = await service.set_participant_blocked(room.id, dj.id, guest.id, True)

    assert room.participants[guest.id].blocked is True
    with pytest.raises(RoomPermissionError, match="bloqueó"):
        await service.add_request(room.id, guest.id, {"song_id": "1"})
    with pytest.raises(RoomPermissionError, match="bloqueó"):
        await service.add_wishlist_request(room.id, guest.id, {
            "title": "Otra", "artist": "Artista",
        })

    room, rejoined = await service.join_room(room.code, "Nombre cambiado", "blocked-device-123")
    assert rejoined.id == guest.id and rejoined.blocked is True

    room = await service.set_participant_blocked(room.id, dj.id, guest.id, False)
    room = await service.add_request(room.id, guest.id, {"song_id": "1"})
    assert room.queue[0].requested_by == guest.id


@pytest.mark.asyncio
async def test_only_dj_can_update_playback():
    service = RoomService()
    room, _dj = await service.create_room("Sala", "DJ", 3)
    room, guest = await service.join_room(room.code, "Invitado")

    with pytest.raises(RoomPermissionError):
        await service.update_playback(room.id, guest.id, {"playing": True})


@pytest.mark.asyncio
async def test_dj_consumes_next_item_without_removing_the_rest():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 3)
    room, guest = await service.join_room(room.code, "Invitado")
    await service.replace_catalog(room.id, dj.id, [
        {"song_id": "1", "title": "Primera", "artist": "", "album": "", "duration": 0},
        {"song_id": "2", "title": "Segunda", "artist": "", "album": "", "duration": 0},
    ])
    await service.add_request(room.id, guest.id, {"song_id": "1", "title": "Primera"})
    await service.add_request(room.id, guest.id, {"song_id": "2", "title": "Segunda"})

    updated, item = await service.consume_next(room.id, dj.id)

    assert item is not None and item.song_id == "1"
    assert [queued.song_id for queued in updated.queue] == ["2"]


@pytest.mark.asyncio
async def test_guest_searches_the_room_catalog():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 3)
    room, guest = await service.join_room(room.code, "Invitado")
    await service.replace_catalog(room.id, dj.id, [
        {"song_id": "1", "title": "Corazón", "artist": "Orquesta", "album": "Éxitos", "duration": 180},
        {"song_id": "2", "title": "Otra", "artist": "Cantante", "album": "Disco", "duration": 200},
    ])

    songs, total = await service.search_catalog(room.id, guest.id, "corazon", 0, 20)

    assert total == 1
    assert songs[0]["song_id"] == "1"


@pytest.mark.asyncio
async def test_guest_catalog_prioritizes_highest_ratings():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 3)
    room, guest = await service.join_room(room.code, "Invitado")
    await service.replace_catalog(room.id, dj.id, [
        {"song_id": "one", "title": "Una estrella", "artist": "", "rating": 1},
        {"song_id": "three", "title": "Tres estrellas", "artist": "", "rating": 3},
        {"song_id": "five", "title": "Cinco estrellas", "artist": "", "rating": 5},
        {"song_id": "zero", "title": "Sin calificar", "artist": "", "rating": 0},
    ])

    songs, total = await service.search_catalog(room.id, guest.id, "", 0, 100)

    assert total == 4
    assert [song["song_id"] for song in songs] == ["five", "three", "zero", "one"]


@pytest.mark.asyncio
async def test_guest_catalog_rotates_large_default_rating_pool(monkeypatch):
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 3)
    room, guest = await service.join_room(room.code, "Invitado")
    await service.replace_catalog(room.id, dj.id, [
        {"song_id": str(index), "title": f"Canción {index:03}", "artist": "", "rating": 1}
        for index in range(51)
    ])

    shuffled = False
    class PredictableRandom:
        def shuffle(self, values):
            nonlocal shuffled
            shuffled = True
            values.reverse()

    monkeypatch.setattr("party_server.room_service.secrets.SystemRandom", lambda: PredictableRandom())
    songs, total = await service.search_catalog(room.id, guest.id, "", 0, 100)

    assert shuffled is True
    assert total == 51
    assert songs[0]["song_id"] == "50"


@pytest.mark.asyncio
async def test_replacing_catalog_removes_unavailable_queue_items():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 3)
    room, guest = await service.join_room(room.code, "Invitado")
    await service.replace_catalog(room.id, dj.id, [
        {"song_id": "old", "title": "Anterior", "artist": "", "album": "", "duration": 0},
        {"song_id": "keep", "title": "Conservar", "artist": "", "album": "", "duration": 0},
    ])
    await service.add_request(room.id, guest.id, {"song_id": "old", "title": "Anterior"})
    await service.add_request(room.id, guest.id, {"song_id": "keep", "title": "Conservar"})

    updated = await service.replace_catalog(room.id, dj.id, [
        {"song_id": "keep", "title": "Conservar", "artist": "", "album": "", "duration": 0},
        {"song_id": "new", "title": "Nueva", "artist": "", "album": "", "duration": 0},
    ])

    assert [item.song_id for item in updated.queue] == ["keep"]


@pytest.mark.asyncio
async def test_guest_requests_are_interleaved_in_rounds():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 5)
    room, guest_a = await service.join_room(room.code, "Ana")
    room, guest_b = await service.join_room(room.code, "Beto")
    await service.replace_catalog(room.id, dj.id, [
        {"song_id": str(index), "title": f"Canción {index}", "artist": "", "album": "", "duration": 0}
        for index in range(1, 7)
    ])
    for song_id in ("1", "2", "3"):
        await service.add_request(room.id, guest_a.id, {"song_id": song_id})
    for song_id in ("4", "5", "6"):
        room = await service.add_request(room.id, guest_b.id, {"song_id": song_id})

    assert [item.song_id for item in room.queue] == ["1", "4", "2", "5", "3", "6"]


@pytest.mark.asyncio
async def test_lowering_limit_keeps_programmed_songs_but_blocks_new_ones():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 4)
    room, guest = await service.join_room(room.code, "Invitado")
    await service.replace_catalog(room.id, dj.id, [
        {"song_id": str(index), "title": f"Canción {index}", "artist": "", "album": "", "duration": 0}
        for index in range(1, 5)
    ])
    for song_id in ("1", "2", "3"):
        await service.add_request(room.id, guest.id, {"song_id": song_id})

    room = await service.update_limit(room.id, dj.id, 1)

    assert len(room.queue) == 3
    assert room.limit_per_guest == 1
    with pytest.raises(RoomConflictError):
        await service.add_request(room.id, guest.id, {"song_id": "4"})


@pytest.mark.asyncio
async def test_dj_reorders_and_consumes_a_specific_item():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 4)
    room, guest = await service.join_room(room.code, "Invitado")
    await service.replace_catalog(room.id, dj.id, [
        {"song_id": str(index), "title": f"Canción {index}", "artist": "", "album": "", "duration": 0}
        for index in range(1, 4)
    ])
    for song_id in ("1", "2", "3"):
        room = await service.add_request(room.id, guest.id, {"song_id": song_id})

    selected_id = room.queue[2].id
    room = await service.reorder_queue(room.id, dj.id, selected_id, 0)
    room, consumed = await service.consume_next(room.id, dj.id, selected_id)

    assert consumed is not None and consumed.song_id == "3"
    assert [item.song_id for item in room.queue] == ["1", "2"]


@pytest.mark.asyncio
async def test_up_next_notification_is_claimed_once_inside_fifteen_seconds():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 3)
    room, guest = await service.join_room(room.code, "Invitado")
    await service.replace_catalog(room.id, dj.id, [
        {"song_id": "1", "title": "Próxima", "artist": "", "album": "", "duration": 0},
    ])
    await service.add_request(room.id, guest.id, {"song_id": "1"})
    await service.update_playback(room.id, dj.id, {
        "current": {"title": "Actual"},
        "position_ms": 46_000,
        "duration_ms": 60_000,
        "playing": True,
    })

    notice = await service.claim_up_next_notification(room.id)
    duplicate = await service.claim_up_next_notification(room.id)

    assert notice is not None and notice["requested_by"] == guest.id
    assert notice["seconds_remaining"] == 14
    assert duplicate is None


@pytest.mark.asyncio
async def test_one_time_limit_does_not_reopen_after_song_is_consumed():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 1, cyclic_requests=False)
    room, guest = await service.join_room(room.code, "Invitado")
    await service.replace_catalog(room.id, dj.id, [
        {"song_id": "1", "title": "Primera", "artist": "", "album": "", "duration": 0},
        {"song_id": "2", "title": "Segunda", "artist": "", "album": "", "duration": 0},
    ])
    await service.add_request(room.id, guest.id, {"song_id": "1"})
    await service.consume_next(room.id, dj.id)

    with pytest.raises(RoomConflictError):
        await service.add_request(room.id, guest.id, {"song_id": "2"})


@pytest.mark.asyncio
async def test_cyclic_limit_reopens_when_a_song_leaves_the_queue():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 1, cyclic_requests=True)
    room, guest = await service.join_room(room.code, "Invitado")
    await service.replace_catalog(room.id, dj.id, [
        {"song_id": "1", "title": "Primera", "artist": "", "album": "", "duration": 0},
        {"song_id": "2", "title": "Segunda", "artist": "", "album": "", "duration": 0},
    ])
    await service.add_request(room.id, guest.id, {"song_id": "1"})
    await service.consume_next(room.id, dj.id)

    updated = await service.add_request(room.id, guest.id, {"song_id": "2"})

    assert [item.song_id for item in updated.queue] == ["2"]
    assert updated.participants[guest.id].requests_made == 2


@pytest.mark.asyncio
async def test_guests_can_request_a_song_only_twice_per_party_but_dj_is_exempt():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 5, cyclic_requests=True)
    room, guest_a = await service.join_room(room.code, "Ana")
    room, guest_b = await service.join_room(room.code, "Beto")
    await service.replace_catalog(room.id, dj.id, [
        {"song_id": "hit", "title": "El hit", "artist": "Orquesta", "rating": 5},
    ])

    await service.add_request(room.id, guest_a.id, {"song_id": "hit"})
    await service.consume_next(room.id, dj.id)
    room = await service.add_request(room.id, guest_b.id, {"song_id": "hit"})
    await service.consume_next(room.id, dj.id)

    assert room.guest_song_request_counts == {"hit": 2}
    with pytest.raises(RoomConflictError, match="máximo de 2"):
        await service.add_request(room.id, guest_a.id, {"song_id": "hit"})

    room = await service.add_request(room.id, dj.id, {"song_id": "hit"})
    assert room.queue[-1].source.value == "dj"
    assert room.guest_song_request_counts == {"hit": 2}


@pytest.mark.asyncio
async def test_guest_catalog_marks_songs_that_reached_the_party_request_limit():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 5, cyclic_requests=True)
    room, guest = await service.join_room(room.code, "Invitado")
    await service.replace_catalog(room.id, dj.id, [
        {"song_id": "hit", "title": "El hit", "artist": "Orquesta", "rating": 5},
    ])
    for _ in range(2):
        await service.add_request(room.id, guest.id, {"song_id": "hit"})
        await service.consume_next(room.id, dj.id)

    songs, total = await service.search_catalog(room.id, guest.id, "", 0, 100)

    assert total == 1
    assert songs[0]["guest_request_count"] == 2
    assert songs[0]["guest_request_limit"] == 2
    assert songs[0]["guest_request_limit_reached"] is True
    assert (await service.get_room(room.id)).snapshot()["guest_song_request_counts"] == {"hit": 2}


@pytest.mark.asyncio
async def test_same_device_keeps_identity_and_quota_after_rejoining_with_another_name():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 1, cyclic_requests=False)
    room, guest = await service.join_room(room.code, "Nombre inicial", "device-persistent-123")
    await service.replace_catalog(room.id, dj.id, [
        {"song_id": "1", "title": "Primera", "artist": "", "album": "", "duration": 0},
        {"song_id": "2", "title": "Segunda", "artist": "", "album": "", "duration": 0},
    ])
    await service.add_request(room.id, guest.id, {"song_id": "1"})

    room, rejoined = await service.join_room(room.code, "Otro nombre", "device-persistent-123")

    assert rejoined.id == guest.id
    assert rejoined.requests_made == 1
    with pytest.raises(RoomConflictError):
        await service.add_request(room.id, rejoined.id, {"song_id": "2"})


@pytest.mark.asyncio
async def test_public_room_blocks_the_eleventh_unique_guest_but_allows_rejoining_device():
    service = RoomService()
    room, _dj = await service.create_room("Abierta", "DJ", 3, is_public=True)
    for index in range(10):
        room, _guest = await service.join_room(room.code, f"Invitado {index}", f"public-device-{index:02d}-long")

    assert await service.get_public_rooms() == []
    room, rejoined = await service.join_room(room.code, "Invitado actualizado", "public-device-00-long")
    assert rejoined.name == "Invitado actualizado"
    with pytest.raises(RoomConflictError, match="límite de 10"):
        await service.join_room(room.code, "Once", "public-device-11-long")


@pytest.mark.asyncio
async def test_download_availability_notice_persists_until_guest_acknowledges_it():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 3)
    room, guest = await service.join_room(room.code, "Invitado")
    room, request = await service.add_wishlist_request(
        room.id,
        guest.id,
        {"title": "Nueva canción", "artist": "Artista"},
    )

    room, notice = await service.mark_wishlist_available(
        room.id, dj.id, request["id"], request["title"], request["artist"],
    )
    snapshot = room.snapshot()

    assert notice["requested_by"] == guest.id
    assert snapshot["wishlist_available"] == [notice]

    room, removed = await service.acknowledge_wishlist_available(
        room.id, guest.id, request["id"],
    )

    assert removed is True
    assert room.snapshot()["wishlist_available"] == []


@pytest.mark.asyncio
async def test_other_guest_cannot_acknowledge_an_availability_notice():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 3)
    room, owner = await service.join_room(room.code, "Dueño")
    room, other = await service.join_room(room.code, "Otro")
    room, request = await service.add_wishlist_request(
        room.id,
        owner.id,
        {"title": "Privada", "artist": "Artista"},
    )
    await service.mark_wishlist_available(room.id, dj.id, request["id"])

    room, removed = await service.acknowledge_wishlist_available(
        room.id, other.id, request["id"],
    )

    assert removed is False
    assert len(room.wishlist_available) == 1


@pytest.mark.asyncio
async def test_playback_preserves_the_consumed_queue_item_identity():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 3)

    room = await service.update_playback(room.id, dj.id, {
        "current": {
            "song_id": "same-song",
            "queue_item_id": "request-turn-42",
            "title": "Canción repetible",
            "artist": "Artista",
            "requested_by": "guest-1",
        },
        "position_ms": 750,
        "duration_ms": 180_000,
        "playing": True,
    })

    assert room.snapshot()["playback"]["current"]["queue_item_id"] == "request-turn-42"


@pytest.mark.asyncio
async def test_room_closes_when_dj_lease_expires_even_with_connected_guests():
    service = RoomService()
    room, dj = await service.create_room("Sala pública", "DJ", 3, is_public=True)
    room, guest = await service.join_room(room.code, "Invitado")
    await service.set_connected(room.id, dj.id, True)
    await service.set_connected(room.id, guest.id, True)
    room.dj_last_seen_at = datetime.now(timezone.utc) - timedelta(seconds=61)

    closed = await service.cleanup_expired(dj_absence_seconds=60)

    assert closed == [room.id]
    assert room.open is False
    assert room.is_public is False
    assert all(not participant.connected for participant in room.participants.values())
    assert await service.get_public_rooms() == []


@pytest.mark.asyncio
async def test_dj_heartbeat_renews_room_lease():
    service = RoomService()
    room, dj = await service.create_room("Sala", "DJ", 3, is_public=True)
    room.dj_last_seen_at = datetime.now(timezone.utc) - timedelta(seconds=61)

    await service.touch_dj(room.id, dj.id)
    closed = await service.cleanup_expired(dj_absence_seconds=60)

    assert closed == []
    assert room.open is True
