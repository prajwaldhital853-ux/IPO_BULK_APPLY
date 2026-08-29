from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import PushNotificationLog
from .expo_push import send_expo_push
from .jobs import _enabled_tokens

log = logging.getLogger('push.broadcast')


async def broadcast_notification(
    db: AsyncSession,
    *,
    event_key: str,
    event_type: str,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
    channel_id: str = 'ipo',
    force: bool = False,
) -> dict[str, Any]:
    """Send one push to all enabled devices, deduplicated by event_key."""
    key = event_key.strip()
    if not key:
        return {'ok': False, 'error': 'missing_event_key'}

    if not force:
        existing = await db.scalar(
            select(PushNotificationLog).where(PushNotificationLog.event_key == key),
        )
        if existing is not None:
            return {
                'ok': True,
                'skipped': 'already_sent',
                'eventKey': key,
                'sent': 0,
            }

    tokens = await _enabled_tokens(db)
    if not tokens:
        log.warning('%s: no push devices (event=%s)', event_type, key)
        return {
            'ok': True,
            'eventKey': key,
            'eventType': event_type,
            'sent': 0,
            'tokenCount': 0,
            'warning': 'No devices registered.',
        }

    result = await send_expo_push(
        tokens,
        title=title,
        body=body,
        data={'type': event_type, **(data or {})},
        channel_id=channel_id,
    )

    if not force:
        row = PushNotificationLog(
            id=str(uuid.uuid4()),
            event_key=key,
            event_type=event_type,
        )
        db.add(row)
        await db.flush()

    log.info(
        '%s sent=%s tokens=%s key=%s',
        event_type,
        result.get('sent'),
        len(tokens),
        key,
    )
    return {
        'ok': True,
        'eventKey': key,
        'eventType': event_type,
        'tokenCount': len(tokens),
        **result,
    }
