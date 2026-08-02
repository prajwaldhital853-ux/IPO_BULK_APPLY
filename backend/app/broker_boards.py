"""
Derive premium board payloads from scraped Merolagani floorsheet rows.

Shapes match mobile types in brokerAnalytics.ts so clients can paint directly.
Logos / LTP / Chg% are left null where needed — phone enriches from mini-screener.
"""

from __future__ import annotations

import math
import re
from collections import defaultdict
from typing import Any

from .broker_flow import FloorRow, session_date_from_rows

KIND_TOP_BUYERS = 'top-buyers'
KIND_TOP_SELLERS = 'top-sellers'
KIND_NET_HOLDERS = 'net-holders'
KIND_NET_RELEASES = 'net-releases'
KIND_AGGRESSIVE = 'aggressive-holders'
KIND_BROKER_TOP = 'broker-top-buy-sell'

MERO_BOARD_KINDS = (
    KIND_TOP_BUYERS,
    KIND_TOP_SELLERS,
    KIND_NET_HOLDERS,
    KIND_NET_RELEASES,
    KIND_AGGRESSIVE,
    KIND_BROKER_TOP,
)


def _norm_broker(code: str) -> str:
    return re.sub(r'\D', '', (code or '').strip())


def _looks_like_broker_firm(name: str) -> bool:
    n = (name or '').strip()
    if not n:
        return False
    if re.search(
        r'securities|broker|capital\s*market|investment\s*banking',
        n,
        re.I,
    ):
        return True
    if re.search(
        r'hydropower|hydro\s*power|development\s*bank|commercial\s*bank|'
        r'life\s*insurance|non[\s-]*life|microfinance|mutual\s*fund|'
        r'agritech|manufacturing|hotels?\s+and\s+tourism|power\s+limited|'
        r'energy\s+ltd',
        n,
        re.I,
    ):
        return False
    return True


def _has_broker_data(rows: list[FloorRow]) -> bool:
    return any(_norm_broker(r.buyer_broker) or _norm_broker(r.seller_broker) for r in rows)


def _broker_names(rows: list[FloorRow]) -> dict[str, str]:
    names: dict[str, str] = {}
    for r in rows:
        buy = _norm_broker(r.buyer_broker)
        sell = _norm_broker(r.seller_broker)
        if buy and r.buyer_name and _looks_like_broker_firm(r.buyer_name):
            names.setdefault(buy, r.buyer_name.strip())
        if sell and r.seller_name and _looks_like_broker_firm(r.seller_name):
            names.setdefault(sell, r.seller_name.strip())
    return names


def build_top_side_board(
    rows: list[FloorRow],
    side: str,
    *,
    session_date: str | None,
    limit: int,
) -> dict[str, Any]:
    """Top buyers / sellers — broker × symbol qty ranking."""
    agg: dict[str, dict[str, Any]] = {}
    for r in rows:
        broker_raw = r.buyer_broker if side == 'buy' else r.seller_broker
        broker = _norm_broker(broker_raw)
        if not broker:
            continue
        qty = r.quantity
        amt = r.amount or qty * r.rate
        if qty <= 0 and amt <= 0:
            continue
        key = f'{r.symbol.upper()}|{broker}'
        cur = agg.get(key)
        if not cur:
            cur = {
                'symbol': r.symbol.upper(),
                'broker': broker,
                'qty': 0.0,
                'amount': 0.0,
                'rateSum': 0.0,
                'trades': 0,
            }
            agg[key] = cur
        cur['qty'] += qty
        cur['amount'] += amt
        cur['rateSum'] += r.rate
        cur['trades'] += 1

    list_rows = [
        {
            'id': f"{c['symbol']}|{c['broker']}",
            'symbol': c['symbol'],
            'brokerCode': c['broker'],
            'qty': c['qty'],
            'amount': c['amount'],
            'avgRate': c['rateSum'] / c['trades'] if c['trades'] else None,
            'trades': c['trades'],
        }
        for c in agg.values()
        if c['qty'] > 0
    ]
    list_rows.sort(key=lambda r: (-r['qty'], -r['amount']))
    if limit > 0:
        list_rows = list_rows[:limit]

    return {
        'rows': list_rows,
        'sessionDate': session_date,
        'tradesScanned': len(rows),
        'side': side,
        'source': 'merolagani',
    }


def _build_net_agg(rows: list[FloorRow]) -> dict[str, dict[str, Any]]:
    agg: dict[str, dict[str, Any]] = {}
    for r in rows:
        qty = r.quantity
        amt = r.amount or qty * r.rate
        if qty <= 0 and amt <= 0:
            continue

        def apply(broker_raw: str, is_buy: bool) -> None:
            broker = _norm_broker(broker_raw)
            if not broker:
                return
            key = f'{r.symbol.upper()}|{broker}'
            cur = agg.get(key)
            if not cur:
                cur = {
                    'symbol': r.symbol.upper(),
                    'name': r.name,
                    'broker': broker,
                    'qty': 0.0,
                    'amount': 0.0,
                    'rateSum': 0.0,
                    'trades': 0,
                    'buyQty': 0.0,
                    'sellQty': 0.0,
                    'buyAmt': 0.0,
                    'sellAmt': 0.0,
                }
                agg[key] = cur
            if is_buy:
                cur['buyQty'] += qty
                cur['buyAmt'] += amt
            else:
                cur['sellQty'] += qty
                cur['sellAmt'] += amt
            cur['qty'] = cur['buyQty'] - cur['sellQty']
            cur['amount'] = cur['buyAmt'] - cur['sellAmt']
            cur['trades'] += 1
            cur['rateSum'] += r.rate

        apply(r.buyer_broker, True)
        apply(r.seller_broker, False)
    return agg


def build_net_side_board(
    rows: list[FloorRow],
    mode: str,
    *,
    session_date: str | None,
    limit: int,
) -> dict[str, Any]:
    """Top Holders (symbol net buy) / Top Release (broker×symbol net sell)."""
    if not _has_broker_data(rows):
        return {
            'rows': [],
            'sessionDate': session_date,
            'tradesScanned': len(rows),
            'mode': mode,
            'brokerBreakdown': False,
            'source': 'merolagani',
        }

    net = _build_net_agg(rows)

    if mode == 'holders':
        by_sym: dict[str, dict[str, Any]] = {}
        for n in net.values():
            if n['qty'] <= 0:
                continue
            sym = n['symbol']
            cur = by_sym.get(sym)
            if not cur:
                cur = {
                    'symbol': sym,
                    'qty': 0.0,
                    'amount': 0.0,
                    'rateSum': 0.0,
                    'trades': 0,
                }
                by_sym[sym] = cur
            cur['qty'] += n['qty']
            cur['amount'] += abs(n['amount'])
            cur['rateSum'] += n['rateSum']
            cur['trades'] += n['trades']
        list_rows = [
            {
                'id': a['symbol'],
                'symbol': a['symbol'],
                'brokerCode': '',
                'qty': a['qty'],
                'amount': a['amount'],
                'avgRate': a['rateSum'] / a['trades'] if a['trades'] else None,
                'ltp': None,
                'trades': a['trades'],
            }
            for a in by_sym.values()
        ]
        list_rows.sort(key=lambda r: (-r['qty'], -r['amount']))
        if limit > 0:
            list_rows = list_rows[:limit]
        return {
            'rows': list_rows,
            'sessionDate': session_date,
            'tradesScanned': len(rows),
            'mode': 'holders',
            'brokerBreakdown': False,
            'source': 'merolagani',
        }

    list_rows = [
        {
            'id': f"{n['symbol']}|{n['broker']}",
            'symbol': n['symbol'],
            'brokerCode': n['broker'],
            'qty': abs(n['qty']),
            'amount': abs(n['amount']),
            'avgRate': n['rateSum'] / n['trades'] if n['trades'] else None,
            'ltp': None,
            'trades': n['trades'],
        }
        for n in net.values()
        if n['qty'] < 0
    ]
    list_rows.sort(key=lambda r: (-r['qty'], -r['amount']))
    if limit > 0:
        list_rows = list_rows[:limit]
    return {
        'rows': list_rows,
        'sessionDate': session_date,
        'tradesScanned': len(rows),
        'mode': 'releases',
        'brokerBreakdown': True,
        'source': 'merolagani',
    }


def build_broker_top_buy_sell_board(
    rows: list[FloorRow],
    *,
    session_date: str | None,
) -> dict[str, Any]:
    if not _has_broker_data(rows):
        return {
            'brokers': [],
            'sessionDate': session_date,
            'tradesScanned': len(rows),
            'brokerBreakdown': False,
            'source': 'merolagani',
        }

    names = _broker_names(rows)
    by_broker: dict[str, dict[str, Any]] = {}

    def bump(raw: str, symbol: str, qty: float, amt: float, is_buy: bool) -> None:
        code = _norm_broker(raw)
        if not code or not symbol:
            return
        b = by_broker.get(code)
        if not b:
            b = {
                'code': code,
                'buy': defaultdict(lambda: {'qty': 0.0, 'amt': 0.0}),
                'sell': defaultdict(lambda: {'qty': 0.0, 'amt': 0.0}),
                'buyAmt': 0.0,
                'sellAmt': 0.0,
            }
            by_broker[code] = b
        side = b['buy'] if is_buy else b['sell']
        side[symbol]['qty'] += qty
        side[symbol]['amt'] += amt
        if is_buy:
            b['buyAmt'] += amt
        else:
            b['sellAmt'] += amt

    for r in rows:
        qty = r.quantity
        amt = r.amount or qty * r.rate
        if qty <= 0 and amt <= 0:
            continue
        sym = r.symbol.upper()
        bump(r.buyer_broker, sym, qty, amt, True)
        bump(r.seller_broker, sym, qty, amt, False)

    def top_symbols(side_map: dict, take: int = 5) -> list[str]:
        items = sorted(
            side_map.items(),
            key=lambda kv: (-kv[1]['amt'], -kv[1]['qty']),
        )
        return [sym for sym, _ in items[:take]]

    brokers: list[dict[str, Any]] = []
    for b in by_broker.values():
        buy_syms = top_symbols(b['buy'], 5)
        sell_syms = top_symbols(b['sell'], 5)
        if not buy_syms and not sell_syms:
            continue
        floor_name = names.get(b['code'], '')
        name = (
            floor_name
            if floor_name and _looks_like_broker_firm(floor_name)
            else f"Broker {b['code']}"
        )
        brokers.append(
            {
                'code': b['code'],
                'name': name,
                'iconUrl': None,
                'buySymbols': buy_syms,
                'sellSymbols': sell_syms,
                'buyAmt': b['buyAmt'],
                'sellAmt': b['sellAmt'],
                'score': b['buyAmt'] + b['sellAmt'],
            }
        )
    brokers.sort(key=lambda x: -x['score'])
    return {
        'brokers': brokers,
        'sessionDate': session_date,
        'tradesScanned': len(rows),
        'brokerBreakdown': True,
        'source': 'merolagani',
    }


def _count_brokers_on_symbol(rows: list[FloorRow], symbol: str) -> int:
    found: set[str] = set()
    sym = symbol.upper()
    for r in rows:
        if r.symbol.upper() != sym:
            continue
        buy = _norm_broker(r.buyer_broker)
        sell = _norm_broker(r.seller_broker)
        if buy:
            found.add(buy)
        if sell:
            found.add(sell)
    return len(found)


def build_aggressive_board(
    rows: list[FloorRow],
    *,
    session_date: str | None,
    limit: int,
) -> dict[str, Any]:
    """Stock-centric aggressive holders — LTP/icons filled on the phone."""
    if not _has_broker_data(rows):
        return {
            'stocks': [],
            'sessionDate': session_date,
            'brokerBreakdown': False,
            'tradesScanned': len(rows),
            'source': 'merolagani',
        }

    names = _broker_names(rows)
    net = _build_net_agg(rows)
    by_sym: dict[str, dict[str, Any]] = {}

    for n in net.values():
        if n['qty'] <= 0:
            continue
        sym = n['symbol']
        bucket = by_sym.get(sym)
        if not bucket:
            bucket = {
                'symbol': sym,
                'name': n['name'],
                'brokers': [],
                'totalHold': 0.0,
                'totalBuy': 0.0,
            }
            by_sym[sym] = bucket
        code = _norm_broker(n['broker'])
        if not code:
            continue
        hold_qty = abs(n['qty'])
        bucket['brokers'].append(
            {'code': code, 'holdQty': hold_qty, 'buyQty': n['buyQty']}
        )
        bucket['totalHold'] += hold_qty
        bucket['totalBuy'] += n['buyQty']

    stocks: list[dict[str, Any]] = []
    for bucket in by_sym.values():
        if bucket['totalHold'] <= 0:
            continue
        bucket['brokers'].sort(key=lambda b: -b['holdQty'])
        top3 = bucket['brokers'][:3]
        top3_hold = sum(b['holdQty'] for b in top3)
        top3_pct = (
            round((top3_hold / bucket['totalHold']) * 10000) / 100
            if bucket['totalHold'] > 0
            else 0.0
        )
        top_brokers = []
        for b in top3:
            code = b['code']
            floor = names.get(code, '')
            name = (
                floor
                if floor and _looks_like_broker_firm(floor)
                else f'Broker {code}'
            )
            top_brokers.append(
                {
                    'code': code,
                    'name': name,
                    'iconUrl': None,
                    'holdQty': b['holdQty'],
                    'holdPct': (
                        round((b['holdQty'] / bucket['totalHold']) * 10000) / 100
                        if bucket['totalHold'] > 0
                        else 0.0
                    ),
                    'buyQty': b['buyQty'],
                }
            )
        involved = _count_brokers_on_symbol(rows, bucket['symbol'])
        score = (
            (top3_pct or 1)
            * math.log10(bucket['totalHold'] + 10)
        )
        stocks.append(
            {
                'symbol': bucket['symbol'],
                'name': bucket['name'],
                'iconUrl': None,
                'ltp': None,
                'change': None,
                'changePct': None,
                'publicTradePct': None,
                'brokersInvolved': involved or len(bucket['brokers']),
                'top3HoldingPct': top3_pct,
                'totalTradedQty': bucket['totalBuy'],
                'topBrokers': top_brokers,
                'score': score,
            }
        )

    stocks.sort(key=lambda s: -s['score'])
    if limit > 0:
        stocks = stocks[:limit]
    return {
        'stocks': stocks,
        'sessionDate': session_date,
        'brokerBreakdown': True,
        'tradesScanned': len(rows),
        'source': 'merolagani',
    }


def build_all_mero_boards(
    rows: list[FloorRow],
    *,
    session_date: str | None,
    limit: int,
    aggressive_limit: int,
) -> dict[str, dict[str, Any]]:
    """Return kind → payload for all Merolagani-derived Phase 1 boards (+ callers add Acc/Dis)."""
    sd = session_date or session_date_from_rows(rows, None)
    top_limit = max(limit * 2, 200)
    return {
        KIND_TOP_BUYERS: build_top_side_board(
            rows, 'buy', session_date=sd, limit=top_limit
        ),
        KIND_TOP_SELLERS: build_top_side_board(
            rows, 'sell', session_date=sd, limit=top_limit
        ),
        KIND_NET_HOLDERS: build_net_side_board(
            rows, 'holders', session_date=sd, limit=top_limit
        ),
        KIND_NET_RELEASES: build_net_side_board(
            rows, 'releases', session_date=sd, limit=top_limit
        ),
        KIND_BROKER_TOP: build_broker_top_buy_sell_board(
            rows, session_date=sd
        ),
        KIND_AGGRESSIVE: build_aggressive_board(
            rows,
            session_date=sd,
            limit=aggressive_limit if aggressive_limit > 0 else 200,
        ),
    }
