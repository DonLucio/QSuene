from contextlib import asynccontextmanager
import asyncio

import socketio
import redis.asyncio as redis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import create_router
from .config import get_settings
from .event_broker import Priority, PriorityEventBroker
from .realtime import register_socket_handlers
from .room_service import RoomService
from .persistence import PostgresRoomRepository

settings = get_settings()
room_repository = PostgresRoomRepository(settings.database_url) if settings.database_url else None
room_service = RoomService(room_repository)
redis_client = redis.from_url(settings.redis_url) if settings.redis_url else None

client_manager = (
    socketio.AsyncRedisManager(settings.redis_url)
    if settings.redis_url
    else None
)
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=settings.origins,
    client_manager=client_manager,
)
broker = PriorityEventBroker(sio)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if room_repository:
        await room_repository.initialize()
    if redis_client:
        await redis_client.ping()
    broker.start()
    async def cleanup_rooms():
        while True:
            await asyncio.sleep(10)
            closed_room_ids = await room_service.cleanup_expired(
                settings.room_idle_minutes,
                settings.disconnected_guest_minutes,
                settings.dj_absence_seconds,
            )
            for room_id in closed_room_ids:
                await broker.publish(
                    "room.closed",
                    {"room_id": room_id, "reason": "dj_absent"},
                    room=room_id,
                    priority=Priority.CRITICAL,
                )
    cleanup_task = asyncio.create_task(cleanup_rooms())
    yield
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    await broker.stop()
    if room_repository:
        await room_repository.close()
    if redis_client:
        await redis_client.aclose()


api = FastAPI(title="Que Suene Party Server", version="0.1.0", lifespan=lifespan)
api.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
api.include_router(create_router(room_service, broker, redis_client))
register_socket_handlers(sio, room_service, broker, settings)

application = socketio.ASGIApp(sio, other_asgi_app=api, socketio_path="socket.io")
