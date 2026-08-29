from pydantic import BaseModel, Field


class VersionedEvent(BaseModel):
    contract_version: int = Field(default=1, ge=1, le=1)


class QueueRequestAdd(VersionedEvent):
    song_id: str = Field(min_length=1, max_length=100)
    title: str = Field(default="", max_length=200)
    artist: str = Field(default="", max_length=200)
    position: str | None = None


class WishlistRequestAdd(VersionedEvent):
    title: str = Field(min_length=1, max_length=120)
    artist: str = Field(min_length=1, max_length=120)


class WishlistAvailable(VersionedEvent):
    request_id: str = Field(min_length=1, max_length=100)
    title: str = Field(default="", max_length=200)
    artist: str = Field(default="", max_length=200)


class RequestIdEvent(VersionedEvent):
    request_id: str = Field(min_length=1, max_length=100)


class RoomLimitUpdate(VersionedEvent):
    limit: int = Field(ge=1, le=20)


class ParticipantBlockUpdate(VersionedEvent):
    participant_id: str = Field(min_length=1, max_length=100)
    blocked: bool


class RoomCyclicUpdate(VersionedEvent):
    cyclic_requests: bool


class QueueItemEvent(VersionedEvent):
    item_id: str | None = Field(default=None, max_length=100)


class QueueReorder(VersionedEvent):
    item_id: str = Field(min_length=1, max_length=100)
    new_index: int = Field(ge=0, le=10000)


class SettingsUpdate(VersionedEvent):
    is_public: bool | None = None
    limit_per_guest: int | None = Field(default=None, ge=1, le=20)
    cyclic_requests: bool | None = None


class PlaybackCurrent(BaseModel):
    song_id: str = Field(min_length=1, max_length=500)
    queue_item_id: str | None = Field(default=None, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    artist: str = Field(default="", max_length=200)
    requested_by: str | None = Field(default=None, max_length=100)


class PlaybackUpdate(VersionedEvent):
    current: PlaybackCurrent | None = None
    position_ms: int = Field(default=0, ge=0)
    duration_ms: int = Field(default=0, ge=0)
    playing: bool = False
    progress_only: bool = False


def validate_event(model, payload: dict | None) -> tuple[dict | None, str | None]:
    try:
        return model.model_validate(payload or {}).model_dump(), None
    except Exception as exc:
        return None, str(exc)
