from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import CurrentUser, get_current_user
from ..db.models import UserNote
from ..db.session import get_db

router = APIRouter(prefix='/app/notes', tags=['notes'])

TITLE_MAX = 200
BODY_MAX = 20_000


class NoteIn(BaseModel):
    title: str = Field(default='', max_length=TITLE_MAX)
    body: str = Field(default='', max_length=BODY_MAX)
    pinned: bool = False


class NotePatch(BaseModel):
    title: str | None = Field(default=None, max_length=TITLE_MAX)
    body: str | None = Field(default=None, max_length=BODY_MAX)
    pinned: bool | None = None


class NoteOut(BaseModel):
    id: str
    title: str
    body: str
    pinned: bool
    createdAt: str
    updatedAt: str


def _iso(dt: datetime | None) -> str:
    if dt is None:
        return ''
    if dt.tzinfo is None:
        return dt.isoformat() + 'Z'
    return dt.isoformat()


def _out(row: UserNote) -> NoteOut:
    return NoteOut(
        id=row.id,
        title=row.title or '',
        body=row.body or '',
        pinned=bool(row.pinned),
        createdAt=_iso(row.created_at),
        updatedAt=_iso(row.updated_at),
    )


def _clean_title(raw: str) -> str:
    return (raw or '').strip()[:TITLE_MAX]


def _clean_body(raw: str) -> str:
    return (raw or '')[:BODY_MAX]


@router.get('', response_model=list[NoteOut])
async def list_notes(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[NoteOut]:
    rows = (
        await db.scalars(
            select(UserNote)
            .where(UserNote.user_id == user.id)
            .order_by(UserNote.pinned.desc(), UserNote.updated_at.desc()),
        )
    ).all()
    return [_out(r) for r in rows]


@router.post('', response_model=NoteOut)
async def create_note(
    body: NoteIn,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NoteOut:
    title = _clean_title(body.title)
    text = _clean_body(body.body)
    if not title and not text.strip():
        raise HTTPException(status_code=400, detail='Note cannot be empty')
    if not title:
        title = text.strip().split('\n', 1)[0][:80] or 'Untitled'
    row = UserNote(
        id=str(uuid.uuid4()),
        user_id=user.id,
        title=title,
        body=text,
        pinned=bool(body.pinned),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _out(row)


@router.get('/{note_id}', response_model=NoteOut)
async def get_note(
    note_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NoteOut:
    row = await db.get(UserNote, note_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail='Note not found')
    return _out(row)


@router.patch('/{note_id}', response_model=NoteOut)
async def update_note(
    note_id: str,
    body: NotePatch,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NoteOut:
    row = await db.get(UserNote, note_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail='Note not found')
    if body.title is not None:
        row.title = _clean_title(body.title) or row.title
    if body.body is not None:
        row.body = _clean_body(body.body)
    if body.pinned is not None:
        row.pinned = bool(body.pinned)
    if not (row.title or '').strip() and not (row.body or '').strip():
        raise HTTPException(status_code=400, detail='Note cannot be empty')
    await db.commit()
    await db.refresh(row)
    return _out(row)


@router.delete('/{note_id}')
async def delete_note(
    note_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    row = await db.get(UserNote, note_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail='Note not found')
    await db.delete(row)
    await db.commit()
    return {'ok': True}
