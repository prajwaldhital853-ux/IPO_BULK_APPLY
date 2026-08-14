"""Shared demat registry for one Google user across all their phones.

The active set is *derived*, never chosen: demats are ordered by the time they
were first registered and the first `max_accounts` stay active. Everything else
is locked until a slot frees up (demat deleted everywhere, or plan raised).
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import UserDematSlot

# Permissive on purpose: MeroShare usernames can include characters the old
# stricter charset dropped, which registered 0 demats and disabled the cap.
_ALIAS_RE = re.compile(r'^[du]:.{2,80}$')

# A demat released because its phone went silent keeps its queue position for a
# while: if that phone comes back (or the app is reinstalled) it stays where it
# was instead of jumping to the end of the queue.
UNCLAIMED_TTL = timedelta(days=30)


def aliases_of(raw: str) -> list[str]:
    """Split a packed key (`d:130…;u:174:user`) into normalized aliases."""
    out: list[str] = []
    seen: set[str] = set()
    for piece in (raw or '').strip().lower().split(';'):
        piece = piece.strip()[:96]
        if piece and _ALIAS_RE.match(piece) and piece not in seen:
            seen.add(piece)
            out.append(piece)
    return out


def pack(aliases: list[str]) -> str:
    return ';'.join(aliases)[:200]


def normalize_keys(raw_keys: list[str]) -> list[str]:
    """Collapse incoming keys so one demat never occupies two slots."""
    groups: list[list[str]] = []
    for raw in raw_keys:
        parts = aliases_of(str(raw))
        if not parts:
            continue
        hit = None
        for group in groups:
            if set(group) & set(parts):
                hit = group
                break
        if hit is None:
            groups.append(list(parts))
        else:
            for p in parts:
                if p not in hit:
                    hit.append(p)
    return [pack(g) for g in groups]


def _devices(row: UserDematSlot) -> list[str]:
    try:
        data = json.loads(row.devices_json or '[]')
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[str] = []
    for item in data:
        did = str(item).strip()[:128]
        if did and did not in out:
            out.append(did)
    return out


def _set_devices(row: UserDematSlot, devices: list[str]) -> None:
    row.devices_json = json.dumps(devices)


def _aware(dt: datetime | None) -> datetime:
    if dt is None:
        return datetime.now(UTC)
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _order_key(row: UserDematSlot) -> tuple[datetime, str]:
    return (_aware(row.first_seen_at), row.key or '')


@dataclass
class RegistryState:
    max_accounts: int
    total: int
    active_keys: list[str] = field(default_factory=list)
    locked_keys: list[str] = field(default_factory=list)
    device_count: int = 0
    device_ids: set[str] = field(default_factory=set)

    @property
    def can_add(self) -> bool:
        return self.total < self.max_accounts


async def list_registry(db: AsyncSession, user_id: str) -> list[UserDematSlot]:
    rows = (
        await db.scalars(
            select(UserDematSlot).where(UserDematSlot.user_id == user_id),
        )
    ).all()
    return sorted(rows, key=_order_key)


async def claimed_totals(db: AsyncSession) -> dict[str, int]:
    """Unique claimed demats per user — one lookup for admin list screens."""
    rows = (await db.scalars(select(UserDematSlot))).all()
    out: dict[str, int] = {}
    for row in rows:
        if _devices(row):
            out[row.user_id] = out.get(row.user_id, 0) + 1
    return out


async def purge_unclaimed(db: AsyncSession, user_id: str) -> int:
    """Drop long-unclaimed queue placeholders so the table cannot grow forever."""
    now = datetime.now(UTC)
    removed = 0
    for row in await list_registry(db, user_id):
        if _devices(row):
            continue
        if now - _aware(row.last_seen_at) >= UNCLAIMED_TTL:
            await db.delete(row)
            removed += 1
    if removed:
        await db.flush()
    return removed


def build_state(
    rows: list[UserDematSlot],
    *,
    max_accounts: int,
    unlimited: bool,
) -> RegistryState:
    ordered = [r for r in sorted(rows, key=_order_key) if _devices(r)]
    keys = [r.key for r in ordered]
    devices: set[str] = set()
    for r in ordered:
        devices |= set(_devices(r))
    if unlimited:
        return RegistryState(
            max_accounts=max_accounts,
            total=len(keys),
            active_keys=keys,
            locked_keys=[],
            device_count=len(devices),
            device_ids=devices,
        )
    return RegistryState(
        max_accounts=max_accounts,
        total=len(keys),
        active_keys=keys[:max_accounts],
        locked_keys=keys[max_accounts:],
        device_count=len(devices),
        device_ids=devices,
    )


def cap_claimed(state: RegistryState, slots) -> int:
    """Unique demats across phones — never let each device count only itself."""
    keyed = state.total
    slot_sum = sum(max(0, int(s.account_count or 0)) for s in slots)
    if keyed > 0:
        # Keyed registry is authoritative; slot_sum catches unreconciled inflation.
        return max(keyed, slot_sum)
    return slot_sum


async def release_devices(
    db: AsyncSession,
    user_id: str,
    device_ids: list[str],
) -> int:
    """Free demats held by installs that are gone (uninstalled / stale).

    The row stays as an unclaimed placeholder so the demat keeps its queue
    position if that phone reinstalls, but it no longer uses a plan slot.
    """
    targets = {str(d).strip() for d in device_ids if str(d).strip()}
    if not targets:
        return 0
    freed = 0
    for row in await list_registry(db, user_id):
        devices = _devices(row)
        keep = [d for d in devices if d not in targets]
        if len(keep) == len(devices):
            continue
        _set_devices(row, keep)
        if not keep:
            freed += 1
    await db.flush()
    return freed


async def sync_device_keys(
    db: AsyncSession,
    *,
    user_id: str,
    device_id: str,
    keys: list[str],
    max_accounts: int,
    unlimited: bool,
) -> RegistryState:
    """Register this phone's demats and free the ones it no longer has."""
    device_id = (device_id or '').strip()[:128]
    if not device_id:
        raise ValueError('deviceId required')

    incoming = normalize_keys(keys)
    rows = await list_registry(db, user_id)
    now = datetime.now(UTC)

    alias_to_row: dict[str, UserDematSlot] = {}
    for row in rows:
        for alias in aliases_of(row.key):
            alias_to_row[alias] = row

    matched: set[str] = set()
    for key in incoming:
        parts = aliases_of(key)
        row = next((alias_to_row[p] for p in parts if p in alias_to_row), None)
        if row is None:
            row = UserDematSlot(
                id=str(uuid.uuid4()),
                user_id=user_id,
                key=pack(parts),
                devices_json=json.dumps([device_id]),
                first_seen_at=now,
                last_seen_at=now,
            )
            db.add(row)
            for p in parts:
                alias_to_row[p] = row
            matched.add(row.id)
            continue

        merged = aliases_of(row.key)
        for p in parts:
            if p not in merged:
                merged.append(p)
                alias_to_row[p] = row
        row.key = pack(merged)
        devices = _devices(row)
        if device_id not in devices:
            devices.append(device_id)
            _set_devices(row, devices)
        row.last_seen_at = now
        matched.add(row.id)

    # Demats this phone used to have but deleted → release its claim.
    for row in rows:
        if row.id in matched:
            continue
        devices = _devices(row)
        if device_id not in devices:
            continue
        keep = [d for d in devices if d != device_id]
        if keep:
            _set_devices(row, keep)
        else:
            await db.delete(row)

    await db.flush()
    rows = await list_registry(db, user_id)
    return build_state(rows, max_accounts=max_accounts, unlimited=unlimited)


async def can_add_key(
    db: AsyncSession,
    *,
    user_id: str,
    candidate_key: str | None,
    max_accounts: int,
    unlimited: bool,
) -> tuple[bool, RegistryState]:
    rows = await list_registry(db, user_id)
    state = build_state(rows, max_accounts=max_accounts, unlimited=unlimited)
    if unlimited:
        return True, state
    parts = aliases_of(candidate_key or '')
    if parts:
        known = {a for r in rows if _devices(r) for a in aliases_of(r.key)}
        if known & set(parts):
            # Same demat already claimed (e.g. present on another phone).
            return True, state
    return state.can_add, state


async def candidate_is_known(
    db: AsyncSession,
    *,
    user_id: str,
    candidate_key: str | None,
) -> bool:
    parts = aliases_of(candidate_key or '')
    if not parts:
        return False
    rows = await list_registry(db, user_id)
    known = {a for r in rows if _devices(r) for a in aliases_of(r.key)}
    return bool(known & set(parts))
