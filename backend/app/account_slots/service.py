from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import UserDeviceSlot

UNLIMITED = 999999

# Always remove installs that never heartbeated this long (uninstalled / lost).
HARD_STALE = timedelta(days=7)
# Auto-free quiet phones when at/over the plan cap (uninstall = no more heartbeats).
GHOST_ABS = timedelta(minutes=3)
# Fresh reinstall with 0 local accounts — free other traces immediately.
GHOST_ABS_EMPTY = timedelta(0)
# Sibling lag while at/over cap.
GHOST_LAG = timedelta(minutes=2)


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


def projected_total(
    slots: list[UserDeviceSlot],
    *,
    device_id: str,
    this_count: int,
) -> int:
    total = 0
    seen = False
    for s in slots:
        if s.device_id == device_id:
            total += max(0, this_count)
            seen = True
        else:
            total += max(0, int(s.account_count or 0))
    if not seen:
        total += max(0, this_count)
    return total


def is_unlimited(max_accounts: int) -> bool:
    return max_accounts >= UNLIMITED


async def cleanup_device_slots(
    db: AsyncSession,
    user_id: str,
    *,
    keep_device_id: str,
    max_accounts: int,
    this_count: int,
) -> list[UserDeviceSlot]:
    """Drop uninstalled / abandoned install traces so they stop consuming the plan.

    Uninstall cannot notify the server (new install id). We free slots that:
    - have not heartbeated for HARD_STALE (7 days), or
    - are over-cap ghosts: quiet for GHOST_ABS, or lagging live siblings by GHOST_LAG.
    The phone currently reporting is never deleted.
    """
    keep = (keep_device_id or '').strip()
    now = datetime.now(UTC)
    slots = await list_slots(db, user_id)
    changed = False

    for s in list(slots):
        if s.device_id == keep:
            continue
        if _age(s.last_seen_at, now) >= HARD_STALE:
            await db.delete(s)
            changed = True

    if changed:
        await db.flush()
        slots = await list_slots(db, user_id)

    if is_unlimited(max_accounts):
        return slots

    total = projected_total(slots, device_id=keep, this_count=this_count)
    # At or over the cap: drop quiet/uninstalled installs so the live phone
    # can use the freed slots (OS cannot notify us on uninstall).
    if total < max_accounts:
        return slots

    others = [s for s in slots if s.device_id != keep]
    if not others:
        return slots

    newest_other = max(
        (_aware(s.last_seen_at) or _aware(s.created_at) or now) for s in others
    )

    abs_ghost = GHOST_ABS_EMPTY if this_count <= 0 else GHOST_ABS

    def is_ghost(s: UserDeviceSlot) -> bool:
        age = _age(s.last_seen_at, now)
        if age >= abs_ghost:
            return True
        seen = _aware(s.last_seen_at) or _aware(s.created_at)
        if seen is None:
            return True
        return (newest_other - seen) >= GHOST_LAG

    ghosts = sorted(
        [s for s in others if is_ghost(s)],
        key=lambda s: _aware(s.last_seen_at) or _aware(s.created_at) or now,
    )
    for s in ghosts:
        await db.delete(s)
        await db.flush()
        slots = await list_slots(db, user_id)
        total = projected_total(slots, device_id=keep, this_count=this_count)
        if total < max_accounts:
            break

    return slots


async def release_other_slots(
    db: AsyncSession,
    user_id: str,
    *,
    keep_device_id: str,
) -> int:
    """Immediately drop every install except this phone (user confirmed uninstall)."""
    keep = (keep_device_id or '').strip()
    if not keep:
        raise ValueError('deviceId required')
    slots = await list_slots(db, user_id)
    removed = 0
    for s in list(slots):
        if s.device_id == keep:
            continue
        await db.delete(s)
        removed += 1
    if removed:
        await db.flush()
    return removed
