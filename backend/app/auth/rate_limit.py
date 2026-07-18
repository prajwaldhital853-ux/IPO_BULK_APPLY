from __future__ import annotations

import asyncio
import time
from collections import defaultdict


class RateLimiter:
    """Simple sliding-window limiter keyed by user id."""

    def __init__(self, max_calls: int, window_seconds: int) -> None:
        self._max = max_calls
        self._window = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def check(self, key: str) -> bool:
        now = time.time()
        async with self._lock:
            bucket = self._hits[key]
            cutoff = now - self._window
            self._hits[key] = [t for t in bucket if t >= cutoff]
            if len(self._hits[key]) >= self._max:
                return False
            self._hits[key].append(now)
            return True


cdsc_user_limiter = RateLimiter(max_calls=30, window_seconds=60)
