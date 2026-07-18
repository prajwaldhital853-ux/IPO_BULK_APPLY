from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, Field


class GoogleAuthRequest(BaseModel):
    id_token: str = Field(alias='idToken')

    model_config = {'populate_by_name': True}


class RefreshRequest(BaseModel):
    refresh_token: str = Field(alias='refreshToken')

    model_config = {'populate_by_name': True}


class LogoutRequest(BaseModel):
    refresh_token: str | None = Field(default=None, alias='refreshToken')

    model_config = {'populate_by_name': True}


class PremiumOut(BaseModel):
    active: bool
    plan: str | None = None
    expires_at: str | None = Field(default=None, alias='expiresAt')

    model_config = {'populate_by_name': True}


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    avatar_url: str | None = Field(default=None, alias='avatarUrl')

    model_config = {'populate_by_name': True}


class AuthResponse(BaseModel):
    access_token: str = Field(alias='accessToken')
    refresh_token: str = Field(alias='refreshToken')
    expires_in: int = Field(alias='expiresIn')
    user: UserOut
    premium: PremiumOut

    model_config = {'populate_by_name': True}


class MeResponse(BaseModel):
    user: UserOut
    premium: PremiumOut


def premium_from_row(plan: str | None, expires_at: datetime | None) -> PremiumOut:
    active = False
    if plan and expires_at:
        exp = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=UTC)
        active = exp > datetime.now(UTC)
    return PremiumOut(
        active=active,
        plan=plan if active else None,
        expiresAt=expires_at.isoformat() if expires_at and active else None,
    )
