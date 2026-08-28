from __future__ import annotations

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import (
    PremiumEntitlement,
    RefreshToken,
    SubscriptionRequest,
    User,
    UserActiveAccounts,
    UserDematSlot,
    UserDeviceSlot,
    UserNote,
    UserPinOtp,
    UserPriceAlert,
)


async def delete_user_by_id(db: AsyncSession, user_id: str) -> bool:
    """Delete a user and all owned server data. Returns False if not found."""
    row = await db.get(User, user_id)
    if row is None:
        return False

    # Explicit deletes — SQLite often lacks ORM/FK cascade at runtime.
    await db.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
    await db.execute(
        delete(PremiumEntitlement).where(PremiumEntitlement.user_id == user_id),
    )
    await db.execute(
        delete(SubscriptionRequest).where(SubscriptionRequest.user_id == user_id),
    )
    await db.execute(delete(UserPinOtp).where(UserPinOtp.user_id == user_id))
    await db.execute(delete(UserNote).where(UserNote.user_id == user_id))
    await db.execute(delete(UserDeviceSlot).where(UserDeviceSlot.user_id == user_id))
    await db.execute(delete(UserDematSlot).where(UserDematSlot.user_id == user_id))
    await db.execute(
        delete(UserActiveAccounts).where(UserActiveAccounts.user_id == user_id),
    )
    await db.execute(delete(UserPriceAlert).where(UserPriceAlert.user_id == user_id))
    await db.delete(row)
    return True
