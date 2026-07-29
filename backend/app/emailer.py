"""Send emails (OTP, subscription notices).

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

import html as html_lib
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
    settings = get_settings()
    body = (
        f'Your NEPSE GHAR admin verification code is: {otp}\n\n'
        f'This code expires in {settings.admin_otp_ttl_minutes} minutes.\n'
        'If you did not request this, ignore this email.'
    )
    _send_plain_email(
        to_email=to_email,
        subject='NEPSE GHAR Admin password reset code',
        body=body,
    )


def send_user_pin_otp(*, to_email: str, otp: str) -> None:
    settings = get_settings()
    body = (
        f'Your NEPSE GHAR PIN reset verification code is: {otp}\n\n'
        f'This code expires in {settings.admin_otp_ttl_minutes} minutes.\n'
        'If you did not request this, ignore this email.'
    )
    _send_plain_email(
        to_email=to_email,
        subject='NEPSE GHAR PIN reset code',
        body=body,
    )


def send_premium_expiry_reminder(
    *,
    to_email: str,
    name: str,
    days_left: int,
    expires_at_label: str,
) -> None:
    """Email user that premium expires in 1 or 2 days."""
    first = (name or '').strip().split(' ')[0] if (name or '').strip() else ''
    greeting = f'Hi {first},' if first else 'Hi,'
    if days_left <= 1:
        subject = 'NEPSE GHAR: Your subscription expires tomorrow'
        when = 'tomorrow'
    else:
        subject = f'NEPSE GHAR: Your subscription expires in {days_left} days'
        when = f'in {days_left} days'

    body = (
        f'{greeting}\n\n'
        f'Your NEPSE GHAR premium subscription is expiring {when} '
        f'({expires_at_label}).\n\n'
        'Please renew or subscribe again for uninterrupted service — '
        'bulk IPO apply, result checks, and your account limit stay active '
        'only while premium is valid.\n\n'
        'Open the NEPSE GHAR app → Profile / Subscription to renew.\n\n'
        'Thank you,\n'
        'NEPSE GHAR'
    )
    _send_plain_email(to_email=to_email, subject=subject, body=body)


def send_subscription_activated(
    *,
    to_email: str,
    name: str,
    plan_title: str,
    expires_at_label: str,
    max_accounts: int,
    logo_url: str | None = None,
    period: str = '',
    days: int | None = None,
    amount_npr: int | None = None,
    perks: list[str] | None = None,
) -> None:
    """Notify user that admin approved their subscription."""
    first = (name or '').strip().split(' ')[0] if (name or '').strip() else ''
    greeting = f'Hi {first},' if first else 'Hi,'
    if max_accounts >= 999_999:
        limit_label = 'Unlimited'
    else:
        limit_label = f'{max_accounts} accounts'

    period_label = (period or '').strip()
    if not period_label and days:
        period_label = f'{days} days'
    amount_label = f'Rs {int(amount_npr)}' if amount_npr and amount_npr > 0 else ''
    perk_lines = [p.strip() for p in (perks or []) if str(p).strip()]

    subject = 'NEPSE GHAR: Your subscription is now active'
    perk_text = ''
    if perk_lines:
        perk_text = 'Included benefits:\n' + ''.join(f'- {p}\n' for p in perk_lines) + '\n'

    body = (
        f'{greeting}\n\n'
        'Your NEPSE GHAR premium subscription has been approved and is now active.\n\n'
        f'Status: Active\n'
        f'Plan: {plan_title}\n'
        + (f'Duration: {period_label}\n' if period_label else '')
        + (f'Amount: {amount_label}\n' if amount_label else '')
        + f'Valid until: {expires_at_label}\n'
        f'MeroShare account limit: {limit_label}\n\n'
        f'{perk_text}'
        'Open the NEPSE GHAR app to use:\n'
        '- Bulk IPO apply across your MeroShare accounts\n'
        '- IPO result / allotment checks\n'
        '- Higher account limit and premium tools\n\n'
        'Thank you for choosing NEPSE GHAR.'
    )
    html = _subscription_activated_html(
        greeting=greeting,
        plan_title=plan_title,
        expires_at_label=expires_at_label,
        limit_label=limit_label,
        logo_url=logo_url,
        period_label=period_label,
        amount_label=amount_label,
        perk_lines=perk_lines,
    )
    _send_plain_email(to_email=to_email, subject=subject, body=body, html=html)


def _subscription_activated_html(
    *,
    greeting: str,
    plan_title: str,
    expires_at_label: str,
    limit_label: str,
    logo_url: str | None,
    period_label: str = '',
    amount_label: str = '',
    perk_lines: list[str] | None = None,
) -> str:
    # Logo palette: navy + growth green
    navy = '#0B2C5F'
    green = '#3D9B3C'
    green_dark = '#2E7D32'
    soft = '#F3F7F4'
    border = '#D5E2D8'
    muted = '#5A6B62'

    g = html_lib.escape(greeting)
    plan = html_lib.escape(plan_title)
    expires = html_lib.escape(expires_at_label or '—')
    limit = html_lib.escape(limit_label)
    period = html_lib.escape(period_label) if period_label else ''
    amount = html_lib.escape(amount_label) if amount_label else ''

    logo_block = ''
    if logo_url:
        safe_logo = html_lib.escape(logo_url, quote=True)
        logo_block = (
            f'<img src="{safe_logo}" width="96" height="96" alt="NEPSE GHAR" '
            'style="display:block;margin:0 auto 12px auto;border:0;'
            'background:#ffffff;border-radius:18px;padding:8px;" />'
        )

    detail_rows = [
        ('Status', 'Active'),
        ('Plan', plan),
    ]
    if period:
        detail_rows.append(('Duration', period))
    if amount:
        detail_rows.append(('Amount', amount))
    detail_rows.append(('Valid until', expires))
    detail_rows.append(('MeroShare account limit', limit))

    rows_html = ''
    for i, (label, value) in enumerate(detail_rows):
        bottom = f'border-bottom:1px solid {border};' if i < len(detail_rows) - 1 else ''
        rows_html += (
            f'<tr><td style="padding:14px 16px;{bottom}">'
            f'<div style="color:{muted};font-size:11px;font-weight:700;'
            f'text-transform:uppercase;letter-spacing:0.5px;">{html_lib.escape(label)}</div>'
            f'<div style="color:{navy};font-size:15px;font-weight:800;margin-top:4px;">{value}</div>'
            f'</td></tr>'
        )

    perks = perk_lines or []
    perks_html = ''
    if perks:
        items = ''.join(
            f'<li style="margin:0 0 8px 0;color:#243B2C;font-size:13px;line-height:1.45;">'
            f'{html_lib.escape(p)}</li>'
            for p in perks
        )
        perks_html = (
            f'<tr><td style="padding:8px 24px 4px 24px;">'
            f'<div style="color:{navy};font-size:13px;font-weight:800;margin-bottom:8px;">'
            f'What\'s included</div>'
            f'<ul style="margin:0;padding-left:18px;">{items}</ul>'
            f'</td></tr>'
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:{soft};font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{soft};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid {border};">
          <tr>
            <td style="background:{navy};padding:28px 24px;text-align:center;">
              {logo_block}
              <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.4px;">
                <span style="color:#ffffff;">NEPSE</span>
                <span style="color:{green};"> GHAR</span>
              </div>
              <div style="color:#A8C0DE;font-size:11px;margin-top:8px;font-weight:700;letter-spacing:1.2px;">
                INVEST · TRACK · GROW
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px 24px;">
              <div style="display:inline-block;background:#E8F5E9;color:{green_dark};font-size:12px;font-weight:800;padding:6px 12px;border-radius:999px;letter-spacing:0.4px;">
                SUBSCRIPTION ACTIVE
              </div>
              <p style="margin:18px 0 10px 0;color:{navy};font-size:16px;font-weight:700;">{g}</p>
              <p style="margin:0 0 18px 0;color:{muted};font-size:14px;line-height:1.55;">
                Your premium subscription request has been approved. Your account is active now —
                open the NEPSE GHAR app and start using premium features.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 8px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{soft};border:1px solid {border};border-radius:12px;">
                {rows_html}
              </table>
            </td>
          </tr>
          {perks_html}
          <tr>
            <td style="padding:16px 24px 8px 24px;">
              <div style="color:{navy};font-size:13px;font-weight:800;margin-bottom:8px;">You can now</div>
              <p style="margin:0;color:{muted};font-size:13px;line-height:1.6;">
                • Add more MeroShare accounts (up to your new limit)<br/>
                • Bulk apply for open IPOs<br/>
                • Check IPO results / allotment status in bulk<br/>
                • Use premium portfolio and market tools in the app
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px 28px 24px;">
              <p style="margin:0;color:{muted};font-size:12px;line-height:1.5;">
                Thank you for choosing <strong style="color:{navy};">NEPSE GHAR</strong>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _send_plain_email(
    *,
    to_email: str,
    subject: str,
    body: str,
    html: str | None = None,
) -> None:
    providers = _resolve_providers()
    if not providers:
        raise EmailNotConfiguredError(
            'Email is not configured. On Render set SENDGRID_API_KEY, RESEND_API_KEY, '
            'or BREVO_API_KEY. SMTP only works on VPS/local.'
        )

    last_error: Exception | None = None
    for provider in providers:
        try:
            if provider == 'sendgrid':
                _send_via_sendgrid(
                    to_email=to_email, subject=subject, body=body, html=html,
                )
            elif provider == 'brevo':
                _send_via_brevo(
                    to_email=to_email, subject=subject, body=body, html=html,
                )
            elif provider == 'resend':
                _send_via_resend(
                    to_email=to_email, subject=subject, body=body, html=html,
                )
            elif provider == 'smtp':
                _send_via_smtp(
                    to_email=to_email, subject=subject, body=body, html=html,
                )
            else:
                raise EmailNotConfiguredError(f'Unknown email provider: {provider}')
            if len(providers) > 1:
                log.info('Email sent via %s (fallback chain had %s)', provider, providers)
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


def _send_otp_email(*, to_email: str, otp: str, subject: str, intro: str) -> None:
    settings = get_settings()
    body = (
        f'{intro}: {otp}\n\n'
        f'This code expires in {settings.admin_otp_ttl_minutes} minutes.\n'
        'If you did not request this, ignore this email.'
    )
    _send_plain_email(to_email=to_email, subject=subject, body=body)


def _send_via_sendgrid(
    *,
    to_email: str,
    subject: str,
    body: str,
    html: str | None = None,
) -> None:
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
    content = [{'type': 'text/plain', 'value': body}]
    if html:
        content.append({'type': 'text/html', 'value': html})
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
            'content': content,
        },
        timeout=30.0,
    )
    if resp.status_code >= 400:
        detail = resp.text.strip()[:240] or resp.reason_phrase
        raise RuntimeError(f'SendGrid rejected email ({resp.status_code}): {detail}')

    log.info(
        'SendGrid email queued from=%s to=%s',
        from_email,
        _mask_email_for_log(recipient),
    )


def _send_via_brevo(
    *,
    to_email: str,
    subject: str,
    body: str,
    html: str | None = None,
) -> None:
    settings = get_settings()
    if not settings.brevo_api_key:
        raise EmailNotConfiguredError('BREVO_API_KEY is not set')

    sender = _sender_email()
    recipient = to_email.strip().lower()
    html_content = html or (
        '<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">'
        f'<p>{html_lib.escape(body).replace(chr(10), "<br/>")}</p>'
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
            'htmlContent': html_content,
            'tags': ['nepse-ghar'],
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
        'Brevo email queued from=%s to=%s messageId=%s',
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


def _send_via_resend(
    *,
    to_email: str,
    subject: str,
    body: str,
    html: str | None = None,
) -> None:
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

    payload: dict[str, object] = {
        'from': from_addr,
        'to': [recipient],
        'subject': subject,
        'text': body,
    }
    if html:
        payload['html'] = html

    resp = httpx.post(
        'https://api.resend.com/emails',
        headers={
            'Authorization': f'Bearer {settings.resend_api_key}',
            'Content-Type': 'application/json',
        },
        json=payload,
        timeout=30.0,
    )
    if resp.status_code >= 400:
        detail = resp.text.strip()[:240] or resp.reason_phrase
        raise RuntimeError(f'Resend rejected email ({resp.status_code}): {detail}')

    try:
        data = resp.json()
        message_id = data.get('id')
    except Exception:  # noqa: BLE001
        message_id = None
    log.info(
        'Resend email queued from=%s to=%s id=%s',
        from_addr,
        _mask_email_for_log(recipient),
        message_id or 'unknown',
    )


def _send_via_smtp(
    *,
    to_email: str,
    subject: str,
    body: str,
    html: str | None = None,
) -> None:
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
    if html:
        msg.add_alternative(html, subtype='html')

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        smtp.starttls()
        smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)
