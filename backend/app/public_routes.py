from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from .auth.deps import CurrentUser, get_optional_user
from .db.session import get_db
from .feedback import create_feedback
from .public_settings import settings_to_public
from .site_settings import get_or_create_settings
from .team import get_team_member, list_team_members, photo_public_path
from .market_closures import list_market_closures
from .admin.schemas import (
    FeedbackSubmitIn,
    FeedbackSubmitOut,
    MarketClosureOut,
    PublicAppSettingsOut,
    TeamMemberOut,
)

router = APIRouter(prefix='/app', tags=['app'])


def team_member_to_out(row) -> TeamMemberOut:  # noqa: ANN001
    return TeamMemberOut(
        id=row.id,
        name=row.name,
        role=row.role,
        bio=row.bio,
        email=row.email or None,
        whatsapp=row.whatsapp or None,
        accent=row.accent,
        photoUrl=photo_public_path(row),
        sortOrder=row.sort_order,
    )


@router.get('/public-settings', response_model=PublicAppSettingsOut)
async def public_settings(db: AsyncSession = Depends(get_db)) -> PublicAppSettingsOut:
    row = await get_or_create_settings(db)
    return settings_to_public(row)


@router.get('/team', response_model=list[TeamMemberOut])
async def public_team(db: AsyncSession = Depends(get_db)) -> list[TeamMemberOut]:
    rows = await list_team_members(db)
    return [team_member_to_out(r) for r in rows]


@router.get('/market-closures', response_model=list[MarketClosureOut])
async def public_market_closures(
    db: AsyncSession = Depends(get_db),
) -> list[MarketClosureOut]:
    rows = await list_market_closures(db, active_only=True)
    return [
        MarketClosureOut(
            id=r.id,
            date=r.date,
            title=r.title,
            notice=r.notice or '',
            color=r.color,
            active=bool(r.active),
        )
        for r in rows
    ]


@router.get('/team/{member_id}/photo')
async def team_member_photo(
    member_id: str,
    db: AsyncSession = Depends(get_db),
) -> Response:
    row = await get_team_member(db, member_id)
    if row is None or not row.photo_b64:
        raise HTTPException(status_code=404, detail='No photo for this member')
    import base64

    try:
        data = base64.b64decode(row.photo_b64)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail='Invalid photo data') from e
    return Response(
        content=data,
        media_type=row.photo_mime or 'image/jpeg',
        headers={'Cache-Control': 'public, max-age=300'},
    )


@router.get('/payment-qr')
async def payment_qr_image(db: AsyncSession = Depends(get_db)) -> Response:
    row = await get_or_create_settings(db)
    if not row.payment_qr_image_b64:
        raise HTTPException(status_code=404, detail='No payment QR image uploaded')
    import base64

    try:
        data = base64.b64decode(row.payment_qr_image_b64)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail='Invalid QR image data') from e
    mime = row.payment_qr_image_mime or 'image/jpeg'
    return Response(
        content=data,
        media_type=mime,
        headers={'Cache-Control': 'public, max-age=300'},
    )


@router.get('/logo')
async def app_logo(db: AsyncSession = Depends(get_db)) -> Response:
    row = await get_or_create_settings(db)
    if not getattr(row, 'app_logo_b64', None):
        raise HTTPException(status_code=404, detail='No app logo uploaded')
    import base64

    try:
        data = base64.b64decode(row.app_logo_b64)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail='Invalid logo data') from e
    mime = getattr(row, 'app_logo_mime', None) or 'image/png'
    return Response(
        content=data,
        media_type=mime,
        headers={'Cache-Control': 'public, max-age=300'},
    )


@router.get('/popup-notice')
async def popup_notice_image_legacy(db: AsyncSession = Depends(get_db)) -> Response:
    """Serve first notice (legacy single URL). Prefer /popup-notice/{id}."""
    from .public_settings import load_popup_notice_items

    row = await get_or_create_settings(db)
    items = load_popup_notice_items(row)
    if not items:
        raise HTTPException(status_code=404, detail='No popup notice uploaded')
    import base64

    first = items[0]
    try:
        data = base64.b64decode(first['image_b64'])
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail='Invalid notice image data') from e
    return Response(
        content=data,
        media_type=first.get('mime') or 'image/jpeg',
        headers={'Cache-Control': 'public, max-age=300'},
    )


@router.get('/popup-notice/{notice_id}')
async def popup_notice_image(
    notice_id: str,
    db: AsyncSession = Depends(get_db),
) -> Response:
    from .public_settings import find_popup_notice

    row = await get_or_create_settings(db)
    item = find_popup_notice(row, notice_id)
    if item is None:
        raise HTTPException(status_code=404, detail='Notice not found')
    import base64

    try:
        data = base64.b64decode(item['image_b64'])
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail='Invalid notice image data') from e
    return Response(
        content=data,
        media_type=item.get('mime') or 'image/jpeg',
        headers={'Cache-Control': 'public, max-age=300'},
    )


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
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f'Could not save feedback: {e}') from e
    return FeedbackSubmitOut(id=row.id, ok=True)
