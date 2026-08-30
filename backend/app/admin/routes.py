from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth.deps import utcnow
from ..auth.user_delete import delete_user_by_id
from ..auth.jwt_tokens import create_admin_token
from ..config import get_settings
from ..auth.subscription import (
    DEFAULT_PLAN_DETAILS,
    PLAN_CATALOG,
    clear_premium,
    effective_max_accounts,
    expire_premium_if_needed,
    get_pending_request,
    load_user_with_premium,
    plan_info,
    upsert_premium,
)
from ..account_slots.service import (
    iso as slot_iso,
    list_slots as list_device_slots,
    prune_devices,
    reconcile_device_slots,
)
from ..account_slots.registry import (
    build_state,
    list_registry,
    release_devices,
)
from ..db.models import (
    PremiumEntitlement,
    RefreshToken,
    SubscriptionRequest,
    User,
    UserDeviceSlot,
    UserFeedback,
)
from ..db.session import get_db
from ..emailer import email_configured
from .deps import AdminUser, get_admin_user
from .list_queries import paginate_admin_subscriptions, paginate_admin_users
from .schemas import (
    AdminActionIn,
    AdminDashboardStats,
    AdminForgotPasswordIn,
    AdminLoginRequest,
    AdminLoginResponse,
    AdminLoginVerifyRequest,
    AdminMaxAccountsIn,
    AdminNotificationHistoryOut,
    AdminNotificationSendIn,
    AdminPaginatedSubscriptionsOut,
    AdminPaginatedUsersOut,
    AdminPasswordChangeIn,
    AdminPendingBrief,
    AdminResetPasswordIn,
    AdminSettingsOut,
    AdminSettingsUpdateIn,
    AdminSubscriptionRow,
    AdminUserDeviceRow,
    AdminUserRow,
    FeedbackRowOut,
    FeedbackStatusIn,
    TeamMemberIn,
    TeamMemberOut,
    MarketClosureIn,
    MarketClosureOut,
    ManagedOfferingIn,
    ManagedOfferingOut,
)
from ..emailer import EmailNotConfiguredError
from ..feedback import list_feedback, update_feedback_status
from ..team import (
    create_team_member,
    delete_team_member,
    list_team_members,
    photo_public_path,
    update_team_member,
)
from ..market_closures import (
    create_market_closure,
    delete_market_closure,
    list_market_closures,
    update_market_closure,
)
from ..managed_offerings import (
    create_managed_offering,
    delete_managed_offering,
    list_managed_offerings,
    update_managed_offering,
)
from ..public_settings import _contact_out, _payment_out, _popup_notice_out
from ..site_settings import (
    attempt_admin_login,
    complete_admin_login_otp,
    get_or_create_settings,
    is_trusted_admin_device,
    request_password_reset,
    reset_password_with_otp,
    start_admin_login_otp,
    update_admin_password,
    update_site_settings,
    verify_admin_login,
)

router = APIRouter(prefix='/admin', tags=['admin'])

log = logging.getLogger('admin.routes')


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
    await expire_premium_if_needed(db, user)
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


async def _user_row(
    db: AsyncSession,
    user: User,
    devices: list[UserDeviceSlot] | None = None,
    claimed_total: int | None = None,
) -> AdminUserRow:
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
    max_acc = effective_max_accounts(user, premium_active=active)
    if devices is not None:
        slot_rows = devices
    else:
        await reconcile_device_slots(db, user.id)
        from ..account_slots.service import (
            AGGRESSIVE_STALE,
            EMPTY_STALE,
            release_stale_device_claims,
        )

        await release_stale_device_claims(
            db,
            user.id,
            stale_threshold=AGGRESSIVE_STALE,
        )
        await release_stale_device_claims(
            db,
            user.id,
            stale_threshold=EMPTY_STALE,
        )
        dead = await prune_devices(db, user.id)
        if dead:
            await release_devices(db, user.id, dead)
            await db.commit()
        slot_rows = await list_device_slots(db, user.id)
    device_outs = [
        AdminUserDeviceRow(
            deviceId=s.device_id,
            deviceLabel=s.device_label or 'Unknown device',
            platform=s.platform or 'android',
            accountCount=int(s.account_count or 0),
            lastSeenAt=slot_iso(s.last_seen_at),
        )
        for s in slot_rows
    ]
    # Unique demats claimed across every phone — one demat on two phones is
    # a single slot, so this is never inflated by duplicates.
    if claimed_total is None:
        claimed = build_state(
            await list_registry(db, user.id),
            max_accounts=max_acc,
            unlimited=False,
        ).total
    else:
        claimed = claimed_total
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
        subscriptionRequestCount=int(req_count or 0),
        lastSubscriptionAt=last_req.isoformat() if last_req else None,
        claimedTotal=claimed,
        deviceCount=len(device_outs),
        devices=device_outs,
        isBlocked=bool(getattr(user, 'is_blocked', False)),
        blockedAt=(
            user.blocked_at.isoformat()
            if getattr(user, 'blocked_at', None) is not None
            else None
        ),
        blockedReason=getattr(user, 'blocked_reason', None),
    )


def _client_ip(request: Request) -> str:
    forwarded = (request.headers.get('x-forwarded-for') or '').strip()
    if forwarded:
        return forwarded.split(',')[0].strip() or 'unknown'
    real_ip = (request.headers.get('x-real-ip') or '').strip()
    if real_ip:
        return real_ip
    if request.client and request.client.host:
        return request.client.host
    return 'unknown'


@router.post('/login', response_model=AdminLoginResponse, response_model_by_alias=True)
async def admin_login(
    body: AdminLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminLoginResponse:
    from .login_guard import build_client_key

    settings = get_settings()
    client_key = build_client_key(_client_ip(request), body.device_id)
    ok, err = await attempt_admin_login(
        db,
        body.email,
        body.password,
        client_key=client_key,
    )
    if not ok:
        await db.commit()
        detail = err or 'Invalid admin email or password'
        status = 429 if 'locked' in detail.lower() or 'try again' in detail.lower() else 401
        raise HTTPException(status_code=status, detail=detail)
    row = await get_or_create_settings(db)
    device_id = (body.device_id or '').strip()
    if is_trusted_admin_device(row, device_id):
        await db.commit()
        token, ttl = create_admin_token(
            email=row.admin_email,
            secret=settings.jwt_secret,
            ttl_seconds=86_400,
        )
        return AdminLoginResponse(
            accessToken=token,
            expiresIn=ttl,
            email=row.admin_email,
            needsOtp=False,
        )

    try:
        masked = await start_admin_login_otp(db, device_id=device_id)
        await db.commit()
    except EmailNotConfiguredError:
        raise HTTPException(
            status_code=503,
            detail=(
                'Admin email is not configured on the server, so a new-device '
                'login code cannot be sent. Set SENDGRID_API_KEY, RESEND_API_KEY, '
                'or BREVO_API_KEY.'
            ),
        ) from None
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return AdminLoginResponse(
        accessToken='',
        expiresIn=0,
        email=body.email.strip().lower(),
        needsOtp=True,
        maskedEmail=masked,
    )


@router.post(
    '/login/verify',
    response_model=AdminLoginResponse,
    response_model_by_alias=True,
)
async def admin_login_verify(
    body: AdminLoginVerifyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminLoginResponse:
    from .login_guard import build_client_key

    settings = get_settings()
    client_key = build_client_key(_client_ip(request), body.device_id)
    ok, err = await complete_admin_login_otp(
        db,
        email=body.email,
        password=body.password,
        otp=body.otp,
        device_id=body.device_id,
        client_key=client_key,
    )
    if not ok:
        await db.commit()
        detail = err or 'Invalid verification code'
        status = 429 if 'locked' in detail.lower() or 'try again' in detail.lower() else 401
        raise HTTPException(status_code=status, detail=detail)
    row = await get_or_create_settings(db)
    await db.commit()
    token, ttl = create_admin_token(
        email=row.admin_email,
        secret=settings.jwt_secret,
        ttl_seconds=86_400,
    )
    return AdminLoginResponse(
        accessToken=token,
        expiresIn=ttl,
        email=row.admin_email,
        needsOtp=False,
    )


def _settings_out(row) -> AdminSettingsOut:
    from ..public_settings import (
        _contact_out,
        _home_promo_out,
        _home_promos_out,
        _legal_pages_out,
        _payment_out,
        _popup_notice_out,
        _subscription_plans_out,
        app_logo_public_path,
    )

    return AdminSettingsOut(
        adminEmail=row.admin_email,
        payment=_payment_out(row),
        contact=_contact_out(row),
        popupNotice=_popup_notice_out(row),
        subscriptionPlans=_subscription_plans_out(row),
        appLogoUrl=app_logo_public_path(row),
        homePromo=_home_promo_out(row),
        homePromos=_home_promos_out(row),
        legalPages=_legal_pages_out(row),
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
        if body.payment.clear_qr_image:
            payment['clear_qr_image'] = '1'
        elif body.payment.qr_image_base64:
            payment['qr_image_base64'] = body.payment.qr_image_base64
            payment['qr_image_mime'] = 'image/jpeg'
    contact = None
    if body.contact is not None:
        contact = {
            'company_name': body.contact.company_name,
            'email': body.contact.email,
            'whatsapp': body.contact.whatsapp,
            'whatsapp_url': body.contact.whatsapp_url,
            'facebook_url': body.contact.facebook_url,
            'tiktok_url': body.contact.tiktok_url,
            'social_links': [
                {
                    'id': link.id,
                    'platform': link.platform,
                    'label': link.label,
                    'detail': link.detail,
                    'url': link.url,
                }
                for link in (body.contact.social_links or [])
            ]
            if body.contact.social_links is not None
            else None,
        }
        # Drop None social_links key so update skips when omitted
        if contact['social_links'] is None:
            contact.pop('social_links')
    popup_notice = None
    if body.popup_notice is not None:
        popup_notice = {}
        if body.popup_notice.clear_all or body.popup_notice.clear_image:
            popup_notice['clear_all'] = '1'
        elif body.popup_notice.delete_id:
            popup_notice['delete_id'] = body.popup_notice.delete_id
        elif body.popup_notice.image_base64:
            popup_notice['image_base64'] = body.popup_notice.image_base64
            popup_notice['image_mime'] = 'image/jpeg'
        elif body.popup_notice.text:
            popup_notice['text'] = body.popup_notice.text.strip()

    subscription_plans = None
    if body.subscription_plans is not None:
        subscription_plans = [
            {
                'id': p.id,
                'title': p.title,
                'priceLabel': p.price_label,
                'amountNpr': p.amount_npr,
                'period': p.period,
                'days': p.days,
                'maxAccounts': p.max_accounts,
                'perks': list(p.perks or []),
            }
            for p in body.subscription_plans
        ]

    app_logo = None
    if body.clear_app_logo:
        app_logo = {'clear': '1'}
    elif body.app_logo_base64:
        app_logo = {'image_base64': body.app_logo_base64}

    home_promo = None
    if body.home_promo is not None:
        home_promo = {
            'visible': body.home_promo.visible,
            'text': body.home_promo.text,
            'action': body.home_promo.action,
            'color': body.home_promo.color,
        }

    home_promos = None
    if body.home_promos is not None:
        home_promos = {}
        for key in ('home', 'apply', 'services', 'check', 'profile'):
            page = getattr(body.home_promos, key, None)
            if page is None:
                continue
            home_promos[key] = {
                'visible': page.visible,
                'text': page.text,
                'action': page.action,
                'color': page.color,
            }

    legal_pages = None
    if body.legal_pages is not None:
        legal_pages = {}
        if body.legal_pages.about is not None:
            about = body.legal_pages.about
            legal_pages['about'] = {
                'tagline': about.tagline,
                'whoWeAre': about.who_we_are,
                'offerings': about.offerings,
            }
        if body.legal_pages.terms is not None:
            terms = body.legal_pages.terms
            legal_pages['terms'] = {
                'intro': terms.intro,
                'sections': (
                    [{'heading': s.heading, 'body': s.body} for s in terms.sections]
                    if terms.sections is not None
                    else None
                ),
            }
        if body.legal_pages.privacy is not None:
            privacy = body.legal_pages.privacy
            legal_pages['privacy'] = {
                'intro': privacy.intro,
                'sections': (
                    [
                        {'heading': s.heading, 'body': s.body}
                        for s in privacy.sections
                    ]
                    if privacy.sections is not None
                    else None
                ),
            }

    try:
        row = await update_site_settings(
            db,
            payment=payment,
            contact=contact,
            popup_notice=popup_notice,
            subscription_plans=subscription_plans,
            app_logo=app_logo,
            home_promo=home_promo,
            home_promos=home_promos,
            legal_pages=legal_pages,
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return _settings_out(row)


_ALLOWED_QR_MIME = {
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
}
_MAX_QR_BYTES = 2 * 1024 * 1024


@router.post('/settings/payment-qr', response_model=AdminSettingsOut)
async def admin_upload_payment_qr(
    file: UploadFile = File(...),
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminSettingsOut:
    import base64
    from datetime import UTC, datetime

    mime = (file.content_type or '').lower().strip()
    if mime not in _ALLOWED_QR_MIME:
        raise HTTPException(
            status_code=400,
            detail='Upload a JPG, PNG, WEBP, or GIF image from your gallery.',
        )
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail='Empty image file')
    if len(raw) > _MAX_QR_BYTES:
        raise HTTPException(status_code=400, detail='Image too large (max 2 MB)')

    row = await get_or_create_settings(db)
    row.payment_qr_image_b64 = base64.b64encode(raw).decode('ascii')
    row.payment_qr_image_mime = 'image/jpeg' if mime == 'image/jpg' else mime
    row.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(row)
    return _settings_out(row)


@router.delete('/settings/payment-qr', response_model=AdminSettingsOut)
async def admin_delete_payment_qr(
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminSettingsOut:
    from datetime import UTC, datetime

    row = await get_or_create_settings(db)
    row.payment_qr_image_b64 = None
    row.payment_qr_image_mime = None
    row.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(row)
    return _settings_out(row)


_MAX_NOTICE_BYTES = 4 * 1024 * 1024


@router.post('/settings/popup-notice', response_model=AdminSettingsOut)
async def admin_upload_popup_notice(
    file: UploadFile = File(...),
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminSettingsOut:
    import base64
    import uuid as _uuid

    from ..public_settings import (
        _MAX_POPUP_NOTICES,
        load_popup_notice_items,
        serialize_popup_notices,
    )

    mime = (file.content_type or '').lower().strip()
    if mime not in _ALLOWED_QR_MIME:
        raise HTTPException(
            status_code=400,
            detail='Upload a JPG, PNG, WEBP, or GIF image from your gallery.',
        )
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail='Empty image file')
    if len(raw) > _MAX_NOTICE_BYTES:
        raise HTTPException(status_code=400, detail='Image too large (max 4 MB)')

    row = await get_or_create_settings(db)
    items = load_popup_notice_items(row)
    if len(items) >= _MAX_POPUP_NOTICES:
        raise HTTPException(
            status_code=400,
            detail=f'Maximum {_MAX_POPUP_NOTICES} notices allowed',
        )
    items.append(
        {
            'id': str(_uuid.uuid4()),
            'kind': 'image',
            'image_b64': base64.b64encode(raw).decode('ascii'),
            'mime': 'image/jpeg' if mime == 'image/jpg' else mime,
        }
    )
    row.popup_notices_json = serialize_popup_notices(items)
    row.popup_notice_image_b64 = None
    row.popup_notice_image_mime = None
    row.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(row)
    return _settings_out(row)


@router.delete('/settings/popup-notice', response_model=AdminSettingsOut)
async def admin_delete_all_popup_notices(
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminSettingsOut:
    row = await get_or_create_settings(db)
    row.popup_notices_json = '[]'
    row.popup_notice_image_b64 = None
    row.popup_notice_image_mime = None
    row.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(row)
    return _settings_out(row)


@router.delete('/settings/popup-notice/{notice_id}', response_model=AdminSettingsOut)
async def admin_delete_popup_notice(
    notice_id: str,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminSettingsOut:
    from ..public_settings import load_popup_notice_items, serialize_popup_notices

    row = await get_or_create_settings(db)
    items = [x for x in load_popup_notice_items(row) if x['id'] != notice_id]
    row.popup_notices_json = serialize_popup_notices(items)
    if notice_id == 'legacy' or not items:
        row.popup_notice_image_b64 = None
        row.popup_notice_image_mime = None
    row.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(row)
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
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except EmailNotConfiguredError:
        raise HTTPException(
            status_code=503,
            detail='Email is not configured on the server. Set SENDGRID_API_KEY, RESEND_API_KEY, or BREVO_API_KEY.',
        ) from None
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return {
        'ok': True,
        'message': 'A verification code was sent to the admin Gmail.',
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


def _team_out(row) -> TeamMemberOut:  # noqa: ANN001
    return TeamMemberOut(
        id=row.id,
        name=row.name,
        role=row.role,
        bio=row.bio,
        email=row.email or None,
        whatsapp=row.whatsapp or None,
        accent=row.accent,
        photoUrl=photo_public_path(row),
        sortOrder=row.sort_order,
    )


@router.get('/team', response_model=list[TeamMemberOut])
async def admin_list_team(
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[TeamMemberOut]:
    rows = await list_team_members(db)
    return [_team_out(r) for r in rows]


@router.post('/team', response_model=TeamMemberOut)
async def admin_create_team(
    body: TeamMemberIn,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> TeamMemberOut:
    try:
        row = await create_team_member(
            db,
            name=body.name,
            role=body.role,
            bio=body.bio,
            email=body.email,
            whatsapp=body.whatsapp,
            accent=body.accent,
            sort_order=body.sort_order,
            photo_base64=body.photo_base64,
            photo_mime=None,
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    await db.refresh(row)
    return _team_out(row)


@router.put('/team/{member_id}', response_model=TeamMemberOut)
async def admin_update_team(
    member_id: str,
    body: TeamMemberIn,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> TeamMemberOut:
    try:
        row = await update_team_member(
            db,
            member_id,
            name=body.name,
            role=body.role,
            bio=body.bio,
            email=body.email,
            whatsapp=body.whatsapp,
            accent=body.accent,
            sort_order=body.sort_order,
            photo_base64=body.photo_base64,
            photo_mime=None,
            clear_photo=body.clear_photo,
        )
        await db.commit()
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    await db.refresh(row)
    return _team_out(row)


@router.delete('/team/{member_id}')
async def admin_delete_team(
    member_id: str,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    try:
        await delete_team_member(db, member_id)
        await db.commit()
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {'ok': True}


def _closure_out(row) -> MarketClosureOut:  # noqa: ANN001
    return MarketClosureOut(
        id=row.id,
        date=row.date,
        title=row.title,
        notice=row.notice or '',
        color=row.color,
        active=bool(row.active),
    )


@router.get('/market-closures', response_model=list[MarketClosureOut])
async def admin_list_closures(
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[MarketClosureOut]:
    rows = await list_market_closures(db, active_only=False)
    return [_closure_out(r) for r in rows]


@router.post('/market-closures', response_model=MarketClosureOut)
async def admin_create_closure(
    body: MarketClosureIn,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> MarketClosureOut:
    try:
        row = await create_market_closure(
            db,
            date=body.date,
            title=body.title,
            notice=body.notice,
            color=body.color,
            active=body.active,
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    await db.refresh(row)
    return _closure_out(row)


@router.put('/market-closures/{closure_id}', response_model=MarketClosureOut)
async def admin_update_closure(
    closure_id: str,
    body: MarketClosureIn,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> MarketClosureOut:
    try:
        row = await update_market_closure(
            db,
            closure_id,
            date=body.date,
            title=body.title,
            notice=body.notice,
            color=body.color,
            active=body.active,
        )
        await db.commit()
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    await db.refresh(row)
    return _closure_out(row)


@router.delete('/market-closures/{closure_id}')
async def admin_delete_closure(
    closure_id: str,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    try:
        await delete_market_closure(db, closure_id)
        await db.commit()
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {'ok': True}


def _managed_offering_out(row) -> ManagedOfferingOut:  # noqa: ANN001
    return ManagedOfferingOut(
        id=row.id,
        matchKey=row.match_key,
        name=row.name,
        symbol=row.symbol or '',
        type=row.offering_type,
        audience=row.audience,
        issueManager=row.issue_manager,
        status=row.status,
        displaySection=row.display_section,
        units=row.units,
        appliedUnits=row.applied_units,
        applicants=row.applicants,
        price=row.price,
        totalAmount=row.total_amount,
        appliedAmount=row.applied_amount,
        openingDate=row.opening_date,
        closingDate=row.closing_date,
        extendedClosingDate=row.extended_closing_date,
        rightShareRatio=row.right_share_ratio,
        active=bool(row.active),
        updatedAt=row.updated_at.isoformat() if row.updated_at else None,
    )


@router.get('/ipo-issues', response_model=list[ManagedOfferingOut])
async def admin_list_ipo_issues(
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[ManagedOfferingOut]:
    rows = await list_managed_offerings(db, active_only=False)
    return [_managed_offering_out(r) for r in rows]


@router.post('/ipo-issues', response_model=ManagedOfferingOut)
async def admin_create_ipo_issue(
    body: ManagedOfferingIn,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> ManagedOfferingOut:
    try:
        row = await create_managed_offering(
            db,
            name=body.name,
            symbol=body.symbol,
            offering_type=body.type,
            audience=body.audience,
            issue_manager=body.issue_manager,
            status=body.status,
            display_section=body.display_section,
            units=body.units,
            applied_units=body.applied_units,
            applicants=body.applicants,
            price=body.price,
            total_amount=body.total_amount,
            applied_amount=body.applied_amount,
            opening_date=body.opening_date,
            closing_date=body.closing_date,
            extended_closing_date=body.extended_closing_date,
            right_share_ratio=body.right_share_ratio,
            active=body.active,
            match_key=body.match_key,
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    await db.refresh(row)
    return _managed_offering_out(row)


@router.put('/ipo-issues/{offering_id}', response_model=ManagedOfferingOut)
async def admin_update_ipo_issue(
    offering_id: str,
    body: ManagedOfferingIn,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> ManagedOfferingOut:
    try:
        row = await update_managed_offering(
            db,
            offering_id,
            name=body.name,
            symbol=body.symbol,
            offering_type=body.type,
            audience=body.audience,
            issue_manager=body.issue_manager,
            status=body.status,
            display_section=body.display_section,
            units=body.units,
            applied_units=body.applied_units,
            applicants=body.applicants,
            price=body.price,
            total_amount=body.total_amount,
            applied_amount=body.applied_amount,
            opening_date=body.opening_date,
            closing_date=body.closing_date,
            extended_closing_date=body.extended_closing_date,
            right_share_ratio=body.right_share_ratio,
            active=body.active,
        )
        await db.commit()
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    await db.refresh(row)
    return _managed_offering_out(row)


@router.delete('/ipo-issues/{offering_id}')
async def admin_delete_ipo_issue(
    offering_id: str,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    try:
        await delete_managed_offering(db, offering_id)
        await db.commit()
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {'ok': True}


@router.get('/stats', response_model=AdminDashboardStats, response_model_by_alias=True)
async def admin_stats(
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminDashboardStats:
    now = utcnow()
    pending = await db.scalar(
        select(func.count())
        .select_from(SubscriptionRequest)
        .where(SubscriptionRequest.status == 'pending'),
    )
    approved_requests = await db.scalar(
        select(func.count())
        .select_from(SubscriptionRequest)
        .where(SubscriptionRequest.status == 'approved'),
    )
    rejected_requests = await db.scalar(
        select(func.count())
        .select_from(SubscriptionRequest)
        .where(SubscriptionRequest.status == 'rejected'),
    )
    active = await db.scalar(
        select(func.count())
        .select_from(PremiumEntitlement)
        .where(PremiumEntitlement.expires_at > now),
    )
    total = await db.scalar(select(func.count()).select_from(SubscriptionRequest))
    users = await db.scalar(select(func.count()).select_from(User))
    new_feedback = await db.scalar(
        select(func.count())
        .select_from(UserFeedback)
        .where(UserFeedback.status == 'new'),
    )
    feedback_read = await db.scalar(
        select(func.count())
        .select_from(UserFeedback)
        .where(UserFeedback.status == 'read'),
    )
    feedback_resolved = await db.scalar(
        select(func.count())
        .select_from(UserFeedback)
        .where(UserFeedback.status == 'resolved'),
    )
    feedback_total = await db.scalar(select(func.count()).select_from(UserFeedback))
    blocked_users = await db.scalar(
        select(func.count()).select_from(User).where(User.is_blocked.is_(True)),
    )
    # Users with claims from more than one device/phone.
    multi_device_rows = (
        await db.execute(
            select(UserDeviceSlot.user_id)
            .group_by(UserDeviceSlot.user_id)
            .having(func.count(UserDeviceSlot.id) > 1),
        )
    ).all()

    premium_ids = set(
        (
            await db.scalars(
                select(PremiumEntitlement.user_id).where(
                    PremiumEntitlement.expires_at > now,
                ),
            )
        ).all(),
    )
    pending_ids = set(
        (
            await db.scalars(
                select(SubscriptionRequest.user_id).where(
                    SubscriptionRequest.status == 'pending',
                ),
            )
        ).all(),
    )
    # Match list filters: premium > pending > free
    pending_user_count = len(pending_ids - premium_ids)
    premium_user_count = len(premium_ids)
    total_users = int(users or 0)
    free_user_count = max(0, total_users - premium_user_count - pending_user_count)

    return AdminDashboardStats(
        pendingCount=int(pending or 0),
        activeCount=int(active or 0),
        totalRequests=int(total or 0),
        totalUsers=total_users,
        newFeedbackCount=int(new_feedback or 0),
        blockedUserCount=int(blocked_users or 0),
        multiDeviceUserCount=len(multi_device_rows),
        premiumUserCount=premium_user_count,
        pendingUserCount=pending_user_count,
        freeUserCount=free_user_count,
        approvedRequestCount=int(approved_requests or 0),
        rejectedRequestCount=int(rejected_requests or 0),
        feedbackReadCount=int(feedback_read or 0),
        feedbackResolvedCount=int(feedback_resolved or 0),
        feedbackTotalCount=int(feedback_total or 0),
    )


@router.post('/demo-users/seed')
async def admin_seed_demo_users(
    count: int = Query(default=1000, ge=1, le=5000),
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    """Create demo users for admin-panel testing (clearly fake emails)."""
    from .demo_users import ensure_demo_users

    result = await ensure_demo_users(db, target=count)
    await db.commit()
    return result


@router.delete('/demo-users/seed')
async def admin_clear_demo_users(
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    """Remove all demo users created by the seed helper."""
    from .demo_users import clear_demo_users

    removed = await clear_demo_users(db)
    await db.commit()
    return {'removed': removed}


@router.get('/users', response_model=AdminPaginatedUsersOut, response_model_by_alias=True)
async def admin_list_users(
    access: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=120),
    cursor: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=50),
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminPaginatedUsersOut:
    result = await paginate_admin_users(
        db,
        access=access,
        q=q,
        cursor=cursor,
        page=page,
        limit=limit,
    )
    await db.commit()
    return result


@router.get('/users/{user_id}', response_model=AdminUserRow)
async def admin_get_user(
    user_id: str,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserRow:
    user = await load_user_with_premium(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail='User not found')
    row = await _user_row(db, user)
    await db.commit()
    return row


@router.get('/subscriptions', response_model=AdminPaginatedSubscriptionsOut, response_model_by_alias=True)
async def admin_list_subscriptions(
    status: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=50),
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminPaginatedSubscriptionsOut:
    result = await paginate_admin_subscriptions(
        db,
        status=status,
        cursor=cursor,
        page=page,
        limit=limit,
    )
    await db.commit()
    return result


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
    # Enrich with period/perks from full plan catalog when available.
    rich = next(
        (p for p in DEFAULT_PLAN_DETAILS if str(p.get('id')) == row.plan_id),
        None,
    )
    if rich:
        info = {**info, **rich}

    premium_row = await upsert_premium(
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

    # Notify user by email (non-blocking for the approve API).
    try:
        email = (user.email or '').strip()
        if email and email_configured():
            from zoneinfo import ZoneInfo

            from ..emailer import send_subscription_activated

            settings = get_settings()
            base = settings.effective_public_base_url
            # Always include logo (bundled fallback served by /app/logo).
            logo_url = f'{base}/app/logo' if base else None

            max_acc = effective_max_accounts(user, premium_active=True)
            plan_title = str(
                info.get('title') or row.plan_title or row.plan_id or 'Premium',
            )
            period = str(info.get('period') or '').strip()
            days = int(info.get('days') or 0) or None
            amount = int(row.amount_npr or info.get('amountNpr') or 0) or None
            perks_raw = info.get('perks') or []
            perks = [str(p).strip() for p in perks_raw if str(p).strip()]

            # Prefer the entitlement we just wrote (avoids stale/missing reload).
            exp = premium_row.expires_at
            if exp is None and user.premium is not None:
                exp = user.premium.expires_at
            if exp is None and days:
                from datetime import timedelta

                from ..auth.subscription import utcnow as sub_utcnow

                exp = sub_utcnow() + timedelta(days=days)

            expires_label = '—'
            if exp is not None:
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=UTC)
                try:
                    npt = ZoneInfo('Asia/Kathmandu')
                    expires_label = exp.astimezone(npt).strftime(
                        '%d %b %Y, %H:%M NPT',
                    )
                except Exception:  # noqa: BLE001
                    expires_label = exp.strftime('%d %b %Y, %H:%M UTC')

            send_subscription_activated(
                to_email=email,
                name=(user.name or '').strip(),
                plan_title=plan_title,
                expires_at_label=expires_label,
                max_accounts=max_acc,
                logo_url=logo_url,
                period=period,
                days=days,
                amount_npr=amount,
                perks=perks,
            )
        elif not email:
            log.warning(
                'subscription approve: no email for user=%s (skip notify)',
                user.id,
            )
    except Exception as exc:  # noqa: BLE001
        log.warning(
            'subscription approve: notify email failed user=%s: %s',
            row.user_id,
            exc,
        )

    try:
        from ..push.user_notify import notify_user

        max_acc = effective_max_accounts(user, premium_active=True)
        await notify_user(
            db,
            row.user_id,
            title='Premium approved',
            body=(
                f'Your {row.plan_title} subscription is active. '
                f'Account limit: {max_acc}. Open the app to use premium features.'
            ),
            data={'type': 'subscription_approved', 'requestId': row.id},
        )
    except Exception as exc:  # noqa: BLE001
        log.warning(
            'subscription approve: push failed user=%s: %s',
            row.user_id,
            exc,
        )

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

    try:
        from ..push.user_notify import notify_user, sanitize_user_notify_text

        note = sanitize_user_notify_text(body.admin_note)
        body_text = f'Your {row.plan_title} subscription request was not approved.'
        if note:
            body_text = f'{body_text} {note}'
        await notify_user(
            db,
            row.user_id,
            title='Premium request rejected',
            body=body_text,
            data={'type': 'subscription_rejected', 'requestId': row.id},
        )
    except Exception as exc:  # noqa: BLE001
        log.warning(
            'subscription reject: push failed user=%s: %s',
            row.user_id,
            exc,
        )

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
        latest.admin_note = (body.admin_note or 'Premium deactivated').strip()
        latest.reviewed_by = admin.email
        latest.reviewed_at = utcnow()
        if latest.status == 'pending':
            latest.status = 'rejected'
    await db.commit()

    try:
        from ..push.user_notify import notify_user, sanitize_user_notify_text

        note = sanitize_user_notify_text(body.admin_note)
        body_text = 'Your premium subscription was deactivated.'
        if note:
            body_text = f'{body_text} {note}'
        await notify_user(
            db,
            user_id,
            title='Premium deactivated',
            body=body_text,
            data={'type': 'premium_deactivated'},
        )
    except Exception as exc:  # noqa: BLE001
        log.warning('deactivate: push failed user=%s: %s', user_id, exc)

    return {'ok': True}


@router.put('/users/{user_id}/max-accounts', response_model=AdminUserRow)
async def admin_set_user_max_accounts(
    user_id: str,
    body: AdminMaxAccountsIn,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserRow:
    user = await load_user_with_premium(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail='User not found')
    await expire_premium_if_needed(db, user)
    premium = user.premium
    active = False
    if premium and premium.expires_at:
        exp = (
            premium.expires_at
            if premium.expires_at.tzinfo
            else premium.expires_at.replace(tzinfo=UTC)
        )
        active = exp > datetime.now(UTC)
    # The active set is derived from the new cap (first N demats by the order
    # they were added), so phones pick it up on their next sync automatically.
    user.max_accounts = int(body.max_accounts)
    new_max = user.max_accounts
    await db.commit()
    user = await load_user_with_premium(db, user_id)
    assert user is not None

    try:
        from ..push.user_notify import notify_user

        label = 'unlimited' if new_max >= 999999 else str(new_max)
        await notify_user(
            db,
            user_id,
            title='Account limit updated',
            body=f'Your MeroShare account limit is now {label}.',
            data={'type': 'account_limit_updated', 'maxAccounts': new_max},
        )
    except Exception as exc:  # noqa: BLE001
        log.warning('max-accounts: push failed user=%s: %s', user_id, exc)

    return await _user_row(db, user)


@router.post('/users/{user_id}/block', response_model=AdminUserRow)
async def admin_block_user(
    user_id: str,
    body: AdminActionIn,
    admin: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserRow:
    """Block Google sign-in for this user. Guest use on device still works."""
    user = await load_user_with_premium(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail='User not found')
    user.is_blocked = True
    user.blocked_at = utcnow()
    note = (body.admin_note or '').strip()
    user.blocked_reason = note or 'Account blocked'
    # Kill existing signed-in sessions.
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked.is_(False))
        .values(revoked=True),
    )
    await db.commit()
    user = await load_user_with_premium(db, user_id)
    assert user is not None

    try:
        from ..push.user_notify import notify_user, sanitize_user_notify_text

        note = sanitize_user_notify_text(body.admin_note)
        body_text = (
            'Your account has been blocked. '
            'Sign in is disabled until your account is restored.'
        )
        if note:
            body_text = f'{body_text} {note}'
        await notify_user(
            db,
            user_id,
            title='Account blocked',
            body=body_text,
            data={'type': 'account_blocked'},
        )
    except Exception as exc:  # noqa: BLE001
        log.warning('block: push failed user=%s: %s', user_id, exc)

    return await _user_row(db, user)


@router.post('/users/{user_id}/unblock', response_model=AdminUserRow)
async def admin_unblock_user(
    user_id: str,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserRow:
    user = await load_user_with_premium(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail='User not found')
    user.is_blocked = False
    user.blocked_at = None
    user.blocked_reason = None
    await db.commit()
    user = await load_user_with_premium(db, user_id)
    assert user is not None
    return await _user_row(db, user)


@router.delete('/users/{user_id}/devices/{device_id}', response_model=AdminUserRow)
async def admin_forget_user_device(
    user_id: str,
    device_id: str,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserRow:
    """Remove a phone's claimed slot count (does not wipe accounts on the phone)."""
    user = await load_user_with_premium(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail='User not found')
    row = await db.scalar(
        select(UserDeviceSlot).where(
            UserDeviceSlot.user_id == user_id,
            UserDeviceSlot.device_id == device_id,
        ),
    )
    if row is None:
        raise HTTPException(status_code=404, detail='Device not found')
    await db.delete(row)
    await release_devices(db, user_id, [device_id])
    await reconcile_device_slots(db, user_id)
    await db.commit()
    user = await load_user_with_premium(db, user_id)
    assert user is not None
    return await _user_row(db, user)


@router.delete('/users/{user_id}')
async def admin_delete_user(
    user_id: str,
    _: AdminUser = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    """Permanently delete a Google user and all server-side data (premium, slots, notes)."""
    deleted = await delete_user_by_id(db, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail='User not found')
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


@router.get('/notifications/screens')
async def admin_notification_screens(
    _: AdminUser = Depends(get_admin_user),
) -> dict[str, object]:
    from ..push.admin_notify import REDIRECT_SCREEN_OPTIONS

    return {
        'ok': True,
        'screens': [
            {
                'id': opt['id'],
                'label': opt['label'],
                'needsSymbol': bool(opt.get('needsSymbol')),
            }
            for opt in REDIRECT_SCREEN_OPTIONS
        ],
    }


@router.get('/notifications/audience-preview')
async def admin_notification_audience_preview(
    audience: str = Query(..., pattern=r'^(free|premium|all)$'),
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_admin_user),
) -> dict[str, object]:
    from ..push.admin_notify import count_audience

    count = await count_audience(db, audience)  # type: ignore[arg-type]
    return {'ok': True, 'audience': audience, 'deviceCount': count}


@router.get(
    '/notifications/history',
    response_model=list[AdminNotificationHistoryOut],
    response_model_by_alias=True,
)
async def admin_notification_history(
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_admin_user),
) -> list[AdminNotificationHistoryOut]:
    from ..push.admin_notify import history_row_to_dict, list_notification_history

    rows = await list_notification_history(db)
    return [AdminNotificationHistoryOut(**history_row_to_dict(row)) for row in rows]


@router.post('/notifications/send')
async def admin_notification_send(
    body: AdminNotificationSendIn,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_admin_user),
) -> dict[str, object]:
    from ..push.admin_notify import send_admin_custom_notification

    result = await send_admin_custom_notification(
        db,
        title=body.title,
        body=body.body,
        audience=body.audience,  # type: ignore[arg-type]
        redirect_screen=body.redirect_screen,
        redirect_symbol=body.redirect_symbol,
        sent_by=admin.email,
        image_base64=body.image_base64,
    )
    await db.commit()
    return result
