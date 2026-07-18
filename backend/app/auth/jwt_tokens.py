from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt

ALGORITHM = 'HS256'


def _utcnow() -> datetime:
    return datetime.now(UTC)


def create_access_token(
    *,
    user_id: str,
    email: str,
    secret: str,
    ttl_seconds: int,
) -> tuple[str, str, int]:
    jti = str(uuid.uuid4())
    exp = _utcnow() + timedelta(seconds=ttl_seconds)
    payload = {
        'sub': user_id,
        'email': email,
        'jti': jti,
        'exp': exp,
        'iat': _utcnow(),
        'type': 'access',
    }
    token = jwt.encode(payload, secret, algorithm=ALGORITHM)
    return token, jti, ttl_seconds


def decode_access_token(token: str, secret: str) -> dict:
    return jwt.decode(token, secret, algorithms=[ALGORITHM])


def new_refresh_token_id() -> str:
    return secrets.token_urlsafe(32)


def new_token_family_id() -> str:
    return secrets.token_urlsafe(16)


def refresh_expires_at(days: int) -> datetime:
    return _utcnow() + timedelta(days=days)


def create_admin_token(
    *,
    email: str,
    secret: str,
    ttl_seconds: int = 86_400,
) -> tuple[str, int]:
    exp = _utcnow() + timedelta(seconds=ttl_seconds)
    payload = {
        'sub': 'admin',
        'email': email,
        'jti': str(uuid.uuid4()),
        'exp': exp,
        'iat': _utcnow(),
        'type': 'admin',
    }
    token = jwt.encode(payload, secret, algorithm=ALGORITHM)
    return token, ttl_seconds
