from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from .admin.passwords import generate_otp, hash_otp, verify_otp
from .config import get_settings
from .db.models import User, UserPinOtp
from .emailer import EmailNotConfiguredError, send_user_pin_otp


def _pepper() -> str:
    return get_settings().jwt_secret


def mask_email(email: str) -> str:
    normalized = email.strip()
    if '@' not in normalized:
        return normalized
    local, domain = normalized.split('@', 1)
    if len(local) <= 1:
        masked_local = '*'
    elif len(local) <= 3:
        masked_local = local[0] + '*' * (len(local) - 1)
    else:
        masked_local = local[0] + '*' * (len(local) - 2) + local[-1]
    return f'{masked_local}@{domain}'


async def request_user_pin_otp(db: AsyncSession, user: User) -> str:
    settings = get_settings()
    otp = generate_otp()
    expires = datetime.now(UTC) + timedelta(minutes=settings.admin_otp_ttl_minutes)

    row = await db.get(UserPinOtp, user.id)
    if row is None:
        row = UserPinOtp(user_id=user.id)
        db.add(row)

    row.otp_hash = hash_otp(otp, pepper=_pepper())
    row.expires_at = expires
    row.attempts = 0
    await db.flush()

    try:
        send_user_pin_otp(to_email=user.email.strip().lower(), otp=otp)
    except EmailNotConfiguredError:
        import logging

        logging.getLogger('pin-otp').warning(
            'Email not configured — PIN OTP for %s: %s (expires %s)',
            user.email,
            otp,
            expires.isoformat(),
        )
        if settings.app_env == 'production':
            raise
    except RuntimeError:
        raise

    return mask_email(user.email)


async def verify_user_pin_otp(db: AsyncSession, user_id: str, otp: str) -> None:
    row = await db.get(UserPinOtp, user_id)
    if row is None:
        raise ValueError('Invalid code — request a new one')

    exp = row.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=UTC)
    if exp <= datetime.now(UTC):
        raise ValueError('Code expired — request a new one')

    row.attempts += 1
    if row.attempts > 5:
        raise ValueError('Too many attempts — request a new code')

    if not verify_otp(otp.strip(), row.otp_hash, pepper=_pepper()):
        raise ValueError('Invalid verification code')

    await db.delete(row)
