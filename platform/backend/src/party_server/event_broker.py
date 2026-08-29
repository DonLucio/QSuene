import asyncio
import itertools
from typing import Any

import socketio


class Priority:
    CRITICAL = 0
    HIGH = 10
    NORMAL = 20
    LOW = 30


class PriorityEventBroker:
    """Ordena emisiones que aún no han sido enviadas al socket."""

    def __init__(self, sio: socketio.AsyncServer) -> None:
        self._sio = sio
        self._queue: asyncio.PriorityQueue = asyncio.PriorityQueue()
        self._sequence = itertools.count()
        self._worker: asyncio.Task | None = None

    def start(self) -> None:
        if self._worker is None:
            self._worker = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._worker is not None:
            self._worker.cancel()
            try:
                await self._worker
            except asyncio.CancelledError:
                pass
            self._worker = None

    async def publish(self, event: str, payload: Any, *, room: str, priority: int) -> None:
        await self._queue.put((priority, next(self._sequence), event, payload, room))

    async def _run(self) -> None:
        while True:
            priority, _, event, payload, room = await self._queue.get()
            try:
                envelope = {"priority": priority, "data": payload}
                await self._sio.emit(event, envelope, room=room)
            finally:
                self._queue.task_done()

