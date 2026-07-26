from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db.models import PremiumEntitlement, SubscriptionRequest, User
from .schemas import PendingRequestOut, PremiumOut, premium_from_row

# Free tier: 10 MeroShare accounts. Paid plans unlock 50 by default.
# Admin can raise a user's cap (or set 999999 = unlimited) via users.max_accounts.
FREE_ACCOUNT_LIMIT = 10
PREMIUM_ACCOUNT_LIMIT = 50
UNLIMITED_ACCOUNT_LIMIT = 999_999

PLAN_CATALOG: dict[str, dict[str, object]] = {
    'premium_6month': {
        'title': 'Premium 6 Months',
        'days': 180,
        'amountNpr': 300,
        'maxAccounts': PREMIUM_ACCOUNT_LIMIT,
    },
    'premium_yearly': {
        'title': 'Premium Yearly',
        'days': 365,
        'amountNpr': 500,
        'maxAccounts': PREMIUM_ACCOUNT_LIMIT,
    },
    # Legacy aliases (pending requests / old clients)
    'premium_monthly': {
        'title': 'Premium 6 Months',
        'days': 180,
        'amountNpr': 300,
        'maxAccounts': PREMIUM_ACCOUNT_LIMIT,
    },
}


def effective_max_accounts(user: User, *, premium_active: bool) -> int:
    override = getattr(user, 'max_accounts', None)
    if override is not None:
        try:
            n = int(override)
            if n > 0:
                return n
        except (TypeError, ValueError):
            pass
    return PREMIUM_ACCOUNT_LIMIT if premium_active else FREE_ACCOUNT_LIMIT


def plan_info(plan_id: str) -> dict[str, object]:
    info = PLAN_CATALOG.get(plan_id)
    if info is None:
        raise ValueError(f'Unknown plan: {plan_id}')
    return info


def utcnow() -> datetime:
    return datetime.now(UTC)


def _pending_out(row: SubscriptionRequest | None) -> PendingRequestOut | None:
    if row is None:
        return None
    return PendingRequestOut(
        id=row.id,
        planId=row.plan_id,
        planTitle=row.plan_title,
        amountNpr=row.amount_npr,
        status=row.status,
        paymentNote=row.payment_note,
        createdAt=row.created_at.isoformat(),
    )


async def get_pending_request(
    db: AsyncSession,
    user_id: str,
) -> SubscriptionRequest | None:
    return await db.scalar(
        select(SubscriptionRequest)
        .where(
            SubscriptionRequest.user_id == user_id,
            SubscriptionRequest.status == 'pending',
        )
        .order_by(SubscriptionRequest.created_at.desc()),
    )


async def expire_premium_if_needed(
    db: AsyncSession,
    user: User,
) -> bool:
    """Delete expired entitlement so the user is treated as free. Returns True if removed."""
    row = user.premium
    if row is None or row.expires_at is None:
        return False
    exp = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=UTC)
    if exp > utcnow():
        return False
    await db.delete(row)
    await db.flush()
    user.premium = None
    return True


async def build_premium_out(
    db: AsyncSession,
    user: User,
) -> PremiumOut:
    await expire_premium_if_needed(db, user)
    pending = await get_pending_request(db, user.id)
    base = premium_from_row(
        user.premium.plan if user.premium else None,
        user.premium.expires_at if user.premium else None,
        max_accounts=FREE_ACCOUNT_LIMIT,
    )
    max_acc = effective_max_accounts(user, premium_active=base.active)
    if base.active:
        return base.model_copy(
            update={
                'status': 'active',
                'pending_request': None,
                'max_accounts': max_acc,
            }
        )
    if pending is not None:
        return PremiumOut(
            active=False,
            plan=None,
            expires_at=None,
            status='pending',
            maxAccounts=max_acc,
            pending_request=_pending_out(pending),
        )
    return PremiumOut(
        active=False,
        plan=None,
        expires_at=None,
        status='free',
        maxAccounts=max_acc,
        pending_request=None,
    )


async def upsert_premium(
    db: AsyncSession,
    user_id: str,
    plan_id: str,
    days: int,
    source: str = 'admin',
) -> PremiumEntitlement:
    expires = utcnow() + timedelta(days=days)
    row = await db.scalar(
        select(PremiumEntitlement).where(PremiumEntitlement.user_id == user_id),
    )
    if row is None:
        row = PremiumEntitlement(
            user_id=user_id,
            plan=plan_id,
            expires_at=expires,
            source=source,
        )
        db.add(row)
    else:
        current = row.expires_at
        if current and current.tzinfo is None:
            current = current.replace(tzinfo=UTC)
        if current and current > utcnow():
            row.expires_at = current + timedelta(days=days)
        else:
            row.expires_at = expires
        row.plan = plan_id
        row.source = source
    await db.flush()
    return row


async def clear_premium(db: AsyncSession, user_id: str) -> None:
    row = await db.scalar(
        select(PremiumEntitlement).where(PremiumEntitlement.user_id == user_id),
    )
    if row is not None:
        await db.delete(row)


async def load_user_with_premium(db: AsyncSession, user_id: str) -> User | None:
    return await db.scalar(
        select(User)
        .where(User.id == user_id)
        .options(
            selectinload(User.premium),
            selectinload(User.subscription_requests),
        ),
    )
