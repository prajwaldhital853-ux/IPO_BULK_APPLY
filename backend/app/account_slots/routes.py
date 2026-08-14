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
    cleanup_device_slots,
    iso,
    is_unlimited,
    list_slots,
    projected_total,
    release_other_slots,
    upsert_slot,
)
from .active import clear_active_set, get_active_set, prune_active_keys, save_active_set

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
    can_release_others: bool = Field(default=False, alias='canReleaseOthers')
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
        if others > 0:
            message += (
                '\n\nIf you uninstalled the app on another phone, '
                'you can free those slots now.'
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
        canReleaseOthers=(not allowed) and others > 0,
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
    slots = await cleanup_device_slots(
        db,
        user.id,
        keep_device_id=body.device_id,
        max_accounts=max_acc,
        this_count=body.account_count,
    )
    await db.commit()
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
    slots = await cleanup_device_slots(
        db,
        user.id,
        keep_device_id=body.device_id,
        max_accounts=max_acc,
        this_count=body.account_count,
    )
    await db.commit()
    return _status(
        max_accounts=max_acc,
        slots=slots,
        device_id=body.device_id,
        this_count=body.account_count,
        adding=True,
    )


@router.post('/release-others', response_model=SlotStatusOut)
async def release_other_device_slots(
    body: SlotIn,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SlotStatusOut:
    """Drop every other install's claimed count for this Google user.

    Use after uninstalling the app on another phone — the OS cannot notify us,
    so the user confirms from the phone they still have.
    """
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
        await release_other_slots(
            db,
            user.id,
            keep_device_id=body.device_id,
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


class ActiveSetOut(BaseModel):
    keys: list[str] = Field(default_factory=list)
    confirmed_for_max: int = Field(default=0, alias='confirmedForMax')
    max_accounts: int = Field(alias='maxAccounts')

    model_config = {'populate_by_name': True}


class ActiveSetIn(BaseModel):
    keys: list[str] = Field(default_factory=list)
    confirmed_for_max: int = Field(alias='confirmedForMax', ge=1)

    model_config = {'populate_by_name': True}


@router.get('/active', response_model=ActiveSetOut)
async def get_shared_active_accounts(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActiveSetOut:
    max_acc = await _max_for_user(db, user.id)
    keys, confirmed = await get_active_set(db, user.id)
    if is_unlimited(max_acc):
        if keys or confirmed:
            await clear_active_set(db, user.id)
            await db.commit()
        return ActiveSetOut(keys=[], confirmedForMax=0, maxAccounts=max_acc)
    # Plan raised/lowered (or too many keys for new cap) → unlock so phones re-pick.
    stale = bool(keys) and (
        confirmed != max_acc or len(keys) > max_acc or confirmed < 1
    )
    if stale:
        await clear_active_set(db, user.id)
        await db.commit()
        keys, confirmed = [], 0
    return ActiveSetOut(
        keys=keys,
        confirmedForMax=confirmed if confirmed == max_acc and keys else 0,
        maxAccounts=max_acc,
    )


@router.put('/active', response_model=ActiveSetOut)
async def put_shared_active_accounts(
    body: ActiveSetIn,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActiveSetOut:
    max_acc = await _max_for_user(db, user.id)
    if is_unlimited(max_acc):
        await clear_active_set(db, user.id)
        await db.commit()
        return ActiveSetOut(keys=[], confirmedForMax=0, maxAccounts=max_acc)
    try:
        keys, confirmed = await save_active_set(
            db,
            user_id=user.id,
            keys=body.keys,
            confirmed_for_max=body.confirmed_for_max,
            max_accounts=max_acc,
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return ActiveSetOut(
        keys=keys,
        confirmedForMax=confirmed,
        maxAccounts=max_acc,
    )


@router.delete('/active', response_model=ActiveSetOut)
async def delete_shared_active_accounts(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActiveSetOut:
    max_acc = await _max_for_user(db, user.id)
    # Clients used to wipe the shared set when THIS phone was under quota
    # (including while accounts were still loading). That unlocked every
    # other phone. Only unlimited plans may clear.
    if is_unlimited(max_acc):
        await clear_active_set(db, user.id)
        await db.commit()
        return ActiveSetOut(keys=[], confirmedForMax=0, maxAccounts=max_acc)
    keys, confirmed = await get_active_set(db, user.id)
    return ActiveSetOut(
        keys=keys,
        confirmedForMax=confirmed if confirmed == max_acc else 0,
        maxAccounts=max_acc,
    )


class PruneActiveIn(BaseModel):
    keys: list[str] = Field(default_factory=list)

    model_config = {'populate_by_name': True}


@router.post('/active/prune', response_model=ActiveSetOut)
async def prune_shared_active_accounts(
    body: PruneActiveIn,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActiveSetOut:
    """Free slots after deleting demats that were in the shared active set."""
    max_acc = await _max_for_user(db, user.id)
    if is_unlimited(max_acc):
        await clear_active_set(db, user.id)
        await db.commit()
        return ActiveSetOut(keys=[], confirmedForMax=0, maxAccounts=max_acc)
    keys, confirmed = await prune_active_keys(
        db,
        user_id=user.id,
        remove_keys=body.keys,
        max_accounts=max_acc,
    )
    await db.commit()
    return ActiveSetOut(
        keys=keys,
        confirmedForMax=confirmed,
        maxAccounts=max_acc,
    )
