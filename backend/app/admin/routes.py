from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth.deps import utcnow
from ..auth.jwt_tokens import create_admin_token
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
from ..config import get_settings
from ..db.models import PremiumEntitlement, SubscriptionRequest, User, UserFeedback
from ..db.session import get_db
from ..emailer import email_configured
from .deps import AdminUser, get_admin_user
from .schemas import (
    AdminActionIn,
    AdminDashboardStats,
    AdminForgotPasswordIn,
    AdminLoginRequest,
    AdminLoginResponse,
    AdminMaxAccountsIn,
    AdminPasswordChangeIn,
    AdminPendingBrief,
    AdminResetPasswordIn,
    AdminSettingsOut,
    AdminSettingsUpdateIn,
    AdminSubscriptionRow,
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
    get_or_create_settings,
    request_password_reset,
    reset_password_with_otp,
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
    await db.commit()
    token, ttl = create_admin_token(
        email=row.admin_email,
        secret=settings.jwt_secret,
        ttl_seconds=86_400,
    )
    return AdminLoginResponse(accessToken=token, expiresIn=ttl, email=row.admin_email)


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
    except EmailNotConfiguredError:
        raise HTTPException(
            status_code=503,
            detail='Email is not configured on the server. Set SENDGRID_API_KEY, RESEND_API_KEY, or BREVO_API_KEY.',
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
    await db.commit()
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
    await db.commit()
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
    user.max_accounts = int(body.max_accounts)
    await db.commit()
    user = await load_user_with_premium(db, user_id)
    assert user is not None
    return await _user_row(db, user)


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
