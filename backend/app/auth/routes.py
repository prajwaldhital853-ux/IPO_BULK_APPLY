from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..config import get_settings
from ..db.models import PremiumEntitlement, RefreshToken, User
from ..db.session import get_db
from .blacklist import get_blacklist
from .deps import CurrentUser, get_current_user, utcnow
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
    PremiumOut,
    RefreshRequest,
    UserOut,
    premium_from_row,
)

router = APIRouter(prefix='/auth', tags=['auth'])


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        avatarUrl=user.avatar_url,
    )


async def _load_user(db: AsyncSession, user_id: str) -> User | None:
    return await db.scalar(
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.premium)),
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
    premium = premium_from_row(
        user.premium.plan if user.premium else None,
        user.premium.expires_at if user.premium else None,
    )
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
    user = await _load_user(db, user.id)
    assert user is not None
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
        .options(selectinload(RefreshToken.user).selectinload(User.premium)),
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
    premium = premium_from_row(
        user.premium.plan if user.premium else None,
        user.premium.expires_at if user.premium else None,
    )
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
    row = await _load_user(db, user.id)
    if row is None:
        raise HTTPException(status_code=404, detail='User not found')
    await db.delete(row)
    await db.commit()
    return {'ok': True}


@router.get('/me', response_model=MeResponse)
async def auth_me(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeResponse:
    row = await _load_user(db, user.id)
    if row is None:
        raise HTTPException(status_code=404, detail='User not found')
    premium = premium_from_row(
        row.premium.plan if row.premium else None,
        row.premium.expires_at if row.premium else None,
    )
    return MeResponse(user=_user_out(row), premium=premium)
