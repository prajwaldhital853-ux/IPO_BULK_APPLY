from __future__ import annotations

import json
import uuid

from .admin.schemas import (
    ContactSettingsOut,
    PaymentSettingsOut,
    PublicAppSettingsOut,
    SocialLinkOut,
)
from .db.models import SiteSettings


def payment_qr_public_path(row: SiteSettings) -> str | None:
    if row.payment_qr_image_b64:
        stamp = int(row.updated_at.timestamp()) if row.updated_at else 0
        return f'/app/payment-qr?v={stamp}'
    return None


def _payment_out(row: SiteSettings) -> PaymentSettingsOut:
    wa = row.payment_whatsapp.strip()
    wa_url = f'https://wa.me/{wa}' if wa else ''
    return PaymentSettingsOut(
        qrText=row.payment_qr_text,
        qrImageUrl=payment_qr_public_path(row),
        bankName=row.payment_bank_name,
        accountName=row.payment_account_name,
        accountNumber=row.payment_account_number,
        whatsapp=wa,
        whatsappUrl=wa_url,
    )


def parse_social_links(raw: str | None) -> list[SocialLinkOut]:
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[SocialLinkOut] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        url = str(item.get('url') or '').strip()
        platform = str(item.get('platform') or 'custom').strip().lower() or 'custom'
        label = str(item.get('label') or platform).strip() or platform.title()
        if not url and not label:
            continue
        sid = str(item.get('id') or '').strip() or str(uuid.uuid4())
        out.append(
            SocialLinkOut(
                id=sid,
                platform=platform,
                label=label,
                detail=str(item.get('detail') or '').strip(),
                url=url,
            )
        )
    return out


def social_links_with_legacy(row: SiteSettings) -> list[SocialLinkOut]:
    """Prefer JSON social links; fall back to legacy facebook/tiktok columns."""
    links = parse_social_links(getattr(row, 'contact_social_links', None))
    if links:
        return links
    legacy: list[SocialLinkOut] = []
    fb = (row.contact_facebook_url or '').strip()
    if fb:
        legacy.append(
            SocialLinkOut(
                id='legacy-facebook',
                platform='facebook',
                label='Facebook',
                detail='Open page',
                url=fb,
            )
        )
    tt = (row.contact_tiktok_url or '').strip()
    if tt:
        legacy.append(
            SocialLinkOut(
                id='legacy-tiktok',
                platform='tiktok',
                label='TikTok',
                detail=tt.replace('https://www.tiktok.com/', '@').replace(
                    'https://tiktok.com/',
                    '@',
                ),
                url=tt,
            )
        )
    return legacy


def serialize_social_links(links: list[dict] | list[SocialLinkOut]) -> str:
    payload = []
    for item in links:
        if isinstance(item, SocialLinkOut):
            payload.append(
                {
                    'id': item.id,
                    'platform': item.platform,
                    'label': item.label,
                    'detail': item.detail,
                    'url': item.url,
                }
            )
        else:
            payload.append(
                {
                    'id': str(item.get('id') or uuid.uuid4()),
                    'platform': str(item.get('platform') or 'custom').strip().lower(),
                    'label': str(item.get('label') or 'Link').strip(),
                    'detail': str(item.get('detail') or '').strip(),
                    'url': str(item.get('url') or '').strip(),
                }
            )
    return json.dumps(payload)


def _contact_out(row: SiteSettings) -> ContactSettingsOut:
    links = social_links_with_legacy(row)
    fb = next((l.url for l in links if l.platform == 'facebook'), None)
    tt = next((l.url for l in links if l.platform == 'tiktok'), None)
    return ContactSettingsOut(
        companyName=row.contact_company_name,
        email=row.contact_email,
        whatsapp=row.contact_whatsapp,
        whatsappUrl=row.contact_whatsapp_url,
        facebookUrl=fb or (row.contact_facebook_url or None),
        tiktokUrl=tt or (row.contact_tiktok_url or None),
        socialLinks=links,
    )


def settings_to_public(row: SiteSettings) -> PublicAppSettingsOut:
    return PublicAppSettingsOut(
        payment=_payment_out(row),
        contact=_contact_out(row),
    )
