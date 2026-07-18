from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..config import get_settings
from ..auth.jwt_tokens import decode_access_token

_admin_bearer = HTTPBearer(auto_error=False)


@dataclass
class AdminUser:
    email: str


async def get_admin_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_admin_bearer),
) -> AdminUser:
    if creds is None or creds.scheme.lower() != 'bearer':
        raise HTTPException(status_code=401, detail='Admin login required')
    settings = get_settings()
    try:
        payload = decode_access_token(creds.credentials, settings.jwt_secret)
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail='Invalid admin token') from e

    if payload.get('type') != 'admin':
        raise HTTPException(status_code=401, detail='Invalid admin token type')
    email = str(payload.get('email') or '')
    if not email:
        raise HTTPException(status_code=401, detail='Invalid admin token')
    return AdminUser(email=email)
