from __future__ import annotations

import logging
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from .market_data import now_npt
from .notify_broadcast import broadcast_notification
from .sharehub_offerings import (
    SharehubOffering,
    effective_close,
    fetch_sharehub_offerings,
    is_offering_closed,
    is_offering_current,
    type_label,
)

log = logging.getLogger('push.ipo')


def _offering_id(row: SharehubOffering) -> str:
    return f'{row.offering_type}:{row.sharehub_id}'


async def notify_sharehub_open(
    db: AsyncSession,
    row: SharehubOffering,
    *,
    force: bool = False,
) -> dict:
    label = type_label(row.offering_type)
    symbol = row.symbol.strip()
    name = row.name.strip() or symbol or label
    open_date = row.opening_date
    close_date = effective_close(row)

    title = f'{label} open — {symbol or name}'
    body = f'{name} is open for application'
    if open_date:
        body += f' from {open_date.strftime("%d %b %Y")}'
    if close_date:
        body += f'. Apply before {close_date.strftime("%d %b %Y")}.'
    else:
        body += '.'

    event_key = (
        f'sharehub_open:{row.offering_type}:{row.sharehub_id}:'
        f'{open_date.isoformat() if open_date else "na"}'
    )
    return await broadcast_notification(
        db,
        event_key=event_key,
        event_type='ipo_open',
        title=title,
        body=body,
        data={
            'offeringId': _offering_id(row),
            'symbol': symbol,
            'matchKey': row.match_key,
            'companyName': name,
            'offeringType': row.offering_type,
        },
        channel_id='ipo',
        force=force,
    )


async def notify_sharehub_last_day(
    db: AsyncSession,
    row: SharehubOffering,
    *,
    force: bool = False,
) -> dict:
    label = type_label(row.offering_type)
    symbol = row.symbol.strip()
    name = row.name.strip() or symbol or label
    close_date = effective_close(row)

    title = f'Last day — apply {symbol or name}'
    body = (
        f'Today is the last day to apply for {name} ({label}). '
        'Open the app and apply before the issue closes.'
    )

    event_key = (
        f'sharehub_last_day:{row.offering_type}:{row.sharehub_id}:'
        f'{close_date.isoformat() if close_date else "na"}'
    )
    return await broadcast_notification(
        db,
        event_key=event_key,
        event_type='ipo_last_day',
        title=title,
        body=body,
        data={
            'offeringId': _offering_id(row),
            'symbol': symbol,
            'matchKey': row.match_key,
            'companyName': name,
            'offeringType': row.offering_type,
        },
        channel_id='ipo',
        force=force,
    )


async def notify_sharehub_closed(
    db: AsyncSession,
    row: SharehubOffering,
    *,
    force: bool = False,
) -> dict:
    label = type_label(row.offering_type)
    symbol = row.symbol.strip()
    name = row.name.strip() or symbol or label
    close_date = effective_close(row)

    title = f'{label} closed — {symbol or name}'
    body = f'{name} ({label}) is now closed for application.'
    if close_date:
        body += f' It closed on {close_date.strftime("%d %b %Y")}.'

    event_key = (
        f'sharehub_closed:{row.offering_type}:{row.sharehub_id}:'
        f'{close_date.isoformat() if close_date else "na"}'
    )
    return await broadcast_notification(
        db,
        event_key=event_key,
        event_type='ipo_closed',
        title=title,
        body=body,
        data={
            'offeringId': _offering_id(row),
            'symbol': symbol,
            'matchKey': row.match_key,
            'companyName': name,
            'offeringType': row.offering_type,
        },
        channel_id='ipo',
        force=force,
    )


def _count_sent(res: dict) -> bool:
    return not res.get('skipped') and int(res.get('sent') or 0) > 0


async def run_ipo_reminder_job(db: AsyncSession) -> dict:
    """
    Cron: automatic IPO/FPO/Right notifications from ShareHub public offerings.
    No admin action required — same data source as Current Issues in the app.
    """
    today: date = now_npt().date()
    offerings = await fetch_sharehub_offerings()

    open_sent = 0
    last_day_sent = 0
    closed_sent = 0
    skipped = 0
    results: list[dict] = []

    for row in offerings:
        if is_offering_current(row, today):
            open_date = row.opening_date
            if open_date is None or open_date <= today:
                res = await notify_sharehub_open(db, row)
                results.append(res)
                if res.get('skipped'):
                    skipped += 1
                elif _count_sent(res):
                    open_sent += 1

            close_date = effective_close(row)
            if close_date == today:
                res = await notify_sharehub_last_day(db, row)
                results.append(res)
                if res.get('skipped'):
                    skipped += 1
                elif _count_sent(res):
                    last_day_sent += 1

        elif is_offering_closed(row, today):
            res = await notify_sharehub_closed(db, row)
            results.append(res)
            if res.get('skipped'):
                skipped += 1
            elif _count_sent(res):
                closed_sent += 1

    summary = {
        'ok': True,
        'source': 'sharehub',
        'today': today.isoformat(),
        'scanned': len(offerings),
        'openSent': open_sent,
        'lastDaySent': last_day_sent,
        'closedSent': closed_sent,
        'skipped': skipped,
    }
    log.info('ipo_reminders %s', summary)
    return summary
