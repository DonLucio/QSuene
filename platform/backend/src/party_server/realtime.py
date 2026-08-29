import socketio

from .config import Settings
from .event_broker import Priority, PriorityEventBroker
from .room_service import RoomConflictError, RoomNotFoundError, RoomPermissionError, RoomService
from .security import TokenError, decode_access_token
from .event_schemas import (
    ParticipantBlockUpdate, PlaybackUpdate, QueueItemEvent, QueueReorder,
    QueueRequestAdd, RequestIdEvent, RoomCyclicUpdate, RoomLimitUpdate,
    SettingsUpdate, WishlistAvailable, WishlistRequestAdd, validate_event,
)


def register_socket_handlers(
    sio: socketio.AsyncServer,
    room_service: RoomService,
    broker: PriorityEventBroker,
    settings: Settings,
) -> None:
    sessions: dict[str, dict] = {}

    @sio.event
    async def connect(sid, environ, auth):
        token = (auth or {}).get("token")
        if not token:
            raise socketio.exceptions.ConnectionRefusedError("Token requerido")
        try:
            claims = decode_access_token(settings, token)
            room = await room_service.set_connected(claims["room_id"], claims["sub"], True)
        except (TokenError, RoomNotFoundError, RoomConflictError) as exc:
            raise socketio.exceptions.ConnectionRefusedError(str(exc)) from exc

        sessions[sid] = claims
        await sio.enter_room(sid, claims["room_id"])
        await broker.publish(
            "room.state",
            room.snapshot(),
            room=claims["room_id"],
            priority=Priority.NORMAL,
        )

    @sio.event
    async def disconnect(sid, reason):
        claims = sessions.pop(sid, None)
        if not claims:
            return
        try:
            room = await room_service.set_connected(claims["room_id"], claims["sub"], False)
        except RoomNotFoundError:
            return
        await broker.publish(
            "room.state",
            room.snapshot(),
            room=claims["room_id"],
            priority=Priority.LOW,
        )

    @sio.on("room.snapshot.request")
    async def room_snapshot(sid, _payload=None):
        claims = sessions.get(sid)
        if not claims:
            return {"accepted": False, "error": "Sesión no autenticada"}
        room = await room_service.get_room(claims["room_id"])
        return {"accepted": True, "state": room.snapshot()}

    @sio.on("dj.heartbeat")
    async def dj_heartbeat(sid, _payload=None):
        claims = sessions.get(sid)
        if not claims:
            return {"accepted": False, "error": "Sesión no autenticada"}
        try:
            await room_service.touch_dj(claims["room_id"], claims["sub"])
        except (RoomPermissionError, RoomNotFoundError) as exc:
            return {"accepted": False, "error": str(exc)}
        return {"accepted": True}

    @sio.on("queue.request.add")
    async def add_request(sid, payload):
        claims = sessions.get(sid)
        if not claims:
            return {"accepted": False, "error": "Sesión no autenticada"}
        validated, validation_error = validate_event(QueueRequestAdd, payload)
        if validation_error:
            return {"accepted": False, "error": validation_error}
        try:
            room = await room_service.add_request(claims["room_id"], claims["sub"], validated)
        except (RoomConflictError, RoomNotFoundError, RoomPermissionError) as exc:
            return {"accepted": False, "error": str(exc)}
        await broker.publish(
            "room.state",
            room.snapshot(),
            room=room.id,
            priority=Priority.HIGH,
        )
        return {
            "accepted": True,
            "room_version": room.version,
            "state": room.snapshot(),
        }

    @sio.on("wishlist.available")
    async def wishlist_available(sid, payload):
        claims = sessions.get(sid)
        if not claims:
            return {"accepted": False, "error": "Sesión no autenticada"}
        validated, validation_error = validate_event(WishlistAvailable, payload)
        if validation_error:
            return {"accepted": False, "error": validation_error}
        try:
            request_id = validated["request_id"]
            room, notice = await room_service.mark_wishlist_available(
                claims["room_id"],
                claims["sub"],
                request_id,
                validated["title"], validated["artist"],
            )
        except (RoomPermissionError, RoomNotFoundError) as exc:
            return {"accepted": False, "error": str(exc)}
        await broker.publish(
            "wishlist.available",
            notice,
            room=room.id,
            priority=Priority.HIGH,
        )
        await broker.publish("room.state", room.snapshot(), room=room.id, priority=Priority.HIGH)
        return {"accepted": True, "room_version": room.version}

    @sio.on("wishlist.available.ack")
    async def acknowledge_wishlist_available(sid, payload):
        claims = sessions.get(sid)
        if not claims:
            return {"accepted": False, "error": "Sesión no autenticada"}
        validated, validation_error = validate_event(RequestIdEvent, payload)
        if validation_error:
            return {"accepted": False, "error": validation_error}
        try:
            room, removed = await room_service.acknowledge_wishlist_available(
                claims["room_id"],
                claims["sub"],
                validated["request_id"],
            )
        except (RoomPermissionError, RoomNotFoundError) as exc:
            return {"accepted": False, "error": str(exc)}
        if removed:
            await broker.publish("room.state", room.snapshot(), room=room.id, priority=Priority.HIGH)
        return {"accepted": True, "removed": removed, "room_version": room.version}

    @sio.on("wishlist.request.add")
    async def add_wishlist_request(sid, payload):
        claims = sessions.get(sid)
        if not claims:
            return {"accepted": False, "error": "Sesión no autenticada"}
        validated, validation_error = validate_event(WishlistRequestAdd, payload)
        if validation_error:
            return {"accepted": False, "error": validation_error}
        try:
            room, item = await room_service.add_wishlist_request(
                claims["room_id"],
                claims["sub"],
                validated,
            )
        except (RoomConflictError, RoomNotFoundError, RoomPermissionError) as exc:
            return {"accepted": False, "error": str(exc)}
        await broker.publish("room.state", room.snapshot(), room=room.id, priority=Priority.HIGH)
        await broker.publish("wishlist.requested", item, room=room.id, priority=Priority.HIGH)
        return {"accepted": True, "request": item, "room_version": room.version}

    @sio.on("room.limit.update")
    async def update_limit(sid, payload):
        claims = sessions.get(sid)
        if not claims:
            return {"accepted": False, "error": "Sesión no autenticada"}
        validated, validation_error = validate_event(RoomLimitUpdate, payload)
        if validation_error:
            return {"accepted": False, "error": validation_error}
        try:
            room = await room_service.update_limit(
                claims["room_id"],
                claims["sub"],
                validated["limit"],
            )
        except (RoomPermissionError, RoomNotFoundError, TypeError, ValueError) as exc:
            return {"accepted": False, "error": str(exc)}
        await broker.publish("room.state", room.snapshot(), room=room.id, priority=Priority.HIGH)
        await broker.publish(
            "room.settings.updated",
            {
                "changed": "limit",
                "limit_per_guest": room.limit_per_guest,
                "cyclic_requests": room.cyclic_requests,
                "room_version": room.version,
            },
            room=room.id,
            priority=Priority.HIGH,
        )
        return {"accepted": True, "limit_per_guest": room.limit_per_guest, "room_version": room.version}

    @sio.on("participant.block.update")
    async def update_participant_block(sid, payload):
        claims = sessions.get(sid)
        if not claims:
            return {"accepted": False, "error": "Sesión no autenticada"}
        validated, validation_error = validate_event(ParticipantBlockUpdate, payload)
        if validation_error:
            return {"accepted": False, "error": validation_error}
        target_id = validated["participant_id"]
        blocked = validated["blocked"]
        try:
            room = await room_service.set_participant_blocked(
                claims["room_id"],
                claims["sub"],
                target_id,
                blocked,
            )
        except (RoomPermissionError, RoomNotFoundError) as exc:
            return {"accepted": False, "error": str(exc)}
        await broker.publish("room.state", room.snapshot(), room=room.id, priority=Priority.HIGH)
        await broker.publish(
            "participant.block.updated",
            {"participant_id": target_id, "blocked": blocked, "room_version": room.version},
            room=room.id,
            priority=Priority.CRITICAL,
        )
        return {"accepted": True, "blocked": blocked, "room_version": room.version}

    @sio.on("room.cyclic.update")
    async def update_cyclic_requests(sid, payload):
        claims = sessions.get(sid)
        if not claims:
            return {"accepted": False, "error": "Sesión no autenticada"}
        validated, validation_error = validate_event(RoomCyclicUpdate, payload)
        if validation_error:
            return {"accepted": False, "error": validation_error}
        try:
            room = await room_service.update_cyclic_requests(
                claims["room_id"],
                claims["sub"],
                validated["cyclic_requests"],
            )
        except (RoomPermissionError, RoomNotFoundError) as exc:
            return {"accepted": False, "error": str(exc)}
        await broker.publish("room.state", room.snapshot(), room=room.id, priority=Priority.HIGH)
        await broker.publish(
            "room.settings.updated",
            {
                "changed": "cyclic_requests",
                "limit_per_guest": room.limit_per_guest,
                "cyclic_requests": room.cyclic_requests,
                "room_version": room.version,
            },
            room=room.id,
            priority=Priority.HIGH,
        )
        return {
            "accepted": True,
            "cyclic_requests": room.cyclic_requests,
            "room_version": room.version,
        }

    @sio.on("queue.item.reorder")
    async def reorder_queue(sid, payload):
        claims = sessions.get(sid)
        if not claims:
            return {"accepted": False, "error": "Sesión no autenticada"}
        validated, validation_error = validate_event(QueueReorder, payload)
        if validation_error:
            return {"accepted": False, "error": validation_error}
        try:
            room = await room_service.reorder_queue(
                claims["room_id"],
                claims["sub"],
                validated["item_id"], validated["new_index"],
            )
        except (RoomPermissionError, RoomNotFoundError, TypeError, ValueError) as exc:
            return {"accepted": False, "error": str(exc)}
        await broker.publish("room.state", room.snapshot(), room=room.id, priority=Priority.HIGH)
        return {"accepted": True, "room_version": room.version}

    @sio.on("settings.update")
    async def update_settings(sid, payload):
        claims = sessions.get(sid)
        if not claims:
            return {"accepted": False, "error": "Sesión no autenticada"}
        payload_dict, validation_error = validate_event(SettingsUpdate, payload)
        if validation_error:
            return {"accepted": False, "error": validation_error}
        try:
            room = await room_service.update_room_settings(
                claims["room_id"],
                claims["sub"],
                is_public=payload_dict.get("is_public"),
                limit_per_guest=payload_dict.get("limit_per_guest"),
                cyclic_requests=payload_dict.get("cyclic_requests"),
            )
        except (RoomPermissionError, RoomNotFoundError, ValueError) as exc:
            return {"accepted": False, "error": str(exc)}
        await broker.publish("room.state", room.snapshot(), room=room.id, priority=Priority.HIGH)
        return {"accepted": True, "room_version": room.version}

    @sio.on("playback.update")

    async def playback_update(sid, payload):
        claims = sessions.get(sid)
        if not claims:
            return {"accepted": False, "error": "Sesión no autenticada"}
        validated, validation_error = validate_event(PlaybackUpdate, payload)
        if validation_error:
            return {"accepted": False, "error": validation_error}
        try:
            previous_room = await room_service.get_room(claims["room_id"])
            previous_playback = dict(previous_room.playback)
            room = await room_service.update_playback(claims["room_id"], claims["sub"], validated)
        except (RoomPermissionError, RoomNotFoundError, ValueError) as exc:
            return {"accepted": False, "error": str(exc)}
        priority = Priority.LOW if validated.get("progress_only") else Priority.CRITICAL
        await broker.publish("room.state", room.snapshot(), room=room.id, priority=priority)
        current = room.playback.get("current")
        previous_current = previous_playback.get("current") or {}
        current_key = (
            f"{(current or {}).get('queue_item_id', '')}|"
            f"{(current or {}).get('song_id', '')}|{(current or {}).get('title', '')}"
        )
        previous_key = (
            f"{previous_current.get('queue_item_id', '')}|"
            f"{previous_current.get('song_id', '')}|{previous_current.get('title', '')}"
        )
        transport_changed = (
            bool(previous_playback.get("playing")) != bool(room.playback.get("playing"))
            or current_key != previous_key
        )
        if current and transport_changed:
            await broker.publish(
                "playback.status",
                {
                    "playing": bool(room.playback.get("playing")),
                    "song_id": current.get("song_id", ""),
                    "queue_item_id": current.get("queue_item_id"),
                    "title": current.get("title", "Canción actual"),
                    "artist": current.get("artist", ""),
                    "requested_by": current.get("requested_by"),
                    "position_ms": room.playback.get("position_ms", 0),
                    "duration_ms": room.playback.get("duration_ms", 0),
                    "song_changed": current_key != previous_key,
                },
                room=room.id,
                priority=Priority.CRITICAL,
            )
        upcoming = await room_service.claim_up_next_notification(room.id)
        if upcoming:
            await broker.publish("queue.up_next", upcoming, room=room.id, priority=Priority.CRITICAL)
        return {"accepted": True, "room_version": room.version}

    @sio.on("queue.item.consume")
    async def consume_next(sid, payload=None):
        claims = sessions.get(sid)
        if not claims:
            return {"accepted": False, "error": "Sesión no autenticada"}
        validated, validation_error = validate_event(QueueItemEvent, payload)
        if validation_error:
            return {"accepted": False, "error": validation_error}
        try:
            room, item = await room_service.consume_next(
                claims["room_id"],
                claims["sub"],
                validated["item_id"],
            )
        except (RoomPermissionError, RoomNotFoundError) as exc:
            return {"accepted": False, "error": str(exc)}
        if item is not None:
            await broker.publish(
                "room.state",
                room.snapshot(),
                room=room.id,
                priority=Priority.HIGH,
            )
        return {
            "accepted": True,
            "item": item.public_dict() if item else None,
            "room_version": room.version,
        }

    @sio.on("queue.item.remove")
    async def remove_queue_item(sid, payload=None):
        claims = sessions.get(sid)
        if not claims:
            return {"accepted": False, "error": "Sesión no autenticada"}
        validated, validation_error = validate_event(QueueItemEvent, payload)
        if validation_error:
            return {"accepted": False, "error": validation_error}
        try:
            room, item = await room_service.consume_next(
                claims["room_id"],
                claims["sub"],
                validated["item_id"],
            )
        except (RoomPermissionError, RoomNotFoundError) as exc:
            return {"accepted": False, "error": str(exc)}
        if item is not None:
            await broker.publish("room.state", room.snapshot(), room=room.id, priority=Priority.HIGH)
        return {
            "accepted": True,
            "item": item.public_dict() if item else None,
            "room_version": room.version,
        }
