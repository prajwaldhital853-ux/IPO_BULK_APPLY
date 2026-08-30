from __future__ import annotations

from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx

NPT = ZoneInfo('Asia/Kathmandu')
SHAREHUB = 'https://sharehubnepal.com/live/api/v1/nepselive'
SHAREHUB_V2 = 'https://sharehubnepal.com/live/api/v2/nepselive'
SHAREHUB_DATA = 'https://sharehubnepal.com/data/api/v1'

# NEPSE regular session (approx.)
SESSION_OPEN_HOUR = 11
SESSION_OPEN_MINUTE = 0
SESSION_CLOSE_HOUR = 15
SESSION_CLOSE_MINUTE = 0


def now_npt() -> datetime:
    return datetime.now(NPT)


def is_weekday_npt(dt: datetime | None = None) -> bool:
    d = dt or now_npt()
    # Python: Mon=0 … Sun=6. NEPSE closed Fri(4) & Sat(5).
    return d.weekday() not in (4, 5)


def is_market_session_hours(dt: datetime | None = None) -> bool:
    d = dt or now_npt()
    if not is_weekday_npt(d):
        return False
    minutes = d.hour * 60 + d.minute
    open_m = SESSION_OPEN_HOUR * 60 + SESSION_OPEN_MINUTE
    close_m = SESSION_CLOSE_HOUR * 60 + SESSION_CLOSE_MINUTE
    return open_m <= minutes <= close_m


def is_market_open_window(dt: datetime | None = None) -> bool:
    """First ~45 minutes after session open (cron fires at 11:00 NPT)."""
    d = dt or now_npt()
    minutes = d.hour * 60 + d.minute
    open_m = SESSION_OPEN_HOUR * 60 + SESSION_OPEN_MINUTE
    return open_m <= minutes < open_m + 45


def is_market_close_window(dt: datetime | None = None) -> bool:
    """After regular close until ~16:30 NPT (cron fires at 15:05)."""
    d = dt or now_npt()
    minutes = d.hour * 60 + d.minute
    close_m = SESSION_CLOSE_HOUR * 60 + SESSION_CLOSE_MINUTE
    return close_m <= minutes <= close_m + 90


def parse_market_is_open(status: dict | None) -> bool | None:
    if not isinstance(status, dict):
        return None
    raw = str(status.get('isOpen') or '').strip().upper()
    if raw in {'OPEN', 'TRUE', '1', 'YES'}:
        return True
    if raw in {'CLOSE', 'CLOSED', 'FALSE', '0', 'NO'}:
        return False
    return None


def status_as_of_date_npt(status: dict | None) -> date | None:
    if not isinstance(status, dict):
        return None
    raw = status.get('asOf')
    if not raw:
        return None
    try:
        as_of = datetime.fromisoformat(str(raw))
    except ValueError:
        return None
    if as_of.tzinfo is None:
        as_of = as_of.replace(tzinfo=NPT)
    return as_of.astimezone(NPT).date()


async def fetch_market_status() -> dict | None:
    status = await fetch_json('/market-status')
    return status if isinstance(status, dict) else None


async def fetch_market_is_open() -> bool | None:
    return parse_market_is_open(await fetch_market_status())


async def had_trading_session_today() -> bool:
    """True when ShareHub reports today's session had turnover/volume."""
    status = await fetch_market_status()
    if status_as_of_date_npt(status) != now_npt().date():
        return False
    summary_rows = await fetch_json('/market-summary')
    smap = _summary_map(summary_rows if isinstance(summary_rows, list) else None)
    turnover = _pick(smap, 'turnover')
    volume = _pick(smap, 'volume', 'total traded')
    if turnover is not None and turnover > 0:
        return True
    if volume is not None and volume > 0:
        return True
    return False


async def fetch_json(path: str, base: str = SHAREHUB) -> Any | None:
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.get(
                f'{base}{path}',
                headers={'Accept': 'application/json', 'Cache-Control': 'no-cache'},
            )
            if not res.is_success:
                return None
            return res.json()
    except Exception:  # noqa: BLE001
        return None


def _summary_map(rows: list[dict] | None) -> dict[str, float]:
    out: dict[str, float] = {}
    if not isinstance(rows, list):
        return out
    for row in rows:
        if not isinstance(row, dict):
            continue
        detail = str(row.get('detail') or '').strip().lower()
        try:
            value = float(row.get('value') or 0)
        except (TypeError, ValueError):
            continue
        if detail:
            out[detail] = value
    return out


def _pick(m: dict[str, float], *keys: str) -> float | None:
    for key in keys:
        for k, v in m.items():
            if key in k:
                return v
    return None


async def fetch_market_summary_text(*, kind: str) -> tuple[str, str]:
    """
    Build title/body for market open or close push.
    kind: 'open' | 'close'
    """
    status, summary_rows, index_rows = await _fetch_bundle()
    smap = _summary_map(summary_rows if isinstance(summary_rows, list) else None)

    nepse = None
    change = None
    pct = None
    if isinstance(index_rows, list):
        for row in index_rows:
            if not isinstance(row, dict):
                continue
            name = str(row.get('index') or '').upper()
            if 'NEPSE' in name and 'SENSITIVE' not in name:
                try:
                    nepse = float(row.get('currentValue') or 0)
                    change = float(row.get('change') or 0)
                    pct = float(row.get('perChange') or 0)
                except (TypeError, ValueError):
                    pass
                break

    turnover = _pick(smap, 'turnover')
    volume = _pick(smap, 'volume', 'total traded')
    advanced = _pick(smap, 'advanced')
    declined = _pick(smap, 'declined')

    is_open = False
    if isinstance(status, dict):
        is_open = str(status.get('isOpen') or '').lower() in {'true', '1', 'yes', 'open'}

    when = now_npt().strftime('%d %b %Y, %H:%M NPT')
    if kind == 'open':
        title = 'NEPSE GHAR'
        parts = [f'Market is open · {when}']
        if nepse is not None:
            ch = f'{change:+.2f}' if change is not None else '—'
            pc = f'{pct:+.2f}%' if pct is not None else '—'
            parts.append(f'NEPSE {nepse:,.2f} ({ch} / {pc})')
        body = ' · '.join(parts)
        return title, body

    title = 'NEPSE GHAR'
    parts = [f'Market closed · day summary · {when}']
    if nepse is not None:
        ch = f'{change:+.2f}' if change is not None else '—'
        pc = f'{pct:+.2f}%' if pct is not None else '—'
        parts.append(f'NEPSE {nepse:,.2f} ({ch} / {pc})')
    if turnover is not None:
        parts.append(f'Turnover Rs {turnover:,.0f}')
    if volume is not None:
        parts.append(f'Vol {volume:,.0f}')
    if advanced is not None or declined is not None:
        parts.append(
            f'Adv {int(advanced or 0)} / Dec {int(declined or 0)}',
        )
    if not is_open and nepse is None and turnover is None:
        parts.append('Summary unavailable — open the app for details')
    body = ' · '.join(parts)
    return title, body


async def _fetch_bundle() -> tuple[Any, Any, Any]:
    status = await fetch_json('/market-status')
    summary = await fetch_json('/market-summary')
    index = await fetch_json('/index')
    return status, summary, index


async def fetch_ltp_map(symbols: set[str]) -> dict[str, float]:
    """Best-effort LTP lookup for alert symbols via ShareHub mini-screener / today's price."""
    if not symbols:
        return {}
    want = {s.upper() for s in symbols}
    out: dict[str, float] = {}

    mini = await fetch_json('/security/mini-screener', SHAREHUB_DATA)
    out.update(_parse_ltp_list(mini, want))

    today = await fetch_json('/todays-price', SHAREHUB_V2)
    out.update(_parse_ltp_list(today, want))

    if len(out) < len(want):
        for path in ('/securities', '/live-stock'):
            raw = await fetch_json(path)
            out.update(_parse_ltp_list(raw, want))
            if len(out) >= len(want):
                break
    return out


def _parse_ltp_list(raw: Any, want: set[str]) -> dict[str, float]:
    out: dict[str, float] = {}
    rows: list[Any] = []
    if isinstance(raw, list):
        rows = raw
    elif isinstance(raw, dict):
        for key in ('data', 'securities', 'stocks', 'content', 'payload'):
            if isinstance(raw.get(key), list):
                rows = raw[key]
                break
    for row in rows:
        if not isinstance(row, dict):
            continue
        sym = str(
            row.get('symbol')
            or row.get('stockSymbol')
            or row.get('ticker')
            or '',
        ).upper().strip()
        if not sym or sym not in want:
            continue
        for price_key in (
            'lastTradedPrice',
            'ltp',
            'closingPrice',
            'lastPrice',
            'price',
        ):
            if row.get(price_key) is None:
                continue
            try:
                out[sym] = float(row[price_key])
                break
            except (TypeError, ValueError):
                continue
    return out
