from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import CurrentUser, get_optional_user
from ..db.session import get_db
from ..feedback import create_feedback
from ..public_settings import settings_to_public
from ..site_settings import get_or_create_settings
from .admin.schemas import FeedbackSubmitIn, FeedbackSubmitOut, PublicAppSettingsOut

router = APIRouter(prefix='/app', tags=['app'])


@router.get('/public-settings', response_model=PublicAppSettingsOut)
async def public_settings(db: AsyncSession = Depends(get_db)) -> PublicAppSettingsOut:
    row = await get_or_create_settings(db)
    return settings_to_public(row)


@router.post('/feedback', response_model=FeedbackSubmitOut)
async def submit_feedback(
    body: FeedbackSubmitIn,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser | None = Depends(get_optional_user),
) -> FeedbackSubmitOut:
    try:
        row = await create_feedback(
            db,
            kind=body.kind,
            name=body.name or (user.email if user else ''),
            email=body.email or (user.email if user else ''),
            message=body.message,
            user_id=user.id if user else None,
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return FeedbackSubmitOut(id=row.id, ok=True)
