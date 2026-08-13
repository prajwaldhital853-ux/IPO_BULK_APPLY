from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import CurrentUser, get_current_user
from ..auth.subscription import (
    effective_max_accounts,
    expire_premium_if_needed,
    load_user_with_premium,
)
from ..db.session import get_db
from .service import (
    iso,
    is_unlimited,
    list_slots,
    projected_total,
    upsert_slot,
)

router = APIRouter(prefix='/app/account-slots', tags=['account-slots'])


class SlotIn(BaseModel):
    device_id: str = Field(alias='deviceId', min_length=4, max_length=128)
    device_label: str = Field(default='', alias='deviceLabel', max_length=128)
    platform: str = 'android'
    account_count: int = Field(alias='accountCount', ge=0, le=999999)

    model_config = {'populate_by_name': True}


class DeviceOut(BaseModel):
    device_id: str = Field(alias='deviceId')
    device_label: str = Field(alias='deviceLabel')
    platform: str
    account_count: int = Field(alias='accountCount')
    last_seen_at: str = Field(alias='lastSeenAt')
    is_this_device: bool = Field(alias='isThisDevice')

    model_config = {'populate_by_name': True}


class SlotStatusOut(BaseModel):
    allowed: bool
    max_accounts: int = Field(alias='maxAccounts')
    claimed_total: int = Field(alias='claimedTotal')
    this_device_count: int = Field(alias='thisDeviceCount')
    other_devices_total: int = Field(alias='otherDevicesTotal')
    device_count: int = Field(alias='deviceCount')
    message: str = ''
    devices: list[DeviceOut] = Field(default_factory=list)

    model_config = {'populate_by_name': True}


async def _max_for_user(db: AsyncSession, user_id: str) -> int:
    row = await load_user_with_premium(db, user_id)
    if row is None:
        raise HTTPException(status_code=401, detail='User not found')
    await expire_premium_if_needed(db, row)
    premium = row.premium
    active = False
    if premium and premium.expires_at:
        from datetime import UTC, datetime

        exp = (
            premium.expires_at
            if premium.expires_at.tzinfo
            else premium.expires_at.replace(tzinfo=UTC)
        )
        active = exp > datetime.now(UTC)
    return effective_max_accounts(row, premium_active=active)


def _devices_out(slots, this_id: str) -> list[DeviceOut]:
    return [
        DeviceOut(
            deviceId=s.device_id,
            deviceLabel=s.device_label or 'Unknown device',
            platform=s.platform,
            accountCount=int(s.account_count or 0),
            lastSeenAt=iso(s.last_seen_at),
            isThisDevice=s.device_id == this_id,
        )
        for s in slots
    ]


def _status(
    *,
    max_accounts: int,
    slots,
    device_id: str,
    this_count: int,
    adding: bool,
) -> SlotStatusOut:
    next_count = this_count + (1 if adding else 0)
    total = projected_total(slots, device_id=device_id, this_count=next_count)
    others = max(0, total - next_count)
    unlimited = is_unlimited(max_accounts)
    allowed = unlimited or total <= max_accounts
    message = ''
    if not allowed:
        message = (
            f'Your plan allows {max_accounts} MeroShare accounts in total '
            f'across all phones signed in with this Google account.\n\n'
            f'This phone: {this_count}\n'
            f'Other phones: {others}\n'
            f'Total: {this_count + others} / {max_accounts}'
        )
    reported_total = projected_total(
        slots, device_id=device_id, this_count=this_count,
    )
    return SlotStatusOut(
        allowed=allowed,
        maxAccounts=max_accounts,
        claimedTotal=reported_total if not adding else total,
        thisDeviceCount=this_count,
        otherDevicesTotal=others,
        deviceCount=len({s.device_id for s in slots} | {device_id}),
        message=message,
        devices=_devices_out(slots, device_id),
    )


@router.put('/report', response_model=SlotStatusOut)
async def report_slots(
    body: SlotIn,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SlotStatusOut:
    max_acc = await _max_for_user(db, user.id)
    try:
        await upsert_slot(
            db,
            user_id=user.id,
            device_id=body.device_id,
            device_label=body.device_label,
            platform=body.platform,
            account_count=body.account_count,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    await db.commit()
    slots = await list_slots(db, user.id)
    return _status(
        max_accounts=max_acc,
        slots=slots,
        device_id=body.device_id,
        this_count=body.account_count,
        adding=False,
    )


@router.post('/check', response_model=SlotStatusOut)
async def check_can_add(
    body: SlotIn,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SlotStatusOut:
    """Report this phone's current count, then check if adding one more is allowed."""
    max_acc = await _max_for_user(db, user.id)
    try:
        await upsert_slot(
            db,
            user_id=user.id,
            device_id=body.device_id,
            device_label=body.device_label,
            platform=body.platform,
            account_count=body.account_count,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    await db.commit()
    slots = await list_slots(db, user.id)
    return _status(
        max_accounts=max_acc,
        slots=slots,
        device_id=body.device_id,
        this_count=body.account_count,
        adding=True,
    )
