from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db.models import UserFeedback


ALLOWED_KINDS = frozenset({'feedback', 'feature_request'})
ALLOWED_STATUSES = frozenset({'new', 'read', 'resolved'})


def _feedback_out(row: UserFeedback) -> dict[str, object]:
    return {
        'id': row.id,
        'kind': row.kind,
        'name': row.name,
        'email': row.email,
        'message': row.message,
        'userId': row.user_id,
        'status': row.status,
        'createdAt': row.created_at.isoformat(),
    }


async def create_feedback(
    db: AsyncSession,
    *,
    kind: str,
    name: str,
    email: str,
    message: str,
    user_id: str | None = None,
) -> UserFeedback:
    normalized_kind = kind.strip().lower()
    if normalized_kind not in ALLOWED_KINDS:
        raise ValueError('Invalid feedback type')
    body = message.strip()
    if len(body) < 5:
        raise ValueError('Message must be at least 5 characters')
    if len(body) > 4000:
        raise ValueError('Message is too long')

    row = UserFeedback(
        id=str(uuid.uuid4()),
        kind=normalized_kind,
        name=name.strip()[:256],
        email=email.strip()[:320],
        message=body,
        user_id=user_id,
        status='new',
    )
    db.add(row)
    await db.flush()
    return row


async def list_feedback(
    db: AsyncSession,
    *,
    kind: str | None = None,
    status: str | None = None,
) -> list[dict[str, object]]:
    stmt = select(UserFeedback).order_by(UserFeedback.created_at.desc())
    if kind and kind != 'all':
        stmt = stmt.where(UserFeedback.kind == kind.strip().lower())
    if status and status != 'all':
        stmt = stmt.where(UserFeedback.status == status.strip().lower())
    rows = (await db.scalars(stmt)).all()
    return [_feedback_out(row) for row in rows]


async def update_feedback_status(
    db: AsyncSession,
    feedback_id: str,
    status: str,
) -> dict[str, object]:
    normalized = status.strip().lower()
    if normalized not in ALLOWED_STATUSES:
        raise ValueError('Invalid status')
    row = await db.get(UserFeedback, feedback_id)
    if row is None:
        raise LookupError('Feedback not found')
    row.status = normalized
    await db.flush()
    return _feedback_out(row)
