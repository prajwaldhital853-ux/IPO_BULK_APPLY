from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import UserDeviceSlot

UNLIMITED = 999999


def iso(dt: datetime | None) -> str:
    if dt is None:
        return ''
    if dt.tzinfo is None:
        return dt.isoformat() + 'Z'
    return dt.isoformat()


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
