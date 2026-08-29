from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

import httpx

log = logging.getLogger('push.sharehub_offerings')

DATA_BASE = 'https://sharehubnepal.com/data/api/v1'
OFFERING_TYPES = ('Ipo', 'Fpo', 'Right')
MAX_PAGES = 5


@dataclass(frozen=True)
class SharehubOffering:
    sharehub_id: int
    symbol: str
    name: str
    offering_type: str
    status: str
    opening_date: date | None
    closing_date: date | None
    extended_closing_date: date | None
    match_key: str
    slug: str | None = None


def _slug(raw: str | None) -> str:
    return re.sub(r'[^a-z0-9]', '', (raw or '').lower())


def _audience_key(raw: str | None) -> str:
    key = _slug(raw)
    if key.startswith('reserved'):
        key = key[len('reserved') :]
    if key.startswith('for'):
        key = key[len('for') :]
    return key or 'generalpublic'


def build_match_key(
    *,
    name: str,
    symbol: str | None,
    audience: str | None,
) -> str:
    name_part = _slug(name)
    symbol_part = _slug(symbol)
    audience_part = _audience_key(audience)
    return f'{name_part}|{symbol_part}|{audience_part}'


def _parse_date(raw: Any) -> date | None:
    if raw is None:
        return None
    text = str(raw).strip()[:10]
    if len(text) < 10:
        return None
    try:
        return datetime.strptime(text, '%Y-%m-%d').date()
    except ValueError:
        return None


def _normalize_row(raw: dict[str, Any], offering_type: str) -> SharehubOffering | None:
    sharehub_id = int(raw.get('id') or 0)
    if sharehub_id <= 0:
        return None
    name = str(raw.get('name') or '').strip()
    symbol = str(raw.get('symbol') or '').strip()
    audience = str(raw.get('for') or raw.get('audience') or '').strip() or None
    if not name and not symbol:
        return None
    return SharehubOffering(
        sharehub_id=sharehub_id,
        symbol=symbol,
        name=name,
        offering_type=offering_type,
        status=str(raw.get('status') or '').strip(),
        opening_date=_parse_date(raw.get('openingDate')),
        closing_date=_parse_date(raw.get('closingDate')),
        extended_closing_date=_parse_date(raw.get('extendedClosingDate')),
        match_key=build_match_key(name=name, symbol=symbol, audience=audience),
        slug=str(raw.get('slug')).strip() if raw.get('slug') else None,
    )


def effective_close(row: SharehubOffering) -> date | None:
    return row.extended_closing_date or row.closing_date


def is_offering_current(row: SharehubOffering, today: date) -> bool:
    if row.status == 'Closed':
        return False
    open_d = row.opening_date
    close_d = effective_close(row)
    if open_d and close_d:
        return open_d <= today <= close_d
    if row.status == 'Open':
        return True
    return False


def is_offering_closed(row: SharehubOffering, today: date) -> bool:
    if is_offering_current(row, today):
        return False
    if row.status == 'Closed':
        return True
    close_d = effective_close(row)
    return close_d is not None and close_d < today


def type_label(offering_type: str) -> str:
    labels = {
        'Ipo': 'IPO',
        'Fpo': 'FPO',
        'Right': 'Right Share',
        'MutualFund': 'Mutual Fund',
        'BondOrDebenture': 'Debenture',
    }
    return labels.get(offering_type, offering_type or 'IPO')


async def _fetch_page(
    client: httpx.AsyncClient,
    offering_type: str,
    page: int,
) -> tuple[list[SharehubOffering], int]:
    try:
        res = await client.get(
            f'{DATA_BASE}/public-offering',
            params={'type': offering_type, 'page': page},
            headers={'Accept': 'application/json'},
        )
        if res.status_code >= 400:
            return [], 1
        payload = res.json()
        data = payload.get('data') if isinstance(payload, dict) else None
        if not isinstance(data, dict):
            return [], 1
        total_pages = int(data.get('totalPages') or 1)
        content = data.get('content') or []
        rows: list[SharehubOffering] = []
        if isinstance(content, list):
            for raw in content:
                if isinstance(raw, dict):
                    row = _normalize_row(raw, offering_type)
                    if row is not None:
                        rows.append(row)
        return rows, max(1, total_pages)
    except Exception as exc:  # noqa: BLE001
        log.warning('ShareHub %s page %s failed: %s', offering_type, page, exc)
        return [], 1


async def fetch_sharehub_offerings(
    types: tuple[str, ...] = OFFERING_TYPES,
) -> list[SharehubOffering]:
    """Load recent public offerings from ShareHub (same feed as the mobile app)."""
    timeout = httpx.Timeout(25.0, connect=10.0)
    seen: set[tuple[str, int]] = set()
    out: list[SharehubOffering] = []

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        for offering_type in types:
            page = 1
            total_pages = 1
            while page <= min(total_pages, MAX_PAGES):
                rows, total_pages = await _fetch_page(client, offering_type, page)
                for row in rows:
                    key = (row.offering_type, row.sharehub_id)
                    if key in seen:
                        continue
                    seen.add(key)
                    out.append(row)
                page += 1

    return out
