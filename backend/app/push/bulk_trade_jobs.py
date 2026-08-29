from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from .market_data import SHAREHUB_V2, fetch_json, is_market_session_hours, now_npt
from .notify_broadcast import broadcast_notification

log = logging.getLogger('push.bulk_trade')

# Rs 50 lakh+ single trade (matches typical "bulk" floorsheet interest).
BULK_TRADE_MIN_AMOUNT_NPR = 5_000_000
FLOORSHEET_SCAN_PAGES = 3
FLOORSHEET_PAGE_SIZE = 50


def _parse_amount(row: dict[str, Any]) -> float:
    for key in ('amount', 'contractAmount', 'totalAmount', 'value'):
        raw = row.get(key)
        if raw is None:
            continue
        try:
            return float(raw)
        except (TypeError, ValueError):
            continue
    qty = row.get('quantity') or row.get('contractQuantity')
    rate = row.get('rate') or row.get('contractRate') or row.get('price')
    try:
        if qty is not None and rate is not None:
            return float(qty) * float(rate)
    except (TypeError, ValueError):
        pass
    return 0.0


def _parse_contract_id(row: dict[str, Any]) -> str:
    for key in ('contractId', 'id', 'contract_id'):
        raw = row.get(key)
        if raw is not None and str(raw).strip():
            return str(raw).strip()
    sym = str(row.get('symbol') or row.get('stockSymbol') or '')
    qty = str(row.get('quantity') or '')
    rate = str(row.get('rate') or '')
    return f'{sym}:{qty}:{rate}'


async def _fetch_floorsheet_page(page: int) -> list[dict[str, Any]]:
    path = f'/floorsheet?page={page}&size={FLOORSHEET_PAGE_SIZE}'
    raw = await fetch_json(path, base=SHAREHUB_V2)
    if not isinstance(raw, dict):
        return []
    data = raw.get('data')
    if isinstance(data, dict) and isinstance(data.get('content'), list):
        return [r for r in data['content'] if isinstance(r, dict)]
    if isinstance(raw.get('content'), list):
        return [r for r in raw['content'] if isinstance(r, dict)]
    return []


def _fmt_amount(n: float) -> str:
    if n >= 10_000_000:
        return f'Rs {n / 10_000_000:.2f} Cr'
    if n >= 100_000:
        return f'Rs {n / 100_000:.2f} L'
    return f'Rs {n:,.0f}'


async def run_bulk_trade_notification_job(db: AsyncSession) -> dict:
    """Cron during market hours: notify when large floorsheet trades appear."""
    if not is_market_session_hours():
        return {'ok': True, 'skipped': 'outside_session', 'notified': 0}

    today = now_npt().date().isoformat()
    notified = 0
    scanned = 0
    skipped = 0

    for page in range(1, FLOORSHEET_SCAN_PAGES + 1):
        rows = await _fetch_floorsheet_page(page)
        if not rows:
            break
        for row in rows:
            scanned += 1
            amount = _parse_amount(row)
            if amount < BULK_TRADE_MIN_AMOUNT_NPR:
                continue
            contract_id = _parse_contract_id(row)
            symbol = str(
                row.get('symbol') or row.get('stockSymbol') or '',
            ).upper().strip()
            if not symbol:
                continue

            event_key = f'bulk_trade:{today}:{contract_id}'
            buyer = str(row.get('buyerMemberId') or row.get('buyerBroker') or '—')
            seller = str(row.get('sellerMemberId') or row.get('sellerBroker') or '—')
            qty = row.get('quantity') or row.get('contractQuantity')
            try:
                qty_label = f'{int(float(qty)):,} units' if qty is not None else ''
            except (TypeError, ValueError):
                qty_label = ''

            title = f'Bulk trade — {symbol}'
            body = f'{_fmt_amount(amount)}'
            if qty_label:
                body += f' · {qty_label}'
            body += f' · Buyer {buyer} / Seller {seller}'

            res = await broadcast_notification(
                db,
                event_key=event_key,
                event_type='bulk_transaction',
                title=title,
                body=body,
                data={
                    'symbol': symbol,
                    'contractId': contract_id,
                    'amount': amount,
                },
                channel_id='bulk_trades',
            )
            if res.get('skipped'):
                skipped += 1
            elif int(res.get('sent') or 0) > 0:
                notified += 1

    return {
        'ok': True,
        'sessionDate': today,
        'scanned': scanned,
        'notified': notified,
        'skipped': skipped,
        'minAmountNpr': BULK_TRADE_MIN_AMOUNT_NPR,
    }
