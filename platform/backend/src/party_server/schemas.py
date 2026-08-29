from pydantic import BaseModel, Field


class CreateRoomRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    dj_name: str = Field(default="DJ", min_length=1, max_length=40)
    limit_per_guest: int = Field(default=3, ge=1, le=20)
    cyclic_requests: bool = False
    is_public: bool = False


class UpdateRoomSettingsRequest(BaseModel):
    is_public: bool | None = None
    limit_per_guest: int | None = Field(default=None, ge=1, le=20)
    cyclic_requests: bool | None = None


class ResolveMusicSelectionRequest(BaseModel):
    query: str = Field(min_length=2, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    artist: str = Field(min_length=1, max_length=200)
    provider: str = Field(default="lastfm", max_length=40)
    provider_url: str = Field(default="", max_length=500)



class JoinRoomRequest(BaseModel):
    guest_name: str = Field(min_length=1, max_length=40)
    device_id: str = Field(min_length=16, max_length=100)


class RoomAccessResponse(BaseModel):
    room_id: str
    room_code: str
    participant_id: str
    role: str
    token: str
    join_url: str


class CatalogSong(BaseModel):
    song_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    artist: str = Field(default="", max_length=200)
    album: str = Field(default="", max_length=200)
    duration: float = Field(default=0, ge=0)
    rating: int = Field(default=0, ge=0, le=5)


class ReplaceCatalogRequest(BaseModel):
    songs: list[CatalogSong] = Field(max_length=50_000)
