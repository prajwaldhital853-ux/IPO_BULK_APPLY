from __future__ import annotations

import base64
import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db.models import TeamMember

_ALLOWED_PHOTO_MIME = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}
_MAX_PHOTO_BYTES = 2 * 1024 * 1024


def photo_public_path(row: TeamMember) -> str | None:
    if row.photo_b64:
        stamp = int(row.updated_at.timestamp()) if row.updated_at else 0
        return f'/app/team/{row.id}/photo?v={stamp}'
    return None


async def list_team_members(db: AsyncSession) -> list[TeamMember]:
    stmt = select(TeamMember).order_by(
        TeamMember.sort_order.asc(),
        TeamMember.created_at.asc(),
    )
    return list((await db.scalars(stmt)).all())


async def get_team_member(db: AsyncSession, member_id: str) -> TeamMember | None:
    return await db.get(TeamMember, member_id)


def _decode_photo(raw_b64: str, mime: str | None) -> tuple[str, str]:
    resolved_mime = (mime or 'image/jpeg').strip().lower()
    match = re.match(
        r'^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$',
        raw_b64.strip(),
        flags=re.DOTALL,
    )
    payload = raw_b64
    if match:
        resolved_mime = match.group(1).lower()
        payload = match.group(2)
    payload = re.sub(r'\s+', '', payload)
    try:
        data = base64.b64decode(payload, validate=False)
    except Exception as e:  # noqa: BLE001
        raise ValueError('Invalid photo data') from e
    if not data:
        raise ValueError('Empty photo')
    if len(data) > _MAX_PHOTO_BYTES:
        raise ValueError('Photo too large (max 2 MB)')
    if resolved_mime == 'image/jpg':
        resolved_mime = 'image/jpeg'
    if resolved_mime not in _ALLOWED_PHOTO_MIME:
        raise ValueError('Upload a JPG, PNG, WEBP, or GIF image')
    return base64.b64encode(data).decode('ascii'), resolved_mime


async def create_team_member(
    db: AsyncSession,
    *,
    name: str,
    role: str,
    bio: str,
    email: str | None,
    whatsapp: str | None,
    accent: str,
    sort_order: int | None,
    photo_base64: str | None,
    photo_mime: str | None,
) -> TeamMember:
    if not name.strip():
        raise ValueError('Name is required')
    row = TeamMember(
        id=str(uuid.uuid4()),
        name=name.strip(),
        role=role.strip(),
        bio=bio.strip(),
        email=(email or '').strip() or None,
        whatsapp=(whatsapp or '').strip() or None,
        accent=(accent or '#42A5F5').strip(),
        sort_order=int(sort_order or 0),
    )
    if photo_base64:
        row.photo_b64, row.photo_mime = _decode_photo(photo_base64, photo_mime)
    db.add(row)
    await db.flush()
    return row


async def update_team_member(
    db: AsyncSession,
    member_id: str,
    *,
    name: str | None = None,
    role: str | None = None,
    bio: str | None = None,
    email: str | None = None,
    whatsapp: str | None = None,
    accent: str | None = None,
    sort_order: int | None = None,
    photo_base64: str | None = None,
    photo_mime: str | None = None,
    clear_photo: bool = False,
) -> TeamMember:
    row = await db.get(TeamMember, member_id)
    if row is None:
        raise LookupError('Team member not found')
    if name is not None:
        row.name = name.strip()
    if role is not None:
        row.role = role.strip()
    if bio is not None:
        row.bio = bio.strip()
    if email is not None:
        row.email = email.strip() or None
    if whatsapp is not None:
        row.whatsapp = whatsapp.strip() or None
    if accent is not None:
        row.accent = accent.strip() or '#42A5F5'
    if sort_order is not None:
        row.sort_order = int(sort_order)
    if clear_photo:
        row.photo_b64 = None
        row.photo_mime = None
    elif photo_base64:
        row.photo_b64, row.photo_mime = _decode_photo(photo_base64, photo_mime)
    row.updated_at = datetime.now(UTC)
    await db.flush()
    return row


async def delete_team_member(db: AsyncSession, member_id: str) -> None:
    row = await db.get(TeamMember, member_id)
    if row is None:
        raise LookupError('Team member not found')
    await db.delete(row)
    await db.flush()
