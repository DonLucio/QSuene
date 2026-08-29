from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from .config import Settings, get_settings
from .event_broker import Priority, PriorityEventBroker
from .models import Role
from .room_service import RoomConflictError, RoomNotFoundError, RoomPermissionError, RoomService
from .schemas import (
    CreateRoomRequest,
    JoinRoomRequest,
    ReplaceCatalogRequest,
    RoomAccessResponse,
    ResolveMusicSelectionRequest,
    UpdateRoomSettingsRequest,
)
from .security import TokenError, create_access_token, decode_access_token
from .music_discovery import DiscoveryUnavailableError


def create_router(room_service: RoomService, broker: PriorityEventBroker, redis_client=None, discovery_service=None) -> APIRouter:
    router = APIRouter(prefix="/api/v1")

    @router.get("/health")
    async def health() -> dict:
        repository = getattr(room_service, "_repository", None)
        database = "disabled" if repository is None else ("ok" if await repository.ping() else "error")
        redis_status = "disabled" if redis_client is None else ("ok" if await redis_client.ping() else "error")
        healthy = database != "error" and redis_status != "error"
        return {
            "status": "ok" if healthy else "degraded",
            "database": database,
            "redis": redis_status,
        }

    @router.get("/parties/public")
    @router.get("/rooms/public")
    async def public_parties() -> list[dict]:
        return await room_service.get_public_rooms()

    @router.post("/rooms", response_model=RoomAccessResponse, status_code=status.HTTP_201_CREATED)
    async def create_room(payload: CreateRoomRequest, settings: Settings = Depends(get_settings)):
        room, dj = await room_service.create_room(
            payload.name,
            payload.dj_name,
            payload.limit_per_guest,
            payload.cyclic_requests,
            payload.is_public,
        )
        token = create_access_token(
            settings,
            room_id=room.id,
            participant_id=dj.id,
            role=Role.DJ,
        )
        return RoomAccessResponse(
            room_id=room.id,
            room_code=room.code,
            participant_id=dj.id,
            role=dj.role.value,
            token=token,
            join_url=f"{settings.public_url.rstrip('/')}/?room={room.code}",
        )


    @router.post("/rooms/{code}/join", response_model=RoomAccessResponse)
    async def join_room(code: str, payload: JoinRoomRequest, settings: Settings = Depends(get_settings)):
        try:
            room, guest = await room_service.join_room(code, payload.guest_name, payload.device_id)
        except RoomNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RoomConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        token = create_access_token(
            settings,
            room_id=room.id,
            participant_id=guest.id,
            role=Role.GUEST,
        )
        return RoomAccessResponse(
            room_id=room.id,
            room_code=room.code,
            participant_id=guest.id,
            role=guest.role.value,
            token=token,
            join_url=f"{settings.public_url.rstrip('/')}/?room={room.code}",
        )

    @router.get("/rooms/{room_id}")
    async def room_snapshot(
        room_id: str,
        authorization: str | None = Header(default=None),
        settings: Settings = Depends(get_settings),
    ):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Token requerido")
        try:
            claims = decode_access_token(settings, authorization.removeprefix("Bearer "))
            if claims["room_id"] != room_id:
                raise TokenError("El token no corresponde a esta sala")
            room = await room_service.get_room(room_id)
        except TokenError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        except RoomNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return room.snapshot()

    @router.delete("/rooms/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def close_room(
        room_id: str,
        authorization: str | None = Header(default=None),
        settings: Settings = Depends(get_settings),
    ):
        claims = _authenticated_claims(authorization, settings, room_id)
        try:
            room = await room_service.close_room(room_id, claims["sub"])
        except RoomNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RoomPermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        await broker.publish("room.closed", {"room_id": room.id}, room=room.id, priority=Priority.CRITICAL)
        return None

    @router.put("/rooms/{room_id}/catalog")
    async def replace_catalog(
        room_id: str,
        payload: ReplaceCatalogRequest,
        authorization: str | None = Header(default=None),
        settings: Settings = Depends(get_settings),
    ):
        claims = _authenticated_claims(authorization, settings, room_id)
        try:
            room = await room_service.replace_catalog(
                room_id,
                claims["sub"],
                [song.model_dump() for song in payload.songs],
            )
        except RoomNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RoomPermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        await broker.publish(
            "room.state",
            room.snapshot(),
            room=room.id,
            priority=Priority.HIGH,
        )
        await broker.publish(
            "catalog.updated",
            {
                "room_id": room.id,
                "room_version": room.version,
                "catalog_count": len(room.catalog),
            },
            room=room.id,
            priority=Priority.HIGH,
        )
        return {"success": True, "catalog_count": len(room.catalog), "room_version": room.version}

    @router.get("/rooms/{room_id}/catalog")
    async def search_catalog(
        room_id: str,
        q: str = "",
        offset: int = 0,
        limit: int = 100,
        authorization: str | None = Header(default=None),
        settings: Settings = Depends(get_settings),
    ):
        claims = _authenticated_claims(authorization, settings, room_id)
        normalized_offset = max(0, offset)
        normalized_limit = max(1, min(200, limit))
        try:
            songs, total = await room_service.search_catalog(
                room_id,
                claims["sub"],
                q,
                normalized_offset,
                normalized_limit,
            )
        except RoomNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return {"songs": songs, "total": total, "offset": normalized_offset, "limit": normalized_limit}

    @router.get("/rooms/{room_id}/discovery")
    async def discover_music(
        room_id: str,
        q: str = Query(min_length=2, max_length=200),
        limit: int = Query(default=20, ge=1, le=30),
        authorization: str | None = Header(default=None),
        settings: Settings = Depends(get_settings),
    ):
        claims = _authenticated_claims(authorization, settings, room_id)
        if discovery_service is None:
            raise HTTPException(status_code=503, detail="La búsqueda asistida no está disponible")
        try:
            local_songs, local_total = await room_service.search_catalog(room_id, claims["sub"], q, 0, 1)
            results = await discovery_service.search(q, claims["sub"], limit)
        except RoomNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except DiscoveryUnavailableError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        repository = getattr(room_service, "_repository", None)
        if repository and not results:
            await repository.record_music_search(
                room_id, claims["sub"], q, local_total, 0, "unresolved",
                provider=getattr(discovery_service.provider, "provider", ""),
            )
        return {
            "query": q, "results": results, "total": len(results),
            "local_result_count": local_total,
            "attribution": {"label": "Información musical de Last.fm", "url": "https://www.last.fm"},
        }

    @router.post("/rooms/{room_id}/discovery/resolve")
    async def resolve_music(
        room_id: str,
        payload: ResolveMusicSelectionRequest,
        authorization: str | None = Header(default=None),
        settings: Settings = Depends(get_settings),
    ):
        claims = _authenticated_claims(authorization, settings, room_id)
        try:
            room, resolution, result = await room_service.resolve_music_selection(
                room_id, claims["sub"], payload.model_dump(),
            )
        except RoomNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RoomPermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except RoomConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        await broker.publish("room.state", room.snapshot(), room=room.id, priority=Priority.HIGH)
        if resolution == "wishlist_requested":
            await broker.publish("wishlist.requested", result, room=room.id, priority=Priority.HIGH)
        repository = getattr(room_service, "_repository", None)
        if repository:
            await repository.record_music_search(
                room_id, claims["sub"], payload.query, 1 if resolution == "queued" else 0,
                1, resolution, payload.title, payload.artist, payload.provider,
            )
        participant = room.participants[claims["sub"]]
        own_pending = sum(1 for item in room.queue if item.requested_by == claims["sub"])
        requests_used = own_pending if room.cyclic_requests else participant.requests_made
        return {
            "accepted": True, "resolution": resolution, "result": result,
            "state": room.snapshot(), "requests_used": requests_used,
            "requests_remaining": max(0, room.limit_per_guest - requests_used),
        }

    @router.patch("/rooms/{room_id}/settings")

    async def update_room_settings(
        room_id: str,
        payload: UpdateRoomSettingsRequest,
        authorization: str | None = Header(default=None),
        settings: Settings = Depends(get_settings),
    ):
        claims = _authenticated_claims(authorization, settings, room_id)
        try:
            room = await room_service.update_room_settings(
                room_id,
                claims["sub"],
                is_public=payload.is_public,
                limit_per_guest=payload.limit_per_guest,
                cyclic_requests=payload.cyclic_requests,
            )
        except RoomNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RoomPermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        await broker.publish(
            "room.state",
            room.snapshot(),
            room=room.id,
            priority=Priority.HIGH,
        )
        return room.snapshot()

    return router



def _authenticated_claims(
    authorization: str | None,
    settings: Settings,
    room_id: str,
) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token requerido")
    try:
        claims = decode_access_token(settings, authorization.removeprefix("Bearer "))
    except TokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    if claims["room_id"] != room_id:
        raise HTTPException(status_code=403, detail="El token no corresponde a esta sala")
    return claims
