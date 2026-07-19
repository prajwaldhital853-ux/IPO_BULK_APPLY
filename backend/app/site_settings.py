from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .admin.passwords import generate_otp, hash_otp, hash_password, verify_otp, verify_password
from .config import get_settings
from .db.models import AdminOtpReset, SiteSettings
from .emailer import EmailNotConfiguredError, send_admin_otp


def _pepper() -> str:
    return get_settings().jwt_secret


def _defaults() -> dict[str, str]:
    s = get_settings()
    return {
        'admin_email': s.admin_email.strip().lower(),
        'payment_qr_text': s.payment_qr_text,
        'payment_bank_name': s.payment_bank_name,
        'payment_account_name': s.payment_account_name,
        'payment_account_number': s.payment_account_number,
        'payment_whatsapp': s.payment_whatsapp,
        'contact_company_name': 'Kalash Financial Solution Pvt. Ltd.',
        'contact_email': 'kalashfinancialsolution@gmail.com',
        'contact_whatsapp': '9709133067',
        'contact_whatsapp_url': 'https://wa.me/9779709133067',
        'contact_facebook_url': '',
        'contact_tiktok_url': 'https://www.tiktok.com/@unique_share_market',
    }


async def get_or_create_settings(db: AsyncSession) -> SiteSettings:
    row = await db.get(SiteSettings, 1)
    if row is not None:
        return row

    s = get_settings()
    defaults = _defaults()
    row = SiteSettings(
        id=1,
        admin_email=defaults['admin_email'],
        admin_password_hash=hash_password(s.admin_password, pepper=_pepper()),
        payment_qr_text=defaults['payment_qr_text'],
        payment_bank_name=defaults['payment_bank_name'],
        payment_account_name=defaults['payment_account_name'],
        payment_account_number=defaults['payment_account_number'],
        payment_whatsapp=defaults['payment_whatsapp'],
        contact_company_name=defaults['contact_company_name'],
        contact_email=defaults['contact_email'],
        contact_whatsapp=defaults['contact_whatsapp'],
        contact_whatsapp_url=defaults['contact_whatsapp_url'],
        contact_facebook_url=defaults['contact_facebook_url'],
        contact_tiktok_url=defaults['contact_tiktok_url'],
    )
    db.add(row)
    await db.flush()
    return row


async def verify_admin_login(db: AsyncSession, email: str, password: str) -> bool:
    row = await get_or_create_settings(db)
    if email.strip().lower() != row.admin_email.strip().lower():
        return False
    return verify_password(password, row.admin_password_hash, pepper=_pepper())


async def update_admin_password(db: AsyncSession, new_password: str) -> None:
    if len(new_password) < 8:
        raise ValueError('Password must be at least 8 characters')
    row = await get_or_create_settings(db)
    row.admin_password_hash = hash_password(new_password, pepper=_pepper())
    row.updated_at = datetime.now(UTC)
    await db.flush()


async def request_password_reset(db: AsyncSession, email: str) -> None:
    row = await get_or_create_settings(db)
    normalized = email.strip().lower()
    if normalized != row.admin_email.strip().lower():
        # Do not reveal whether email exists
        return

    settings = get_settings()
    otp = generate_otp()
    expires = datetime.now(UTC) + timedelta(minutes=settings.admin_otp_ttl_minutes)

    existing = await db.scalar(
        select(AdminOtpReset).where(AdminOtpReset.email == normalized),
    )
    if existing is None:
        existing = AdminOtpReset(email=normalized)
        db.add(existing)

    existing.otp_hash = hash_otp(otp, pepper=_pepper())
    existing.expires_at = expires
    existing.attempts = 0
    await db.flush()

    try:
        send_admin_otp(to_email=normalized, otp=otp)
    except EmailNotConfiguredError:
        # Dev fallback: log OTP when SMTP not set (Render logs)
        import logging

        logging.getLogger('admin-otp').warning(
            'SMTP not configured — admin OTP for %s: %s (expires %s)',
            normalized,
            otp,
            expires.isoformat(),
        )
        if settings.app_env == 'production':
            raise


async def reset_password_with_otp(
    db: AsyncSession,
    email: str,
    otp: str,
    new_password: str,
) -> None:
    row = await get_or_create_settings(db)
    normalized = email.strip().lower()
    if normalized != row.admin_email.strip().lower():
        raise ValueError('Invalid email or code')

    otp_row = await db.scalar(
        select(AdminOtpReset).where(AdminOtpReset.email == normalized),
    )
    if otp_row is None:
        raise ValueError('Invalid email or code')

    exp = otp_row.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=UTC)
    if exp <= datetime.now(UTC):
        raise ValueError('Code expired — request a new one')

    otp_row.attempts += 1
    if otp_row.attempts > 5:
        raise ValueError('Too many attempts — request a new code')

    if not verify_otp(otp.strip(), otp_row.otp_hash, pepper=_pepper()):
        raise ValueError('Invalid email or code')

    await update_admin_password(db, new_password)
    await db.delete(otp_row)


async def update_site_settings(
    db: AsyncSession,
    *,
    payment: dict[str, str] | None = None,
    contact: dict[str, str | None] | None = None,
) -> SiteSettings:
    row = await get_or_create_settings(db)

    if payment is not None:
        row.payment_qr_text = payment.get('qr_text', row.payment_qr_text).strip()
        row.payment_bank_name = payment.get('bank_name', row.payment_bank_name).strip()
        row.payment_account_name = payment.get('account_name', row.payment_account_name).strip()
        row.payment_account_number = payment.get(
            'account_number',
            row.payment_account_number,
        ).strip()
        row.payment_whatsapp = payment.get('whatsapp', row.payment_whatsapp).strip()
        if payment.get('clear_qr_image'):
            row.payment_qr_image_b64 = None
            row.payment_qr_image_mime = None
        elif payment.get('qr_image_base64'):
            import base64
            import re

            raw_b64 = str(payment['qr_image_base64']).strip()
            mime = str(payment.get('qr_image_mime') or 'image/jpeg').strip().lower()
            match = re.match(
                r'^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$',
                raw_b64,
                flags=re.DOTALL,
            )
            if match:
                mime = match.group(1).lower()
                raw_b64 = match.group(2)
            raw_b64 = re.sub(r'\s+', '', raw_b64)
            try:
                data = base64.b64decode(raw_b64, validate=False)
            except Exception as e:  # noqa: BLE001
                raise ValueError('Invalid QR image data') from e
            if not data:
                raise ValueError('Empty QR image')
            if len(data) > 2 * 1024 * 1024:
                raise ValueError('Image too large (max 2 MB)')
            if mime == 'image/jpg':
                mime = 'image/jpeg'
            if mime not in {
                'image/jpeg',
                'image/png',
                'image/webp',
                'image/gif',
            }:
                raise ValueError('Upload a JPG, PNG, WEBP, or GIF image')
            row.payment_qr_image_b64 = base64.b64encode(data).decode('ascii')
            row.payment_qr_image_mime = mime

    if contact is not None:
        row.contact_company_name = contact.get(
            'company_name',
            row.contact_company_name,
        ).strip()
        row.contact_email = contact.get('email', row.contact_email).strip()
        row.contact_whatsapp = contact.get('whatsapp', row.contact_whatsapp).strip()
        row.contact_whatsapp_url = contact.get(
            'whatsapp_url',
            row.contact_whatsapp_url,
        ).strip()
        fb = contact.get('facebook_url')
        if fb is not None:
            row.contact_facebook_url = fb.strip()
        tt = contact.get('tiktok_url')
        if tt is not None:
            row.contact_tiktok_url = tt.strip()

    row.updated_at = datetime.now(UTC)
    await db.flush()
    return row
