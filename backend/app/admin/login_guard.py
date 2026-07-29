"""Per-IP / per-device admin login lockout (not account-wide).

State is persisted to disk so counters survive process restarts and work
reliably under a single uvicorn worker (and still work better than
pure in-memory if the process reloads between attempts).
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path

ADMIN_MAX_FAILED_LOGINS = 3
ADMIN_LOCK_MINUTES = 5


@dataclass
class _AttemptState:
    fails: int = 0
    locked_until: float = 0.0  # unix seconds


_lock = threading.Lock()
_states: dict[str, _AttemptState] = {}
_loaded = False


def _state_path() -> Path:
    override = (os.environ.get('ADMIN_LOGIN_GUARD_PATH') or '').strip()
    if override:
        return Path(override)
    # backend/app/admin/login_guard.py → backend/data/...
    backend_root = Path(__file__).resolve().parents[2]
    return backend_root / 'data' / 'admin_login_attempts.json'


def _load_unlocked() -> None:
    global _loaded
    if _loaded:
        return
    path = _state_path()
    try:
        if path.is_file():
            raw = json.loads(path.read_text(encoding='utf-8'))
            if isinstance(raw, dict):
                for key, value in raw.items():
                    if not isinstance(value, dict):
                        continue
                    try:
                        fails = int(value.get('fails') or 0)
                        locked_until = float(value.get('locked_until') or 0)
                    except (TypeError, ValueError):
                        continue
                    _states[str(key)] = _AttemptState(
                        fails=max(0, fails),
                        locked_until=max(0.0, locked_until),
                    )
    except (OSError, json.JSONDecodeError, TypeError):
        pass
    _loaded = True


def _save_unlocked() -> None:
    path = _state_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            key: {'fails': state.fails, 'locked_until': state.locked_until}
            for key, state in _states.items()
        }
        fd, tmp_name = tempfile.mkstemp(
            prefix='admin_login_',
            suffix='.json',
            dir=str(path.parent),
        )
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as handle:
                json.dump(payload, handle)
            os.replace(tmp_name, path)
        except Exception:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise
    except OSError:
        # Never break login if disk write fails — keep in-memory state.
        pass


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
        _load_unlocked()
        state = _states.get(client_key)
        if not state or state.locked_until <= now:
            if state and state.locked_until and state.locked_until <= now:
                state.fails = 0
                state.locked_until = 0.0
                _save_unlocked()
            return 0
        return max(0, int(state.locked_until - now))


def clear_attempts(client_key: str) -> None:
    with _lock:
        _load_unlocked()
        if client_key in _states:
            _states.pop(client_key, None)
            _save_unlocked()


def record_failure(client_key: str) -> tuple[int, int]:
    """
    Increment failure count for this client.

    Returns (attempts_used, lock_remaining_seconds).
    When lock_remaining_seconds > 0, the client was just locked (or already locked).
    """
    now = time.time()
    with _lock:
        _load_unlocked()
        state = _states.get(client_key)
        if state is None:
            state = _AttemptState()
            _states[client_key] = state

        if state.locked_until > now:
            return max(state.fails, ADMIN_MAX_FAILED_LOGINS), max(
                0,
                int(state.locked_until - now),
            )

        # Expired lock
        if state.locked_until and state.locked_until <= now:
            state.fails = 0
            state.locked_until = 0.0

        state.fails += 1
        if state.fails >= ADMIN_MAX_FAILED_LOGINS:
            state.locked_until = now + ADMIN_LOCK_MINUTES * 60
            # Keep fails at the max so retries while locked stay consistent.
            state.fails = ADMIN_MAX_FAILED_LOGINS
            _save_unlocked()
            return ADMIN_MAX_FAILED_LOGINS, ADMIN_LOCK_MINUTES * 60

        _save_unlocked()
        return state.fails, 0


def prune_expired(max_entries: int = 5000) -> None:
    """Best-effort cleanup so the map cannot grow forever."""
    now = time.time()
    with _lock:
        _load_unlocked()
        changed = False
        if len(_states) < max_entries:
            dead = [
                k
                for k, s in _states.items()
                if s.locked_until and s.locked_until <= now and s.fails == 0
            ]
            for k in dead:
                _states.pop(k, None)
                changed = True
            if changed:
                _save_unlocked()
            return
        unlocked = [
            (k, s) for k, s in _states.items() if s.locked_until <= now
        ]
        unlocked.sort(key=lambda x: x[1].locked_until)
        for k, _ in unlocked[: max(0, len(_states) - max_entries // 2)]:
            _states.pop(k, None)
            changed = True
        if changed:
            _save_unlocked()
