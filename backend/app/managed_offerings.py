from __future__ import annotations

import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db.models import ManagedOffering

OFFERING_TYPES = frozenset(
    {'Ipo', 'Fpo', 'Right', 'MutualFund', 'BondOrDebenture'},
)
STATUSES = frozenset({'ComingSoon', 'Proposed', 'Open', 'Closed'})
DISPLAY_SECTIONS = frozenset({'current', 'upcoming', 'both'})
_DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}')


def _slug(raw: str | None) -> str:
    return re.sub(r'[^a-z0-9]', '', (raw or '').lower())


def _audience_key(raw: str | None) -> str:
    key = _slug(raw)
    if key.startswith('reserved'):
        key = key[len('reserved') :]
    if key.startswith('for'):
        key = key[len('for') :]
    return key


def build_match_key(
    *,
    name: str,
    symbol: str | None = None,
    audience: str | None = None,
) -> str:
    name_part = _slug(name)
    symbol_part = _slug(symbol)
    audience_part = _audience_key(audience) or 'generalpublic'
    if not name_part and not symbol_part:
        raise ValueError('Name or symbol is required')
    return f'{name_part}|{symbol_part}|{audience_part}'


def _normalize_date(raw: str | None) -> str | None:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    match = _DATE_RE.match(text)
    if not match:
        raise ValueError('Dates must be YYYY-MM-DD')
    return match.group(0)


def _normalize_type(raw: str | None) -> str:
    value = (raw or 'Ipo').strip()
    aliases = {
        'ipo': 'Ipo',
        'fpo': 'Fpo',
        'right': 'Right',
        'rightshare': 'Right',
        'right share': 'Right',
        'mutualfund': 'MutualFund',
        'mutual fund': 'MutualFund',
        'bondordebenture': 'BondOrDebenture',
        'debenture': 'BondOrDebenture',
        'bond': 'BondOrDebenture',
    }
    mapped = aliases.get(value.lower().replace('_', ' ').strip(), value)
    if mapped not in OFFERING_TYPES:
        raise ValueError(
            'Type must be one of: Ipo, Fpo, Right, MutualFund, BondOrDebenture',
        )
    return mapped


def _normalize_status(raw: str | None) -> str:
    value = (raw or 'ComingSoon').strip()
    aliases = {
        'comingsoon': 'ComingSoon',
        'coming soon': 'ComingSoon',
        'proposed': 'Proposed',
        'open': 'Open',
        'closed': 'Closed',
    }
    mapped = aliases.get(value.lower().replace('_', ' ').strip(), value)
    if mapped not in STATUSES:
        raise ValueError('Status must be ComingSoon, Proposed, Open, or Closed')
    return mapped


def _normalize_display_section(raw: str | None) -> str:
    value = (raw or 'both').strip().lower()
    if value not in DISPLAY_SECTIONS:
        raise ValueError('Display section must be current, upcoming, or both')
    return value


def _optional_int(raw: int | float | None) -> int | None:
    if raw is None:
        return None
    return int(raw)


def _optional_float(raw: int | float | None) -> float | None:
    if raw is None:
        return None
    return float(raw)


async def list_managed_offerings(
    db: AsyncSession,
    *,
    active_only: bool = False,
) -> list[ManagedOffering]:
    stmt = select(ManagedOffering).order_by(
        ManagedOffering.opening_date.desc().nullslast(),
        ManagedOffering.created_at.desc(),
    )
    if active_only:
        stmt = stmt.where(ManagedOffering.active.is_(True))
    return list((await db.scalars(stmt)).all())


async def get_managed_offering(
    db: AsyncSession,
    offering_id: str,
) -> ManagedOffering | None:
    return await db.get(ManagedOffering, offering_id)


async def get_managed_offering_by_match_key(
    db: AsyncSession,
    match_key: str,
) -> ManagedOffering | None:
    stmt = select(ManagedOffering).where(ManagedOffering.match_key == match_key)
    return await db.scalar(stmt)


async def create_managed_offering(
    db: AsyncSession,
    *,
    name: str,
    symbol: str = '',
    offering_type: str = 'Ipo',
    audience: str | None = None,
    issue_manager: str | None = None,
    status: str = 'ComingSoon',
    display_section: str = 'both',
    units: int | None = None,
    applied_units: int | None = None,
    applicants: int | None = None,
    price: float | None = None,
    total_amount: float | None = None,
    applied_amount: float | None = None,
    opening_date: str | None = None,
    closing_date: str | None = None,
    extended_closing_date: str | None = None,
    right_share_ratio: str | None = None,
    active: bool = True,
    match_key: str | None = None,
) -> ManagedOffering:
    name_clean = (name or '').strip()
    symbol_clean = (symbol or '').strip().upper()
    if not name_clean:
        raise ValueError('Company name is required')
    key = (match_key or '').strip() or build_match_key(
        name=name_clean,
        symbol=symbol_clean,
        audience=audience,
    )
    existing = await get_managed_offering_by_match_key(db, key)
    if existing is not None:
        raise ValueError('An IPO record with this company/symbol already exists')

    row = ManagedOffering(
        id=str(uuid.uuid4()),
        match_key=key,
        name=name_clean,
        symbol=symbol_clean,
        offering_type=_normalize_type(offering_type),
        audience=(audience or '').strip() or None,
        issue_manager=(issue_manager or '').strip() or None,
        status=_normalize_status(status),
        display_section=_normalize_display_section(display_section),
        units=_optional_int(units),
        applied_units=_optional_int(applied_units),
        applicants=_optional_int(applicants),
        price=_optional_float(price),
        total_amount=_optional_float(total_amount),
        applied_amount=_optional_float(applied_amount),
        opening_date=_normalize_date(opening_date),
        closing_date=_normalize_date(closing_date),
        extended_closing_date=_normalize_date(extended_closing_date),
        right_share_ratio=(right_share_ratio or '').strip() or None,
        active=bool(active),
    )
    db.add(row)
    await db.flush()
    return row


async def update_managed_offering(
    db: AsyncSession,
    offering_id: str,
    *,
    name: str,
    symbol: str = '',
    offering_type: str = 'Ipo',
    audience: str | None = None,
    issue_manager: str | None = None,
    status: str = 'ComingSoon',
    display_section: str = 'both',
    units: int | None = None,
    applied_units: int | None = None,
    applicants: int | None = None,
    price: float | None = None,
    total_amount: float | None = None,
    applied_amount: float | None = None,
    opening_date: str | None = None,
    closing_date: str | None = None,
    extended_closing_date: str | None = None,
    right_share_ratio: str | None = None,
    active: bool = True,
) -> ManagedOffering:
    row = await db.get(ManagedOffering, offering_id)
    if row is None:
        raise LookupError('IPO record not found')

    name_clean = (name or '').strip()
    if not name_clean:
        raise ValueError('Company name is required')
    symbol_clean = (symbol or '').strip().upper()
    new_key = build_match_key(
        name=name_clean,
        symbol=symbol_clean,
        audience=audience,
    )
    if new_key != row.match_key:
        clash = await get_managed_offering_by_match_key(db, new_key)
        if clash is not None and clash.id != row.id:
            raise ValueError('An IPO record with this company/symbol already exists')
        row.match_key = new_key

    row.name = name_clean
    row.symbol = symbol_clean
    row.offering_type = _normalize_type(offering_type)
    row.audience = (audience or '').strip() or None
    row.issue_manager = (issue_manager or '').strip() or None
    row.status = _normalize_status(status)
    row.display_section = _normalize_display_section(display_section)
    row.units = _optional_int(units)
    row.applied_units = _optional_int(applied_units)
    row.applicants = _optional_int(applicants)
    row.price = _optional_float(price)
    row.total_amount = _optional_float(total_amount)
    row.applied_amount = _optional_float(applied_amount)
    row.opening_date = _normalize_date(opening_date)
    row.closing_date = _normalize_date(closing_date)
    row.extended_closing_date = _normalize_date(extended_closing_date)
    row.right_share_ratio = (right_share_ratio or '').strip() or None
    row.active = bool(active)
    await db.flush()
    return row


async def delete_managed_offering(db: AsyncSession, offering_id: str) -> None:
    row = await db.get(ManagedOffering, offering_id)
    if row is None:
        raise LookupError('IPO record not found')
    await db.delete(row)
    await db.flush()
