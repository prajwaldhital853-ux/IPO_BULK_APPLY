from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
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
