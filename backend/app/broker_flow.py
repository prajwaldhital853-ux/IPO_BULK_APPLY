"""
Shared Merolagani premium-board cache (Postgres).

Scrapes Merolagani floorsheet once on the server, builds Acc/Dis plus Phase 1
boards (top buy/sell, net holders/releases, aggressive, broker top), and stores
JSON snapshots so every mobile client can read the same warm cache.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .db.models import BrokerFlowSnapshot

log = logging.getLogger('broker-flow')

# One Merolagani scrape at a time — first visitor warms cache for everyone else.
_refresh_lock: asyncio.Lock | None = None


def _lock() -> asyncio.Lock:
    global _refresh_lock
    if _refresh_lock is None:
        _refresh_lock = asyncio.Lock()
    return _refresh_lock

MERO_FLOOR = 'https://merolagani.com/Floorsheet.aspx'
UA = (
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 '
    'Chrome/120 Mobile Safari/537.36'
)

KIND_ACC = 'accumulation'
KIND_DIST = 'distribution'
KIND_TOP_BUYERS = 'top-buyers'
KIND_TOP_SELLERS = 'top-sellers'
KIND_NET_HOLDERS = 'net-holders'
KIND_NET_RELEASES = 'net-releases'
KIND_AGGRESSIVE = 'aggressive-holders'
KIND_BROKER_TOP = 'broker-top-buy-sell'
KIND_FINANCIAL = 'financial-reports'
KIND_52_HIGH = 'fifty-two-week-high'
KIND_52_LOW = 'fifty-two-week-low'
KIND_UNLOCK = 'unlock-period'
KIND_FAVORITES = 'broker-favorites'

# Acc/Dis only (legacy helper for /premium/broker-flow both).
KINDS = (KIND_ACC, KIND_DIST)

LIGHT_KINDS = (KIND_52_HIGH, KIND_52_LOW, KIND_UNLOCK, KIND_FAVORITES)

# All Merolagani-derived boards written by refresh_broker_flow_cache.
MERO_KINDS = (
    KIND_ACC,
    KIND_DIST,
    KIND_TOP_BUYERS,
    KIND_TOP_SELLERS,
    KIND_NET_HOLDERS,
    KIND_NET_RELEASES,
    KIND_AGGRESSIVE,
    KIND_BROKER_TOP,
)

# Mobile Acc/Dis maps these to top-holders / top-releases.
KIND_TO_MOBILE = {
    KIND_ACC: 'top-holders',
    KIND_DIST: 'top-releases',
}

# Aliases accepted by GET /premium/broker-flow/{kind}
KIND_ALIASES: dict[str, str] = {
    'top-holders': KIND_ACC,
    'holders': KIND_ACC,
    'acc': KIND_ACC,
    'accumulation': KIND_ACC,
    'top-releases': KIND_DIST,
    'releases': KIND_DIST,
    'dist': KIND_DIST,
    'distribution': KIND_DIST,
    'top-buyers': KIND_TOP_BUYERS,
    'buyers': KIND_TOP_BUYERS,
    'top-sellers': KIND_TOP_SELLERS,
    'sellers': KIND_TOP_SELLERS,
    'net-holders': KIND_NET_HOLDERS,
    'table-holders': KIND_NET_HOLDERS,
    'net-releases': KIND_NET_RELEASES,
    'table-releases': KIND_NET_RELEASES,
    'aggressive-holders': KIND_AGGRESSIVE,
    'aggressive': KIND_AGGRESSIVE,
    'broker-top-buy-sell': KIND_BROKER_TOP,
    'broker-top': KIND_BROKER_TOP,
    'fifty-two-week-high': KIND_52_HIGH,
    '52w-high': KIND_52_HIGH,
    '52-week-high': KIND_52_HIGH,
    'fifty-two-week-low': KIND_52_LOW,
    '52w-low': KIND_52_LOW,
    '52-week-low': KIND_52_LOW,
    'unlock-period': KIND_UNLOCK,
    'unlock': KIND_UNLOCK,
    'broker-favorites': KIND_FAVORITES,
    'favorites': KIND_FAVORITES,
}


@dataclass
class FloorRow:
    contract_id: int
    symbol: str
    name: str
    buyer_broker: str
    seller_broker: str
    buyer_name: str | None
    seller_name: str | None
    rate: float
    quantity: float
    amount: float


def _num(v: str) -> float:
    try:
        return float(str(v).replace(',', ''))
    except (TypeError, ValueError):
        return 0.0


def _grab_field(html: str, name: str) -> str:
    esc = re.escape(name)
    m = re.search(
        rf'name="{esc}"[^>]*value="([^"]*)"|value="([^"]*)"[^>]*name="{esc}"',
        html,
        re.I,
    )
    if not m:
        return ''
    return m.group(1) or m.group(2) or ''


def parse_merolagani_rows(html: str) -> list[FloorRow]:
    rows: list[FloorRow] = []
    tbody = re.search(r'<tbody>([\s\S]*?)</tbody>', html, re.I)
    body = tbody.group(1) if tbody else html
    for part in re.split(r'</tr>', body, flags=re.I):
        if 'BrokerDetail' not in part and 'symbol=' not in part:
            continue
        contract_m = re.search(r'<td[^>]*>\s*(\d{12,})\s*</td>', part, re.I)
        if not contract_m:
            continue
        symbol_m = re.search(
            r"symbol=([A-Z0-9.]+)[^>]*(?:title='([^']*)')?[^>]*>\s*([A-Z0-9.]+)\s*<",
            part,
            re.I,
        )
        if not symbol_m:
            continue
        broker_ms = list(
            re.finditer(
                r"<a[^>]*title=['\"]([^'\"]*)['\"][^>]*href=['\"][^'\"]*BrokerDetail\.aspx\?code=(\d+)[^'\"]*['\"][^>]*>|"
                r"<a[^>]*href=['\"][^'\"]*BrokerDetail\.aspx\?code=(\d+)[^'\"]*['\"][^>]*title=['\"]([^'\"]*)['\"][^>]*>",
                part,
                re.I,
            )
        )
        if len(broker_ms) < 2:
            continue
        qty_m = re.search(
            r'</a>\s*</td>\s*<td[^>]*>\s*([\d,]+)\s*</td>\s*<td[^>]*>\s*([\d,.]+)\s*</td>\s*<td[^>]*>\s*([\d,.]+)\s*</td>',
            part,
            re.I,
        )
        quantity = rate = amount = 0.0
        if qty_m:
            quantity = _num(qty_m.group(1))
            rate = _num(qty_m.group(2))
            amount = _num(qty_m.group(3))
        else:
            nums = re.findall(r'<td[^>]*>\s*([\d,.]+)\s*</td>', part, re.I)
            if len(nums) >= 3:
                quantity = _num(nums[-3])
                rate = _num(nums[-2])
                amount = _num(nums[-1])

        b0, b1 = broker_ms[0], broker_ms[1]
        buyer_code = (b0.group(2) or b0.group(3) or '').strip()
        seller_code = (b1.group(2) or b1.group(3) or '').strip()
        buyer_name = (b0.group(1) or b0.group(4) or '').strip() or None
        seller_name = (b1.group(1) or b1.group(4) or '').strip() or None
        symbol = (symbol_m.group(3) or symbol_m.group(1) or '').upper()
        if not symbol or not buyer_code:
            continue
        rows.append(
            FloorRow(
                contract_id=int(contract_m.group(1)),
                symbol=symbol,
                name=(symbol_m.group(2) or symbol).strip(),
                buyer_broker=buyer_code,
                seller_broker=seller_code,
                buyer_name=buyer_name,
                seller_name=seller_name,
                rate=rate,
                quantity=quantity,
                amount=amount or quantity * rate,
            )
        )
    return rows


def _parse_as_of(html: str) -> str | None:
    m = re.search(r'As of\s+(\d{4})/(\d{2})/(\d{2})', html, re.I)
    if not m:
        return None
    return f'{m.group(1)}-{m.group(2)}-{m.group(3)}'


def _date_from_contract(contract_id: int) -> str | None:
    s = str(contract_id)
    if len(s) < 8 or not s[:8].isdigit():
        return None
    return f'{s[0:4]}-{s[4:6]}-{s[6:8]}'


def session_date_from_rows(rows: list[FloorRow], as_of: str | None) -> str | None:
    counts: dict[str, int] = {}
    for r in rows[:120]:
        d = _date_from_contract(r.contract_id)
        if not d:
            continue
        counts[d] = counts.get(d, 0) + 1
    if counts:
        return max(counts.items(), key=lambda kv: kv[1])[0]
    return as_of


def _norm_broker(code: str) -> str:
    return re.sub(r'\D', '', (code or '').strip())


def build_net_boards(
    rows: list[FloorRow],
    *,
    limit: int,
    session_date: str | None,
) -> dict[str, dict[str, Any]]:
    """Build accumulation + distribution snapshots (broker×symbol net)."""
    # key -> agg
    agg: dict[str, dict[str, Any]] = {}
    names: dict[str, str] = {}

    for r in rows:
        qty = r.quantity
        amt = r.amount
        if qty <= 0 and amt <= 0:
            continue
        for raw, is_buy in ((r.buyer_broker, True), (r.seller_broker, False)):
            broker = _norm_broker(raw)
            if not broker:
                continue
            if is_buy and r.buyer_name:
                names.setdefault(broker, r.buyer_name)
            if not is_buy and r.seller_name:
                names.setdefault(broker, r.seller_name)
            key = f'{r.symbol.upper()}|{broker}'
            cur = agg.get(key)
            if not cur:
                cur = {
                    'symbol': r.symbol.upper(),
                    'name': r.name,
                    'broker': broker,
                    'buyQty': 0.0,
                    'sellQty': 0.0,
                    'buyAmt': 0.0,
                    'sellAmt': 0.0,
                    'rateSum': 0.0,
                    'trades': 0,
                }
                agg[key] = cur
            if is_buy:
                cur['buyQty'] += qty
                cur['buyAmt'] += amt
            else:
                cur['sellQty'] += qty
                cur['sellAmt'] += amt
            cur['trades'] += 1
            cur['rateSum'] += r.rate

    def board(mode: str) -> dict[str, Any]:
        want_acc = mode == KIND_ACC
        intel: list[dict[str, Any]] = []
        for cur in agg.values():
            net_qty = cur['buyQty'] - cur['sellQty']
            net_amt = cur['buyAmt'] - cur['sellAmt']
            if want_acc and net_qty <= 0:
                continue
            if not want_acc and net_qty >= 0:
                continue
            side_total = cur['buyQty'] + cur['sellQty']
            share = 100
            if side_total > 0:
                side = cur['buyQty'] if want_acc else cur['sellQty']
                share = round((side / side_total) * 100)
            abs_qty = abs(net_qty)
            abs_amt = abs(net_amt)
            avg = cur['rateSum'] / cur['trades'] if cur['trades'] else None
            intel.append(
                {
                    'rank': 0,
                    'symbol': cur['symbol'],
                    'name': cur['name'],
                    'brokerCode': cur['broker'],
                    'brokerName': names.get(cur['broker']),
                    'iconUrl': None,
                    'sharePct': share,
                    'ltp': None,
                    'changePct': None,
                    'quantity': abs_qty,
                    'amount': abs_amt,
                    'avgRate': avg,
                    'netQty': net_qty,
                    'netAmount': net_amt,
                    'turnover': None,
                    'volume': None,
                    'sector': None,
                    'fiftyTwoWeekHigh': None,
                    'fiftyTwoWeekLow': None,
                    'pctFromHigh': None,
                    'pctFromLow': None,
                    'score': abs_amt * (1 + (abs_qty + 10) ** 0.5 / 10),
                    'signal': (
                        'Net accumulation on floorsheet'
                        if want_acc
                        else 'Net distribution on floorsheet'
                    ),
                    'metrics': [
                        {'label': 'Net qty', 'value': f'{net_qty:,.0f}'},
                        {'label': 'Buy', 'value': f'{cur["buyQty"]:,.0f}'},
                        {'label': 'Sell', 'value': f'{cur["sellQty"]:,.0f}'},
                    ],
                    'tags': [],
                }
            )

        intel.sort(key=lambda r: (-(r['score'] or 0), -(r['amount'] or 0)))
        for i, row in enumerate(intel[:limit], start=1):
            row['rank'] = i
        trimmed = intel[:limit]
        title = 'Broker Accumulation' if want_acc else 'Broker Distribution'
        return {
            'title': title,
            'subtitle': (
                'Net buyers still holding — buy qty minus sell qty on session floorsheet'
                if want_acc
                else 'Net sellers releasing — sell qty minus buy qty on session floorsheet'
            ),
            'sessionDate': session_date,
            'tradesScanned': len(rows),
            'brokerBreakdown': True,
            'summary': [
                {'label': 'Net positions', 'value': str(len(trimmed))},
                {'label': 'Trades scanned', 'value': str(len(rows))},
                {
                    'label': 'Mode',
                    'value': 'Accumulation' if want_acc else 'Distribution',
                },
            ],
            'rows': trimmed,
            'mobileKind': KIND_TO_MOBILE[mode],
            'source': 'merolagani',
        }

    return {KIND_ACC: board(KIND_ACC), KIND_DIST: board(KIND_DIST)}


async def _http_get(client: httpx.AsyncClient) -> str:
    res = await client.get(
        MERO_FLOOR,
        headers={
            'Accept': 'text/html',
            'User-Agent': UA,
            'Cache-Control': 'no-cache',
        },
    )
    res.raise_for_status()
    return res.text


async def _http_post_page(client: httpx.AsyncClient, html: str, page: int) -> str:
    data = {
        '__EVENTTARGET': 'ctl00$ContentPlaceHolder1$PagerControl1$btnPaging',
        '__EVENTARGUMENT': '',
        '__VIEWSTATE': _grab_field(html, '__VIEWSTATE'),
        '__VIEWSTATEGENERATOR': _grab_field(html, '__VIEWSTATEGENERATOR'),
        'ctl00$ContentPlaceHolder1$PagerControl1$hdnCurrentPage': str(page),
        'ctl00$ContentPlaceHolder1$PagerControl1$hdnPCID': 'PC1',
    }
    ev = _grab_field(html, '__EVENTVALIDATION')
    if ev:
        data['__EVENTVALIDATION'] = ev
    res = await client.post(
        MERO_FLOOR,
        content=urlencode(data),
        headers={
            'Accept': 'text/html',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': UA,
            'Referer': MERO_FLOOR,
            'Origin': 'https://merolagani.com',
        },
    )
    res.raise_for_status()
    return res.text


async def scrape_floorsheet(pages: int) -> tuple[list[FloorRow], str | None, int]:
    pages = max(1, min(pages, 40))
    timeout = httpx.Timeout(25.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        html = await _http_get(client)
        as_of = _parse_as_of(html)
        all_rows = parse_merolagani_rows(html)
        for page in range(2, pages + 1):
            try:
                html = await _http_post_page(client, html, page)
                all_rows.extend(parse_merolagani_rows(html))
            except Exception as e:  # noqa: BLE001
                log.warning('Merolagani page %s failed: %s', page, e)
                break
    session_date = session_date_from_rows(all_rows, as_of)
    max_id = max((r.contract_id for r in all_rows), default=0)
    return all_rows, session_date, max_id


async def get_snapshot(
    db: AsyncSession,
    kind: str,
) -> BrokerFlowSnapshot | None:
    return await db.scalar(
        select(BrokerFlowSnapshot).where(BrokerFlowSnapshot.kind == kind)
    )


async def _mero_kinds_complete(db: AsyncSession) -> bool:
    for kind in MERO_KINDS:
        row = await get_snapshot(db, kind)
        if not row or not (row.payload_json or '').strip() or row.payload_json == '{}':
            return False
    return True


def normalize_board_kind(kind: str) -> str | None:
    key = (kind or '').strip().lower()
    if key in KIND_ALIASES:
        return KIND_ALIASES[key]
    if key in MERO_KINDS or key == KIND_FINANCIAL or key in LIGHT_KINDS:
        return key
    return None


async def upsert_snapshot(
    db: AsyncSession,
    *,
    kind: str,
    payload: dict[str, Any],
    session_date: str | None,
    trades_scanned: int,
    max_contract_id: int,
    source: str = 'merolagani',
) -> BrokerFlowSnapshot:
    now = datetime.now(timezone.utc)
    row = await get_snapshot(db, kind)
    if row is None:
        row = BrokerFlowSnapshot(kind=kind)
        db.add(row)
    row.session_date = session_date or ''
    row.trades_scanned = trades_scanned
    row.max_contract_id = max_contract_id
    row.payload_json = json.dumps(payload, separators=(',', ':'))
    row.source = source
    row.fetched_at = now
    row.updated_at = now
    await db.flush()
    return row


async def refresh_broker_flow_cache(
    db: AsyncSession,
    *,
    force: bool = False,
) -> dict[str, Any]:
    """
    Scrape Merolagani once and write Acc/Dis + Phase 1 boards to Postgres.
    Called by background loop and cron. Skips if latest max_contract_id unchanged
    and all Merolagani kinds are already present (unless force=True).
    """
    from .broker_boards import build_all_mero_boards

    settings = get_settings()
    pages = max(
        int(settings.broker_flow_pages),
        int(settings.broker_flow_aggressive_pages),
    )
    limit = int(settings.broker_flow_row_limit)
    aggressive_limit = int(settings.broker_flow_aggressive_limit)

    existing = await get_snapshot(db, KIND_ACC)
    try:
        rows, session_date, max_id = await scrape_floorsheet(pages)
    except Exception as e:  # noqa: BLE001
        log.warning('Broker flow scrape failed: %s', e)
        return {
            'ok': False,
            'error': str(e),
            'keptCache': bool(existing and existing.payload_json),
        }

    if not rows:
        return {
            'ok': False,
            'error': 'no_rows',
            'keptCache': bool(existing and existing.payload_json),
        }

    complete = await _mero_kinds_complete(db)
    if (
        not force
        and complete
        and existing
        and existing.max_contract_id == max_id
        and existing.session_date == (session_date or '')
        and existing.trades_scanned >= len(rows)
    ):
        return {
            'ok': True,
            'skipped': True,
            'reason': 'unchanged',
            'sessionDate': session_date,
            'maxContractId': max_id,
            'tradesScanned': existing.trades_scanned,
        }

    boards = build_net_boards(rows, limit=limit, session_date=session_date)
    boards.update(
        build_all_mero_boards(
            rows,
            session_date=session_date,
            limit=limit,
            aggressive_limit=aggressive_limit,
        )
    )
    for kind, payload in boards.items():
        await upsert_snapshot(
            db,
            kind=kind,
            payload=payload,
            session_date=session_date,
            trades_scanned=len(rows),
            max_contract_id=max_id,
            source='merolagani',
        )
    await db.commit()
    log.info(
        'Broker flow cache updated: session=%s trades=%s maxId=%s kinds=%s',
        session_date,
        len(rows),
        max_id,
        list(boards.keys()),
    )
    return {
        'ok': True,
        'skipped': False,
        'sessionDate': session_date,
        'maxContractId': max_id,
        'tradesScanned': len(rows),
        'accumulationRows': len(boards[KIND_ACC].get('rows') or []),
        'distributionRows': len(boards[KIND_DIST].get('rows') or []),
        'kinds': list(boards.keys()),
        'source': 'merolagani',
    }


def snapshot_to_response(row: BrokerFlowSnapshot) -> dict[str, Any]:
    try:
        payload = json.loads(row.payload_json or '{}')
    except json.JSONDecodeError:
        payload = {}
    payload['sessionDate'] = payload.get('sessionDate') or row.session_date or None
    payload['tradesScanned'] = payload.get('tradesScanned') or row.trades_scanned
    payload['fetchedAt'] = (
        row.fetched_at.isoformat() if row.fetched_at else None
    )
    payload['updatedAt'] = (
        row.updated_at.isoformat() if row.updated_at else None
    )
    payload['maxContractId'] = row.max_contract_id
    payload['cacheSource'] = row.source
    payload['kind'] = row.kind
    return payload


async def ensure_warm_snapshot(
    db: AsyncSession,
    kind: str,
) -> BrokerFlowSnapshot | None:
    """
    Return cached board. If empty, one caller scrapes Merolagani (or financial
    fan-out) and fills Postgres so every later user hits a warm cache.
    """
    resolved = normalize_board_kind(kind) or kind
    row = await get_snapshot(db, resolved)
    if row and row.payload_json and row.payload_json != '{}':
        return row

    # Financial reports use a separate lock/refresh path (ShareHub fan-out).
    if resolved == KIND_FINANCIAL:
        from .financial_reports_cache import refresh_financial_reports_cache

        meta = await refresh_financial_reports_cache(db, force=True)
        if not meta.get('ok'):
            return await get_snapshot(db, resolved)
        return await get_snapshot(db, resolved)

    # 52W / Unlock / Broker Favorites — ShareHub light boards.
    if resolved in LIGHT_KINDS:
        from .light_boards_cache import refresh_light_boards_cache

        meta = await refresh_light_boards_cache(db, force=True)
        if not meta.get('ok'):
            return await get_snapshot(db, resolved)
        return await get_snapshot(db, resolved)

    async with _lock():
        row = await get_snapshot(db, resolved)
        if row and row.payload_json and row.payload_json != '{}':
            return row
        meta = await refresh_broker_flow_cache(db, force=True)
        if not meta.get('ok'):
            return await get_snapshot(db, resolved)
        return await get_snapshot(db, resolved)
