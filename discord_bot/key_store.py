"""In-memory API key store with TTL."""

import asyncio
import time
from typing import Optional, Tuple


class ApiKeyStore:
    """Store API keys in memory with automatic expiry."""

    def __init__(self, ttl_seconds: int):
        self._ttl_seconds = ttl_seconds
        self._store: dict[int, Tuple[str, str, float]] = {}
        self._lock = asyncio.Lock()

    async def set_key(self, user_id: int, api_key: str, key_type: str) -> None:
        expires_at = time.time() + self._ttl_seconds
        async with self._lock:
            self._store[user_id] = (api_key, key_type, expires_at)
        asyncio.create_task(self._expire_later(user_id, expires_at))

    async def get_key(self, user_id: int) -> Optional[Tuple[str, str]]:
        async with self._lock:
            entry = self._store.get(user_id)
            if not entry:
                return None
            api_key, key_type, expires_at = entry
            if time.time() >= expires_at:
                del self._store[user_id]
                return None
            return api_key, key_type

    async def clear_key(self, user_id: int) -> None:
        async with self._lock:
            self._store.pop(user_id, None)

    async def _expire_later(self, user_id: int, expires_at: float) -> None:
        delay = max(0.0, expires_at - time.time())
        await asyncio.sleep(delay)
        async with self._lock:
            entry = self._store.get(user_id)
            if entry and entry[2] <= time.time():
                del self._store[user_id]
