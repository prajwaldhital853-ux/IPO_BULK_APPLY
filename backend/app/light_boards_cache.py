"""
Shared light premium boards (Postgres) — ShareHub mini-screener derived.

Kinds:
  fifty-two-week-high | fifty-two-week-low | unlock-period | broker-favorites

Same broker_flow_snapshots table as Acc/Dis / financial-reports.
"""

from __future__ import annotations

import asyncio
import logging
import math
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from .broker_flow import get_snapshot, upsert_snapshot
from .config import get_settings

log = logging.getLogger('light-boards')

DATA_BASE = 'https://sharehubnepal.com/data/api/v1'
LIVE_V2 = 'https://sharehubnepal.com/live/api/v2'
ICON_CDN = 'https://sharehubnepal.com/'

KIND_52_HIGH = 'fifty-two-week-high'
KIND_52_LOW = 'fifty-two-week-low'
KIND_UNLOCK = 'unlock-period'
KIND_FAVORITES = 'broker-favorites'

LIGHT_KINDS = (KIND_52_HIGH, KIND_52_LOW, KIND_UNLOCK, KIND_FAVORITES)

_refresh_lock: asyncio.Lock | None = None


def _lock() -> asyncio.Lock:
    global _refresh_lock
    if _refresh_lock is None:
        _refresh_lock = asyncio.Lock()
    return _refresh_lock


def _num(v: Any) -> float | None:
    if v is None or v == '':
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def _str(v: Any) -> str:
    return '' if v is None else str(v)


def _icon_uri(path: str | None) -> str | None:
    if not path:
        return None
    if path.startswith('http'):
        return path
    return f"{ICON_CDN}{path.lstrip('/')}"


def _fmt_num(n: float | None, digits: int = 2) -> str:
    if n is None or not math.isfinite(n):
        return '—'
    return f'{n:,.{digits}f}'


def _fmt_mcap(n: float | None) -> str:
    if n is None or not math.isfinite(n):
        return '—'
    abs_n = abs(n)
    if abs_n >= 1e11:
        return f'{n / 1e11:.2f} Kharab'
    if abs_n >= 1e9:
        return f'{n / 1e9:.2f} Arab'
    if abs_n >= 1e7:
        return f'{n / 1e7:.2f} Cr'
    if abs_n >= 1e5:
        return f'{n / 1e5:.2f} Lakh'
    return f'{n:,.0f}'


def _fmt_rs(n: float | None) -> str:
    if n is None or not math.isfinite(n):
        return '—'
    return f'Rs {_fmt_num(n, 0)}'


def _nepal_today() -> str:
    # NEP is UTC+5:45
    from datetime import timedelta

    now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=45)
    return now.date().isoformat()


def _norm_screener_row(raw: dict[str, Any]) -> dict[str, Any] | None:
    symbol = _str(raw.get('symbol')).upper().strip()
    if not symbol or ' ' in symbol:
        return None
    return {
        'symbol': symbol,
        'name': _str(raw.get('securityName') or raw.get('name') or symbol),
        'ltp': _num(raw.get('lastTradedPrice') or raw.get('ltp')),
        'changePercent': _num(
            raw.get('percentageChange') or raw.get('changePercent')
        ),
        'volume': _num(raw.get('volume') or raw.get('totalTradeQuantity')),
        'turnover': _num(raw.get('turnover') or raw.get('totalTradeValue')),
        'marketCap': _num(raw.get('marketCap') or raw.get('marketCapitalization')),
        'sector': _str(raw.get('sectorName') or raw.get('sector')) or None,
        'fiftyTwoWeekHigh': _num(
            raw.get('fiftyTwoWeekHigh') or raw.get('high52') or raw.get('yearHigh')
        ),
        'fiftyTwoWeekLow': _num(
            raw.get('fiftyTwoWeekLow') or raw.get('low52') or raw.get('yearLow')
        ),
        'peRatio': _num(raw.get('peRatio') or raw.get('pe')),
        'pricePerBookValue': _num(
            raw.get('pricePerBookValue') or raw.get('pb') or raw.get('pbv')
        ),
        'iconUrl': _icon_uri(
            _str(raw.get('iconUrl') or raw.get('icon') or '') or None
        ),
    }


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
    out: list[dict[str, Any]] = []
    for raw in data:
        if not isinstance(raw, dict):
            continue
        row = _norm_screener_row(raw)
        if row:
            out.append(row)
    return out


async def _fetch_demand_symbols(client: httpx.AsyncClient) -> set[str]:
    try:
        res = await client.get(
            f'{LIVE_V2}/nepselive/home-page-data',
            headers={'Accept': 'application/json', 'Cache-Control': 'no-cache'},
        )
        if res.status_code >= 400:
            return set()
        json = res.json()
        demand = json.get('demand') if isinstance(json, dict) else None
        if not isinstance(demand, list):
            return set()
        out: set[str] = set()
        for item in demand:
            if isinstance(item, dict):
                sym = _str(item.get('symbol')).upper()
                if sym:
                    out.add(sym)
            elif isinstance(item, str) and item.strip():
                out.add(item.upper())
        return out
    except Exception:  # noqa: BLE001
        return set()


async def _fetch_top_turnover(client: httpx.AsyncClient) -> set[str]:
    try:
        res = await client.get(
            f'{LIVE_V2}/top-turnover',
            headers={'Accept': 'application/json', 'Cache-Control': 'no-cache'},
        )
        if res.status_code >= 400:
            return set()
        json = res.json()
        if not isinstance(json, list):
            data = json.get('data') if isinstance(json, dict) else None
            json = data if isinstance(data, list) else []
        out: set[str] = set()
        for item in json:
            if isinstance(item, dict):
                sym = _str(item.get('symbol')).upper()
                if sym:
                    out.add(sym)
        return out
    except Exception:  # noqa: BLE001
        return set()


async def _fetch_closed_ipo_days(client: httpx.AsyncClient) -> dict[str, int]:
    """symbol → days since closing (Closed IPOs within 400 days)."""
    recent: dict[str, int] = {}
    today = datetime.now(timezone.utc).date()
    page = 0
    total_pages = 1
    while page < total_pages and page < 8:
        try:
            res = await client.get(
                f'{DATA_BASE}/public-offering',
                params={'type': 'Ipo', 'page': page},
                headers={'Accept': 'application/json'},
            )
            if res.status_code >= 400:
                break
            json = res.json()
            data = json.get('data') if isinstance(json, dict) else None
            if not isinstance(data, dict):
                break
            total_pages = int(data.get('totalPages') or 1)
            content = data.get('content') or []
            if not isinstance(content, list):
                break
            for raw in content:
                if not isinstance(raw, dict):
                    continue
                status = _str(raw.get('status') or raw.get('issueStatus')).lower()
                # Mobile filters status === 'Closed'; allow close variants.
                if status and status not in ('closed', 'close'):
                    continue
                sym = _str(raw.get('symbol') or raw.get('scrip')).upper()
                if not sym:
                    continue
                closing = _str(
                    raw.get('closingDate')
                    or raw.get('closeDate')
                    or raw.get('endDate')
                )[:10]
                if len(closing) < 10:
                    continue
                try:
                    d = datetime.strptime(closing, '%Y-%m-%d').date()
                except ValueError:
                    continue
                days = (today - d).days
                if 0 <= days <= 400:
                    prev = recent.get(sym)
                    if prev is None or days < prev:
                        recent[sym] = days
            page += 1
        except Exception:  # noqa: BLE001
            break
    return recent


def build_52w_board(
    mini: list[dict[str, Any]],
    mode: str,
    *,
    as_of: str,
    limit: int,
) -> dict[str, Any]:
    rows_raw: list[dict[str, Any]] = []
    for s in mini:
        ltp = s.get('ltp')
        high = s.get('fiftyTwoWeekHigh')
        low = s.get('fiftyTwoWeekLow')
        if not ltp or not high or not low:
            continue
        pct_from_high = ((ltp - high) / high) * 100
        pct_from_low = ((ltp - low) / low) * 100
        if mode == 'high':
            if pct_from_high < -25:
                continue
        elif pct_from_low > 25:
            continue

        if mode == 'high':
            signal = (
                'At or breaking 52-week high zone'
                if pct_from_high >= -1
                else f'Within {abs(pct_from_high):.1f}% of 52W high'
            )
            tone = 'up' if pct_from_high >= 0 else 'neutral'
            from_label = 'From high'
            from_val = f"{'+' if pct_from_high >= 0 else ''}{pct_from_high:.2f}%"
        else:
            signal = (
                'At or breaking 52-week low zone'
                if pct_from_low <= 1
                else f'Within {abs(pct_from_low):.1f}% of 52W low'
            )
            tone = 'down' if pct_from_low <= 0 else 'neutral'
            from_label = 'From low'
            from_val = f"{'+' if pct_from_low >= 0 else ''}{pct_from_low:.2f}%"

        rows_raw.append(
            {
                'rank': 0,
                'symbol': s['symbol'],
                'name': s['name'],
                'ltp': ltp,
                'high52': high,
                'low52': low,
                'pctFromHigh': pct_from_high,
                'pctFromLow': pct_from_low,
                'changePct': s.get('changePercent'),
                'volume': s.get('volume'),
                'turnover': s.get('turnover'),
                'sector': s.get('sector'),
                'signal': signal,
                'metrics': [
                    {'label': '52W high', 'value': _fmt_num(high)},
                    {'label': '52W low', 'value': _fmt_num(low)},
                    {
                        'label': 'Range',
                        'value': f'{_fmt_num(low)} – {_fmt_num(high)}',
                    },
                    {'label': from_label, 'value': from_val, 'tone': tone},
                    {'label': 'Turnover', 'value': _fmt_rs(s.get('turnover'))},
                    {'label': 'Mcap', 'value': _fmt_mcap(s.get('marketCap'))},
                ],
            }
        )

    rows_raw.sort(
        key=lambda r: (
            -(r['pctFromHigh'] or 0) if mode == 'high' else (r['pctFromLow'] or 0)
        )
    )
    sorted_rows = rows_raw[:limit]
    for i, r in enumerate(sorted_rows, start=1):
        r['rank'] = i

    return {
        'rows': sorted_rows,
        'summary': [
            {'label': 'Universe', 'value': str(len(mini))},
            {'label': 'Matched', 'value': str(len(sorted_rows))},
            {
                'label': 'Mode',
                'value': 'Near 52W high' if mode == 'high' else 'Near 52W low',
            },
            {'label': 'As of', 'value': as_of},
        ],
        'asOf': as_of,
        'sourceNote': (
            'Uses live mini-screener LTP (not broker floorsheet). '
            'Rankings update with today’s prices even when Merolagani floorsheet lags.'
        ),
        'source': 'sharehub',
    }


def build_unlock_board(
    mini: list[dict[str, Any]],
    ipo_days: dict[str, int],
    *,
    as_of: str,
    limit: int,
) -> dict[str, Any]:
    picked: list[dict[str, Any]] = []
    for r in mini:
        ltp = r.get('ltp')
        if not r.get('symbol') or not ltp:
            continue
        sym = r['symbol']
        days = ipo_days.get(sym)
        low = r.get('fiftyTwoWeekLow')
        high = r.get('fiftyTwoWeekHigh')
        near_low = low is not None and low > 0 and (ltp - low) / low <= 0.15
        far_from_high = high is not None and high > 0 and (high - ltp) / high >= 0.25
        if days is None and not near_low and not far_from_high:
            continue

        pct_from_low = (
            ((ltp - low) / low) * 100 if low is not None and low > 0 else None
        )
        score = 0.0
        if days is not None:
            score += max(0, 180 - abs(days - 120)) / 10
        if pct_from_low is not None:
            score += max(0, 15 - pct_from_low)
        score += abs(r.get('changePercent') or 0) * 0.5

        tags = ['Unlock watch']
        if days is not None:
            tags.append(f'IPO {days}d ago')
        if pct_from_low is not None and pct_from_low <= 10:
            tags.append('Near 52w low')

        if days is not None:
            insight = f'Listed {days}d ago · LTP {_fmt_num(ltp)}'
        elif pct_from_low is not None:
            insight = f'{pct_from_low:.1f}% above 52w low'
        else:
            insight = f'Range reset · {_fmt_num(ltp)}'

        picked.append(
            {
                'symbol': r['symbol'],
                'name': r['name'],
                'ltp': ltp,
                'changePct': r.get('changePercent'),
                'volume': r.get('volume'),
                'turnover': r.get('turnover'),
                'mcap': r.get('marketCap'),
                'pe': r.get('peRatio'),
                'pb': r.get('pricePerBookValue'),
                'sector': r.get('sector'),
                'score': score,
                'insight': insight,
                'iconUrl': r.get('iconUrl'),
                'tags': tags,
            }
        )

    picked.sort(key=lambda x: -x['score'])
    ranked = []
    for i, row in enumerate(picked[:limit], start=1):
        ranked.append({**row, 'rank': i})

    adv = sum(1 for r in ranked if (r.get('changePct') or 0) > 0)
    avg_ch = (
        sum((r.get('changePct') or 0) for r in ranked) / len(ranked) if ranked else 0
    )
    return {
        'kind': KIND_UNLOCK,
        'title': 'Unlock Period',
        'subtitle': (
            'Recent listings & lock-up proximity — where supply events often '
            'create opportunity or risk.'
        ),
        'asOf': as_of,
        'summary': [
            {'label': 'Tracked', 'value': str(len(ranked))},
            {'label': 'Advancing', 'value': str(adv)},
            {
                'label': 'Avg chg',
                'value': f"{'+' if avg_ch >= 0 else ''}{avg_ch:.2f}%",
            },
            {'label': 'Recent IPOs', 'value': str(len(ipo_days))},
        ],
        'rows': ranked,
        'source': 'sharehub',
    }


def build_broker_favorites_board(
    mini: list[dict[str, Any]],
    demand: set[str],
    turnover: set[str],
    *,
    as_of: str,
    limit: int,
) -> dict[str, Any]:
    intel: list[dict[str, Any]] = []
    for s in mini:
        sym = s['symbol']
        ch = s.get('changePercent') or 0
        turn = s.get('turnover') or 0
        high = s.get('fiftyTwoWeekHigh')
        ltp = s.get('ltp') or 0
        near_high = bool(high and ltp and ltp / high >= 0.92)
        score = 0.0
        if sym in demand:
            score += 40
        if sym in turnover:
            score += 35
        if ch > 1:
            score += ch * 3
        if near_high:
            score += 25
        score += math.log10(max(turn, 1000))
        if score < 50:
            continue

        tags = ['Convergence']
        if sym in demand:
            tags.append('Demand')
        if sym in turnover:
            tags.append('Top turnover')
        if near_high:
            tags.append('52W zone')

        high_v = high
        low_v = s.get('fiftyTwoWeekLow')
        pct_high = (
            ((ltp - high_v) / high_v) * 100 if high_v and ltp else None
        )
        pct_low = ((ltp - low_v) / low_v) * 100 if low_v and ltp else None

        intel.append(
            {
                'rank': 0,
                'symbol': s['symbol'],
                'name': s['name'],
                'brokerCode': None,
                'brokerName': None,
                'iconUrl': s.get('iconUrl'),
                'sharePct': None,
                'ltp': s.get('ltp'),
                'changePct': s.get('changePercent'),
                'quantity': s.get('volume'),
                'amount': turn,
                'avgRate': s.get('ltp'),
                'netQty': None,
                'netAmount': None,
                'turnover': turn,
                'volume': s.get('volume'),
                'sector': s.get('sector'),
                'fiftyTwoWeekHigh': high_v,
                'fiftyTwoWeekLow': low_v,
                'pctFromHigh': pct_high,
                'pctFromLow': pct_low,
                'score': score,
                'signal': (
                    'Multi-signal institutional interest · broker favorite candidate'
                ),
                'metrics': [
                    {
                        'label': 'Amount',
                        'value': _fmt_rs(turn) if turn else '—',
                    },
                    {
                        'label': 'Qty',
                        'value': _fmt_num(s.get('volume'), 0),
                    },
                    {'label': 'Avg rate', 'value': _fmt_num(s.get('ltp'))},
                    {'label': 'LTP', 'value': _fmt_num(s.get('ltp'))},
                    {
                        'label': 'Change',
                        'value': (
                            f"{'+' if ch >= 0 else ''}{ch:.2f}%"
                            if s.get('changePercent') is not None
                            else '—'
                        ),
                        'tone': 'up' if ch >= 0 else 'down',
                    },
                    {'label': 'Score', 'value': f'{score:.0f}'},
                ],
                'tags': tags,
            }
        )

    intel.sort(key=lambda r: -r['score'])
    for i, r in enumerate(intel[:limit], start=1):
        r['rank'] = i
    trimmed = intel[:limit]

    return {
        'title': 'Broker Favorites',
        'subtitle': (
            'Stocks where demand, turnover, momentum and 52-week strength '
            'converge — smart-money watchlist.'
        ),
        'sessionDate': as_of,
        'tradesScanned': 0,
        'brokerBreakdown': False,
        'summary': [
            {'label': 'Demand board', 'value': str(len(demand))},
            {'label': 'Top turnover', 'value': str(len(turnover))},
            {'label': 'Candidates', 'value': str(len(trimmed))},
            {'label': 'Source', 'value': 'Live screener'},
        ],
        'rows': trimmed,
        'source': 'sharehub',
        'mobileKind': 'broker-favorites',
    }


async def build_all_light_boards(
    *,
    limit_52: int = 120,
    limit_unlock: int = 50,
    limit_fav: int = 60,
) -> dict[str, dict[str, Any]]:
    timeout = httpx.Timeout(30.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        mini, demand, turnover, ipo_days = await asyncio.gather(
            _fetch_mini_screener(client),
            _fetch_demand_symbols(client),
            _fetch_top_turnover(client),
            _fetch_closed_ipo_days(client),
        )
    as_of = _nepal_today()
    return {
        KIND_52_HIGH: build_52w_board(
            mini, 'high', as_of=as_of, limit=limit_52
        ),
        KIND_52_LOW: build_52w_board(mini, 'low', as_of=as_of, limit=limit_52),
        KIND_UNLOCK: build_unlock_board(
            mini, ipo_days, as_of=as_of, limit=limit_unlock
        ),
        KIND_FAVORITES: build_broker_favorites_board(
            mini, demand, turnover, as_of=as_of, limit=limit_fav
        ),
    }


async def _light_kinds_complete(db: AsyncSession) -> bool:
    for kind in LIGHT_KINDS:
        row = await get_snapshot(db, kind)
        if not row or not (row.payload_json or '').strip() or row.payload_json == '{}':
            return False
    return True


async def refresh_light_boards_cache(
    db: AsyncSession,
    *,
    force: bool = False,
) -> dict[str, Any]:
    settings = get_settings()
    existing = await get_snapshot(db, KIND_FAVORITES)
    if (
        not force
        and await _light_kinds_complete(db)
        and existing
        and existing.fetched_at
    ):
        age = (datetime.now(timezone.utc) - existing.fetched_at).total_seconds()
        ttl = max(60, int(settings.light_boards_refresh_seconds) // 2)
        if age < ttl:
            return {
                'ok': True,
                'skipped': True,
                'reason': 'fresh',
                'kinds': list(LIGHT_KINDS),
            }

    async with _lock():
        if not force and await _light_kinds_complete(db):
            existing = await get_snapshot(db, KIND_FAVORITES)
            if existing and existing.fetched_at:
                age = (
                    datetime.now(timezone.utc) - existing.fetched_at
                ).total_seconds()
                ttl = max(60, int(settings.light_boards_refresh_seconds) // 2)
                if age < ttl:
                    return {
                        'ok': True,
                        'skipped': True,
                        'reason': 'fresh',
                        'kinds': list(LIGHT_KINDS),
                    }

        try:
            boards = await build_all_light_boards(
                limit_52=int(settings.light_boards_52w_limit),
                limit_unlock=int(settings.light_boards_unlock_limit),
                limit_fav=int(settings.light_boards_favorites_limit),
            )
        except Exception as e:  # noqa: BLE001
            log.warning('Light boards build failed: %s', e)
            return {
                'ok': False,
                'error': str(e),
                'keptCache': bool(existing and existing.payload_json),
            }

        as_of = _nepal_today()
        for kind, payload in boards.items():
            rows = payload.get('rows') or []
            await upsert_snapshot(
                db,
                kind=kind,
                payload=payload,
                session_date=as_of,
                trades_scanned=len(rows),
                max_contract_id=0,
                source='sharehub',
            )
        await db.commit()
        log.info(
            'Light boards cache updated: kinds=%s',
            {k: len(v.get('rows') or []) for k, v in boards.items()},
        )
        return {
            'ok': True,
            'skipped': False,
            'kinds': list(boards.keys()),
            'counts': {k: len(v.get('rows') or []) for k, v in boards.items()},
            'source': 'sharehub',
        }
