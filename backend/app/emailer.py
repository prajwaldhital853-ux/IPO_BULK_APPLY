"""Send admin OTP email via Gmail SMTP (no custom domain required).

Set on Render:
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_USER=your.sender@gmail.com
  SMTP_PASSWORD=16-char-google-app-password
  SMTP_FROM=your.sender@gmail.com
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from .config import get_settings

log = logging.getLogger('emailer')


class EmailNotConfiguredError(RuntimeError):
    pass


def smtp_configured() -> bool:
    s = get_settings()
    return bool(s.smtp_user and s.smtp_password and s.smtp_host)


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
    if not smtp_configured():
        raise EmailNotConfiguredError(
            'SMTP is not configured. Set SMTP_USER and SMTP_PASSWORD (Gmail app password).'
        )

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = settings.smtp_from or settings.smtp_user
    msg['To'] = to_email
    msg.set_content(
        f'{intro}: {otp}\n\n'
        f'This code expires in {settings.admin_otp_ttl_minutes} minutes.\n'
        'If you did not request this, ignore this email.'
    )

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
            smtp.starttls()
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
    except Exception as exc:  # noqa: BLE001
        log.exception('SMTP send failed')
        raise RuntimeError(f'Could not send email: {exc}') from exc
