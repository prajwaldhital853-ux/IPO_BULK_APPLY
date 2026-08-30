from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import utcnow
from ..config import get_settings
from ..db.models import AdminNotificationSend, PremiumEntitlement, PushDevice
from ..site_settings import _decode_uploaded_image
from .expo_push import send_expo_push

log = logging.getLogger('push.admin_notify')

Audience = Literal['free', 'premium', 'all']

TAB_SCREENS = frozenset({'Home', 'Apply', 'Services', 'Check', 'Profile'})

REDIRECT_SCREEN_OPTIONS: list[dict[str, Any]] = [
    {'id': 'Home', 'label': 'Home', 'needsSymbol': False},
    {'id': 'Apply', 'label': 'Apply IPO', 'needsSymbol': False},
    {'id': 'Subscription', 'label': 'Subscription', 'needsSymbol': False},
    {'id': 'BulkTransactions', 'label': 'Bulk Transactions', 'needsSymbol': False},
    {'id': 'StockDetail', 'label': 'Stock Detail', 'needsSymbol': True},
    {'id': 'Portfolio', 'label': 'Portfolio', 'needsSymbol': False},
    {'id': 'UserPortfolio', 'label': 'User Portfolio', 'needsSymbol': False},
    {'id': 'PriceAlert', 'label': 'Price Alerts', 'needsSymbol': False},
    {'id': 'Accumulation', 'label': 'Accumulation', 'needsSymbol': False},
    {'id': 'LiveMarketPulse', 'label': 'Live Market Pulse', 'needsSymbol': False},
    {'id': 'AppSettings', 'label': 'App Settings', 'needsSymbol': False},
]

HISTORY_KEEP = 5


def _premium_user_ids(rows: list[PremiumEntitlement], now: datetime) -> set[str]:
    out: set[str] = set()
    for row in rows:
        if not row.expires_at:
            continue
        exp = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=UTC)
        if exp > now:
            out.add(row.user_id)
    return out


async def _active_premium_user_ids(db: AsyncSession) -> set[str]:
    now = datetime.now(UTC)
    rows = (await db.scalars(select(PremiumEntitlement))).all()
    return _premium_user_ids(rows, now)


async def tokens_for_audience(db: AsyncSession, audience: Audience) -> list[str]:
    devices = (
        await db.scalars(
            select(PushDevice).where(PushDevice.enabled.is_(True)),
        )
    ).all()
    if audience == 'all':
        return [d.expo_push_token for d in devices if d.expo_push_token]

    premium_ids = await _active_premium_user_ids(db)
    tokens: list[str] = []
    for device in devices:
        token = (device.expo_push_token or '').strip()
        if not token:
            continue
        is_premium = bool(device.user_id and device.user_id in premium_ids)
        if audience == 'premium' and is_premium:
            tokens.append(token)
        elif audience == 'free' and not is_premium:
            tokens.append(token)
    return tokens


async def count_audience(db: AsyncSession, audience: Audience) -> int:
    return len(await tokens_for_audience(db, audience))


def build_push_data(
    *,
    redirect_screen: str,
    redirect_symbol: str | None = None,
) -> dict[str, str]:
    screen = redirect_screen.strip()
    symbol = (redirect_symbol or '').strip().upper()
    data: dict[str, str] = {'type': 'admin_custom'}
    if screen in TAB_SCREENS:
        data['screen'] = 'MainTabs'
        data['tabScreen'] = screen
    else:
        data['screen'] = screen
    if symbol:
        data['symbol'] = symbol
    return data


async def send_admin_custom_notification(
    db: AsyncSession,
    *,
    title: str,
    body: str,
    audience: Audience,
    redirect_screen: str,
    redirect_symbol: str | None,
    sent_by: str,
    image_base64: str | None = None,
) -> dict[str, Any]:
    allowed = {opt['id'] for opt in REDIRECT_SCREEN_OPTIONS}
    screen = redirect_screen.strip()
    if screen not in allowed:
        return {'ok': False, 'error': 'invalid_redirect_screen'}

    opt = next(o for o in REDIRECT_SCREEN_OPTIONS if o['id'] == screen)
    symbol = (redirect_symbol or '').strip().upper() or None
    if opt.get('needsSymbol') and not symbol:
        return {'ok': False, 'error': 'symbol_required'}

    image_b64: str | None = None
    image_mime: str | None = None
    if image_base64 and image_base64.strip():
        try:
            image_b64, image_mime = _decode_uploaded_image(image_base64.strip())
        except ValueError as e:
            return {'ok': False, 'error': str(e)}

    tokens = await tokens_for_audience(db, audience)
    if not tokens:
        return {
            'ok': True,
            'sent': 0,
            'tokenCount': 0,
            'warning': 'No matching devices registered.',
        }

    push_data = build_push_data(
        redirect_screen=screen,
        redirect_symbol=symbol,
    )

    row_id = str(uuid.uuid4())
    row = AdminNotificationSend(
        id=row_id,
        title=title.strip(),
        body=body.strip(),
        audience=audience,
        redirect_screen=screen,
        redirect_symbol=symbol,
        image_b64=image_b64,
        image_mime=image_mime,
        token_count=len(tokens),
        sent_count=0,
        sent_by=sent_by,
        created_at=utcnow(),
    )
    db.add(row)
    await db.flush()
    await db.commit()

    image_url: str | None = None
    if image_b64:
        base = get_settings().effective_public_base_url
        if base:
            image_url = f'{base}/app/notification-image/{row_id}'

    result = await send_expo_push(
        tokens,
        title=title.strip(),
        body=body.strip(),
        data=push_data,
        channel_id='market_v2',
        image_url=image_url,
    )

    stale_tokens = result.get('staleTokens') or []
    if stale_tokens:
        stale_set = set(stale_tokens)
        stale_rows = (
            await db.scalars(
                select(PushDevice).where(PushDevice.expo_push_token.in_(stale_set)),
            )
        ).all()
        for device in stale_rows:
            device.enabled = False
        if stale_rows:
            log.info('Disabled %s stale push device(s)', len(stale_rows))

    delivered = int(result.get('delivered') or result.get('sent') or 0)
    row.sent_count = delivered
    await db.flush()

    keep_ids = (
        await db.scalars(
            select(AdminNotificationSend.id)
            .order_by(AdminNotificationSend.created_at.desc())
            .limit(HISTORY_KEEP),
        )
    ).all()
    keep_set = set(keep_ids)
    if keep_set:
        await db.execute(
            delete(AdminNotificationSend).where(
                AdminNotificationSend.id.not_in(keep_set),
            ),
        )

    log.info(
        'admin_custom_notification audience=%s tokens=%s delivered=%s failed=%s image=%s by=%s errors=%s',
        audience,
        len(tokens),
        delivered,
        result.get('failed'),
        bool(image_url),
        sent_by,
        result.get('errors'),
    )
    return {
        'ok': True,
        'audience': audience,
        'redirectScreen': screen,
        'redirectSymbol': symbol,
        'tokenCount': len(tokens),
        'sentCount': delivered,
        'delivered': delivered,
        'failed': int(result.get('failed') or 0),
        'errors': result.get('errors') or [],
        'hasImage': bool(image_url),
        **result,
    }


async def list_notification_history(
    db: AsyncSession,
    *,
    limit: int = HISTORY_KEEP,
) -> list[AdminNotificationSend]:
    return (
        await db.scalars(
            select(AdminNotificationSend)
            .order_by(AdminNotificationSend.created_at.desc())
            .limit(limit),
        )
    ).all()


def history_row_to_dict(row: AdminNotificationSend) -> dict[str, Any]:
    return {
        'id': row.id,
        'title': row.title,
        'body': row.body,
        'audience': row.audience,
        'redirectScreen': row.redirect_screen,
        'redirectSymbol': row.redirect_symbol,
        'hasImage': bool(row.image_b64),
        'tokenCount': row.token_count,
        'sentCount': row.sent_count,
        'sentBy': row.sent_by,
        'createdAt': row.created_at.isoformat() if row.created_at else None,
    }
