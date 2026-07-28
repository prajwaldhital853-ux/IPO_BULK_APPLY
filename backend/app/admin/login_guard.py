"""Per-IP / per-device admin login lockout (not account-wide)."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass

ADMIN_MAX_FAILED_LOGINS = 3
ADMIN_LOCK_MINUTES = 5


@dataclass
class _AttemptState:
    fails: int = 0
    locked_until: float = 0.0  # unix seconds


_lock = threading.Lock()
_states: dict[str, _AttemptState] = {}


def build_client_key(ip: str | None, device_id: str | None) -> str:
    """
    Prefer a stable device id so shared Wi‑Fi / NAT does not lock everyone.
    Fall back to IP when device id is missing (e.g. raw API clients).
    """
    did = (device_id or '').strip()[:128]
    if did:
        return f'device:{did}'
    ip_n = (ip or '').strip()[:64] or 'unknown'
    return f'ip:{ip_n}'


def remaining_lock_seconds(client_key: str) -> int:
    now = time.time()
    with _lock:
        state = _states.get(client_key)
        if not state or state.locked_until <= now:
            if state and state.locked_until and state.locked_until <= now:
                state.fails = 0
                state.locked_until = 0.0
            return 0
        return max(0, int(state.locked_until - now))


def clear_attempts(client_key: str) -> None:
    with _lock:
        _states.pop(client_key, None)


def record_failure(client_key: str) -> tuple[int, int]:
    """
    Increment failure count for this client.

    Returns (attempts_used, lock_remaining_seconds).
    When lock_remaining_seconds > 0, the client was just locked (or already locked).
    """
    now = time.time()
    with _lock:
        state = _states.get(client_key)
        if state is None:
            state = _AttemptState()
            _states[client_key] = state

        if state.locked_until > now:
            return state.fails, max(0, int(state.locked_until - now))

        # Expired lock
        if state.locked_until and state.locked_until <= now:
            state.fails = 0
            state.locked_until = 0.0

        state.fails += 1
        if state.fails >= ADMIN_MAX_FAILED_LOGINS:
            state.locked_until = now + ADMIN_LOCK_MINUTES * 60
            state.fails = 0
            return ADMIN_MAX_FAILED_LOGINS, ADMIN_LOCK_MINUTES * 60

        return state.fails, 0


def prune_expired(max_entries: int = 5000) -> None:
    """Best-effort cleanup so the map cannot grow forever."""
    now = time.time()
    with _lock:
        if len(_states) < max_entries:
            dead = [
                k
                for k, s in _states.items()
                if s.locked_until and s.locked_until <= now and s.fails == 0
            ]
            for k in dead:
                _states.pop(k, None)
            return
        # Hard trim oldest unlocked entries when oversized
        unlocked = [
            (k, s) for k, s in _states.items() if s.locked_until <= now
        ]
        unlocked.sort(key=lambda x: x[1].locked_until)
        for k, _ in unlocked[: max(0, len(_states) - max_entries // 2)]:
            _states.pop(k, None)
