"""Default About / Terms / Privacy content for admin-editable pages."""

from __future__ import annotations

import json
from typing import Any

DEFAULT_ABOUT = {
    'tagline': 'NEPSE GHAR · Capital market tools',
    'whoWeAre': (
        'Kalash Financial Solution Pvt. Ltd. builds NEPSE GHAR to help Nepali '
        'investors manage MeroShare accounts, apply IPO in bulk, track live '
        'market data, and access research tools — all from one mobile app.'
    ),
    'offerings': [
        'Bulk & single MeroShare IPO apply',
        'Account expiry, portfolio & result checks',
        'Live NEPSE market, watchlist & share news',
        'Premium analytics for serious investors',
    ],
}

DEFAULT_TERMS = {
    'intro': 'Please read these terms carefully before using NEPSE GHAR.',
    'sections': [
        {
            'heading': '1. Acceptance of Terms',
            'body': (
                'By downloading, installing or using NEPSE GHAR you agree to '
                'these Terms & Conditions. If you do not agree, please stop using the app.'
            ),
        },
        {
            'heading': '2. What the app does',
            'body': (
                'NEPSE GHAR is a tool that helps you manage your MeroShare accounts, '
                'apply for IPO/FPO/rights in bulk, check application status and results, '
                'and view NEPSE market data. We are an independent tool and are not '
                'affiliated with, endorsed by, or operated by CDSC, MeroShare, or NEPSE.'
            ),
        },
        {
            'heading': '3. Your accounts & responsibility',
            'body': (
                'You are responsible for the MeroShare credentials (DP, username, '
                'password, CRN, transaction PIN) you add to the app and for every '
                'action performed using them, including IPO applications. Always '
                'verify company, quantity and amount before you confirm any application.'
            ),
        },
        {
            'heading': '4. No financial advice',
            'body': (
                'Market data, analytics and premium insights are provided for '
                'information only and are not investment advice. You are solely '
                'responsible for your investment decisions. Data may be delayed or inaccurate.'
            ),
        },
        {
            'heading': '5. Subscriptions',
            'body': (
                'Some features require a paid premium subscription. Prices and '
                'account limits are shown in the app. Premium is activated after '
                'your payment is verified. Fees are non-refundable except where required by law.'
            ),
        },
        {
            'heading': '6. Acceptable use',
            'body': (
                'You agree not to misuse the app, attempt to access other users’ '
                'data, reverse-engineer the app, or use it for any unlawful purpose.'
            ),
        },
        {
            'heading': '7. Availability & liability',
            'body': (
                'The app depends on third-party services (MeroShare/CDSC, NEPSE and '
                'our servers) that may be unavailable at times. We are not liable for '
                'missed IPO applications, allotment outcomes, losses, or downtime '
                'arising from such services or from your use of the app.'
            ),
        },
        {
            'heading': '8. Changes',
            'body': (
                'We may update these terms and app features from time to time. '
                'Continued use after changes means you accept the updated terms.'
            ),
        },
    ],
}

DEFAULT_PRIVACY = {
    'intro': 'This Privacy Policy explains how NEPSE GHAR handles your information.',
    'sections': [
        {
            'heading': '1. Information we handle',
            'body': (
                'To provide its features the app handles your MeroShare account details '
                '(DP, username, password, CRN, transaction PIN), your profile info '
                '(name, email) when you sign in, and app usage needed to operate features.'
            ),
        },
        {
            'heading': '2. Where your credentials are stored',
            'body': (
                'Your MeroShare passwords, CRN and transaction PIN are stored encrypted '
                'on your own device using the secure storage of your phone. They are used '
                'only to log in to MeroShare on your behalf to perform the actions you request.'
            ),
        },
        {
            'heading': '3. How we use data',
            'body': (
                'We use your data only to run the features you use — logging into MeroShare, '
                'applying for IPOs, checking status/results, showing market data, and '
                'managing your subscription. We do not sell your data.'
            ),
        },
        {
            'heading': '4. Account & payment',
            'body': (
                'When you sign in with Google we receive your basic profile (name, email, '
                'avatar) to create your account. Premium payment screenshots you share for '
                'verification are used only to activate your subscription.'
            ),
        },
        {
            'heading': '5. Third-party services',
            'body': (
                'The app communicates with MeroShare/CDSC and NEPSE data sources to fetch '
                'and submit information you request, and with our servers for authentication '
                'and subscription. Their handling of data is governed by their own policies.'
            ),
        },
        {
            'heading': '6. Data retention & deletion',
            'body': (
                'Account credentials remain on your device until you remove the account or '
                'uninstall the app. You can delete your profile at any time from Profile → '
                'Delete account, which removes your server profile and local data.'
            ),
        },
        {
            'heading': '7. Security',
            'body': (
                'We use device secure storage and encrypted connections. However, no method '
                'is 100% secure. Keep your device protected with a screen lock and the in-app PIN.'
            ),
        },
        {
            'heading': '8. Contact',
            'body': (
                'For any privacy question, contact us from Profile → Connect With Us '
                '(email or WhatsApp).'
            ),
        },
    ],
}


def default_legal_pages() -> dict[str, Any]:
    return {
        'about': dict(DEFAULT_ABOUT),
        'terms': {
            'intro': DEFAULT_TERMS['intro'],
            'sections': [dict(s) for s in DEFAULT_TERMS['sections']],
        },
        'privacy': {
            'intro': DEFAULT_PRIVACY['intro'],
            'sections': [dict(s) for s in DEFAULT_PRIVACY['sections']],
        },
    }


def _normalize_sections(raw: Any) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, str]] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        heading = str(entry.get('heading') or '').strip()
        body = str(entry.get('body') or '').strip()
        if not heading and not body:
            continue
        if len(heading) > 200:
            heading = heading[:200]
        if len(body) > 8000:
            body = body[:8000]
        out.append({'heading': heading or 'Section', 'body': body})
    return out[:40]


def _normalize_about(raw: Any, company_name: str = '') -> dict[str, Any]:
    base = dict(DEFAULT_ABOUT)
    if not isinstance(raw, dict):
        who = base['whoWeAre']
        if company_name:
            who = who.replace('Kalash Financial Solution Pvt. Ltd.', company_name)
        return {
            'tagline': base['tagline'],
            'whoWeAre': who,
            'offerings': list(base['offerings']),
        }
    tagline = str(raw.get('tagline') or base['tagline']).strip()[:300]
    who = str(raw.get('whoWeAre') or raw.get('who_we_are') or base['whoWeAre']).strip()
    if len(who) > 8000:
        who = who[:8000]
    offerings_raw = raw.get('offerings')
    offerings: list[str] = []
    if isinstance(offerings_raw, list):
        for item in offerings_raw:
            s = str(item).strip()
            if s:
                offerings.append(s[:300])
    if not offerings:
        offerings = list(base['offerings'])
    return {
        'tagline': tagline or base['tagline'],
        'whoWeAre': who or base['whoWeAre'],
        'offerings': offerings[:20],
    }


def _normalize_doc(raw: Any, fallback: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {
            'intro': fallback['intro'],
            'sections': [dict(s) for s in fallback['sections']],
        }
    intro = str(raw.get('intro') or fallback['intro']).strip()[:1000]
    sections = _normalize_sections(raw.get('sections'))
    if not sections:
        sections = [dict(s) for s in fallback['sections']]
    return {'intro': intro or fallback['intro'], 'sections': sections}


def normalize_legal_pages(
    raw: Any,
    *,
    company_name: str = '',
) -> dict[str, Any]:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            raw = {}
    if not isinstance(raw, dict):
        raw = {}
    return {
        'about': _normalize_about(raw.get('about'), company_name=company_name),
        'terms': _normalize_doc(raw.get('terms'), DEFAULT_TERMS),
        'privacy': _normalize_doc(raw.get('privacy'), DEFAULT_PRIVACY),
    }


def load_legal_pages(row: Any) -> dict[str, Any]:
    company = ''
    try:
        company = str(getattr(row, 'contact_company_name', '') or '').strip()
    except Exception:
        company = ''
    raw = getattr(row, 'legal_pages_json', None) or '{}'
    return normalize_legal_pages(raw, company_name=company)
