import asyncio
from contextlib import asynccontextmanager
import secrets
import string
import unicodedata
import uuid
import re
from datetime import datetime, timedelta, timezone

from .models import Participant, QueueItem, QueueSource, Role, Room
from .persistence import room_from_state, room_to_state


class RoomNotFoundError(KeyError):
    pass


class RoomPermissionError(PermissionError):
    pass


class RoomConflictError(ValueError):
    pass


class RoomService:
    """Núcleo de dominio. La interfaz permite sustituir memoria por PostgreSQL."""

    def __init__(self, repository=None) -> None:
        self._rooms: dict[str, Room] = {}
        self._room_ids_by_code: dict[str, str] = {}
        self._lock = asyncio.Lock()
        self._repository = repository

    @asynccontextmanager
    async def _guard(self):
        if self._repository is None:
            async with self._lock:
                yield
            return
        async with self._repository.transaction() as states:
            self._rooms = {room_id: room_from_state(state) for room_id, state in states.items()}
            self._room_ids_by_code = {room.code: room.id for room in self._rooms.values()}
            yield
            states.clear()
            states.update({room_id: room_to_state(room) for room_id, room in self._rooms.items()})

    PUBLIC_GUEST_CAP = 10
    MAX_GUEST_REQUESTS_PER_SONG = 2

    @classmethod
    def _music_identity(cls, title: str, artist: str) -> tuple[str, str]:
        def clean(value: str) -> str:
            normalized = cls._normalize(value)
            normalized = re.sub(
                r"\b(remaster(?:ed)?|version|radio edit|official audio|live|\d{4})\b",
                " ", normalized,
            )
            normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
            return re.sub(r"\s+", " ", normalized).strip()
        return clean(title), clean(artist)

    @staticmethod
    def _new_code() -> str:
        alphabet = string.ascii_uppercase + string.digits
        return "".join(secrets.choice(alphabet) for _ in range(6))

    async def create_room(
        self,
        name: str,
        dj_name: str,
        limit_per_guest: int,
        cyclic_requests: bool = False,
        is_public: bool = False,
    ) -> tuple[Room, Participant]:
        async with self._guard():
            code = self._new_code()
            while code in self._room_ids_by_code:
                code = self._new_code()
            room_id = str(uuid.uuid4())
            dj = Participant(id=str(uuid.uuid4()), name=dj_name, role=Role.DJ)
            room = Room(
                id=room_id,
                code=code,
                name=name,
                limit_per_guest=limit_per_guest,
                dj_id=dj.id,
                cyclic_requests=bool(cyclic_requests),
                is_public=bool(is_public),
                participants={dj.id: dj},
            )
            self._rooms[room_id] = room
            self._room_ids_by_code[code] = room_id
            return room, dj


    async def join_room(self, code: str, guest_name: str, device_id: str = "") -> tuple[Room, Participant]:
        async with self._guard():
            room = self._get_by_code(code)
            if not room.open:
                raise RoomConflictError("La sala está cerrada")
            normalized_device_id = str(device_id or "").strip()
            if normalized_device_id:
                existing = next((
                    participant for participant in room.participants.values()
                    if participant.role is Role.GUEST and participant.device_id == normalized_device_id
                ), None)
                if existing is not None:
                    # The display name may change, but identity and quota do not.
                    existing.name = guest_name
                    room.version += 1
                    return room, existing
            # A public room is advertised from the landing page only while it
            # has capacity. Count unique guests rather than live sockets so a
            # refresh/reconnect cannot bypass the advertised room capacity.
            if room.is_public:
                guest_count = sum(
                    1 for participant in room.participants.values()
                    if participant.role is Role.GUEST
                )
                if guest_count >= self.PUBLIC_GUEST_CAP:
                    raise RoomConflictError("La sala pública alcanzó el límite de 10 invitados")
            guest = Participant(
                id=str(uuid.uuid4()),
                name=guest_name,
                role=Role.GUEST,
                device_id=normalized_device_id,
            )
            room.participants[guest.id] = guest
            room.version += 1
            return room, guest

    async def get_room(self, room_id: str) -> Room:
        async with self._guard():
            room = self._rooms.get(room_id)
            if room is None:
                raise RoomNotFoundError("Sala no encontrada")
            return room

    async def set_connected(self, room_id: str, participant_id: str, connected: bool) -> Room:
        async with self._guard():
            room = self._require_participant(room_id, participant_id)
            if connected and not room.open:
                raise RoomConflictError("La sala está cerrada")
            room.participants[participant_id].connected = connected
            room.participants[participant_id].disconnected_at = (
                None if connected else datetime.now(timezone.utc)
            )
            room.last_activity_at = datetime.now(timezone.utc)
            if participant_id == room.dj_id and connected:
                room.dj_last_seen_at = room.last_activity_at
            room.version += 1
            return room

    async def touch_dj(self, room_id: str, participant_id: str) -> Room:
        """Renew the room lease using a signal that can only come from its DJ."""
        async with self._guard():
            room = self._require_participant(room_id, participant_id)
            if participant_id != room.dj_id:
                raise RoomPermissionError("Solo el DJ puede mantener activa la sala")
            now = datetime.now(timezone.utc)
            room.dj_last_seen_at = now
            room.last_activity_at = now
            return room

    async def add_request(self, room_id: str, participant_id: str, payload: dict) -> Room:
        async with self._guard():
            room = self._require_participant(room_id, participant_id)
            participant = room.participants[participant_id]
            if participant.blocked:
                raise RoomPermissionError("El DJ bloqueó nuevas solicitudes para este usuario")
            song_id = str(payload.get("song_id", "")).strip()
            catalog_song = room.catalog.get(song_id)
            if catalog_song is None:
                raise RoomConflictError("La canción no pertenece al catálogo de esta fiesta")

            if any(item.song_id == song_id for item in room.queue):
                raise RoomConflictError("La canción ya está programada en la cola")

            if participant.role is Role.GUEST:
                song_request_count = int(room.guest_song_request_counts.get(song_id, 0))
                if song_request_count >= self.MAX_GUEST_REQUESTS_PER_SONG:
                    raise RoomConflictError(
                        "Esta canción ya alcanzó el máximo de 2 solicitudes en la fiesta"
                    )
                pending = sum(1 for item in room.queue if item.requested_by == participant_id)
                used = pending if room.cyclic_requests else participant.requests_made
                if used >= room.limit_per_guest:
                    raise RoomConflictError(f"Límite de {room.limit_per_guest} solicitudes alcanzado")

            source = QueueSource.DJ if participant.role is Role.DJ else QueueSource.GUEST
            item = QueueItem(
                id=str(uuid.uuid4()),
                song_id=song_id,
                title=catalog_song["title"],
                artist=catalog_song.get("artist", ""),
                source=source,
                requested_by=participant.id,
                requested_by_name=participant.name,
            )
            if participant.role is Role.DJ and payload.get("position") == "next":
                room.queue.insert(0, item)
            else:
                room.queue.append(item)
                if participant.role is Role.GUEST:
                    participant.requests_made += 1
                    room.guest_song_request_counts[song_id] = (
                        int(room.guest_song_request_counts.get(song_id, 0)) + 1
                    )
                    room.queue = self._interleave_guest_requests(room.queue)
            self._refresh_up_next_marker(room)
            room.version += 1
            return room

    async def add_wishlist_request(
        self,
        room_id: str,
        participant_id: str,
        payload: dict,
    ) -> tuple[Room, dict]:
        async with self._guard():
            room = self._require_participant(room_id, participant_id)
            participant = room.participants[participant_id]
            if participant.role is not Role.GUEST:
                raise RoomPermissionError("Sólo los invitados pueden enviar solicitudes de descarga")
            if participant.blocked:
                raise RoomPermissionError("El DJ bloqueó nuevas solicitudes para este usuario")

            title = str(payload.get("title", "")).strip()[:120]
            artist = str(payload.get("artist", "")).strip()[:120]
            if not title or not artist:
                raise RoomConflictError("Indica el nombre de la canción y el artista")

            request_key = self._normalize(f"{artist}|{title}")
            if any(item.get("request_key") == request_key for item in room.wishlist_requests):
                raise RoomConflictError("Esta canción ya fue solicitada al DJ")

            item = {
                "id": str(uuid.uuid4()),
                "title": title,
                "artist": artist,
                "request_key": request_key,
                "requested_by": participant.id,
                "requested_by_name": participant.name,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            room.wishlist_requests.append(item)
            room.version += 1
            return room, dict(item)

    async def resolve_music_selection(
        self, room_id: str, participant_id: str, payload: dict,
    ) -> tuple[Room, str, dict]:
        """Atomically turn an identified external track into queue or wishlist."""
        async with self._guard():
            room = self._require_participant(room_id, participant_id)
            participant = room.participants[participant_id]
            if participant.role is not Role.GUEST:
                raise RoomPermissionError("Sólo los invitados pueden usar la búsqueda asistida")
            if participant.blocked:
                raise RoomPermissionError("El DJ bloqueó nuevas solicitudes para este usuario")

            title = str(payload.get("title", "")).strip()[:200]
            artist = str(payload.get("artist", "")).strip()[:200]
            if not title or not artist:
                raise RoomConflictError("No fue posible identificar canción y artista")
            identity = self._music_identity(title, artist)
            local_song = next(
                (song for song in room.catalog.values()
                 if self._music_identity(song.get("title", ""), song.get("artist", "")) == identity),
                None,
            )
            if local_song:
                song_id = local_song["song_id"]
                if any(item.song_id == song_id for item in room.queue):
                    raise RoomConflictError("La canción ya está programada en la cola")
                if int(room.guest_song_request_counts.get(song_id, 0)) >= self.MAX_GUEST_REQUESTS_PER_SONG:
                    raise RoomConflictError("Esta canción ya alcanzó el máximo de 2 solicitudes en la fiesta")
                pending = sum(1 for item in room.queue if item.requested_by == participant_id)
                used = pending if room.cyclic_requests else participant.requests_made
                if used >= room.limit_per_guest:
                    raise RoomConflictError(f"Límite de {room.limit_per_guest} solicitudes alcanzado")
                item = QueueItem(
                    id=str(uuid.uuid4()), song_id=song_id, title=local_song["title"],
                    artist=local_song.get("artist", ""), source=QueueSource.GUEST,
                    requested_by=participant.id, requested_by_name=participant.name,
                )
                room.queue.append(item)
                participant.requests_made += 1
                room.guest_song_request_counts[song_id] = int(room.guest_song_request_counts.get(song_id, 0)) + 1
                room.queue = self._interleave_guest_requests(room.queue)
                self._refresh_up_next_marker(room)
                room.version += 1
                return room, "queued", item.public_dict()

            request_key = self._normalize(f"{artist}|{title}")
            existing = next(
                (item for item in room.wishlist_requests if item.get("request_key") == request_key),
                None,
            )
            if existing:
                raise RoomConflictError("Esta canción ya fue solicitada al DJ")
            request = {
                "id": str(uuid.uuid4()), "title": title, "artist": artist,
                "request_key": request_key, "requested_by": participant.id,
                "requested_by_name": participant.name,
                "provider": str(payload.get("provider", "lastfm"))[:40],
                "provider_url": str(payload.get("provider_url", ""))[:500],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            room.wishlist_requests.append(request)
            room.version += 1
            return room, "wishlist_requested", dict(request)

    async def mark_wishlist_available(
        self,
        room_id: str,
        participant_id: str,
        request_id: str,
        title: str = "",
        artist: str = "",
    ) -> tuple[Room, dict]:
        """Persist the notice until its intended guest explicitly acknowledges it."""
        async with self._guard():
            room = self._require_participant(room_id, participant_id)
            if room.participants[participant_id].role is not Role.DJ:
                raise RoomPermissionError("Solo el DJ puede confirmar una descarga")
            request = next(
                (item for item in room.wishlist_requests if item.get("id") == request_id),
                None,
            )
            if request is None:
                raise RoomNotFoundError("Solicitud de descarga no encontrada")
            notice = {
                "request_id": request_id,
                "requested_by": request["requested_by"],
                "title": str(title or request["title"]),
                "artist": str(artist or request.get("artist", "")),
            }
            existing_index = next(
                (index for index, item in enumerate(room.wishlist_available)
                 if item.get("request_id") == request_id),
                None,
            )
            if existing_index is None:
                room.wishlist_available.append(notice)
                room.version += 1
            elif room.wishlist_available[existing_index] != notice:
                room.wishlist_available[existing_index] = notice
                room.version += 1
            return room, dict(notice)

    async def acknowledge_wishlist_available(
        self,
        room_id: str,
        participant_id: str,
        request_id: str,
    ) -> tuple[Room, bool]:
        async with self._guard():
            room = self._require_participant(room_id, participant_id)
            participant = room.participants[participant_id]
            if participant.role is not Role.GUEST:
                raise RoomPermissionError("Solo el invitado destinatario puede confirmar el aviso")
            original_length = len(room.wishlist_available)
            room.wishlist_available = [
                item for item in room.wishlist_available
                if not (
                    item.get("request_id") == request_id
                    and item.get("requested_by") == participant_id
                )
            ]
            removed = len(room.wishlist_available) != original_length
            if removed:
                room.version += 1
            return room, removed

    async def set_participant_blocked(
        self,
        room_id: str,
        participant_id: str,
        target_participant_id: str,
        blocked: bool,
    ) -> Room:
        async with self._guard():
            room = self._require_participant(room_id, participant_id)
            if room.participants[participant_id].role is not Role.DJ:
                raise RoomPermissionError("Sólo el DJ puede bloquear usuarios")
            target = room.participants.get(target_participant_id)
            if target is None:
                raise RoomNotFoundError("Usuario no encontrado")
            if target.role is Role.DJ:
                raise RoomPermissionError("El DJ no puede bloquearse")
            target.blocked = bool(blocked)
            room.version += 1
            return room

    async def update_limit(self, room_id: str, participant_id: str, limit: int) -> Room:
        async with self._guard():
            room = self._require_participant(room_id, participant_id)
            if room.participants[participant_id].role is not Role.DJ:
                raise RoomPermissionError("Solo el DJ puede cambiar el límite")
            room.limit_per_guest = max(1, min(20, int(limit)))
            # Deliberately do not trim the queue. The new limit only controls
            # subsequent requests, as already programmed songs remain valid.
            room.version += 1
            return room

    async def update_cyclic_requests(
        self,
        room_id: str,
        participant_id: str,
        cyclic_requests: bool,
    ) -> Room:
        async with self._guard():
            room = self._require_participant(room_id, participant_id)
            if room.participants[participant_id].role is not Role.DJ:
                raise RoomPermissionError("Solo el DJ puede cambiar el tipo de cupo")
            room.cyclic_requests = bool(cyclic_requests)
            # Switching modes never removes requests already programmed.
            room.version += 1
            return room

    async def reorder_queue(self, room_id: str, participant_id: str, item_id: str, new_index: int) -> Room:
        async with self._guard():
            room = self._require_participant(room_id, participant_id)
            if room.participants[participant_id].role is not Role.DJ:
                raise RoomPermissionError("Solo el DJ puede reorganizar la programación")
            current_index = next((index for index, item in enumerate(room.queue) if item.id == item_id), None)
            if current_index is None:
                raise RoomNotFoundError("La canción programada ya no está en la cola")
            item = room.queue.pop(current_index)
            target_index = max(0, min(int(new_index), len(room.queue)))
            room.queue.insert(target_index, item)
            self._refresh_up_next_marker(room)
            room.version += 1
            return room

    async def replace_catalog(self, room_id: str, participant_id: str, songs: list[dict]) -> Room:
        async with self._guard():
            room = self._require_participant(room_id, participant_id)
            if room.participants[participant_id].role is not Role.DJ:
                raise RoomPermissionError("Solo el DJ puede sincronizar el catálogo")
            room.catalog = {song["song_id"]: dict(song) for song in songs}
            # A queue entry from the previous library can no longer be resolved
            # by the DJ after changing folders. Keep only playable requests.
            room.queue = [item for item in room.queue if item.song_id in room.catalog]
            self._refresh_up_next_marker(room)
            room.version += 1
            return room

    async def search_catalog(
        self,
        room_id: str,
        participant_id: str,
        query: str,
        offset: int,
        limit: int,
    ) -> tuple[list[dict], int]:
        async with self._guard():
            room = self._require_participant(room_id, participant_id)
            normalized_query = self._normalize(query)
            songs = list(room.catalog.values())
            if normalized_query:
                songs = [
                    song for song in songs
                    if normalized_query in self._normalize(
                        f"{song.get('title', '')} {song.get('artist', '')} {song.get('album', '')}"
                    )
                ]
            # Ratings above the default value are explicit DJ recommendations.
            # Keep them first, ordered from five to two stars. The zero/one-star
            # pool is rotated only when large, preventing the same first 100
            # songs from being shown on every guest visit.
            recommended = [song for song in songs if int(song.get("rating", 0) or 0) > 1]
            unrated = [song for song in songs if int(song.get("rating", 0) or 0) <= 1]
            recommended.sort(key=lambda song: (
                -int(song.get("rating", 0) or 0),
                self._normalize(f"{song.get('title', '')} {song.get('artist', '')}"),
            ))
            if len(unrated) > 50:
                secrets.SystemRandom().shuffle(unrated)
            else:
                unrated.sort(key=lambda song: self._normalize(
                    f"{song.get('title', '')} {song.get('artist', '')}"
                ))
            songs = recommended + unrated
            songs = [
                {
                    **song,
                    "guest_request_count": int(room.guest_song_request_counts.get(song["song_id"], 0)),
                    "guest_request_limit": self.MAX_GUEST_REQUESTS_PER_SONG,
                    "guest_request_limit_reached": (
                        int(room.guest_song_request_counts.get(song["song_id"], 0))
                        >= self.MAX_GUEST_REQUESTS_PER_SONG
                    ),
                }
                for song in songs
            ]
            return songs[offset:offset + limit], len(songs)

    async def update_playback(self, room_id: str, participant_id: str, payload: dict) -> Room:
        async with self._guard():
            room = self._require_participant(room_id, participant_id)
            if room.participants[participant_id].role is not Role.DJ:
                raise RoomPermissionError("Solo el DJ puede actualizar la reproducción")
            room.playback = {
                "current": payload.get("current"),
                "position_ms": max(0, int(payload.get("position_ms", 0))),
                "duration_ms": max(0, int(payload.get("duration_ms", 0))),
                "playing": bool(payload.get("playing", False)),
            }
            room.version += 1
            return room

    async def update_room_settings(
        self,
        room_id: str,
        participant_id: str,
        is_public: bool | None = None,
        limit_per_guest: int | None = None,
        cyclic_requests: bool | None = None,
    ) -> Room:
        async with self._guard():
            room = self._require_participant(room_id, participant_id)
            if room.participants[participant_id].role is not Role.DJ:
                raise RoomPermissionError("Solo el DJ puede actualizar la configuración de la sala")
            if is_public is not None:
                room.is_public = bool(is_public)
            if limit_per_guest is not None:
                room.limit_per_guest = max(1, min(20, int(limit_per_guest)))
            if cyclic_requests is not None:
                room.cyclic_requests = bool(cyclic_requests)
                if room.cyclic_requests:
                    room.queue = self._interleave_guest_requests(room.queue)
                    self._refresh_up_next_marker(room)
            room.version += 1
            return room

    async def get_public_rooms(self) -> list[dict]:
        async with self._guard():
            public_rooms: list[dict] = []
            for room in self._rooms.values():
                if room.open and room.is_public:
                    connected_guests = sum(
                        1 for p in room.participants.values()
                        if p.role is Role.GUEST and p.connected
                    )
                    # Do not expose a room after its public guest capacity is exhausted.
                    guest_count = sum(
                        1 for participant in room.participants.values()
                        if participant.role is Role.GUEST
                    )
                    if guest_count < self.PUBLIC_GUEST_CAP:
                        public_rooms.append(room.public_listing())
            return public_rooms

    async def close_room(self, room_id: str, participant_id: str) -> Room:
        async with self._guard():
            room = self._require_participant(room_id, participant_id)
            if room.participants[participant_id].role is not Role.DJ:
                raise RoomPermissionError("Solo el DJ puede cerrar la sala")
            room.open = False
            room.is_public = False
            for participant in room.participants.values():
                participant.connected = False
            room.wishlist_available.clear()
            room.version += 1
            room.last_activity_at = datetime.now(timezone.utc)
            return room

    async def cleanup_expired(
        self,
        idle_minutes: int = 120,
        disconnected_minutes: int = 30,
        dj_absence_seconds: int = 60,
    ) -> list[str]:
        async with self._guard():
            return self._cleanup_expired_locked(
                datetime.now(timezone.utc), idle_minutes, disconnected_minutes, dj_absence_seconds,
            )

    def _cleanup_expired_locked(
        self,
        now: datetime,
        idle_minutes: int = 120,
        disconnected_minutes: int = 30,
        dj_absence_seconds: int = 60,
    ) -> list[str]:
        closed_room_ids = []
        for room in self._rooms.values():
            dj_lease_expired = now - room.dj_last_seen_at >= timedelta(seconds=dj_absence_seconds)
            nobody_connected_and_idle = (
                not any(p.connected for p in room.participants.values())
                and now - room.last_activity_at >= timedelta(minutes=idle_minutes)
            )
            if room.open and (dj_lease_expired or nobody_connected_and_idle):
                room.open = False
                room.is_public = False
                room.wishlist_available.clear()
                for participant in room.participants.values():
                    participant.connected = False
                room.version += 1
                room.last_activity_at = now
                closed_room_ids.append(room.id)
            if room.open:
                stale_guests = [
                    participant_id for participant_id, participant in room.participants.items()
                    if participant.role is Role.GUEST and not participant.connected
                    and not any(item.requested_by == participant_id for item in room.queue)
                    and participant.disconnected_at is not None
                    and now - participant.disconnected_at >= timedelta(minutes=disconnected_minutes)
                ]
                for participant_id in stale_guests:
                    room.participants.pop(participant_id, None)
        return closed_room_ids


    async def consume_next(
        self,
        room_id: str,
        participant_id: str,
        item_id: str | None = None,
    ) -> tuple[Room, QueueItem | None]:
        async with self._guard():
            room = self._require_participant(room_id, participant_id)
            if room.participants[participant_id].role is not Role.DJ:
                raise RoomPermissionError("Solo el DJ puede avanzar la programación")
            item = None
            if item_id:
                item_index = next((index for index, queued in enumerate(room.queue) if queued.id == item_id), None)
                if item_index is None:
                    raise RoomNotFoundError("La canción programada ya no está en la cola")
                item = room.queue.pop(item_index)
            elif room.queue:
                item = room.queue.pop(0)
            if item is not None:
                self._refresh_up_next_marker(room)
                room.version += 1
            return room, item

    async def claim_up_next_notification(self, room_id: str) -> dict | None:
        async with self._guard():
            room = self._rooms.get(room_id)
            if room is None or not room.queue or not room.playback.get("playing"):
                return None
            duration_ms = int(room.playback.get("duration_ms") or 0)
            position_ms = int(room.playback.get("position_ms") or 0)
            remaining_ms = duration_ms - position_ms
            item = room.queue[0]
            if duration_ms <= 0 or remaining_ms <= 0 or remaining_ms > 15_000:
                return None
            if room.up_next_notified_item_id == item.id:
                return None
            room.up_next_notified_item_id = item.id
            return {
                "item_id": item.id,
                "song_id": item.song_id,
                "title": item.title,
                "requested_by": item.requested_by,
                "requested_by_name": item.requested_by_name,
                "seconds_remaining": max(1, (remaining_ms + 999) // 1000),
            }

    def _get_by_code(self, code: str) -> Room:
        room_id = self._room_ids_by_code.get(code.strip().upper())
        if room_id is None:
            raise RoomNotFoundError("Sala no encontrada")
        return self._rooms[room_id]

    def _require_participant(self, room_id: str, participant_id: str) -> Room:
        room = self._rooms.get(room_id)
        if room is None or not room.open or participant_id not in room.participants:
            raise RoomNotFoundError("Sala o participante no encontrado")
        return room

    @staticmethod
    def _interleave_guest_requests(queue: list[QueueItem]) -> list[QueueItem]:
        """Round-robin guest requests while keeping DJ slots fixed."""
        guest_groups: dict[str, list[QueueItem]] = {}
        participant_order: list[str] = []
        for item in queue:
            if item.source is not QueueSource.GUEST:
                continue
            if item.requested_by not in guest_groups:
                guest_groups[item.requested_by] = []
                participant_order.append(item.requested_by)
            guest_groups[item.requested_by].append(item)

        interleaved: list[QueueItem] = []
        round_index = 0
        while any(round_index < len(guest_groups[participant_id]) for participant_id in participant_order):
            for participant_id in participant_order:
                group = guest_groups[participant_id]
                if round_index < len(group):
                    interleaved.append(group[round_index])
            round_index += 1

        guest_iterator = iter(interleaved)
        return [next(guest_iterator) if item.source is QueueSource.GUEST else item for item in queue]

    @staticmethod
    def _refresh_up_next_marker(room: Room) -> None:
        front_id = room.queue[0].id if room.queue else None
        if room.up_next_notified_item_id != front_id:
            room.up_next_notified_item_id = None

    @staticmethod
    def _normalize(value: str) -> str:
        decomposed = unicodedata.normalize("NFD", str(value or ""))
        return "".join(character for character in decomposed if unicodedata.category(character) != "Mn").lower().strip()
