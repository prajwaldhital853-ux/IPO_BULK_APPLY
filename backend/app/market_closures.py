from __future__ import annotations

import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db.models import MarketClosure

_DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
_COLOR_RE = re.compile(r'^#[0-9A-Fa-f]{6}$')


def _normalize_date(raw: str) -> str:
    date = (raw or '').strip()
    if not _DATE_RE.match(date):
        raise ValueError('Date must be YYYY-MM-DD')
    return date


def _normalize_color(raw: str | None) -> str:
    color = (raw or '#E53935').strip()
    if not _COLOR_RE.match(color):
        raise ValueError('Color must be a hex like #E53935')
    return color.upper()


async def list_market_closures(
    db: AsyncSession,
    *,
    active_only: bool = False,
) -> list[MarketClosure]:
    stmt = select(MarketClosure).order_by(MarketClosure.date.desc())
    if active_only:
        stmt = stmt.where(MarketClosure.active.is_(True))
    return list((await db.scalars(stmt)).all())


async def get_market_closure(
    db: AsyncSession,
    closure_id: str,
) -> MarketClosure | None:
    return await db.get(MarketClosure, closure_id)


async def get_market_closure_by_date(
    db: AsyncSession,
    date: str,
) -> MarketClosure | None:
    stmt = select(MarketClosure).where(MarketClosure.date == date)
    return await db.scalar(stmt)


async def create_market_closure(
    db: AsyncSession,
    *,
    date: str,
    title: str,
    notice: str,
    color: str | None,
    active: bool = True,
) -> MarketClosure:
    date_iso = _normalize_date(date)
    existing = await get_market_closure_by_date(db, date_iso)
    if existing is not None:
        raise ValueError(f'A closure already exists for {date_iso}')
    title_clean = (title or '').strip() or 'NEPSE Closed'
    row = MarketClosure(
        id=str(uuid.uuid4()),
        date=date_iso,
        title=title_clean,
        notice=(notice or '').strip(),
        color=_normalize_color(color),
        active=bool(active),
    )
    db.add(row)
    await db.flush()
    return row


async def update_market_closure(
    db: AsyncSession,
    closure_id: str,
    *,
    date: str | None = None,
    title: str | None = None,
    notice: str | None = None,
    color: str | None = None,
    active: bool | None = None,
) -> MarketClosure:
    row = await db.get(MarketClosure, closure_id)
    if row is None:
        raise LookupError('Market closure not found')
    if date is not None:
        date_iso = _normalize_date(date)
        if date_iso != row.date:
            clash = await get_market_closure_by_date(db, date_iso)
            if clash is not None and clash.id != row.id:
                raise ValueError(f'A closure already exists for {date_iso}')
            row.date = date_iso
    if title is not None:
        row.title = title.strip() or 'NEPSE Closed'
    if notice is not None:
        row.notice = notice.strip()
    if color is not None:
        row.color = _normalize_color(color)
    if active is not None:
        row.active = bool(active)
    await db.flush()
    return row


async def delete_market_closure(db: AsyncSession, closure_id: str) -> None:
    row = await db.get(MarketClosure, closure_id)
    if row is None:
        raise LookupError('Market closure not found')
    await db.delete(row)
    await db.flush()
