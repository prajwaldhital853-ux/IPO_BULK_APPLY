from __future__ import annotations

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


class PendingRequestOut(BaseModel):
    id: str
    plan_id: str = Field(alias='planId')
    plan_title: str = Field(alias='planTitle')
    amount_npr: int = Field(alias='amountNpr')
    status: str
    payment_note: str | None = Field(default=None, alias='paymentNote')
    created_at: str = Field(alias='createdAt')

    model_config = {'populate_by_name': True}


class PremiumOut(BaseModel):
    active: bool
    plan: str | None = None
    expires_at: str | None = Field(default=None, alias='expiresAt')
    status: str = 'free'
    pending_request: PendingRequestOut | None = Field(
        default=None,
        alias='pendingRequest',
    )

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


class SubscriptionRequestIn(BaseModel):
    plan_id: str = Field(alias='planId')
    payment_note: str | None = Field(default=None, alias='paymentNote')

    model_config = {'populate_by_name': True}


class PaymentInfoOut(BaseModel):
    qr_text: str = Field(alias='qrText')
    bank_name: str = Field(alias='bankName')
    account_name: str = Field(alias='accountName')
    account_number: str = Field(alias='accountNumber')
    whatsapp_url: str = Field(alias='whatsappUrl')

    model_config = {'populate_by_name': True}


class PinOtpSendOut(BaseModel):
    ok: bool = True
    message: str
    email: str

    model_config = {'populate_by_name': True}


class PinOtpVerifyIn(BaseModel):
    otp: str

    model_config = {'populate_by_name': True}


class PinOtpVerifyOut(BaseModel):
    ok: bool = True

    model_config = {'populate_by_name': True}


def premium_from_row(plan: str | None, expires_at) -> PremiumOut:
    from datetime import UTC, datetime

    active = False
    if plan and expires_at:
        exp = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=UTC)
        active = exp > datetime.now(UTC)
    return PremiumOut(
        active=active,
        plan=plan if active else None,
        expiresAt=expires_at.isoformat() if expires_at and active else None,
        status='active' if active else 'free',
        pendingRequest=None,
    )
