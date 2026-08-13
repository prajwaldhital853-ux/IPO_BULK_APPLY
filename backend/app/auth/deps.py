from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db.models import User
from ..db.session import get_db
from .blacklist import get_blacklist
from .jwt_tokens import decode_access_token

_bearer = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    id: str
    email: str
    jti: str


USER_BLOCKED_DETAIL = (
    'You are temporarily blocked. You cannot sign in with this Google account '
    'right now. You can still use the app as a guest without signing in.'
)


def raise_if_user_blocked(user: User | None) -> None:
    if user is not None and bool(getattr(user, 'is_blocked', False)):
        raise HTTPException(status_code=403, detail=USER_BLOCKED_DETAIL)


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    if creds is None or creds.scheme.lower() != 'bearer':
        raise HTTPException(status_code=401, detail='Missing bearer token')
    settings = get_settings()
    try:
        payload = decode_access_token(creds.credentials, settings.jwt_secret)
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail='Invalid token') from e

    if payload.get('type') != 'access':
        raise HTTPException(status_code=401, detail='Invalid token type')

    jti = str(payload.get('jti') or '')
    if not jti:
        raise HTTPException(status_code=401, detail='Invalid token')

    if await get_blacklist().is_jti_blacklisted(jti):
        raise HTTPException(status_code=401, detail='Token revoked')

    user_id = str(payload.get('sub') or '')
    email = str(payload.get('email') or '')
    if not user_id:
        raise HTTPException(status_code=401, detail='Invalid token subject')

    row = await db.scalar(select(User).where(User.id == user_id))
    if row is None and email:
        row = await db.scalar(
            select(User).where(User.email == email.strip().lower()),
        )
    if row is None:
        raise HTTPException(
            status_code=401,
            detail='Session expired. Please sign in with Google again.',
        )

    raise_if_user_blocked(row)
    return CurrentUser(id=row.id, email=email or row.email, jti=jti)


async def get_optional_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser | None:
    if creds is None:
        return None
    try:
        return await get_current_user(creds, db)
    except HTTPException:
        return None


def utcnow() -> datetime:
    return datetime.now(UTC)
