from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .admin.passwords import (
    generate_otp,
    hash_otp,
    hash_password,
    validate_admin_password,
    verify_otp,
    verify_password,
)
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


ADMIN_MAX_FAILED_LOGINS = 3
ADMIN_LOCK_MINUTES = 5


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def admin_lock_remaining_seconds(row: SiteSettings) -> int:
    """Deprecated global lock — kept for migration cleanup only."""
    locked_until = _as_utc(getattr(row, 'admin_login_locked_until', None))
    if locked_until is None:
        return 0
    remaining = int((locked_until - datetime.now(UTC)).total_seconds())
    return max(0, remaining)


async def attempt_admin_login(
    db: AsyncSession,
    email: str,
    password: str,
    *,
    client_key: str,
) -> tuple[bool, str | None]:
    """
    Verify admin credentials with per-IP / per-device rate limiting.

    A lock applies only to the failing client_key — other devices stay usable.
    Returns (ok, error_message). On success error_message is None.
    """
    from .admin.login_guard import (
        ADMIN_LOCK_MINUTES as LOCK_MINUTES,
        ADMIN_MAX_FAILED_LOGINS as MAX_FAILS,
        clear_attempts,
        prune_expired,
        record_failure,
        remaining_lock_seconds,
    )

    prune_expired()
    row = await get_or_create_settings(db)

    # Drop any legacy account-wide lock so it cannot block everyone.
    if getattr(row, 'admin_login_locked_until', None) is not None or int(
        getattr(row, 'admin_failed_login_count', 0) or 0,
    ):
        row.admin_login_locked_until = None
        row.admin_failed_login_count = 0
        row.updated_at = datetime.now(UTC)

    remaining = remaining_lock_seconds(client_key)
    if remaining > 0:
        mins = max(1, (remaining + 59) // 60)
        return (
            False,
            f'Too many failed login attempts from this device/network. '
            f'Try again in {mins} more minute(s). '
            f'Other devices are not affected.',
        )

    email_ok = email.strip().lower() == row.admin_email.strip().lower()
    password_ok = False
    if email_ok:
        if verify_password(password, row.admin_password_hash, pepper=_pepper()):
            password_ok = True
        else:
            # Recover when JWT_SECRET (password pepper) was rotated on Render
            configured = get_settings().admin_password
            if configured and password == configured:
                row.admin_password_hash = hash_password(password, pepper=_pepper())
                password_ok = True

    if email_ok and password_ok:
        clear_attempts(client_key)
        row.updated_at = datetime.now(UTC)
        await db.flush()
        return True, None

    # Any failed login from this device/IP counts toward lockout.
    used, lock_secs = record_failure(client_key)
    await db.flush()
    if lock_secs > 0:
        return (
            False,
            f'Too many failed login attempts from this device/network. '
            f'Try again in {LOCK_MINUTES} minutes. '
            f'Other devices are not affected.',
        )
    left = max(0, MAX_FAILS - used)
    return (
        False,
        f'Invalid admin email or password. {left} attempt(s) remaining '
        f'before a {LOCK_MINUTES}-minute lock on this device/network '
        f'({used}/{MAX_FAILS} used).',
    )


async def verify_admin_login(db: AsyncSession, email: str, password: str) -> bool:
    """Password check only (no lock counters) — used for change-password verify."""
    row = await get_or_create_settings(db)
    if email.strip().lower() != row.admin_email.strip().lower():
        return False
    if verify_password(password, row.admin_password_hash, pepper=_pepper()):
        return True

    configured = get_settings().admin_password
    if configured and password == configured:
        row.admin_password_hash = hash_password(password, pepper=_pepper())
        row.updated_at = datetime.now(UTC)
        await db.flush()
        return True
    return False


async def sync_admin_credentials_from_env(db: AsyncSession) -> None:
    """Keep DB admin email/password hash aligned with env after secret changes."""
    s = get_settings()
    row = await get_or_create_settings(db)
    changed = False
    email = s.admin_email.strip().lower()
    if email and row.admin_email.strip().lower() != email:
        row.admin_email = email
        changed = True
    if s.admin_password:
        if not verify_password(
            s.admin_password,
            row.admin_password_hash,
            pepper=_pepper(),
        ):
            row.admin_password_hash = hash_password(
                s.admin_password,
                pepper=_pepper(),
            )
            changed = True
    if changed:
        row.updated_at = datetime.now(UTC)
        await db.flush()


async def update_admin_password(db: AsyncSession, new_password: str) -> None:
    validate_admin_password(new_password)
    row = await get_or_create_settings(db)
    row.admin_password_hash = hash_password(new_password, pepper=_pepper())
    row.admin_failed_login_count = 0
    row.admin_login_locked_until = None
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


def _decode_uploaded_image(
    raw_b64: str,
    *,
    default_mime: str = 'image/jpeg',
    max_bytes: int = 4 * 1024 * 1024,
) -> tuple[str, str]:
    """Return (ascii_b64, mime) after validating an uploaded image payload."""
    import base64
    import re

    mime = default_mime.strip().lower()
    payload = raw_b64.strip()
    match = re.match(
        r'^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$',
        payload,
        flags=re.DOTALL,
    )
    if match:
        mime = match.group(1).lower()
        payload = match.group(2)
    payload = re.sub(r'\s+', '', payload)
    try:
        data = base64.b64decode(payload, validate=False)
    except Exception as e:  # noqa: BLE001
        raise ValueError('Invalid image data') from e
    if not data:
        raise ValueError('Empty image')
    if len(data) > max_bytes:
        raise ValueError(f'Image too large (max {max_bytes // (1024 * 1024)} MB)')
    if mime == 'image/jpg':
        mime = 'image/jpeg'
    if mime not in {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}:
        raise ValueError('Upload a JPG, PNG, WEBP, or GIF image')
    return base64.b64encode(data).decode('ascii'), mime


async def update_site_settings(
    db: AsyncSession,
    *,
    payment: dict[str, str] | None = None,
    contact: dict[str, str | None] | None = None,
    popup_notice: dict[str, str] | None = None,
    subscription_plans: list[dict] | None = None,
    app_logo: dict[str, str] | None = None,
    home_promo: dict[str, object] | None = None,
    home_promos: dict[str, object] | None = None,
    legal_pages: dict[str, object] | None = None,
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
            encoded, mime = _decode_uploaded_image(
                str(payment['qr_image_base64']),
                default_mime=str(payment.get('qr_image_mime') or 'image/jpeg'),
                max_bytes=2 * 1024 * 1024,
            )
            row.payment_qr_image_b64 = encoded
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
        if 'social_links' in contact:
            from .public_settings import serialize_social_links

            raw_links = contact.get('social_links') or []
            row.contact_social_links = serialize_social_links(raw_links)
            # Keep legacy columns in sync for older app builds
            fb_link = next(
                (
                    str(x.get('url') or '').strip()
                    for x in raw_links
                    if str(x.get('platform') or '').lower() == 'facebook'
                    and str(x.get('url') or '').strip()
                ),
                '',
            )
            tt_link = next(
                (
                    str(x.get('url') or '').strip()
                    for x in raw_links
                    if str(x.get('platform') or '').lower() == 'tiktok'
                    and str(x.get('url') or '').strip()
                ),
                '',
            )
            row.contact_facebook_url = fb_link or None
            row.contact_tiktok_url = tt_link or None

    if popup_notice is not None:
        from .public_settings import (
            _MAX_POPUP_NOTICES,
            load_popup_notice_items,
            serialize_popup_notices,
        )
        import uuid as _uuid

        if popup_notice.get('clear_all') or popup_notice.get('clear_image'):
            row.popup_notices_json = '[]'
            row.popup_notice_image_b64 = None
            row.popup_notice_image_mime = None
        elif popup_notice.get('delete_id'):
            delete_id = str(popup_notice['delete_id']).strip()
            items = [
                x
                for x in load_popup_notice_items(row)
                if x['id'] != delete_id
            ]
            row.popup_notices_json = serialize_popup_notices(items)
            if delete_id == 'legacy' or not items:
                row.popup_notice_image_b64 = None
                row.popup_notice_image_mime = None
        elif popup_notice.get('image_base64'):
            items = load_popup_notice_items(row)
            if len(items) >= _MAX_POPUP_NOTICES:
                raise ValueError(f'Maximum {_MAX_POPUP_NOTICES} notices allowed')
            encoded, mime = _decode_uploaded_image(
                str(popup_notice['image_base64']),
                default_mime=str(
                    popup_notice.get('image_mime') or 'image/jpeg',
                ),
                max_bytes=4 * 1024 * 1024,
            )
            items.append(
                {
                    'id': str(_uuid.uuid4()),
                    'kind': 'image',
                    'image_b64': encoded,
                    'mime': mime,
                }
            )
            row.popup_notices_json = serialize_popup_notices(items)
            # Clear legacy single slot once multi-list is in use.
            row.popup_notice_image_b64 = None
            row.popup_notice_image_mime = None
        elif popup_notice.get('text'):
            text = str(popup_notice['text']).strip()
            if not text:
                raise ValueError('Notice text is empty')
            if len(text) > 4000:
                raise ValueError('Notice text too long (max 4000 characters)')
            items = load_popup_notice_items(row)
            if len(items) >= _MAX_POPUP_NOTICES:
                raise ValueError(f'Maximum {_MAX_POPUP_NOTICES} notices allowed')
            items.append(
                {
                    'id': str(_uuid.uuid4()),
                    'kind': 'text',
                    'text': text,
                }
            )
            row.popup_notices_json = serialize_popup_notices(items)
            row.popup_notice_image_b64 = None
            row.popup_notice_image_mime = None

    if subscription_plans is not None:
        from .auth.subscription import _normalize_plan

        normalized: list[dict] = []
        for entry in subscription_plans:
            if not isinstance(entry, dict):
                continue
            norm = _normalize_plan(entry)
            if norm:
                normalized.append(norm)
        if not normalized:
            raise ValueError('At least one valid subscription plan is required')
        row.subscription_plans_json = json.dumps(normalized)

    if app_logo is not None:
        if app_logo.get('clear'):
            row.app_logo_b64 = None
            row.app_logo_mime = None
        elif app_logo.get('image_base64'):
            encoded, mime = _decode_uploaded_image(
                str(app_logo['image_base64']),
                default_mime=str(app_logo.get('image_mime') or 'image/png'),
                max_bytes=2 * 1024 * 1024,
            )
            row.app_logo_b64 = encoded
            row.app_logo_mime = mime

    if home_promo is not None or home_promos is not None:
        from .public_settings import (
            _ALLOWED_HOME_PROMO_ACTIONS,
            _DEFAULT_HOME_PROMO_TEXT,
            _HOME_PROMO_PAGE_KEYS,
            _normalize_hex_color,
            _normalize_promo_card,
            load_home_promo_pages,
        )
        import json as _json

        current = load_home_promo_pages(row)
        merged = {key: dict(current[key]) for key in _HOME_PROMO_PAGE_KEYS}

        # Legacy single-card update writes to the home page only.
        if home_promo is not None:
            home_merged = dict(merged['home'])
            if 'visible' in home_promo and home_promo['visible'] is not None:
                home_merged['visible'] = bool(home_promo['visible'])
            if 'text' in home_promo and home_promo['text'] is not None:
                text = str(home_promo['text']).strip()
                if len(text) > 512:
                    raise ValueError('Home promo text too long (max 512 characters)')
                home_merged['text'] = text or _DEFAULT_HOME_PROMO_TEXT
            if 'action' in home_promo and home_promo['action'] is not None:
                action = str(home_promo['action']).strip() or 'none'
                if action not in _ALLOWED_HOME_PROMO_ACTIONS:
                    raise ValueError(f'Invalid home promo action: {action}')
                home_merged['action'] = action
            if 'color' in home_promo and home_promo['color'] is not None:
                home_merged['color'] = _normalize_hex_color(str(home_promo['color']))
            merged['home'] = _normalize_promo_card(home_merged)

        if home_promos is not None and isinstance(home_promos, dict):
            for key in _HOME_PROMO_PAGE_KEYS:
                page_in = home_promos.get(key)
                if not isinstance(page_in, dict):
                    continue
                page_merged = dict(merged[key])
                if 'visible' in page_in and page_in['visible'] is not None:
                    page_merged['visible'] = bool(page_in['visible'])
                if 'text' in page_in and page_in['text'] is not None:
                    text = str(page_in['text']).strip()
                    if len(text) > 512:
                        raise ValueError(
                            f'Promo text too long on {key} (max 512 characters)'
                        )
                    page_merged['text'] = text or _DEFAULT_HOME_PROMO_TEXT
                if 'action' in page_in and page_in['action'] is not None:
                    action = str(page_in['action']).strip() or 'none'
                    if action not in _ALLOWED_HOME_PROMO_ACTIONS:
                        raise ValueError(f'Invalid promo action on {key}: {action}')
                    page_merged['action'] = action
                if 'color' in page_in and page_in['color'] is not None:
                    page_merged['color'] = _normalize_hex_color(str(page_in['color']))
                merged[key] = _normalize_promo_card(page_merged)

        row.home_promo_pages_json = _json.dumps(merged)
        # Keep legacy columns in sync with the home page card.
        home_card = merged['home']
        row.home_promo_visible = bool(home_card['visible'])
        row.home_promo_text = str(home_card['text'])
        row.home_promo_action = str(home_card['action'])
        row.home_promo_color = str(home_card['color'])

    if legal_pages is not None:
        from .legal_pages import load_legal_pages, normalize_legal_pages
        import json as _json

        current = load_legal_pages(row)
        merged = {
            'about': current['about'],
            'terms': current['terms'],
            'privacy': current['privacy'],
        }
        if isinstance(legal_pages.get('about'), dict):
            about_in = legal_pages['about']
            about_merged = dict(merged['about'])
            if about_in.get('tagline') is not None:
                about_merged['tagline'] = about_in['tagline']
            if about_in.get('whoWeAre') is not None:
                about_merged['whoWeAre'] = about_in['whoWeAre']
            if about_in.get('offerings') is not None:
                about_merged['offerings'] = about_in['offerings']
            merged['about'] = about_merged
        if isinstance(legal_pages.get('terms'), dict):
            terms_in = legal_pages['terms']
            terms_merged = dict(merged['terms'])
            if terms_in.get('intro') is not None:
                terms_merged['intro'] = terms_in['intro']
            if terms_in.get('sections') is not None:
                terms_merged['sections'] = terms_in['sections']
            merged['terms'] = terms_merged
        if isinstance(legal_pages.get('privacy'), dict):
            priv_in = legal_pages['privacy']
            priv_merged = dict(merged['privacy'])
            if priv_in.get('intro') is not None:
                priv_merged['intro'] = priv_in['intro']
            if priv_in.get('sections') is not None:
                priv_merged['sections'] = priv_in['sections']
            merged['privacy'] = priv_merged
        company = (row.contact_company_name or '').strip()
        normalized = normalize_legal_pages(merged, company_name=company)
        row.legal_pages_json = _json.dumps(normalized)

    row.updated_at = datetime.now(UTC)
    await db.flush()
    return row
