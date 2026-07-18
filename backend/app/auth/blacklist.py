from __future__ import annotations

import asyncio
import time
from typing import Protocol

try:
    import redis.asyncio as aioredis
except ImportError:  # pragma: no cover
    aioredis = None  # type: ignore[assignment]


class TokenBlacklist(Protocol):
    async def add_jti(self, jti: str, ttl_seconds: int) -> None: ...
    async def is_jti_blacklisted(self, jti: str) -> bool: ...


class MemoryBlacklist:
    """Dev fallback when Redis is unavailable."""

    def __init__(self) -> None:
        self._entries: dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def add_jti(self, jti: str, ttl_seconds: int) -> None:
        async with self._lock:
            self._entries[jti] = time.time() + max(1, ttl_seconds)

    async def is_jti_blacklisted(self, jti: str) -> bool:
        async with self._lock:
            exp = self._entries.get(jti)
            if exp is None:
                return False
            if exp <= time.time():
                del self._entries[jti]
                return False
            return True


class RedisBlacklist:
    def __init__(self, redis_url: str) -> None:
        if aioredis is None:
            raise RuntimeError('redis package not installed')
        self._redis = aioredis.from_url(redis_url, decode_responses=True)

    async def add_jti(self, jti: str, ttl_seconds: int) -> None:
        await self._redis.setex(f'blacklist:{jti}', max(1, ttl_seconds), '1')

    async def is_jti_blacklisted(self, jti: str) -> bool:
        return bool(await self._redis.exists(f'blacklist:{jti}'))


_blacklist: TokenBlacklist | None = None


async def init_blacklist(redis_url: str | None) -> TokenBlacklist:
    global _blacklist
    if redis_url and aioredis is not None:
        try:
            bl = RedisBlacklist(redis_url)
            await bl._redis.ping()
            _blacklist = bl
            return bl
        except Exception:
            pass
    _blacklist = MemoryBlacklist()
    return _blacklist


def get_blacklist() -> TokenBlacklist:
    if _blacklist is None:
        raise RuntimeError('Blacklist not initialized')
    return _blacklist
