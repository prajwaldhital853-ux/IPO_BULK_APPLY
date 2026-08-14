from __future__ import annotations

import json
import re
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import UserActiveAccounts

_KEY_RE = re.compile(r'^[du]:.{2,80}$')


def _parts(raw: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for piece in (raw or '').strip().lower().split(';'):
        piece = piece.strip()[:96]
        if piece and _KEY_RE.match(piece) and piece not in seen:
            seen.add(piece)
            out.append(piece)
    return out


def normalize_active_key(raw: str) -> str | None:
    parts = _parts(raw)
    if not parts:
        return None
    return ';'.join(parts)[:120]


def key_aliases(raw: str) -> set[str]:
    return set(_parts(raw))


def keys_overlap(left: str, right: str) -> bool:
    return bool(key_aliases(left) & key_aliases(right))


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

    confirmed_for_max = int(max_accounts)
    if not cleaned:
        raise ValueError('Select at least one active account')
    # Collapse aliases that point at the same demat.
    collapsed: list[str] = []
    for key in cleaned:
        if any(keys_overlap(key, e) for e in collapsed):
            continue
        collapsed.append(key)
    cleaned = collapsed
    if len(cleaned) > max_accounts:
        raise ValueError(
            f'Your plan allows {max_accounts} active accounts across all phones',
        )

    existing_keys, existing_max = await get_active_set(db, user_id)
    if existing_keys and existing_max == max_accounts:
        # Locked set for this plan: cannot swap in a different group of demats.
        missing = [
            k
            for k in existing_keys
            if not any(keys_overlap(k, n) for n in cleaned)
        ]
        if missing:
            raise ValueError(
                'Active accounts are already chosen for this Google account '
                'on another phone. You cannot pick a different set. '
                'Delete an active account first to free a slot.',
            )
        ordered = list(existing_keys)
        for key in cleaned:
            if not any(keys_overlap(key, e) for e in ordered):
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

    drop_parts: set[str] = set()
    for raw in remove_keys:
        drop_parts |= key_aliases(str(raw))
        key = normalize_active_key(str(raw))
        if key:
            drop_parts |= key_aliases(key)
    if not drop_parts:
        return existing_keys, existing_max

    remaining = [
        k for k in existing_keys if not (key_aliases(k) & drop_parts)
    ]
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
