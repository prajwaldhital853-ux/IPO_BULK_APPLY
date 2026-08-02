"""
Shared financial reports feed cache (Postgres).

Fans out ShareHub fundamental/values for the top market-cap symbols and stores
one JSON snapshot so every mobile client can read the same warm feed.
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from .broker_flow import KIND_FINANCIAL, get_snapshot, upsert_snapshot
from .config import get_settings

log = logging.getLogger('financial-reports')

DATA_BASE = 'https://sharehubnepal.com/data/api/v1'
ICON_CDN = 'https://sharehubnepal.com/'

_refresh_lock: asyncio.Lock | None = None


def _lock() -> asyncio.Lock:
    global _refresh_lock
    if _refresh_lock is None:
        _refresh_lock = asyncio.Lock()
    return _refresh_lock


def _icon_uri(path: str | None) -> str | None:
    if not path:
        return None
    if path.startswith('http'):
        return path
    return f"{ICON_CDN}{path.lstrip('/')}"


def _fmt_amt_short(n: float) -> str:
    abs_n = abs(n)
    if abs_n >= 1e9:
        return f'{n / 1e9:.2f}Ar'
    if abs_n >= 1e7:
        return f'{n / 1e7:.2f}Cr'
    if abs_n >= 1e5:
        return f'{n / 1e5:.2f}L'
    return f'{n:,.0f}'


def _format_fiscal_quarter(
    fy: str | None, quarter: str | None
) -> tuple[str, str]:
    """Return (title, quarterLabel) matching mobile formatFiscalQuarter."""
    fy_s = (fy or '').strip() or None
    q_raw = (quarter or '').strip().lower().lstrip('q')
    labels = {
        '1': '1st Quarter',
        '2': '2nd Quarter',
        '3': '3rd Quarter',
        '4': '4th Quarter',
    }
    q_label = labels.get(q_raw) or (
        (quarter or '').strip().upper() if (quarter or '').strip() else None
    )
    title = ' · '.join(
        p for p in (q_label, f'FY {fy_s}' if fy_s else None, 'Financial Report') if p
    )
    return title, q_label or ''


def _fund_num(values: list[dict[str, Any]], key: str) -> float | None:
    for v in values:
        if v.get('key') == key:
            try:
                n = float(v.get('value'))
            except (TypeError, ValueError):
                return None
            return n if n == n else None  # NaN check
    return None


def _qn(date_or_title: str) -> int:
    m = re.search(r'q([1-4])|([1-4])(?:st|nd|rd|th)', date_or_title.lower())
    if not m:
        return 0
    return int(m.group(1) or m.group(2))


async def _fetch_mini_screener(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    res = await client.get(
        f'{DATA_BASE}/security/mini-screener',
        headers={'Accept': 'application/json', 'Cache-Control': 'no-cache'},
    )
    res.raise_for_status()
    json = res.json()
    data = json.get('data') if isinstance(json, dict) else json
    if not isinstance(data, list):
        return []
    return [r for r in data if isinstance(r, dict)]


async def _fetch_fundamentals(
    client: httpx.AsyncClient,
    symbol: str,
) -> list[dict[str, Any]]:
    res = await client.get(
        f'{DATA_BASE}/fundamental/values/{symbol}',
        headers={'Accept': 'application/json', 'Cache-Control': 'no-cache'},
    )
    if res.status_code >= 400:
        return []
    json = res.json()
    data = json.get('data') if isinstance(json, dict) else None
    return data if isinstance(data, list) else []


async def build_financial_reports_payload(
    *,
    symbol_limit: int,
    concurrency: int,
) -> dict[str, Any]:
    timeout = httpx.Timeout(30.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        screener = await _fetch_mini_screener(client)
        symbols = [
            r
            for r in screener
            if (r.get('symbol') or '')
            and ' ' not in str(r.get('symbol'))
        ]
        symbols.sort(
            key=lambda r: (
                -(float(r.get('marketCap') or 0) or 0),
                -(float(r.get('turnover') or 0) or 0),
            )
        )
        symbols = symbols[: max(1, symbol_limit)]
        name_by_sym = {
            str(r.get('symbol', '')).upper(): r for r in symbols
        }

        sem = asyncio.Semaphore(max(1, concurrency))
        rows_out: list[dict[str, Any]] = []

        async def one(row: dict[str, Any]) -> list[dict[str, Any]]:
            sym = str(row.get('symbol', '')).upper()
            async with sem:
                try:
                    items = await _fetch_fundamentals(client, sym)
                except Exception:  # noqa: BLE001
                    return []
            out: list[dict[str, Any]] = []
            for item in items:
                values = item.get('values') if isinstance(item, dict) else None
                if not isinstance(values, list) or not values:
                    continue
                fy = item.get('fiscalYear')
                q = item.get('quarter')
                title, q_label = _format_fiscal_quarter(
                    str(fy) if fy is not None else None,
                    str(q) if q is not None else None,
                )
                eps = _fund_num(values, 'eps')
                if eps is None:
                    eps = _fund_num(values, 'eps_a')
                net_profit = _fund_num(values, 'net_profit')
                roe = _fund_num(values, 'roe')
                item_sym = str(item.get('symbol') or sym).upper()
                quote = name_by_sym.get(item_sym) or row
                details_parts = []
                if eps is not None:
                    details_parts.append(f'EPS {eps:.2f}')
                if net_profit is not None:
                    details_parts.append(f'NP {_fmt_amt_short(net_profit)}')
                if roe is not None:
                    details_parts.append(f'ROE {roe:.2f}%')
                try:
                    rid = int(item.get('id') or 0)
                except (TypeError, ValueError):
                    rid = 0
                out.append(
                    {
                        'id': rid or (len(out) + 1),
                        'symbol': item_sym,
                        'securityName': quote.get('securityName')
                        or quote.get('name')
                        or item_sym,
                        'title': title,
                        'date': f'FY {fy}' if fy else (q_label or ''),
                        'attachmentUrl': None,
                        'details': ' · '.join(details_parts),
                        'iconUrl': _icon_uri(
                            item.get('iconUrl') or quote.get('iconUrl')
                        ),
                    }
                )
            return out

        batches = await asyncio.gather(*(one(r) for r in symbols))
        for batch in batches:
            rows_out.extend(batch)

    rows_out.sort(
        key=lambda r: (
            r.get('date') or '',
            _qn(r.get('title') or ''),
        ),
        reverse=True,
    )

    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for r in rows_out:
        key = f"id:{r['id']}" if r.get('id') else f"{r['symbol']}:{r['title']}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(r)

    companies = {r['symbol'] for r in unique if r.get('symbol')}
    latest_fy = (unique[0].get('date') or '').replace('FY ', '') if unique else '—'
    return {
        'asOf': datetime.now(timezone.utc).isoformat(),
        'summary': [
            {'label': 'Reports', 'value': str(len(unique))},
            {'label': 'Companies', 'value': str(len(companies))},
            {'label': 'Latest FY', 'value': latest_fy or '—'},
        ],
        'rows': unique,
        'source': 'sharehub',
    }


async def refresh_financial_reports_cache(
    db: AsyncSession,
    *,
    force: bool = False,
) -> dict[str, Any]:
    settings = get_settings()
    existing = await get_snapshot(db, KIND_FINANCIAL)
    if (
        not force
        and existing
        and existing.payload_json
        and existing.payload_json != '{}'
        and existing.fetched_at
    ):
        age = (datetime.now(timezone.utc) - existing.fetched_at).total_seconds()
        if age < max(60, int(settings.financial_reports_refresh_seconds) // 2):
            return {
                'ok': True,
                'skipped': True,
                'reason': 'fresh',
                'rows': int(existing.trades_scanned or 0),
            }

    async with _lock():
        existing = await get_snapshot(db, KIND_FINANCIAL)
        try:
            payload = await build_financial_reports_payload(
                symbol_limit=int(settings.financial_reports_symbol_limit),
                concurrency=int(settings.financial_reports_concurrency),
            )
        except Exception as e:  # noqa: BLE001
            log.warning('Financial reports build failed: %s', e)
            return {
                'ok': False,
                'error': str(e),
                'keptCache': bool(existing and existing.payload_json),
            }

        rows = payload.get('rows') or []
        if not rows:
            return {
                'ok': False,
                'error': 'no_rows',
                'keptCache': bool(existing and existing.payload_json),
            }

        await upsert_snapshot(
            db,
            kind=KIND_FINANCIAL,
            payload=payload,
            session_date=(payload.get('asOf') or '')[:10],
            trades_scanned=len(rows),
            max_contract_id=0,
            source='sharehub',
        )
        await db.commit()
        log.info('Financial reports cache updated: rows=%s', len(rows))
        return {
            'ok': True,
            'skipped': False,
            'rows': len(rows),
            'asOf': payload.get('asOf'),
            'source': 'sharehub',
        }
