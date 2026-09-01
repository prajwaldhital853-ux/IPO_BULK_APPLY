from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db.models import PremiumEntitlement, PushDevice, User, UserPriceAlert
from ..emailer import email_configured, send_premium_expiry_reminder
from .expo_push import send_expo_push
from .market_data import (
    NPT,
    fetch_ltp_map,
    fetch_market_is_open,
    fetch_market_summary_text,
    had_trading_session_today,
    is_market_close_window,
    is_market_open_window,
    is_market_session_hours,
    now_npt,
)

log = logging.getLogger('push.jobs')


async def _enabled_tokens(db: AsyncSession) -> list[str]:
    rows = (
        await db.scalars(
            select(PushDevice).where(PushDevice.enabled.is_(True)),
        )
    ).all()
    return [r.expo_push_token for r in rows if r.expo_push_token]


async def run_market_open_job(db: AsyncSession) -> dict:
    if not is_market_open_window():
        return {
            'ok': True,
            'skipped': 'outside_open_window',
            'sent': 0,
            'tokenCount': 0,
        }
    is_open = await fetch_market_is_open()
    if is_open is not True:
        reason = 'market_closed' if is_open is False else 'market_status_unavailable'
        log.info('market_open skipped: %s', reason)
        return {'ok': True, 'skipped': reason, 'sent': 0, 'tokenCount': 0}
    title, body = await fetch_market_summary_text(kind='open')
    tokens = await _enabled_tokens(db)
    if not tokens:
        log.warning('market_open: no push devices registered (sent=0)')
        return {
            'ok': True,
            'kind': 'open',
            'sent': 0,
            'tokenCount': 0,
            'warning': 'No devices registered. Open the app, enable App notifications, allow OS permission.',
        }
    result = await send_expo_push(
        tokens,
        title=title,
        body=body,
        data={'type': 'market_open'},
        channel_id='market_v2',
    )
    log.info('market_open sent=%s tokenCount=%s', result.get('sent'), len(tokens))
    return {'ok': True, 'kind': 'open', 'tokenCount': len(tokens), **result}


async def run_market_close_job(db: AsyncSession) -> dict:
    if not is_market_close_window():
        return {
            'ok': True,
            'skipped': 'outside_close_window',
            'sent': 0,
            'tokenCount': 0,
        }
    is_open = await fetch_market_is_open()
    if is_open is True:
        log.info('market_close skipped: market_still_open')
        return {
            'ok': True,
            'skipped': 'market_still_open',
            'sent': 0,
            'tokenCount': 0,
        }
    if is_open is None:
        log.info('market_close skipped: market_status_unavailable')
        return {
            'ok': True,
            'skipped': 'market_status_unavailable',
            'sent': 0,
            'tokenCount': 0,
        }
    if not await had_trading_session_today():
        log.info('market_close skipped: no_trading_today')
        return {
            'ok': True,
            'skipped': 'no_trading_today',
            'sent': 0,
            'tokenCount': 0,
        }
    title, body = await fetch_market_summary_text(kind='close')
    tokens = await _enabled_tokens(db)
    if not tokens:
        log.warning('market_close: no push devices registered (sent=0)')
        return {
            'ok': True,
            'kind': 'close',
            'sent': 0,
            'tokenCount': 0,
            'warning': 'No devices registered. Open the app, enable App notifications, allow OS permission.',
        }
    result = await send_expo_push(
        tokens,
        title=title,
        body=body,
        data={'type': 'market_close'},
        channel_id='market_v2',
    )
    log.info('market_close sent=%s tokenCount=%s', result.get('sent'), len(tokens))
    return {'ok': True, 'kind': 'close', 'tokenCount': len(tokens), **result}


async def run_price_alert_job(db: AsyncSession) -> dict:
    if not is_market_session_hours():
        return {'ok': True, 'skipped': 'outside_session', 'triggered': 0}
    is_open = await fetch_market_is_open()
    if is_open is not True:
        reason = 'market_closed' if is_open is False else 'market_status_unavailable'
        return {'ok': True, 'skipped': reason, 'triggered': 0}

    alerts = (
        await db.scalars(
            select(UserPriceAlert).where(
                UserPriceAlert.enabled.is_(True),
                UserPriceAlert.triggered_at.is_(None),
            ),
        )
    ).all()
    if not alerts:
        return {'ok': True, 'triggered': 0, 'checked': 0}

    symbols = {a.symbol.upper() for a in alerts}
    ltp_map = await fetch_ltp_map(symbols)
    triggered = 0

    for alert in alerts:
        ltp = ltp_map.get(alert.symbol.upper())
        if ltp is None:
            continue
        hit = (
            alert.direction == 'above' and ltp >= float(alert.target_price)
        ) or (alert.direction == 'below' and ltp <= float(alert.target_price))
        if not hit:
            continue

        tokens: list[str] = []
        if alert.device_id:
            device = await db.get(PushDevice, alert.device_id)
            if device and device.enabled and device.expo_push_token:
                tokens.append(device.expo_push_token)
        if alert.user_id:
            user_devices = (
                await db.scalars(
                    select(PushDevice).where(
                        PushDevice.user_id == alert.user_id,
                        PushDevice.enabled.is_(True),
                    ),
                )
            ).all()
            for d in user_devices:
                if d.expo_push_token and d.expo_push_token not in tokens:
                    tokens.append(d.expo_push_token)

        if not tokens:
            continue

        direction_word = 'crossed above' if alert.direction == 'above' else 'fell below'
        title = f'{alert.symbol} price alert'
        body = (
            f'{alert.symbol} {direction_word} Rs {alert.target_price:g} '
            f'(now Rs {ltp:g})'
        )
        await send_expo_push(
            tokens,
            title=title,
            body=body,
            data={
                'type': 'price_alert',
                'symbol': alert.symbol,
                'alertId': alert.id,
                'ltp': ltp,
            },
            channel_id='price_alerts',
        )
        alert.triggered_at = datetime.now(UTC)
        alert.enabled = False
        triggered += 1

    await db.flush()
    return {
        'ok': True,
        'triggered': triggered,
        'checked': len(alerts),
        'ltpFound': len(ltp_map),
    }


def _expiry_date_npt(expires_at: datetime) -> date:
    exp = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=UTC)
    return exp.astimezone(NPT).date()


async def run_premium_expiry_reminder_job(db: AsyncSession) -> dict:
    """Email users whose premium expires in 2 days or 1 day (NPT calendar)."""
    if not email_configured():
        log.warning('premium_expiry_reminders: email not configured')
        return {
            'ok': False,
            'error': 'email_not_configured',
            'scanned': 0,
            'sent_2d': 0,
            'sent_1d': 0,
            'skipped': 0,
            'errors': 0,
        }

    today = now_npt().date()
    target_2d = today + timedelta(days=2)
    target_1d = today + timedelta(days=1)
    now = datetime.now(UTC)

    rows = (
        await db.scalars(
            select(PremiumEntitlement)
            .options(selectinload(PremiumEntitlement.user))
            .where(PremiumEntitlement.expires_at.is_not(None)),
        )
    ).all()

    scanned = 0
    sent_2d = 0
    sent_1d = 0
    skipped = 0
    errors = 0

    for row in rows:
        user: User | None = row.user
        if row.expires_at is None or user is None:
            skipped += 1
            continue
        email = (user.email or '').strip()
        if not email:
            skipped += 1
            continue

        exp = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(
            tzinfo=UTC,
        )
        if exp <= now:
            skipped += 1
            continue

        scanned += 1
        exp_date = _expiry_date_npt(exp)
        expires_label = exp.astimezone(NPT).strftime('%d %b %Y, %H:%M NPT')
        name = (user.name or '').strip()
        matched = False

        if exp_date == target_2d:
            matched = True
            if row.reminder_2d_sent_at is None:
                try:
                    send_premium_expiry_reminder(
                        to_email=email,
                        name=name,
                        days_left=2,
                        expires_at_label=expires_label,
                    )
                    row.reminder_2d_sent_at = now
                    sent_2d += 1
                except Exception as exc:  # noqa: BLE001
                    errors += 1
                    log.warning(
                        'premium_expiry 2d failed user=%s: %s',
                        user.id,
                        exc,
                    )
            else:
                skipped += 1

        if exp_date == target_1d:
            matched = True
            if row.reminder_1d_sent_at is None:
                try:
                    send_premium_expiry_reminder(
                        to_email=email,
                        name=name,
                        days_left=1,
                        expires_at_label=expires_label,
                    )
                    row.reminder_1d_sent_at = now
                    sent_1d += 1
                except Exception as exc:  # noqa: BLE001
                    errors += 1
                    log.warning(
                        'premium_expiry 1d failed user=%s: %s',
                        user.id,
                        exc,
                    )
            else:
                skipped += 1

        if not matched:
            skipped += 1

    await db.flush()
    result = {
        'ok': True,
        'scanned': scanned,
        'sent_2d': sent_2d,
        'sent_1d': sent_1d,
        'skipped': skipped,
        'errors': errors,
        'targets': {
            'in_2_days': target_2d.isoformat(),
            'in_1_day': target_1d.isoformat(),
        },
    }
    log.info('premium_expiry_reminders %s', result)
    return result


async def upsert_push_device(
    db: AsyncSession,
    *,
    expo_push_token: str,
    platform: str = 'android',
    enabled: bool = True,
    user_id: str | None = None,
) -> PushDevice:
    token = expo_push_token.strip()
    row = await db.scalar(
        select(PushDevice).where(PushDevice.expo_push_token == token),
    )
    if row is None:
        row = PushDevice(
            id=str(uuid.uuid4()),
            expo_push_token=token,
            platform=(platform or 'android')[:16],
            enabled=enabled,
            user_id=user_id,
        )
        db.add(row)
    else:
        row.enabled = enabled
        row.platform = (platform or row.platform or 'android')[:16]
        if user_id:
            row.user_id = user_id
        row.updated_at = datetime.now(UTC)

    if enabled and user_id:
        stale = (
            await db.scalars(
                select(PushDevice).where(
                    PushDevice.user_id == user_id,
                    PushDevice.expo_push_token != token,
                    PushDevice.enabled.is_(True),
                ),
            )
        ).all()
        for old in stale:
            old.enabled = False
            old.updated_at = datetime.now(UTC)

    await db.flush()
    return row


async def sync_price_alerts(
    db: AsyncSession,
    *,
    device: PushDevice,
    alerts: list[dict],
    user_id: str | None,
) -> int:
    """Replace this device's alerts with the client payload (enabled ones)."""
    existing = (
        await db.scalars(
            select(UserPriceAlert).where(
                or_(
                    UserPriceAlert.device_id == device.id,
                    UserPriceAlert.user_id == user_id,
                )
                if user_id
                else UserPriceAlert.device_id == device.id,
            ),
        )
    ).all()
    by_id = {a.id: a for a in existing}
    seen: set[str] = set()

    for raw in alerts:
        aid = str(raw.get('id') or '').strip()
        symbol = str(raw.get('symbol') or '').upper().strip()
        direction = str(raw.get('direction') or '').lower().strip()
        if not aid or not symbol or direction not in {'above', 'below'}:
            continue
        try:
            target = float(raw.get('targetPrice') or raw.get('target_price') or 0)
        except (TypeError, ValueError):
            continue
        if target <= 0:
            continue
        enabled = bool(raw.get('enabled', True))
        name = str(raw.get('name') or symbol)[:256]
        seen.add(aid)
        row = by_id.get(aid)
        if row is None:
            row = UserPriceAlert(
                id=aid,
                user_id=user_id or device.user_id,
                device_id=device.id,
                symbol=symbol,
                name=name,
                direction=direction,
                target_price=target,
                enabled=enabled,
                triggered_at=None,
            )
            db.add(row)
        else:
            row.symbol = symbol
            row.name = name
            row.direction = direction
            row.target_price = target
            row.enabled = enabled
            row.device_id = device.id
            if user_id:
                row.user_id = user_id
            # Re-arm if user re-enables after trigger
            if enabled and row.triggered_at is not None:
                row.triggered_at = None

    for aid, row in by_id.items():
        if aid not in seen and row.device_id == device.id:
            await db.delete(row)

    await db.flush()
    return len(seen)
