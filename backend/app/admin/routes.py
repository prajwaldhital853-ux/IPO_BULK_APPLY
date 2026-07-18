from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth.deps import utcnow
from ..auth.jwt_tokens import create_admin_token
from ..auth.subscription import (
    PLAN_CATALOG,
    clear_premium,
    get_pending_request,
    load_user_with_premium,
    plan_info,
    upsert_premium,
)
from ..config import get_settings
from ..db.models import PremiumEntitlement, SubscriptionRequest, User
from ..db.session import get_db
from .deps import AdminUser, get_admin_user
from .schemas import (
    AdminActionIn,
    AdminDashboardStats,
    AdminLoginRequest,
    AdminLoginResponse,
    AdminPendingBrief,
    AdminSubscriptionRow,
    AdminUserRow,
)

router = APIRouter(prefix='/admin', tags=['admin'])


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


async def _access_level(db: AsyncSession, user: User) -> str:
    active, _ = _premium_active(user)
    if active:
        return 'premium'
    pending = await get_pending_request(db, user.id)
    if pending is not None:
        return 'pending'
    return 'free'


def _row_out(req: SubscriptionRequest, user: User, access_level: str) -> AdminSubscriptionRow:
    active, expires_iso = _premium_active(user)
    return AdminSubscriptionRow(
        id=req.id,
        userId=user.id,
        userEmail=user.email,
        userName=user.name,
        userCreatedAt=user.created_at.isoformat(),
        userAccessLevel=access_level,
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


async def _user_row(db: AsyncSession, user: User) -> AdminUserRow:
    access = await _access_level(db, user)
    active, expires_iso = _premium_active(user)
    pending = await get_pending_request(db, user.id)
    req_count = await db.scalar(
        select(func.count())
        .select_from(SubscriptionRequest)
        .where(SubscriptionRequest.user_id == user.id),
    )
    last_req = await db.scalar(
        select(SubscriptionRequest.created_at)
        .where(SubscriptionRequest.user_id == user.id)
        .order_by(SubscriptionRequest.created_at.desc())
        .limit(1),
    )
    premium = user.premium
    return AdminUserRow(
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
        subscriptionRequestCount=int(req_count or 0),
        lastSubscriptionAt=last_req.isoformat() if last_req else None,
    )


@router.post('/login', response_model=AdminLoginResponse)
async def admin_login(body: AdminLoginRequest) -> AdminLoginResponse:
    settings = get_settings()
    if (
        body.email.strip().lower() != settings.admin_email.strip().lower()
        or body.password != settings.admin_password
    ):
        raise HTTPException(status_code=401, detail='Invalid admin email or password')
    token, ttl = create_admin_token(
        email=settings.admin_email,
        secret=settings.jwt_secret,
        ttl_seconds=86_400,
    )
    return AdminLoginResponse(accessToken=token, expiresIn=ttl, email=settings.admin_email)


@router.get('/stats', response_model=AdminDashboardStats)
async def admin_stats(
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminDashboardStats:
    pending = await db.scalar(
        select(func.count())
        .select_from(SubscriptionRequest)
        .where(SubscriptionRequest.status == 'pending'),
    )
    active = await db.scalar(
        select(func.count())
        .select_from(PremiumEntitlement)
        .where(PremiumEntitlement.expires_at > utcnow()),
    )
    total = await db.scalar(select(func.count()).select_from(SubscriptionRequest))
    users = await db.scalar(select(func.count()).select_from(User))
    return AdminDashboardStats(
        pendingCount=int(pending or 0),
        activeCount=int(active or 0),
        totalRequests=int(total or 0),
        totalUsers=int(users or 0),
    )


@router.get('/users', response_model=list[AdminUserRow])
async def admin_list_users(
    access: str | None = Query(default=None),
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminUserRow]:
    stmt = (
        select(User)
        .options(selectinload(User.premium))
        .order_by(User.created_at.desc())
    )
    rows = (await db.scalars(stmt)).all()
    out: list[AdminUserRow] = []
    for user in rows:
        row = await _user_row(db, user)
        if access and access != 'all' and row.access_level != access:
            continue
        out.append(row)
    return out


@router.get('/subscriptions', response_model=list[AdminSubscriptionRow])
async def admin_list_subscriptions(
    status: str | None = Query(default=None),
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminSubscriptionRow]:
    stmt = (
        select(SubscriptionRequest, User)
        .join(User, User.id == SubscriptionRequest.user_id)
        .options(selectinload(User.premium))
        .order_by(SubscriptionRequest.created_at.desc())
    )
    if status:
        stmt = stmt.where(SubscriptionRequest.status == status)
    rows = await db.execute(stmt)
    out: list[AdminSubscriptionRow] = []
    for req, user in rows.all():
        access = await _access_level(db, user)
        out.append(_row_out(req, user, access))
    return out


@router.post('/subscriptions/{request_id}/approve', response_model=AdminSubscriptionRow)
async def admin_approve_subscription(
    request_id: str,
    body: AdminActionIn,
    admin: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminSubscriptionRow:
    row = await db.scalar(
        select(SubscriptionRequest)
        .where(SubscriptionRequest.id == request_id)
        .options(selectinload(SubscriptionRequest.user).selectinload(User.premium)),
    )
    if row is None:
        raise HTTPException(status_code=404, detail='Subscription request not found')
    if row.status != 'pending':
        raise HTTPException(status_code=400, detail=f'Request is already {row.status}')

    info = plan_info(row.plan_id)
    await upsert_premium(
        db,
        row.user_id,
        row.plan_id,
        int(info['days']),
        source='admin',
    )
    row.status = 'approved'
    row.admin_note = (body.admin_note or '').strip() or None
    row.reviewed_by = admin.email
    row.reviewed_at = utcnow()
    await db.commit()
    user = await load_user_with_premium(db, row.user_id)
    assert user is not None
    access = await _access_level(db, user)
    return _row_out(row, user, access)


@router.post('/subscriptions/{request_id}/reject', response_model=AdminSubscriptionRow)
async def admin_reject_subscription(
    request_id: str,
    body: AdminActionIn,
    admin: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminSubscriptionRow:
    row = await db.scalar(
        select(SubscriptionRequest)
        .where(SubscriptionRequest.id == request_id)
        .options(selectinload(SubscriptionRequest.user).selectinload(User.premium)),
    )
    if row is None:
        raise HTTPException(status_code=404, detail='Subscription request not found')
    if row.status != 'pending':
        raise HTTPException(status_code=400, detail=f'Request is already {row.status}')
    row.status = 'rejected'
    row.admin_note = (body.admin_note or '').strip() or None
    row.reviewed_by = admin.email
    row.reviewed_at = utcnow()
    await db.commit()
    user = await load_user_with_premium(db, row.user_id)
    assert user is not None
    access = await _access_level(db, user)
    return _row_out(row, user, access)


@router.post('/users/{user_id}/deactivate')
async def admin_deactivate_user(
    user_id: str,
    body: AdminActionIn,
    admin: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    user = await load_user_with_premium(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail='User not found')
    await clear_premium(db, user_id)
    latest = await db.scalar(
        select(SubscriptionRequest)
        .where(SubscriptionRequest.user_id == user_id)
        .order_by(SubscriptionRequest.created_at.desc()),
    )
    if latest is not None:
        latest.admin_note = (body.admin_note or 'Premium deactivated by admin').strip()
        latest.reviewed_by = admin.email
        latest.reviewed_at = utcnow()
        if latest.status == 'pending':
            latest.status = 'rejected'
    await db.commit()
    return {'ok': True}


@router.delete('/users/{user_id}/subscription')
async def admin_delete_user_subscription(
    user_id: str,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=404, detail='User not found')
    await clear_premium(db, user_id)
    pending = await db.scalars(
        select(SubscriptionRequest).where(
            SubscriptionRequest.user_id == user_id,
            SubscriptionRequest.status == 'pending',
        ),
    )
    for row in pending:
        row.status = 'cancelled'
        row.reviewed_at = utcnow()
    await db.commit()
    return {'ok': True}


@router.get('/plans')
async def admin_plans(_: AdminUser = Depends(get_admin_user)) -> dict[str, object]:
    return PLAN_CATALOG
