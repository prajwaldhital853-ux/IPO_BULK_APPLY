from __future__ import annotations

import json
import re
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import UserActiveAccounts

_KEY_RE = re.compile(r'^[du]:.{2,80}$')


def normalize_active_key(raw: str) -> str | None:
    key = (raw or '').strip().lower()
    if not key or not _KEY_RE.match(key):
        return None
    return key[:96]


def parse_keys(raw: str | None) -> list[str]:
    try:
        data = json.loads(raw or '[]')
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in data:
        key = normalize_active_key(str(item))
        if key and key not in seen:
            seen.add(key)
            out.append(key)
    return out


async def get_active_set(
    db: AsyncSession,
    user_id: str,
) -> tuple[list[str], int]:
    row = await db.get(UserActiveAccounts, user_id)
    if row is None:
        return [], 0
    return parse_keys(row.keys_json), int(row.confirmed_for_max or 0)


async def clear_active_set(db: AsyncSession, user_id: str) -> None:
    row = await db.get(UserActiveAccounts, user_id)
    if row is not None:
        await db.delete(row)
        await db.flush()


async def save_active_set(
    db: AsyncSession,
    *,
    user_id: str,
    keys: list[str],
    confirmed_for_max: int,
    max_accounts: int,
) -> tuple[list[str], int]:
    """Persist shared active fingerprints. Enforces lock once confirmed."""
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in keys:
        key = normalize_active_key(str(raw))
        if key and key not in seen:
            seen.add(key)
            cleaned.append(key)

    if confirmed_for_max < 1:
        raise ValueError('Invalid plan limit')
    if confirmed_for_max > max_accounts:
        raise ValueError('confirmedForMax exceeds plan limit')
    if not cleaned:
        raise ValueError('Select at least one active account')
    if len(cleaned) > max_accounts:
        raise ValueError(
            f'Your plan allows {max_accounts} active accounts across all phones',
        )

    existing_keys, existing_max = await get_active_set(db, user_id)
    if existing_keys and existing_max == confirmed_for_max:
        # Locked set: cannot drop any previously confirmed key.
        missing = [k for k in existing_keys if k not in cleaned]
        if missing:
            raise ValueError(
                'Active accounts are locked for this plan across all your phones. '
                'You cannot swap them out. Delete an active account first to free a slot.',
            )
        # Keep original order, then append new fills.
        ordered = list(existing_keys)
        for key in cleaned:
            if key not in ordered:
                ordered.append(key)
        cleaned = ordered[:max_accounts]

    row = await db.get(UserActiveAccounts, user_id)
    now = datetime.now(UTC)
    payload = json.dumps(cleaned)
    if row is None:
        row = UserActiveAccounts(
            user_id=user_id,
            keys_json=payload,
            confirmed_for_max=int(confirmed_for_max),
            updated_at=now,
        )
        db.add(row)
    else:
        row.keys_json = payload
        row.confirmed_for_max = int(confirmed_for_max)
        row.updated_at = now
    await db.flush()
    return cleaned, int(confirmed_for_max)


async def prune_active_keys(
    db: AsyncSession,
    *,
    user_id: str,
    remove_keys: list[str],
    max_accounts: int,
) -> tuple[list[str], int]:
    """Drop fingerprints after the user deletes those demats (frees slots)."""
    existing_keys, existing_max = await get_active_set(db, user_id)
    if not existing_keys:
        return [], 0

    drop: set[str] = set()
    for raw in remove_keys:
        key = normalize_active_key(str(raw))
        if key:
            drop.add(key)
    if not drop:
        return existing_keys, existing_max

    remaining = [k for k in existing_keys if k not in drop]
    row = await db.get(UserActiveAccounts, user_id)
    now = datetime.now(UTC)

    # Plan no longer matches → clear entirely.
    if existing_max != max_accounts:
        if row is not None:
            await db.delete(row)
            await db.flush()
        return [], 0

    if not remaining:
        if row is not None:
            await db.delete(row)
            await db.flush()
        return [], 0

    payload = json.dumps(remaining)
    if row is None:
        row = UserActiveAccounts(
            user_id=user_id,
            keys_json=payload,
            confirmed_for_max=int(existing_max),
            updated_at=now,
        )
        db.add(row)
    else:
        row.keys_json = payload
        row.confirmed_for_max = int(existing_max)
        row.updated_at = now
    await db.flush()
    return remaining, int(existing_max)
