from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import UserDeviceSlot

from .registry import list_registry, release_devices

UNLIMITED = 999999

# Forget installs that never heartbeated this long (lost / uninstalled).
# Must be days, not minutes: a phone in a pocket looks identical to uninstall,
# and a short timeout let phone B eat phone A's slots.
HARD_STALE = timedelta(days=7)
# Empty reinstall leftover (last reported 0 accounts).
EMPTY_STALE = timedelta(hours=2)


def iso(dt: datetime | None) -> str:
    if dt is None:
        return ''
    if dt.tzinfo is None:
        return dt.isoformat() + 'Z'
    return dt.isoformat()


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def _age(dt: datetime | None, now: datetime) -> timedelta:
    when = _aware(dt)
    if when is None:
        return HARD_STALE
    return max(timedelta(0), now - when)


async def list_slots(db: AsyncSession, user_id: str) -> list[UserDeviceSlot]:
    rows = (
        await db.scalars(
            select(UserDeviceSlot)
            .where(UserDeviceSlot.user_id == user_id)
            .order_by(UserDeviceSlot.last_seen_at.desc()),
        )
    ).all()
    return list(rows)


async def upsert_slot(
    db: AsyncSession,
    *,
    user_id: str,
    device_id: str,
    device_label: str,
    platform: str,
    account_count: int,
) -> UserDeviceSlot:
    device_id = (device_id or '').strip()[:128]
    if not device_id:
        raise ValueError('deviceId required')
    count = max(0, int(account_count))
    row = await db.scalar(
        select(UserDeviceSlot).where(
            UserDeviceSlot.user_id == user_id,
            UserDeviceSlot.device_id == device_id,
        ),
    )
    now = datetime.now(UTC)
    if row is None:
        row = UserDeviceSlot(
            id=str(uuid.uuid4()),
            user_id=user_id,
            device_id=device_id,
            device_label=(device_label or '')[:128],
            platform=(platform or 'android')[:16],
            account_count=count,
            last_seen_at=now,
        )
        db.add(row)
    else:
        row.account_count = count
        if device_label:
            row.device_label = device_label[:128]
        if platform:
            row.platform = platform[:16]
        row.last_seen_at = now
    await db.flush()
    return row


def is_unlimited(max_accounts: int) -> bool:
    return max_accounts >= UNLIMITED


def _devices_on_row(row) -> list[str]:
    import json

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


async def reconcile_device_slots(db: AsyncSession, user_id: str) -> int:
    """Drop inflated per-phone counts that no longer match registry demats."""
    per_device: dict[str, int] = {}
    for row in await list_registry(db, user_id):
        for did in _devices_on_row(row):
            per_device[did] = per_device.get(did, 0) + 1
    fixed = 0
    for slot in await list_slots(db, user_id):
        actual = per_device.get(slot.device_id, 0)
        current = max(0, int(slot.account_count or 0))
        if current > actual:
            slot.account_count = actual
            fixed += 1
    if fixed:
        await db.flush()
    return fixed


async def release_stale_device_claims(
    db: AsyncSession,
    user_id: str,
    *,
    keep_device_id: str = '',
) -> list[str]:
    """Free registry slots held by phones that stopped heartbeating with accounts."""
    keep = (keep_device_id or '').strip()
    now = datetime.now(UTC)
    registry_devices: set[str] = set()
    for row in await list_registry(db, user_id):
        registry_devices |= set(_devices_on_row(row))
    released: list[str] = []
    for slot in await list_slots(db, user_id):
        if slot.device_id == keep:
            continue
        if slot.device_id not in registry_devices:
            continue
        count = max(0, int(slot.account_count or 0))
        if count <= 0:
            continue
        if _age(slot.last_seen_at, now) >= EMPTY_STALE:
            released.append(slot.device_id)
    if released:
        await release_devices(db, user_id, released)
        for slot in await list_slots(db, user_id):
            if slot.device_id in released:
                slot.account_count = 0
        await db.flush()
    return released


async def prune_devices(
    db: AsyncSession,
    user_id: str,
    *,
    keep_device_id: str = '',
    free_idle: bool = False,
) -> list[str]:
    """Forget install traces that can no longer be alive. Returns removed ids.

    A phone with saved accounts is never dropped just because the plan is full
    (`free_idle` is ignored for those). That used to let phone B add a second
    full set after phone A sat unused for a few minutes.
    """
    del free_idle  # kept so older callers do not break
    keep = (keep_device_id or '').strip()
    now = datetime.now(UTC)
    removed: list[str] = []
    for s in await list_slots(db, user_id):
        if s.device_id == keep:
            continue
        age = _age(s.last_seen_at, now)
        count = max(0, int(s.account_count or 0))
        stale = age >= HARD_STALE or (count <= 0 and age >= EMPTY_STALE)
        if not stale:
            continue
        removed.append(s.device_id)
        await db.delete(s)
    if removed:
        await db.flush()
    return removed
