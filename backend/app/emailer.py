"""Send OTP emails.

Render and many PaaS hosts block outbound SMTP. Use an HTTP provider there:

  SendGrid (good deliverability, free tier ~100/day):
    SENDGRID_API_KEY=SG....
    SENDGRID_FROM=noreply@yourdomain.com   # or verified single sender

  Resend (simple setup, free tier):
    RESEND_API_KEY=re_...
    RESEND_FROM=onboarding@resend.dev        # testing only (your signup email)
    RESEND_FROM=NEPSE GHAR <noreply@yourdomain.com>  # production

  Brevo (free 300/day; Gmail sender often lands in spam / deferred):
    BREVO_API_KEY=...
    SMTP_FROM=your.verified@gmail.com

  SMTP (VPS / local only — blocked on Render):
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=...
    SMTP_PASSWORD=...

Set EMAIL_PROVIDER=auto to try SendGrid → Resend → Brevo → SMTP (with fallback on failure).
For best Gmail delivery, verify your own domain on any provider above.
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

import httpx

from .config import get_settings

log = logging.getLogger('emailer')


class EmailNotConfiguredError(RuntimeError):
    pass


def smtp_configured() -> bool:
    s = get_settings()
    return bool(s.smtp_user and s.smtp_password and s.smtp_host)


def email_configured() -> bool:
    return bool(_resolve_providers())


def _sender_email() -> str:
    settings = get_settings()
    sender = (settings.smtp_from or settings.smtp_user or '').strip()
    if not sender:
        raise EmailNotConfiguredError(
            'Set SMTP_FROM (verified sender email) for OTP emails.'
        )
    return sender


def _provider_configured(name: str) -> bool:
    settings = get_settings()
    if name == 'sendgrid':
        return bool(settings.sendgrid_api_key) and bool(
            settings.sendgrid_from or settings.smtp_from or settings.smtp_user
        )
    if name == 'brevo':
        return bool(settings.brevo_api_key) and bool(settings.smtp_from or settings.smtp_user)
    if name == 'resend':
        return bool(settings.resend_api_key)
    if name == 'smtp':
        return smtp_configured()
    return False


def _resolve_providers() -> list[str]:
    settings = get_settings()
    forced = settings.email_provider.strip().lower()
    if forced and forced != 'auto':
        return [forced] if _provider_configured(forced) else []

    order = ('sendgrid', 'resend', 'brevo', 'smtp')
    configured = [name for name in order if _provider_configured(name)]
    return configured


def send_admin_otp(*, to_email: str, otp: str) -> None:
    _send_otp_email(
        to_email=to_email,
        otp=otp,
        subject='NEPSE GHAR Admin password reset code',
        intro='Your NEPSE GHAR admin verification code is',
    )


def send_user_pin_otp(*, to_email: str, otp: str) -> None:
    _send_otp_email(
        to_email=to_email,
        otp=otp,
        subject='NEPSE GHAR PIN reset code',
        intro='Your NEPSE GHAR PIN reset verification code is',
    )


def _send_otp_email(*, to_email: str, otp: str, subject: str, intro: str) -> None:
    settings = get_settings()
    providers = _resolve_providers()
    if not providers:
        raise EmailNotConfiguredError(
            'Email is not configured. On Render set SENDGRID_API_KEY, RESEND_API_KEY, '
            'or BREVO_API_KEY. SMTP only works on VPS/local.'
        )

    body = (
        f'{intro}: {otp}\n\n'
        f'This code expires in {settings.admin_otp_ttl_minutes} minutes.\n'
        'If you did not request this, ignore this email.'
    )

    last_error: Exception | None = None
    for provider in providers:
        try:
            if provider == 'sendgrid':
                _send_via_sendgrid(to_email=to_email, subject=subject, body=body)
            elif provider == 'brevo':
                _send_via_brevo(to_email=to_email, subject=subject, body=body)
            elif provider == 'resend':
                _send_via_resend(to_email=to_email, subject=subject, body=body)
            elif provider == 'smtp':
                _send_via_smtp(to_email=to_email, subject=subject, body=body)
            else:
                raise EmailNotConfiguredError(f'Unknown email provider: {provider}')
            if len(providers) > 1:
                log.info('OTP sent via %s (fallback chain had %s)', provider, providers)
            return
        except EmailNotConfiguredError:
            raise
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            log.warning('Email provider %s failed: %s', provider, exc)

    hint = ''
    if last_error and 'Network is unreachable' in str(last_error):
        hint = ' Render blocks SMTP — use SENDGRID_API_KEY or RESEND_API_KEY.'
    raise RuntimeError(
        f'Could not send email via {", ".join(providers)}: {last_error}.{hint}'
    ) from last_error


def _send_via_sendgrid(*, to_email: str, subject: str, body: str) -> None:
    settings = get_settings()
    if not settings.sendgrid_api_key:
        raise EmailNotConfiguredError('SENDGRID_API_KEY is not set')

    raw_from = (
        settings.sendgrid_from
        or settings.smtp_from
        or settings.smtp_user
        or ''
    ).strip()
    if not raw_from:
        raise EmailNotConfiguredError(
            'Set SENDGRID_FROM or SMTP_FROM to a verified SendGrid sender.'
        )
    from_email = raw_from
    from_name = 'NEPSE GHAR'
    if '<' in raw_from and raw_from.endswith('>'):
        from_name = raw_from.split('<', 1)[0].strip() or from_name
        from_email = raw_from.split('<', 1)[1].rstrip('>').strip()

    recipient = to_email.strip().lower()
    resp = httpx.post(
        'https://api.sendgrid.com/v3/mail/send',
        headers={
            'Authorization': f'Bearer {settings.sendgrid_api_key}',
            'Content-Type': 'application/json',
        },
        json={
            'personalizations': [{'to': [{'email': recipient}]}],
            'from': {'email': from_email, 'name': from_name},
            'subject': subject,
            'content': [{'type': 'text/plain', 'value': body}],
        },
        timeout=30.0,
    )
    if resp.status_code >= 400:
        detail = resp.text.strip()[:240] or resp.reason_phrase
        raise RuntimeError(f'SendGrid rejected email ({resp.status_code}): {detail}')

    log.info(
        'SendGrid OTP queued from=%s to=%s',
        from_email,
        _mask_email_for_log(recipient),
    )


def _send_via_brevo(*, to_email: str, subject: str, body: str) -> None:
    settings = get_settings()
    if not settings.brevo_api_key:
        raise EmailNotConfiguredError('BREVO_API_KEY is not set')

    sender = _sender_email()
    recipient = to_email.strip().lower()
    html = (
        '<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">'
        f'<p>{body.replace(chr(10), "<br/>")}</p>'
        '</div>'
    )
    resp = httpx.post(
        'https://api.brevo.com/v3/smtp/email',
        headers={
            'api-key': settings.brevo_api_key,
            'Content-Type': 'application/json',
            'accept': 'application/json',
        },
        json={
            'sender': {'name': 'NEPSE GHAR', 'email': sender},
            'replyTo': {'name': 'NEPSE GHAR', 'email': sender},
            'to': [{'email': recipient, 'name': recipient}],
            'subject': subject,
            'textContent': body,
            'htmlContent': html,
            'tags': ['otp', 'nepse-ghar'],
        },
        timeout=30.0,
    )
    if resp.status_code >= 400:
        detail = resp.text.strip()[:240] or resp.reason_phrase
        raise RuntimeError(f'Brevo rejected email ({resp.status_code}): {detail}')

    try:
        payload = resp.json()
        message_id = payload.get('messageId') or payload.get('messageIds')
    except Exception:  # noqa: BLE001
        message_id = None
    log.info(
        'Brevo OTP queued from=%s to=%s messageId=%s',
        sender,
        _mask_email_for_log(recipient),
        message_id or 'unknown',
    )


def _mask_email_for_log(email: str) -> str:
    if '@' not in email:
        return email
    local, domain = email.split('@', 1)
    if len(local) <= 2:
        masked = local[0] + '***'
    else:
        masked = local[0] + '***' + local[-1]
    return f'{masked}@{domain}'


def _send_via_resend(*, to_email: str, subject: str, body: str) -> None:
    settings = get_settings()
    if not settings.resend_api_key:
        raise EmailNotConfiguredError('RESEND_API_KEY is not set')

    raw_from = (
        settings.resend_from
        or settings.smtp_from
        or settings.smtp_user
        or 'onboarding@resend.dev'
    ).strip()
    from_addr = raw_from if '<' in raw_from else f'NEPSE GHAR <{raw_from}>'
    recipient = to_email.strip().lower()

    resp = httpx.post(
        'https://api.resend.com/emails',
        headers={
            'Authorization': f'Bearer {settings.resend_api_key}',
            'Content-Type': 'application/json',
        },
        json={
            'from': from_addr,
            'to': [recipient],
            'subject': subject,
            'text': body,
        },
        timeout=30.0,
    )
    if resp.status_code >= 400:
        detail = resp.text.strip()[:240] or resp.reason_phrase
        raise RuntimeError(f'Resend rejected email ({resp.status_code}): {detail}')

    try:
        payload = resp.json()
        message_id = payload.get('id')
    except Exception:  # noqa: BLE001
        message_id = None
    log.info(
        'Resend OTP queued from=%s to=%s id=%s',
        from_addr,
        _mask_email_for_log(recipient),
        message_id or 'unknown',
    )


def _send_via_smtp(*, to_email: str, subject: str, body: str) -> None:
    settings = get_settings()
    if not smtp_configured():
        raise EmailNotConfiguredError(
            'SMTP is not configured. Set SMTP_USER and SMTP_PASSWORD.'
        )

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = settings.smtp_from or settings.smtp_user
    msg['To'] = to_email
    msg.set_content(body)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        smtp.starttls()
        smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)
