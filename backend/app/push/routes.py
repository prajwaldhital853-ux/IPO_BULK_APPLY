from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import CurrentUser, get_optional_user
from ..config import get_settings
from ..db.session import get_db
from .jobs import (
    run_market_close_job,
    run_market_open_job,
    run_price_alert_job,
    sync_price_alerts,
    upsert_push_device,
)

router = APIRouter(prefix='/app/push', tags=['push'])


class PushTokenIn(BaseModel):
    expo_push_token: str = Field(alias='expoPushToken')
    platform: str = 'android'
    enabled: bool = True

    model_config = {'populate_by_name': True}


class PriceAlertIn(BaseModel):
    id: str
    symbol: str
    name: str = ''
    direction: str
    target_price: float = Field(alias='targetPrice')
    enabled: bool = True

    model_config = {'populate_by_name': True}


class SyncAlertsIn(BaseModel):
    expo_push_token: str = Field(alias='expoPushToken')
    alerts: list[PriceAlertIn] = Field(default_factory=list)

    model_config = {'populate_by_name': True}


def _require_cron(x_cron_secret: str = Header(default='', alias='X-Cron-Secret')) -> None:
    expected = get_settings().effective_cron_secret
    if not expected or x_cron_secret.strip() != expected:
        raise HTTPException(status_code=401, detail='Invalid cron secret')


@router.post('/register')
async def register_push_token(
    body: PushTokenIn,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser | None = Depends(get_optional_user),
) -> dict:
    if not body.expo_push_token.strip():
        raise HTTPException(status_code=400, detail='expoPushToken required')
    row = await upsert_push_device(
        db,
        expo_push_token=body.expo_push_token,
        platform=body.platform,
        enabled=body.enabled,
        user_id=user.id if user else None,
    )
    await db.commit()
    return {'ok': True, 'deviceId': row.id, 'enabled': row.enabled}


@router.post('/alerts/sync')
async def sync_alerts(
    body: SyncAlertsIn,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser | None = Depends(get_optional_user),
) -> dict:
    if not body.expo_push_token.strip():
        raise HTTPException(status_code=400, detail='expoPushToken required')
    device = await upsert_push_device(
        db,
        expo_push_token=body.expo_push_token,
        enabled=True,
        user_id=user.id if user else None,
    )
    count = await sync_price_alerts(
        db,
        device=device,
        alerts=[a.model_dump(by_alias=True) for a in body.alerts],
        user_id=user.id if user else None,
    )
    await db.commit()
    return {'ok': True, 'synced': count, 'deviceId': device.id}


@router.post('/jobs/market-open')
async def job_market_open(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_cron),
) -> dict:
    result = await run_market_open_job(db)
    await db.commit()
    return result


@router.post('/jobs/market-close')
async def job_market_close(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_cron),
) -> dict:
    result = await run_market_close_job(db)
    await db.commit()
    return result


@router.post('/jobs/price-alerts')
async def job_price_alerts(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_cron),
) -> dict:
    result = await run_price_alert_job(db)
    await db.commit()
    return result
