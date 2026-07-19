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
from ..db.models import PremiumEntitlement, SubscriptionRequest, User, UserFeedback
from ..db.session import get_db
from .deps import AdminUser, get_admin_user
from .schemas import (
    AdminActionIn,
    AdminDashboardStats,
    AdminForgotPasswordIn,
    AdminLoginRequest,
    AdminLoginResponse,
    AdminPasswordChangeIn,
    AdminPendingBrief,
    AdminResetPasswordIn,
    AdminSettingsOut,
    AdminSettingsUpdateIn,
    AdminSubscriptionRow,
    AdminUserRow,
    FeedbackRowOut,
    FeedbackStatusIn,
)
from ..emailer import EmailNotConfiguredError
from ..feedback import list_feedback, update_feedback_status
from ..public_settings import _contact_out, _payment_out
from ..site_settings import (
    get_or_create_settings,
    request_password_reset,
    reset_password_with_otp,
    update_admin_password,
    update_site_settings,
    verify_admin_login,
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
async def admin_login(
    body: AdminLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> AdminLoginResponse:
    settings = get_settings()
    ok = await verify_admin_login(db, body.email, body.password)
    if not ok:
        raise HTTPException(status_code=401, detail='Invalid admin email or password')
    row = await get_or_create_settings(db)
    await db.commit()
    token, ttl = create_admin_token(
        email=row.admin_email,
        secret=settings.jwt_secret,
        ttl_seconds=86_400,
    )
    return AdminLoginResponse(accessToken=token, expiresIn=ttl, email=row.admin_email)


def _settings_out(row) -> AdminSettingsOut:
    return AdminSettingsOut(
        adminEmail=row.admin_email,
        payment=_payment_out(row),
        contact=_contact_out(row),
    )


@router.get('/settings', response_model=AdminSettingsOut)
async def admin_get_settings(
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminSettingsOut:
    row = await get_or_create_settings(db)
    return _settings_out(row)


@router.put('/settings', response_model=AdminSettingsOut)
async def admin_update_settings(
    body: AdminSettingsUpdateIn,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminSettingsOut:
    payment = None
    if body.payment is not None:
        payment = {
            'qr_text': body.payment.qr_text,
            'bank_name': body.payment.bank_name,
            'account_name': body.payment.account_name,
            'account_number': body.payment.account_number,
            'whatsapp': body.payment.whatsapp,
        }
    contact = None
    if body.contact is not None:
        contact = {
            'company_name': body.contact.company_name,
            'email': body.contact.email,
            'whatsapp': body.contact.whatsapp,
            'whatsapp_url': body.contact.whatsapp_url,
            'facebook_url': body.contact.facebook_url,
            'tiktok_url': body.contact.tiktok_url,
        }
    row = await update_site_settings(db, payment=payment, contact=contact)
    await db.commit()
    return _settings_out(row)


@router.post('/password/change')
async def admin_change_password(
    body: AdminPasswordChangeIn,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    ok = await verify_admin_login(db, _.email, body.current_password)
    if not ok:
        raise HTTPException(status_code=400, detail='Current password is incorrect')
    try:
        await update_admin_password(db, body.new_password)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {'ok': True}


@router.post('/password/forgot')
async def admin_forgot_password(
    body: AdminForgotPasswordIn,
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    try:
        await request_password_reset(db, body.email)
        await db.commit()
    except EmailNotConfiguredError:
        raise HTTPException(
            status_code=503,
            detail='Email is not configured on the server. Set SMTP_USER and SMTP_PASSWORD.',
        ) from None
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return {
        'ok': True,
        'message': 'If that email is registered as admin, a verification code was sent.',
    }


@router.post('/password/reset')
async def admin_reset_password(
    body: AdminResetPasswordIn,
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    try:
        await reset_password_with_otp(
            db,
            body.email,
            body.otp,
            body.new_password,
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {'ok': True}


@router.get('/feedback', response_model=list[FeedbackRowOut])
async def admin_list_feedback(
    kind: str | None = Query(default=None),
    status: str | None = Query(default=None),
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[FeedbackRowOut]:
    rows = await list_feedback(db, kind=kind, status=status)
    return [FeedbackRowOut.model_validate(row) for row in rows]


@router.patch('/feedback/{feedback_id}', response_model=FeedbackRowOut)
async def admin_update_feedback(
    feedback_id: str,
    body: FeedbackStatusIn,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> FeedbackRowOut:
    try:
        row = await update_feedback_status(db, feedback_id, body.status)
        await db.commit()
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return FeedbackRowOut.model_validate(row)


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
    new_feedback = await db.scalar(
        select(func.count())
        .select_from(UserFeedback)
        .where(UserFeedback.status == 'new'),
    )
    return AdminDashboardStats(
        pendingCount=int(pending or 0),
        activeCount=int(active or 0),
        totalRequests=int(total or 0),
        totalUsers=int(users or 0),
        newFeedbackCount=int(new_feedback or 0),
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
