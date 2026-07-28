from __future__ import annotations

import json
import uuid

from .admin.schemas import (
    AboutPageOut,
    ContactSettingsOut,
    HomePromoSettingsOut,
    LegalDocOut,
    LegalPagesOut,
    LegalSectionOut,
    PaymentSettingsOut,
    PopupNoticeItemOut,
    PopupNoticesOut,
    PublicAppSettingsOut,
    SocialLinkOut,
    SubscriptionPlanOut,
)
from .auth.subscription import load_subscription_plans
from .db.models import SiteSettings
from .legal_pages import load_legal_pages

_MAX_POPUP_NOTICES = 10


def payment_qr_public_path(row: SiteSettings) -> str | None:
    if row.payment_qr_image_b64:
        stamp = int(row.updated_at.timestamp()) if row.updated_at else 0
        return f'/app/payment-qr?v={stamp}'
    return None


def _notice_stamp(row: SiteSettings) -> int:
    return int(row.updated_at.timestamp()) if row.updated_at else 0


def load_popup_notice_items(row: SiteSettings) -> list[dict]:
    """Return raw notice dicts [{id, kind, image_b64?, mime?, text?}, ...]."""
    raw = getattr(row, 'popup_notices_json', None) or '[]'
    items: list[dict] = []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            for entry in data:
                if not isinstance(entry, dict):
                    continue
                nid = str(entry.get('id') or '').strip()
                if not nid:
                    continue
                text = str(entry.get('text') or '').strip()
                b64 = str(entry.get('image_b64') or '').strip()
                kind = str(entry.get('kind') or ('text' if text and not b64 else 'image'))
                if kind == 'text':
                    if not text:
                        continue
                    items.append({'id': nid, 'kind': 'text', 'text': text})
                else:
                    if not b64:
                        continue
                    items.append(
                        {
                            'id': nid,
                            'kind': 'image',
                            'image_b64': b64,
                            'mime': str(entry.get('mime') or 'image/jpeg'),
                        }
                    )
    except json.JSONDecodeError:
        items = []

    # Migrate legacy single-image columns into the list when JSON is empty.
    legacy_b64 = getattr(row, 'popup_notice_image_b64', None)
    if not items and legacy_b64:
        items.append(
            {
                'id': 'legacy',
                'kind': 'image',
                'image_b64': legacy_b64,
                'mime': getattr(row, 'popup_notice_image_mime', None) or 'image/jpeg',
            }
        )
    return items


def serialize_popup_notices(items: list[dict]) -> str:
    payload = []
    for entry in items:
        nid = str(entry.get('id') or '').strip() or str(uuid.uuid4())
        kind = str(entry.get('kind') or 'image')
        text = str(entry.get('text') or '').strip()
        b64 = str(entry.get('image_b64') or '').strip()
        if kind == 'text':
            if not text:
                continue
            payload.append({'id': nid, 'kind': 'text', 'text': text})
            continue
        if not b64:
            continue
        payload.append(
            {
                'id': nid,
                'kind': 'image',
                'image_b64': b64,
                'mime': str(entry.get('mime') or 'image/jpeg'),
            }
        )
    return json.dumps(payload)


def find_popup_notice(row: SiteSettings, notice_id: str) -> dict | None:
    for item in load_popup_notice_items(row):
        if item['id'] == notice_id:
            return item
    return None


def popup_notice_item_path(row: SiteSettings, notice_id: str) -> str:
    return f'/app/popup-notice/{notice_id}?v={_notice_stamp(row)}'


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
    seen: set[str] = set()
    for index, item in enumerate(data):
        if not isinstance(item, dict):
            continue
        url = str(item.get('url') or '').strip()
        platform = str(item.get('platform') or 'custom').strip().lower() or 'custom'
        label = str(item.get('label') or platform).strip() or platform.title()
        if not url and not label:
            continue
        sid = str(item.get('id') or '').strip() or str(uuid.uuid4())
        if sid in seen:
            sid = str(uuid.uuid4())
        seen.add(sid)
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
    seen: set[str] = set()
    for index, item in enumerate(links):
        if isinstance(item, SocialLinkOut):
            sid = (item.id or '').strip()
            platform = item.platform
            label = item.label
            detail = item.detail
            url = item.url
        else:
            sid = str(item.get('id') or '').strip()
            platform = str(item.get('platform') or 'custom').strip().lower()
            label = str(item.get('label') or 'Link').strip()
            detail = str(item.get('detail') or '').strip()
            url = str(item.get('url') or '').strip()
        if not sid or sid in seen:
            sid = str(uuid.uuid4())
        seen.add(sid)
        payload.append(
            {
                'id': sid,
                'platform': platform or 'custom',
                'label': label or 'Link',
                'detail': detail,
                'url': url,
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


def _popup_notice_out(row: SiteSettings) -> PopupNoticesOut:
    items: list[PopupNoticeItemOut] = []
    for item in load_popup_notice_items(row):
        kind = str(item.get('kind') or 'image')
        if kind == 'text':
            items.append(
                PopupNoticeItemOut(
                    id=item['id'],
                    imageUrl=None,
                    text=str(item.get('text') or ''),
                    kind='text',
                )
            )
        else:
            items.append(
                PopupNoticeItemOut(
                    id=item['id'],
                    imageUrl=popup_notice_item_path(row, item['id']),
                    text=None,
                    kind='image',
                )
            )
    return PopupNoticesOut(items=items)


def app_logo_public_path(row: SiteSettings) -> str | None:
    if getattr(row, 'app_logo_b64', None):
        stamp = int(row.updated_at.timestamp()) if row.updated_at else 0
        return f'/app/logo?v={stamp}'
    return None


_DEFAULT_HOME_PROMO_TEXT = (
    'Add your MeroShare account to bulk apply for IPOs — '
    'tap here to get started'
)

_ALLOWED_HOME_PROMO_ACTIONS = frozenset(
    {
        'none',
        'AddCapital',
        'Subscription',
        'Apply',
        'Services',
        'Profile',
        'BulkPortfolio',
        'PublicIpoResult',
        'Portfolio',
        'Watchlist',
        'NepseData',
        'IpoBulkStatus',
        'CurrentIpoStatus',
        'NepseCalendar',
    }
)


def _home_promo_out(row: SiteSettings) -> HomePromoSettingsOut:
    text = (getattr(row, 'home_promo_text', None) or '').strip()
    action = (getattr(row, 'home_promo_action', None) or 'AddCapital').strip()
    if action not in _ALLOWED_HOME_PROMO_ACTIONS:
        action = 'AddCapital'
    visible = bool(getattr(row, 'home_promo_visible', True))
    return HomePromoSettingsOut(
        visible=visible,
        text=text or _DEFAULT_HOME_PROMO_TEXT,
        action=action,
    )


def _subscription_plans_out(row: SiteSettings) -> list[SubscriptionPlanOut]:
    plans = load_subscription_plans(row)
    return [
        SubscriptionPlanOut(
            id=str(p['id']),
            title=str(p['title']),
            priceLabel=str(p['priceLabel']),
            amountNpr=int(p['amountNpr']),  # type: ignore[arg-type]
            period=str(p['period']),
            days=int(p['days']),  # type: ignore[arg-type]
            maxAccounts=int(p['maxAccounts']),  # type: ignore[arg-type]
            perks=[str(x) for x in (p.get('perks') or [])],
        )
        for p in plans
    ]


def _legal_pages_out(row: SiteSettings) -> LegalPagesOut:
    data = load_legal_pages(row)
    about = data['about']
    terms = data['terms']
    privacy = data['privacy']
    return LegalPagesOut(
        about=AboutPageOut(
            tagline=str(about.get('tagline') or ''),
            whoWeAre=str(about.get('whoWeAre') or ''),
            offerings=[str(x) for x in (about.get('offerings') or [])],
        ),
        terms=LegalDocOut(
            intro=str(terms.get('intro') or ''),
            sections=[
                LegalSectionOut(
                    heading=str(s.get('heading') or ''),
                    body=str(s.get('body') or ''),
                )
                for s in (terms.get('sections') or [])
            ],
        ),
        privacy=LegalDocOut(
            intro=str(privacy.get('intro') or ''),
            sections=[
                LegalSectionOut(
                    heading=str(s.get('heading') or ''),
                    body=str(s.get('body') or ''),
                )
                for s in (privacy.get('sections') or [])
            ],
        ),
    )


def settings_to_public(row: SiteSettings) -> PublicAppSettingsOut:
    return PublicAppSettingsOut(
        payment=_payment_out(row),
        contact=_contact_out(row),
        popupNotice=_popup_notice_out(row),
        subscriptionPlans=_subscription_plans_out(row),
        appLogoUrl=app_logo_public_path(row),
        homePromo=_home_promo_out(row),
        legalPages=_legal_pages_out(row),
    )
