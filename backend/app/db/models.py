from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
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
    # Optional override for MeroShare account cap (null = plan default 10/50).
    max_accounts: Mapped[int | None] = mapped_column(Integer, nullable=True)
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
    reminder_2d_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    reminder_1d_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
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
    admin_failed_login_count: Mapped[int] = mapped_column(Integer, default=0)
    admin_login_locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    payment_qr_text: Mapped[str] = mapped_column(String(512), default='')
    payment_qr_image_b64: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_qr_image_mime: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payment_bank_name: Mapped[str] = mapped_column(String(256), default='')
    payment_account_name: Mapped[str] = mapped_column(String(256), default='')
    payment_account_number: Mapped[str] = mapped_column(String(64), default='')
    payment_whatsapp: Mapped[str] = mapped_column(String(32), default='')

    # Startup popup notice image (shown when app opens). Null = no notice.
    # Legacy single-image fields (migrated into popup_notices_json on read).
    popup_notice_image_b64: Mapped[str | None] = mapped_column(Text, nullable=True)
    popup_notice_image_mime: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # JSON array of {id, image_b64, mime} — shown serially on app open.
    popup_notices_json: Mapped[str] = mapped_column(Text, default='[]')

    contact_company_name: Mapped[str] = mapped_column(String(256), default='')
    contact_email: Mapped[str] = mapped_column(String(320), default='')
    contact_whatsapp: Mapped[str] = mapped_column(String(32), default='')
    contact_whatsapp_url: Mapped[str] = mapped_column(String(512), default='')
    contact_facebook_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    contact_tiktok_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # JSON array of {id, platform, label, detail, url}
    contact_social_links: Mapped[str] = mapped_column(Text, default='[]')

    # JSON array of subscription plans editable from admin.
    subscription_plans_json: Mapped[str] = mapped_column(Text, default='[]')

    # App-wide company logo (header, drawer, profile, about).
    app_logo_b64: Mapped[str | None] = mapped_column(Text, nullable=True)
    app_logo_mime: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Home screen green promo banner (admin-controlled).
    home_promo_visible: Mapped[bool] = mapped_column(default=True)
    home_promo_text: Mapped[str] = mapped_column(
        String(512),
        default=(
            'Add your MeroShare account to bulk apply for IPOs — '
            'tap here to get started'
        ),
    )
    # none | AddCapital | Subscription | Apply | Services | Profile | …
    home_promo_action: Mapped[str] = mapped_column(String(64), default='AddCapital')
    home_promo_color: Mapped[str] = mapped_column(String(16), default='#1B5E20')
    # Per-page promo cards: { home, apply, services, check, profile }
    home_promo_pages_json: Mapped[str] = mapped_column(Text, default='{}')

    # About / Terms / Privacy pages (JSON) editable from admin.
    legal_pages_json: Mapped[str] = mapped_column(Text, default='{}')

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


class MarketClosure(Base):
    """Unexpected NEPSE closed day + notice, managed from the admin panel."""

    __tablename__ = 'market_closures'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    date: Mapped[str] = mapped_column(String(10), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(256), default='NEPSE Closed')
    notice: Mapped[str] = mapped_column(Text, default='')
    color: Mapped[str] = mapped_column(String(16), default='#E53935')
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class ManagedOffering(Base):
    """Admin-curated IPO/FPO/Right/etc. shown in Current / Upcoming Issues."""

    __tablename__ = 'managed_offerings'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # Deterministic key used to override ShareHub/CDSC rows.
    match_key: Mapped[str] = mapped_column(String(256), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(512), default='')
    symbol: Mapped[str] = mapped_column(String(32), default='')
    # Ipo | Fpo | Right | MutualFund | BondOrDebenture
    offering_type: Mapped[str] = mapped_column(String(32), default='Ipo', index=True)
    # GeneralPublic | ForeignEmployment | …
    audience: Mapped[str | None] = mapped_column(String(128), nullable=True)
    issue_manager: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # ComingSoon | Proposed | Open | Closed
    status: Mapped[str] = mapped_column(String(32), default='ComingSoon', index=True)
    # current | upcoming | both — explicit admin-controlled app placement.
    display_section: Mapped[str] = mapped_column(String(16), default='both', index=True)
    units: Mapped[int | None] = mapped_column(Integer, nullable=True)
    applied_units: Mapped[int | None] = mapped_column(Integer, nullable=True)
    applicants: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    applied_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    opening_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    closing_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    extended_closing_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    right_share_ratio: Mapped[str | None] = mapped_column(String(64), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
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


class PushDevice(Base):
    """Expo push token registered from the mobile app."""

    __tablename__ = 'push_devices'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    expo_push_token: Mapped[str] = mapped_column(String(256), unique=True, index=True)
    user_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey('users.id', ondelete='SET NULL'),
        nullable=True,
        index=True,
    )
    platform: Mapped[str] = mapped_column(String(16), default='android')
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class BrokerFlowSnapshot(Base):
    """Shared premium board cache for all users (Postgres)."""

    __tablename__ = 'broker_flow_snapshots'

    # accumulation | distribution | top-buyers | … | financial-reports |
    # fifty-two-week-high | fifty-two-week-low | unlock-period | broker-favorites
    kind: Mapped[str] = mapped_column(String(32), primary_key=True)
    session_date: Mapped[str] = mapped_column(String(10), default='')
    trades_scanned: Mapped[int] = mapped_column(Integer, default=0)
    # Merolagani contract ids are 12+ digit — need bigint.
    max_contract_id: Mapped[int] = mapped_column(BigInteger, default=0)
    # Full PremiumIntelSnapshot JSON for the mobile client.
    payload_json: Mapped[str] = mapped_column(Text, default='{}')
    source: Mapped[str] = mapped_column(String(32), default='merolagani')
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class UserPriceAlert(Base):
    """Server-side price alert used for background push notifications."""

    __tablename__ = 'user_price_alerts'

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey('users.id', ondelete='CASCADE'),
        nullable=True,
        index=True,
    )
    device_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey('push_devices.id', ondelete='CASCADE'),
        nullable=True,
        index=True,
    )
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(256), default='')
    direction: Mapped[str] = mapped_column(String(8))  # above | below
    target_price: Mapped[float] = mapped_column(Float)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    triggered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class UserNote(Base):
    """Private cloud notes scoped to a signed-in Google account (User.id)."""

    __tablename__ = 'user_notes'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey('users.id', ondelete='CASCADE'),
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), default='')
    body: Mapped[str] = mapped_column(Text, default='')
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

