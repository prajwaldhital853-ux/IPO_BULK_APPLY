from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import PremiumEntitlement, SubscriptionRequest, User

DEMO_EMAIL_PREFIX = 'demo-user-'
DEMO_EMAIL_DOMAIN = '@nepseghar-test.local'
DEMO_SUB_PREFIX = 'demo-seed-'

FIRST_NAMES = (
    'Aarav',
    'Sita',
    'Ram',
    'Priya',
    'Bikash',
    'Anisha',
    'Niraj',
    'Kriti',
    'Sumit',
    'Rina',
    'Dipesh',
    'Maya',
    'Rohan',
    'Sunita',
    'Prakash',
)
LAST_NAMES = (
    'Shrestha',
    'Gurung',
    'Tamang',
    'Karki',
    'Thapa',
    'Rai',
    'Maharjan',
    'Basnet',
    'Adhikari',
    'Poudel',
)


def demo_email(n: int) -> str:
    return f'{DEMO_EMAIL_PREFIX}{n:04d}{DEMO_EMAIL_DOMAIN}'


def demo_sub(n: int) -> str:
    return f'{DEMO_SUB_PREFIX}{n:04d}'


def demo_name(n: int) -> str:
    return f'{FIRST_NAMES[n % len(FIRST_NAMES)]} {LAST_NAMES[(n // 7) % len(LAST_NAMES)]}'


async def count_demo_users(db: AsyncSession) -> int:
    like = f'{DEMO_EMAIL_PREFIX}%{DEMO_EMAIL_DOMAIN}'
    return int(
        await db.scalar(
            select(func.count()).select_from(User).where(User.email.like(like)),
        )
        or 0,
    )


async def clear_demo_users(db: AsyncSession) -> int:
    like = f'{DEMO_EMAIL_PREFIX}%{DEMO_EMAIL_DOMAIN}'
    ids = (await db.scalars(select(User.id).where(User.email.like(like)))).all()
    if not ids:
        return 0
    await db.execute(
        delete(SubscriptionRequest).where(SubscriptionRequest.user_id.in_(ids)),
    )
    await db.execute(
        delete(PremiumEntitlement).where(PremiumEntitlement.user_id.in_(ids)),
    )
    await db.execute(delete(User).where(User.id.in_(ids)))
    return len(ids)


async def seed_demo_users(
    db: AsyncSession,
    *,
    count: int,
    start_index: int = 1,
) -> int:
    now = datetime.now(UTC)
    created = 0
    batch = 0

    for n in range(start_index, start_index + count):
        email = demo_email(n)
        exists = await db.scalar(select(User.id).where(User.email == email))
        if exists:
            continue

        blocked = n % 25 == 0
        premium = (not blocked) and n % 8 == 0
        pending = (not blocked) and (not premium) and n % 10 == 0

        user = User(
            id=str(uuid.uuid4()),
            google_sub=demo_sub(n),
            email=email,
            name=demo_name(n),
            avatar_url=None,
            max_accounts=50 if premium else 10,
            is_blocked=blocked,
            blocked_at=now if blocked else None,
            blocked_reason='Demo blocked user' if blocked else None,
            created_at=now - timedelta(days=n % 400, hours=n % 24, minutes=n % 60),
        )
        db.add(user)

        if premium:
            db.add(
                PremiumEntitlement(
                    user_id=user.id,
                    plan='yearly',
                    expires_at=now + timedelta(days=120 + (n % 200)),
                    source='demo-seed',
                ),
            )
        elif pending:
            db.add(
                SubscriptionRequest(
                    id=str(uuid.uuid4()),
                    user_id=user.id,
                    plan_id='monthly',
                    plan_title='Monthly Premium',
                    amount_npr=299,
                    status='pending',
                    payment_note='Demo seed payment',
                ),
            )

        created += 1
        batch += 1
        if batch >= 100:
            await db.flush()
            batch = 0

    if batch:
        await db.flush()
    return created


async def ensure_demo_users(db: AsyncSession, *, target: int) -> dict[str, int]:
    """Create demo users until `target` total exist. Returns counts."""
    existing = await count_demo_users(db)
    if existing >= target:
        return {'created': 0, 'total': existing, 'alreadyHad': existing}
    need = target - existing
    start = existing + 1
    created = await seed_demo_users(db, count=need, start_index=start)
    total = await count_demo_users(db)
    return {'created': created, 'total': total, 'alreadyHad': existing}
