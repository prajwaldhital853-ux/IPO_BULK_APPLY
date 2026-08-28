from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..config import get_settings
from ..db.models import RefreshToken, SubscriptionRequest, User
from ..db.session import get_db
from .blacklist import get_blacklist
from .user_delete import delete_user_by_id
from .deps import CurrentUser, get_current_user, raise_if_user_blocked, utcnow
from .google import GoogleAuthError, verify_google_id_token
from .jwt_tokens import (
    create_access_token,
    new_refresh_token_id,
    new_token_family_id,
    refresh_expires_at,
)
from .schemas import (
    AuthResponse,
    GoogleAuthRequest,
    LogoutRequest,
    MeResponse,
    PaymentInfoOut,
    PinOtpSendOut,
    PinOtpVerifyIn,
    PinOtpVerifyOut,
    PremiumOut,
    RefreshRequest,
    SubscriptionRequestIn,
    UserOut,
)
from .subscription import (
    PLAN_CATALOG,
    build_premium_out,
    get_pending_request,
    load_user_with_premium,
    plan_info,
    upsert_premium,
)
from ..emailer import EmailNotConfiguredError
from ..pin_otp import request_user_pin_otp, verify_user_pin_otp

router = APIRouter(prefix='/auth', tags=['auth'])


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        avatarUrl=user.avatar_url,
    )


async def _issue_tokens(db: AsyncSession, user: User) -> AuthResponse:
    settings = get_settings()
    access, _jti, ttl = create_access_token(
        user_id=user.id,
        email=user.email,
        secret=settings.jwt_secret,
        ttl_seconds=settings.jwt_access_ttl,
    )
    refresh_id = new_refresh_token_id()
    family_id = new_token_family_id()
    db.add(
        RefreshToken(
            id=refresh_id,
            user_id=user.id,
            family_id=family_id,
            expires_at=refresh_expires_at(settings.jwt_refresh_days),
            revoked=False,
        ),
    )
    await db.commit()
    premium = await build_premium_out(db, user)
    return AuthResponse(
        accessToken=access,
        refreshToken=refresh_id,
        expiresIn=ttl,
        user=_user_out(user),
        premium=premium,
    )


@router.post('/google', response_model=AuthResponse)
async def auth_google(
    body: GoogleAuthRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    settings = get_settings()
    try:
        info = verify_google_id_token(body.id_token, settings.google_client_id_list)
    except GoogleAuthError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e

    user = await db.scalar(select(User).where(User.google_sub == info['sub']))
    if user is None:
        user = User(
            id=str(uuid.uuid4()),
            google_sub=info['sub'],
            email=info['email'],
            name=info['name'],
            avatar_url=info.get('picture'),
        )
        db.add(user)
        await db.flush()
    else:
        user.email = info['email']
        user.name = info['name'] or user.name
        user.avatar_url = info.get('picture') or user.avatar_url

    await db.flush()
    user = await load_user_with_premium(db, user.id)
    assert user is not None
    raise_if_user_blocked(user)
    return await _issue_tokens(db, user)


@router.post('/refresh', response_model=AuthResponse)
async def auth_refresh(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    settings = get_settings()
    row = await db.scalar(
        select(RefreshToken)
        .where(RefreshToken.id == body.refresh_token)
        .options(selectinload(RefreshToken.user)),
    )
    if row is None or row.revoked:
        raise HTTPException(status_code=401, detail='Invalid refresh token')

    exp = row.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=UTC)
    if exp <= utcnow():
        raise HTTPException(status_code=401, detail='Refresh token expired')

    row.revoked = True
    user = row.user
    raise_if_user_blocked(user)
    access, _jti, ttl = create_access_token(
        user_id=user.id,
        email=user.email,
        secret=settings.jwt_secret,
        ttl_seconds=settings.jwt_access_ttl,
    )
    new_id = new_refresh_token_id()
    db.add(
        RefreshToken(
            id=new_id,
            user_id=user.id,
            family_id=row.family_id,
            expires_at=refresh_expires_at(settings.jwt_refresh_days),
            revoked=False,
        ),
    )
    await db.commit()
    user = await load_user_with_premium(db, user.id)
    assert user is not None
    premium = await build_premium_out(db, user)
    return AuthResponse(
        accessToken=access,
        refreshToken=new_id,
        expiresIn=ttl,
        user=_user_out(user),
        premium=premium,
    )


@router.post('/logout')
async def auth_logout(
    body: LogoutRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    settings = get_settings()
    await get_blacklist().add_jti(user.jti, settings.jwt_access_ttl)

    if body.refresh_token:
        row = await db.scalar(
            select(RefreshToken).where(
                RefreshToken.id == body.refresh_token,
                RefreshToken.user_id == user.id,
            ),
        )
        if row is not None:
            row.revoked = True

    await db.commit()
    return {'ok': True}


@router.delete('/account')
async def delete_account(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    settings = get_settings()
    await get_blacklist().add_jti(user.jti, settings.jwt_access_ttl)

    await delete_user_by_id(db, user.id)
    await db.commit()
    return {'ok': True}


@router.get('/me', response_model=MeResponse)
async def auth_me(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeResponse:
    row = await load_user_with_premium(db, user.id)
    if row is None:
        raise HTTPException(status_code=401, detail='User not found')
    premium = await build_premium_out(db, row)
    await db.commit()
    return MeResponse(user=_user_out(row), premium=premium)


@router.post('/pin/send-otp', response_model=PinOtpSendOut)
async def pin_send_otp(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PinOtpSendOut:
    row = await db.scalar(select(User).where(User.id == user.id))
    if row is None:
        raise HTTPException(status_code=401, detail='User not found')
    try:
        masked = await request_user_pin_otp(db, row)
        await db.commit()
    except EmailNotConfiguredError:
        raise HTTPException(
            status_code=503,
            detail='Email is not configured on the server. Contact support.',
        ) from None
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return PinOtpSendOut(
        message=(
            f'Verification code sent to {masked}. '
            'Check Inbox, Spam, and Promotions tabs. '
            'If it does not arrive within 2 minutes, ask support to verify the email provider.'
        ),
        email=masked,
    )


@router.post('/pin/verify-otp', response_model=PinOtpVerifyOut)
async def pin_verify_otp(
    body: PinOtpVerifyIn,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PinOtpVerifyOut:
    try:
        await verify_user_pin_otp(db, user.id, body.otp)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return PinOtpVerifyOut(ok=True)


@router.get('/subscription/payment-info', response_model=PaymentInfoOut)
async def subscription_payment_info(
    db: AsyncSession = Depends(get_db),
) -> PaymentInfoOut:
    from ..site_settings import get_or_create_settings

    row = await get_or_create_settings(db)
    wa = row.payment_whatsapp.strip()
    from ..public_settings import payment_qr_public_path

    return PaymentInfoOut(
        qrText=row.payment_qr_text,
        qrImageUrl=payment_qr_public_path(row),
        bankName=row.payment_bank_name,
        accountName=row.payment_account_name,
        accountNumber=row.payment_account_number,
        whatsappUrl=f'https://wa.me/{wa}' if wa else '',
    )


@router.get('/subscription/status', response_model=PremiumOut)
async def subscription_status(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PremiumOut:
    row = await load_user_with_premium(db, user.id)
    if row is None:
        raise HTTPException(status_code=401, detail='User not found')
    premium = await build_premium_out(db, row)
    await db.commit()
    return premium


@router.post('/subscription/request', response_model=PremiumOut)
async def subscription_request(
    body: SubscriptionRequestIn,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PremiumOut:
    row = await load_user_with_premium(db, user.id)
    if row is None:
        raise HTTPException(status_code=401, detail='User not found')

    premium = await build_premium_out(db, row)
    if premium.active:
        raise HTTPException(status_code=400, detail='Premium is already active')
    if premium.status == 'pending':
        raise HTTPException(
            status_code=400,
            detail='A subscription request is already pending verification',
        )

    try:
        from ..site_settings import get_or_create_settings
        from .subscription import load_subscription_plans, plans_to_catalog

        settings_row = await get_or_create_settings(db)
        catalog = plans_to_catalog(load_subscription_plans(settings_row))
        info = plan_info(body.plan_id, catalog)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    req = SubscriptionRequest(
        id=str(uuid.uuid4()),
        user_id=user.id,
        plan_id=body.plan_id,
        plan_title=str(info['title']),
        amount_npr=int(info['amountNpr']),
        status='pending',
        payment_note=(body.payment_note or '').strip() or None,
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)
    row = await load_user_with_premium(db, user.id)
    assert row is not None
    premium_out = await build_premium_out(db, row)

    try:
        from ..push.user_notify import notify_user

        await notify_user(
            db,
            user.id,
            title='Premium request submitted',
            body=(
                f'Your {req.plan_title} request (Rs {req.amount_npr}) was received. '
                'We will verify payment and notify you when it is approved.'
            ),
            data={'type': 'subscription_submitted', 'requestId': req.id},
        )
    except Exception:  # noqa: BLE001
        await db.rollback()

    return premium_out


@router.post('/subscription/cancel-pending', response_model=PremiumOut)
async def subscription_cancel_pending(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PremiumOut:
    pending = await get_pending_request(db, user.id)
    if pending is None:
        raise HTTPException(status_code=404, detail='No pending subscription request')
    pending.status = 'cancelled'
    pending.reviewed_at = utcnow()
    await db.commit()
    row = await load_user_with_premium(db, user.id)
    assert row is not None
    return await build_premium_out(db, row)
