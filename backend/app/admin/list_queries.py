from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..account_slots.registry import claimed_totals_for_users
from ..auth.subscription import effective_max_accounts
from ..db.models import (
    PremiumEntitlement,
    SubscriptionRequest,
    User,
    UserDeviceSlot,
)
from .pagination import (
    ADMIN_PAGE_SIZE,
    ADMIN_PAGE_SIZE_MAX,
    decode_cursor,
    encode_cursor,
    total_pages,
)
from .schemas import AdminPaginatedSubscriptionsOut, AdminPaginatedUsersOut, AdminPendingBrief, AdminSubscriptionRow, AdminUserRow


def _premium_active(user: User) -> tuple[bool, str | None]:
    premium = user.premium
    if not premium or not premium.expires_at:
        return False, None
    exp = (
        premium.expires_at
        if premium.expires_at.tzinfo
        else premium.expires_at.replace(tzinfo=UTC)
    )
    if exp <= datetime.now(UTC):
        return False, None
    return True, exp.isoformat()


def _access_from_user(user: User, pending: SubscriptionRequest | None) -> str:
    active, _ = _premium_active(user)
    if active:
        return 'premium'
    if pending is not None:
        return 'pending'
    return 'free'


def _active_premium_user_ids(now: datetime):
    return (
        select(PremiumEntitlement.user_id)
        .where(PremiumEntitlement.expires_at > now)
        .distinct()
    )


def _pending_subscription_user_ids():
    return (
        select(SubscriptionRequest.user_id)
        .where(SubscriptionRequest.status == 'pending')
        .distinct()
    )


def _multi_device_user_ids():
    return (
        select(UserDeviceSlot.user_id)
        .group_by(UserDeviceSlot.user_id)
        .having(func.count(UserDeviceSlot.id) > 1)
    )


def _apply_user_access_filter(stmt, filter_key: str, now: datetime):
    if filter_key == 'blocked':
        return stmt.where(User.is_blocked.is_(True))
    if filter_key == 'multi_device':
        return stmt.where(User.id.in_(_multi_device_user_ids()))
    active_premium = _active_premium_user_ids(now)
    pending_users = _pending_subscription_user_ids()
    if filter_key == 'premium':
        return stmt.where(User.id.in_(active_premium))
    if filter_key == 'pending':
        return stmt.where(
            User.id.in_(pending_users),
            ~User.id.in_(active_premium),
        )
    if filter_key == 'free':
        return stmt.where(
            ~User.id.in_(active_premium),
            ~User.id.in_(pending_users),
        )
    return stmt


def _apply_user_search(stmt, q: str | None):
    term = (q or '').strip()
    if not term:
        return stmt
    like = f'%{term}%'
    return stmt.where(or_(User.email.ilike(like), User.name.ilike(like)))


def _user_base_stmt(now: datetime, filter_key: str, q: str | None):
    stmt = select(User).options(selectinload(User.premium))
    stmt = _apply_user_search(stmt, q)
    stmt = _apply_user_access_filter(stmt, filter_key, now)
    return stmt


async def _count_users(
    db: AsyncSession,
    *,
    filter_key: str,
    q: str | None,
    now: datetime,
) -> int:
    stmt = select(func.count()).select_from(User)
    stmt = _apply_user_search(stmt, q)
    stmt = _apply_user_access_filter(stmt, filter_key, now)
    return int(await db.scalar(stmt) or 0)


async def _batch_user_rows(
    db: AsyncSession,
    users: list[User],
) -> list[AdminUserRow]:
    if not users:
        return []
    user_ids = [u.id for u in users]

    pending_rows = (
        await db.scalars(
            select(SubscriptionRequest).where(
                SubscriptionRequest.user_id.in_(user_ids),
                SubscriptionRequest.status == 'pending',
            ),
        )
    ).all()
    pending_by_uid = {r.user_id: r for r in pending_rows}

    count_rows = (
        await db.execute(
            select(SubscriptionRequest.user_id, func.count())
            .where(SubscriptionRequest.user_id.in_(user_ids))
            .group_by(SubscriptionRequest.user_id),
        )
    ).all()
    req_counts = {uid: int(c) for uid, c in count_rows}

    last_rows = (
        await db.execute(
            select(
                SubscriptionRequest.user_id,
                func.max(SubscriptionRequest.created_at),
            )
            .where(SubscriptionRequest.user_id.in_(user_ids))
            .group_by(SubscriptionRequest.user_id),
        )
    ).all()
    last_req = {uid: dt for uid, dt in last_rows}

    dev_rows = (
        await db.execute(
            select(UserDeviceSlot.user_id, func.count())
            .where(UserDeviceSlot.user_id.in_(user_ids))
            .group_by(UserDeviceSlot.user_id),
        )
    ).all()
    dev_counts = {uid: int(c) for uid, c in dev_rows}

    claimed_by_uid = await claimed_totals_for_users(db, user_ids)

    out: list[AdminUserRow] = []
    for user in users:
        active, expires_iso = _premium_active(user)
        pending = pending_by_uid.get(user.id)
        access = _access_from_user(user, pending)
        premium = user.premium
        out.append(
            AdminUserRow(
                id=user.id,
                googleSub=user.google_sub,
                email=user.email,
                name=user.name,
                avatarUrl=user.avatar_url,
                createdAt=user.created_at.isoformat(),
                accessLevel=access,
                premiumPlan=premium.plan if active and premium else None,
                premiumExpiresAt=expires_iso,
                premiumSource=premium.source if premium else None,
                maxAccounts=effective_max_accounts(user, premium_active=active),
                pendingRequest=(
                    AdminPendingBrief(
                        id=pending.id,
                        planId=pending.plan_id,
                        planTitle=pending.plan_title,
                        amountNpr=pending.amount_npr,
                        createdAt=pending.created_at.isoformat(),
                    )
                    if pending
                    else None
                ),
                subscriptionRequestCount=req_counts.get(user.id, 0),
                lastSubscriptionAt=(
                    last_req[user.id].isoformat() if user.id in last_req else None
                ),
                claimedTotal=claimed_by_uid.get(user.id, 0),
                deviceCount=dev_counts.get(user.id, 0),
                devices=[],
                isBlocked=bool(getattr(user, 'is_blocked', False)),
                blockedAt=(
                    user.blocked_at.isoformat()
                    if getattr(user, 'blocked_at', None) is not None
                    else None
                ),
                blockedReason=getattr(user, 'blocked_reason', None),
            ),
        )
    return out


async def paginate_admin_users(
    db: AsyncSession,
    *,
    access: str | None,
    q: str | None,
    cursor: str | None,
    page: int,
    limit: int | None,
) -> AdminPaginatedUsersOut:
    now = datetime.now(UTC)
    filter_key = (access or 'all').strip().lower()
    page_size = min(max(limit or ADMIN_PAGE_SIZE, 1), ADMIN_PAGE_SIZE_MAX)
    page_num = max(page, 1)

    total_count = await _count_users(db, filter_key=filter_key, q=q, now=now)

    stmt = _user_base_stmt(now, filter_key, q)
    stmt = stmt.order_by(User.created_at.desc(), User.id.desc())

    if cursor:
        try:
            dt, uid = decode_cursor(cursor)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
            stmt = stmt.where(tuple_(User.created_at, User.id) < tuple_(dt, uid))
        except (ValueError, TypeError):
            pass

    stmt = stmt.limit(page_size + 1)
    rows = (await db.scalars(stmt)).all()
    has_more = len(rows) > page_size
    page_rows = rows[:page_size]
    items = await _batch_user_rows(db, page_rows)

    next_cursor = None
    if has_more and page_rows:
        last = page_rows[-1]
        next_cursor = encode_cursor(last.created_at, last.id)

    return AdminPaginatedUsersOut(
        items=items,
        page=page_num,
        pageSize=page_size,
        totalCount=total_count,
        totalPages=total_pages(total_count, page_size),
        hasMore=has_more,
        nextCursor=next_cursor,
    )


def _subscription_row_out(
    req: SubscriptionRequest,
    user: User,
    pending_by_uid: dict[str, SubscriptionRequest],
) -> AdminSubscriptionRow:
    pending = pending_by_uid.get(user.id)
    access = _access_from_user(user, pending)
    active, expires_iso = _premium_active(user)
    return AdminSubscriptionRow(
        id=req.id,
        userId=user.id,
        userEmail=user.email,
        userName=user.name,
        userCreatedAt=user.created_at.isoformat(),
        userAccessLevel=access,
        planId=req.plan_id,
        planTitle=req.plan_title,
        amountNpr=req.amount_npr,
        status=req.status,
        paymentNote=req.payment_note,
        adminNote=req.admin_note,
        createdAt=req.created_at.isoformat(),
        reviewedAt=req.reviewed_at.isoformat() if req.reviewed_at else None,
        premiumActive=active,
        premiumExpiresAt=expires_iso,
    )


async def paginate_admin_subscriptions(
    db: AsyncSession,
    *,
    status: str | None,
    cursor: str | None,
    page: int,
    limit: int | None,
) -> AdminPaginatedSubscriptionsOut:
    page_size = min(max(limit or ADMIN_PAGE_SIZE, 1), ADMIN_PAGE_SIZE_MAX)
    page_num = max(page, 1)
    status_key = (status or '').strip().lower()

    count_stmt = select(func.count()).select_from(SubscriptionRequest)
    if status_key and status_key != 'all':
        count_stmt = count_stmt.where(SubscriptionRequest.status == status_key)
    total_count = int(await db.scalar(count_stmt) or 0)

    stmt = (
        select(SubscriptionRequest, User)
        .join(User, User.id == SubscriptionRequest.user_id)
        .options(selectinload(User.premium))
        .order_by(SubscriptionRequest.created_at.desc(), SubscriptionRequest.id.desc())
    )
    if status_key and status_key != 'all':
        stmt = stmt.where(SubscriptionRequest.status == status_key)

    if cursor:
        try:
            dt, rid = decode_cursor(cursor)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
            stmt = stmt.where(
                tuple_(SubscriptionRequest.created_at, SubscriptionRequest.id)
                < tuple_(dt, rid),
            )
        except (ValueError, TypeError):
            pass

    stmt = stmt.limit(page_size + 1)
    pairs = (await db.execute(stmt)).all()
    has_more = len(pairs) > page_size
    page_pairs = pairs[:page_size]

    user_ids = [user.id for _, user in page_pairs]
    pending_rows = (
        await db.scalars(
            select(SubscriptionRequest).where(
                SubscriptionRequest.user_id.in_(user_ids),
                SubscriptionRequest.status == 'pending',
            ),
        )
    ).all() if user_ids else []
    pending_by_uid = {r.user_id: r for r in pending_rows}

    items = [
        _subscription_row_out(req, user, pending_by_uid)
        for req, user in page_pairs
    ]

    next_cursor = None
    if has_more and page_pairs:
        last_req, _ = page_pairs[-1]
        next_cursor = encode_cursor(last_req.created_at, last_req.id)

    return AdminPaginatedSubscriptionsOut(
        items=items,
        page=page_num,
        pageSize=page_size,
        totalCount=total_count,
        totalPages=total_pages(total_count, page_size),
        hasMore=has_more,
        nextCursor=next_cursor,
    )
