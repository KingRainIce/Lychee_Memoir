import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class PostBroadcastHub:
    def __init__(self) -> None:
        self._by_campus: dict[str, list[WebSocket]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def connect(self, campus_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._by_campus[campus_id].append(ws)

    async def disconnect(self, campus_id: str, ws: WebSocket) -> None:
        async with self._lock:
            lst = self._by_campus.get(campus_id, [])
            if ws in lst:
                lst.remove(ws)

    async def broadcast_post(self, campus_id: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._by_campus.get(campus_id, []))
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    if ws in self._by_campus[campus_id]:
                        self._by_campus[campus_id].remove(ws)


hub = PostBroadcastHub()
