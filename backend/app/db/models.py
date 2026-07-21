from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = 'users'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    google_sub: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    name: Mapped[str] = mapped_column(String(256), default='')
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    refresh_tokens: Mapped[list['RefreshToken']] = relationship(back_populates='user')
    premium: Mapped['PremiumEntitlement | None'] = relationship(
        back_populates='user',
        uselist=False,
    )
    subscription_requests: Mapped[list['SubscriptionRequest']] = relationship(
        back_populates='user',
    )


class RefreshToken(Base):
    __tablename__ = 'refresh_tokens'

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    family_id: Mapped[str] = mapped_column(String(64), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    user: Mapped['User'] = relationship(back_populates='refresh_tokens')


class PremiumEntitlement(Base):
    __tablename__ = 'premium_entitlements'

    user_id: Mapped[str] = mapped_column(
        ForeignKey('users.id', ondelete='CASCADE'),
        primary_key=True,
    )
    plan: Mapped[str] = mapped_column(String(32), default='premium')
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source: Mapped[str] = mapped_column(String(64), default='manual')
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped['User'] = relationship(back_populates='premium')


class SubscriptionRequest(Base):
    __tablename__ = 'subscription_requests'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey('users.id', ondelete='CASCADE'),
        index=True,
    )
    plan_id: Mapped[str] = mapped_column(String(64))
    plan_title: Mapped[str] = mapped_column(String(128))
    amount_npr: Mapped[int] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(String(32), default='pending', index=True)
    payment_note: Mapped[str | None] = mapped_column(String(512), nullable=True)
    admin_note: Mapped[str | None] = mapped_column(String(512), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(320), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    user: Mapped['User'] = relationship(back_populates='subscription_requests')


class SiteSettings(Base):
    """Singleton app configuration editable from admin panel."""

    __tablename__ = 'site_settings'

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    admin_email: Mapped[str] = mapped_column(String(320), default='kalashfinancialsolution@gmail.com')
    admin_password_hash: Mapped[str] = mapped_column(String(256))

    payment_qr_text: Mapped[str] = mapped_column(String(512), default='')
    payment_qr_image_b64: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_qr_image_mime: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payment_bank_name: Mapped[str] = mapped_column(String(256), default='')
    payment_account_name: Mapped[str] = mapped_column(String(256), default='')
    payment_account_number: Mapped[str] = mapped_column(String(64), default='')
    payment_whatsapp: Mapped[str] = mapped_column(String(32), default='')

    contact_company_name: Mapped[str] = mapped_column(String(256), default='')
    contact_email: Mapped[str] = mapped_column(String(320), default='')
    contact_whatsapp: Mapped[str] = mapped_column(String(32), default='')
    contact_whatsapp_url: Mapped[str] = mapped_column(String(512), default='')
    contact_facebook_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    contact_tiktok_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class TeamMember(Base):
    """Team member profile shown in the app, managed from the admin panel."""

    __tablename__ = 'team_members'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), default='')
    role: Mapped[str] = mapped_column(String(128), default='')
    bio: Mapped[str] = mapped_column(Text, default='')
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    whatsapp: Mapped[str | None] = mapped_column(String(32), nullable=True)
    accent: Mapped[str] = mapped_column(String(16), default='#42A5F5')
    photo_b64: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_mime: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class AdminOtpReset(Base):
    __tablename__ = 'admin_otp_resets'

    email: Mapped[str] = mapped_column(String(320), primary_key=True)
    otp_hash: Mapped[str] = mapped_column(String(128))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class UserFeedback(Base):
    __tablename__ = 'user_feedback'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(256), default='')
    email: Mapped[str] = mapped_column(String(320), default='')
    message: Mapped[str] = mapped_column(String(4000))
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default='new', index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class UserPinOtp(Base):
    __tablename__ = 'user_pin_otps'

    user_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    otp_hash: Mapped[str] = mapped_column(String(128))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
