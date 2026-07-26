from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db.models import PremiumEntitlement, SiteSettings, SubscriptionRequest, User
from .schemas import PendingRequestOut, PremiumOut, premium_from_row

# Free tier: 10 MeroShare accounts. Paid plans unlock 50 by default.
# Admin can raise a user's cap (or set 999999 = unlimited) via users.max_accounts.
FREE_ACCOUNT_LIMIT = 10
PREMIUM_ACCOUNT_LIMIT = 50
UNLIMITED_ACCOUNT_LIMIT = 999_999

DEFAULT_PLAN_DETAILS: list[dict[str, object]] = [
    {
        'id': 'premium_6month',
        'title': 'Premium 6 Months',
        'priceLabel': 'Rs 300',
        'amountNpr': 300,
        'period': '6 months',
        'days': 180,
        'maxAccounts': PREMIUM_ACCOUNT_LIMIT,
        'perks': [
            f'Add up to {PREMIUM_ACCOUNT_LIMIT} MeroShare accounts',
            'Bulk IPO apply & result check',
            'Investment Summary across portfolios',
            'Aggressive Holders & smart-money signals',
            'Live Market Pulse dashboard',
            'Accumulation / Distribution scanners',
            'Top Buyers, Sellers, Holders & Releases',
            'Broker Favorites & Top Buy/Sell intel',
            '52 Week High / Low advanced screener',
            'Financial Reports, Floor Sheet & Market Depth',
        ],
    },
    {
        'id': 'premium_yearly',
        'title': 'Premium Yearly',
        'priceLabel': 'Rs 500',
        'amountNpr': 500,
        'period': '1 year',
        'days': 365,
        'maxAccounts': PREMIUM_ACCOUNT_LIMIT,
        'perks': [
            f'Add up to {PREMIUM_ACCOUNT_LIMIT} MeroShare accounts',
            'Everything in 6 Months plan',
            'Best value — only Rs 500 / year',
            'Priority data refresh',
        ],
    },
]

# Compact catalog used for entitlement math (kept for backward imports).
PLAN_CATALOG: dict[str, dict[str, object]] = {
    str(p['id']): {
        'title': p['title'],
        'days': p['days'],
        'amountNpr': p['amountNpr'],
        'maxAccounts': p['maxAccounts'],
    }
    for p in DEFAULT_PLAN_DETAILS
}
PLAN_CATALOG['premium_monthly'] = {
    'title': 'Premium 6 Months',
    'days': 180,
    'amountNpr': 300,
    'maxAccounts': PREMIUM_ACCOUNT_LIMIT,
}


def _pick(raw: dict, *keys: str, default: object = None) -> object:
    for key in keys:
        if key in raw and raw[key] is not None:
            return raw[key]
    return default


def _normalize_plan(raw: dict) -> dict[str, object] | None:
    pid = str(_pick(raw, 'id', default='') or '').strip()
    if not pid:
        return None
    title = str(_pick(raw, 'title', default=pid) or pid).strip() or pid
    try:
        amount = int(_pick(raw, 'amountNpr', 'amount_npr', default=0) or 0)
    except (TypeError, ValueError):
        amount = 0
    if amount < 1:
        return None
    try:
        days = int(_pick(raw, 'days', default=0) or 0)
    except (TypeError, ValueError):
        days = 0
    if days < 1:
        days = 30
    try:
        max_acc = int(
            _pick(raw, 'maxAccounts', 'max_accounts', default=PREMIUM_ACCOUNT_LIMIT)
            or PREMIUM_ACCOUNT_LIMIT
        )
    except (TypeError, ValueError):
        max_acc = PREMIUM_ACCOUNT_LIMIT
    period = str(_pick(raw, 'period', default='') or '').strip() or f'{days} days'
    price_label = str(
        _pick(raw, 'priceLabel', 'price', default=f'Rs {amount}') or f'Rs {amount}'
    ).strip()
    perks_raw = raw.get('perks')
    perks: list[str] = []
    if isinstance(perks_raw, list):
        for p in perks_raw:
            s = str(p).strip()
            if s:
                perks.append(s)
    if not perks:
        perks = [f'Add up to {max_acc} MeroShare accounts']
    return {
        'id': pid,
        'title': title,
        'priceLabel': price_label,
        'amountNpr': amount,
        'period': period,
        'days': days,
        'maxAccounts': max(1, max_acc),
        'perks': perks,
    }


def default_subscription_plans() -> list[dict[str, object]]:
    return [dict(p) for p in DEFAULT_PLAN_DETAILS]


def load_subscription_plans(row: SiteSettings | None) -> list[dict[str, object]]:
    if row is None:
        return default_subscription_plans()
    raw = getattr(row, 'subscription_plans_json', None) or '[]'
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return default_subscription_plans()
    if not isinstance(data, list) or not data:
        return default_subscription_plans()
    out: list[dict[str, object]] = []
    for entry in data:
        if not isinstance(entry, dict):
            continue
        norm = _normalize_plan(entry)
        if norm:
            out.append(norm)
    return out or default_subscription_plans()


def plans_to_catalog(plans: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    catalog: dict[str, dict[str, object]] = {}
    for p in plans:
        pid = str(p['id'])
        catalog[pid] = {
            'title': p['title'],
            'days': p['days'],
            'amountNpr': p['amountNpr'],
            'maxAccounts': p['maxAccounts'],
        }
    six = catalog.get('premium_6month')
    if six:
        catalog['premium_monthly'] = dict(six)
    return catalog


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


def plan_info(
    plan_id: str,
    catalog: dict[str, dict[str, object]] | None = None,
) -> dict[str, object]:
    source = catalog or PLAN_CATALOG
    info = source.get(plan_id)
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
