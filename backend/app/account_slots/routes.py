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
from .registry import (
    RegistryState,
    build_state,
    candidate_is_known,
    cap_claimed,
    list_registry,
    purge_unclaimed,
    release_devices,
    sync_device_keys,
)
from .service import (
    is_unlimited,
    iso,
    list_slots,
    prune_devices,
    reconcile_device_slots,
    release_stale_device_claims,
    upsert_slot,
)

router = APIRouter(prefix='/app/account-slots', tags=['account-slots'])


class SlotIn(BaseModel):
    device_id: str = Field(alias='deviceId', min_length=4, max_length=128)
    device_label: str = Field(default='', alias='deviceLabel', max_length=128)
    platform: str = 'android'
    account_count: int = Field(default=0, alias='accountCount', ge=0, le=999999)

    model_config = {'populate_by_name': True}


class SyncIn(SlotIn):
    keys: list[str] = Field(default_factory=list)
    # Older builds only sent a count. Without this flag the registry is left
    # alone, so a legacy heartbeat can never release a phone's demats.
    sync_keys: bool = Field(default=False, alias='syncKeys')

    model_config = {'populate_by_name': True}


class CheckIn(SyncIn):
    candidate_key: str = Field(default='', alias='candidateKey', max_length=200)

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
    # Kept false: freeing other phones on demand was a way around the cap.
    can_release_others: bool = Field(default=False, alias='canReleaseOthers')
    active_keys: list[str] = Field(default_factory=list, alias='activeKeys')
    locked_keys: list[str] = Field(default_factory=list, alias='lockedKeys')
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


def _out(
    state: RegistryState,
    *,
    slots,
    device_id: str,
    this_count: int,
    allowed: bool = True,
    adding: bool = False,
    claimed: int | None = None,
) -> SlotStatusOut:
    unlimited = is_unlimited(state.max_accounts)
    total = cap_claimed(state, slots) if claimed is None else claimed
    others = max(0, total - this_count)
    message = ''
    if not allowed and not unlimited:
        message = (
            f'Your plan allows {state.max_accounts} MeroShare accounts in '
            f'total across every phone signed in with this Google account.\n\n'
            f'Already added: {total} / {state.max_accounts}\n\n'
            'Delete an account you no longer need, or ask for a higher limit.'
        )
    return SlotStatusOut(
        allowed=allowed,
        maxAccounts=state.max_accounts,
        claimedTotal=total + (1 if (adding and allowed) else 0),
        thisDeviceCount=this_count,
        otherDevicesTotal=others,
        deviceCount=len({s.device_id for s in slots} | {device_id}),
        message=message,
        canReleaseOthers=False,
        activeKeys=state.active_keys,
        lockedKeys=state.locked_keys,
        devices=_devices_out(slots, device_id),
    )


async def _sync(
    db: AsyncSession,
    *,
    user_id: str,
    body: SyncIn,
) -> tuple[RegistryState, list, int]:
    """Heartbeat + register this phone's demats; free traces of dead installs."""
    max_acc = await _max_for_user(db, user_id)
    unlimited = is_unlimited(max_acc)
    key_n = len(body.keys) if body.sync_keys else 0
    this_count = max(body.account_count, key_n)
    # Never treat "36 accounts, 0 fingerprints" as a wipe — that used to
    # unregister the phone and let the other phone add a second full set.
    do_sync_keys = body.sync_keys and (bool(body.keys) or this_count <= 0)
    try:
        await upsert_slot(
            db,
            user_id=user_id,
            device_id=body.device_id,
            device_label=body.device_label,
            platform=body.platform,
            account_count=this_count,
        )
        if do_sync_keys:
            state = await sync_device_keys(
                db,
                user_id=user_id,
                device_id=body.device_id,
                keys=body.keys,
                max_accounts=max_acc,
                unlimited=unlimited,
            )
        else:
            state = build_state(
                await list_registry(db, user_id),
                max_accounts=max_acc,
                unlimited=unlimited,
            )
        dead = await prune_devices(
            db,
            user_id,
            keep_device_id=body.device_id,
        )
        if dead:
            await release_devices(db, user_id, dead)
        await reconcile_device_slots(db, user_id)
        await release_stale_device_claims(
            db,
            user_id,
            keep_device_id=body.device_id,
        )
        await purge_unclaimed(db, user_id)
        rows = await list_registry(db, user_id)
        state = build_state(rows, max_accounts=max_acc, unlimited=unlimited)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    await db.commit()
    slots = await list_slots(db, user_id)
    return state, slots, this_count


@router.put('/sync', response_model=SlotStatusOut)
async def sync_slots(
    body: SyncIn,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SlotStatusOut:
    state, slots, this_count = await _sync(db, user_id=user.id, body=body)
    return _out(
        state,
        slots=slots,
        device_id=body.device_id,
        this_count=this_count,
    )


@router.post('/check', response_model=SlotStatusOut)
async def check_can_add(
    body: CheckIn,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SlotStatusOut:
    """Can this Google account claim one more demat anywhere?"""
    state, slots, this_count = await _sync(db, user_id=user.id, body=body)
    unlimited = is_unlimited(state.max_accounts)
    claimed = cap_claimed(state, slots)
    if unlimited:
        allowed = True
    elif await candidate_is_known(
        db,
        user_id=user.id,
        candidate_key=body.candidate_key or None,
    ):
        # Same demat already on another phone — no extra slot used.
        allowed = True
    else:
        allowed = claimed < state.max_accounts
    return _out(
        state,
        slots=slots,
        device_id=body.device_id,
        this_count=this_count,
        allowed=allowed,
        adding=True,
        claimed=claimed,
    )


@router.put('/report', response_model=SlotStatusOut)
async def report_slots(
    body: SyncIn,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SlotStatusOut:
    """Legacy heartbeat for older builds that only reported a count."""
    state, slots, this_count = await _sync(db, user_id=user.id, body=body)
    return _out(
        state,
        slots=slots,
        device_id=body.device_id,
        this_count=this_count,
    )


@router.post('/release-others', response_model=SlotStatusOut)
async def release_other_device_slots(
    body: SyncIn,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SlotStatusOut:
    """Retired: on-demand freeing let users hop the cap. Now a plain sync."""
    state, slots, this_count = await _sync(db, user_id=user.id, body=body)
    return _out(
        state,
        slots=slots,
        device_id=body.device_id,
        this_count=this_count,
    )


class ActiveSetOut(BaseModel):
    keys: list[str] = Field(default_factory=list)
    locked_keys: list[str] = Field(default_factory=list, alias='lockedKeys')
    confirmed_for_max: int = Field(default=0, alias='confirmedForMax')
    max_accounts: int = Field(alias='maxAccounts')
    total: int = 0

    model_config = {'populate_by_name': True}


def _active_out(state: RegistryState) -> ActiveSetOut:
    unlimited = is_unlimited(state.max_accounts)
    return ActiveSetOut(
        keys=[] if unlimited else state.active_keys,
        lockedKeys=state.locked_keys,
        confirmedForMax=0 if unlimited else state.max_accounts,
        maxAccounts=state.max_accounts,
        total=state.total,
    )


@router.get('/active', response_model=ActiveSetOut)
async def get_shared_active_accounts(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActiveSetOut:
    """The derived active set — first N demats by registration order."""
    max_acc = await _max_for_user(db, user.id)
    rows = await list_registry(db, user.id)
    state = build_state(
        rows,
        max_accounts=max_acc,
        unlimited=is_unlimited(max_acc),
    )
    return _active_out(state)


class ActiveSetIn(BaseModel):
    keys: list[str] = Field(default_factory=list)
    confirmed_for_max: int = Field(default=0, alias='confirmedForMax')

    model_config = {'populate_by_name': True}


@router.put('/active', response_model=ActiveSetOut)
async def put_shared_active_accounts(
    body: ActiveSetIn,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActiveSetOut:
    """Retired: phones no longer choose which accounts are active."""
    return await get_shared_active_accounts(user=user, db=db)


@router.delete('/active', response_model=ActiveSetOut)
async def delete_shared_active_accounts(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActiveSetOut:
    """Retired: a phone can no longer unlock the shared set."""
    return await get_shared_active_accounts(user=user, db=db)


@router.post('/active/prune', response_model=ActiveSetOut)
async def prune_shared_active_accounts(
    body: ActiveSetIn,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActiveSetOut:
    """Retired: deleting a demat frees its slot through /sync instead."""
    return await get_shared_active_accounts(user=user, db=db)
