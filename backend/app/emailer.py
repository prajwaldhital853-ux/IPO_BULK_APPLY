"""Send OTP emails.

Render and many PaaS hosts block outbound SMTP. Use an HTTP provider there:

  Brevo (recommended, free tier, verify Gmail as sender):
    BREVO_API_KEY=...
    SMTP_FROM=your.verified@gmail.com

  Resend:
    RESEND_API_KEY=...
    RESEND_FROM=onboarding@resend.dev

  SMTP (VPS / local only):
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=...
    SMTP_PASSWORD=...
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
    s = get_settings()
    if s.brevo_api_key:
        return bool(s.smtp_from or s.smtp_user)
    if s.resend_api_key:
        return bool(s.resend_from or s.smtp_from or s.smtp_user)
    return smtp_configured()


def _sender_email() -> str:
    settings = get_settings()
    sender = (settings.smtp_from or settings.smtp_user or '').strip()
    if not sender:
        raise EmailNotConfiguredError(
            'Set SMTP_FROM (verified sender email) for OTP emails.'
        )
    return sender


def _resolve_provider() -> str:
    settings = get_settings()
    forced = settings.email_provider.strip().lower()
    if forced and forced != 'auto':
        return forced
    if settings.brevo_api_key:
        return 'brevo'
    if settings.resend_api_key:
        return 'resend'
    if smtp_configured():
        return 'smtp'
    return ''


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
    provider = _resolve_provider()
    if not provider:
        raise EmailNotConfiguredError(
            'Email is not configured. On Render set BREVO_API_KEY (recommended) '
            'or RESEND_API_KEY. SMTP only works on VPS/local.'
        )

    body = (
        f'{intro}: {otp}\n\n'
        f'This code expires in {settings.admin_otp_ttl_minutes} minutes.\n'
        'If you did not request this, ignore this email.'
    )

    try:
        if provider == 'brevo':
            _send_via_brevo(to_email=to_email, subject=subject, body=body)
        elif provider == 'resend':
            _send_via_resend(to_email=to_email, subject=subject, body=body)
        elif provider == 'smtp':
            _send_via_smtp(to_email=to_email, subject=subject, body=body)
        else:
            raise EmailNotConfiguredError(f'Unknown email provider: {provider}')
    except EmailNotConfiguredError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.exception('Email send failed (%s)', provider)
        hint = ''
        if provider == 'smtp' and 'Network is unreachable' in str(exc):
            hint = ' Render blocks SMTP — set BREVO_API_KEY on the server.'
        raise RuntimeError(f'Could not send email: {exc}.{hint}') from exc


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

    resp = httpx.post(
        'https://api.resend.com/emails',
        headers={
            'Authorization': f'Bearer {settings.resend_api_key}',
            'Content-Type': 'application/json',
        },
        json={
            'from': from_addr,
            'to': [to_email],
            'subject': subject,
            'text': body,
        },
        timeout=30.0,
    )
    if resp.status_code >= 400:
        detail = resp.text.strip()[:240] or resp.reason_phrase
        raise RuntimeError(f'Resend rejected email ({resp.status_code}): {detail}')


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
