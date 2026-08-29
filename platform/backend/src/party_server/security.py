from datetime import datetime, timedelta, timezone

import jwt

from .config import Settings
from .models import Role


class TokenError(ValueError):
    pass


def create_access_token(
    settings: Settings,
    *,
    room_id: str,
    participant_id: str,
    role: Role,
    expires_in: timedelta = timedelta(hours=12),
) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": participant_id,
            "room_id": room_id,
            "role": role.value,
            "iat": now,
            "exp": now + expires_in,
        },
        settings.secret_key,
        algorithm="HS256",
    )


def decode_access_token(settings: Settings, token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise TokenError("Token inválido o vencido") from exc
    valid_roles = {role.value for role in Role}
    if not payload.get("sub") or not payload.get("room_id") or payload.get("role") not in valid_roles:
        raise TokenError("Token incompleto")
    return payload
