from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import PushDevice
from .expo_push import send_expo_push

log = logging.getLogger('push.user_notify')

ACCOUNT_CHANNEL = 'account'


async def _tokens_for_user(db: AsyncSession, user_id: str) -> list[str]:
    rows = (
        await db.scalars(
            select(PushDevice).where(
                PushDevice.user_id == user_id,
                PushDevice.enabled.is_(True),
            ),
        )
    ).all()
    return [r.expo_push_token for r in rows if r.expo_push_token]


async def notify_user(
    db: AsyncSession,
    user_id: str,
    *,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> int:
    """Send an account/subscription push to all enabled devices for this user."""
    try:
        tokens = await _tokens_for_user(db, user_id)
        if not tokens:
            return 0
        result = await send_expo_push(
            tokens,
            title=title,
            body=body,
            data=data,
            channel_id=ACCOUNT_CHANNEL,
        )
        return int(result.get('sent') or 0)
    except Exception as exc:  # noqa: BLE001
        # Postgres aborts the whole transaction on SQL errors — roll back so the
        # caller can still read/write in the same request (e.g. subscription submit).
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001
            pass
        log.warning('notify_user failed user=%s: %s', user_id, exc)
        return 0
