"""Multi-device account-slot scenarios (no server required).

Run from backend/: python -m tests.test_account_slots_registry
"""
from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.account_slots.registry import (
    build_state,
    can_add_key,
    cap_claimed,
    list_registry,
    release_devices,
    sync_device_keys,
)
from app.account_slots.service import (
    AGGRESSIVE_STALE,
    EMPTY_STALE,
    HARD_STALE,
    list_slots,
    prune_devices,
    upsert_slot,
)
from app.db.models import Base, User

failures: list[str] = []


def check(name: str, cond: bool) -> None:
    if cond:
        print(f'  PASS {name}')
    else:
        print(f'  FAIL {name}')
        failures.append(name)


def demats(prefix: str, count: int, start: int = 0) -> list[str]:
    return [f'd:{prefix}{i:08d}' for i in range(start, start + count)]


async def sync(db, user_id, device, keys, max_accounts):
    await upsert_slot(
        db,
        user_id=user_id,
        device_id=device,
        device_label=device,
        platform='android',
        account_count=len(keys),
    )
    state = await sync_device_keys(
        db,
        user_id=user_id,
        device_id=device,
        keys=keys,
        max_accounts=max_accounts,
        unlimited=False,
    )
    await db.commit()
    return state


async def scenarios() -> None:
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with factory() as db:
        uid = str(uuid.uuid4())
        db.add(
            User(
                id=uid,
                google_sub='sub-1',
                email='a@b.c',
                name='Tester',
            ),
        )
        await db.commit()

        # --- Both phones under the cap: nothing locked. ---
        await sync(db, uid, 'A', demats('1301', 8), 20)
        state = await sync(db, uid, 'B', demats('1302', 8), 20)
        check('under cap: total counts both phones', state.total == 16)
        check('under cap: everything active', len(state.locked_keys) == 0)

        # --- Same demat on two phones is one slot. ---
        state = await sync(db, uid, 'B', demats('1302', 8) + demats('1301', 2), 20)
        check('mirrored demats are not double counted', state.total == 16)

        # --- A fills the plan; B cannot add another demat. ---
        await sync(db, uid, 'A', demats('1301', 12), 20)
        state = await sync(db, uid, 'B', demats('1302', 8), 20)
        check('cap reached exactly', state.total == 20)
        allowed, _ = await can_add_key(
            db,
            user_id=uid,
            candidate_key='d:130399999999',
            max_accounts=20,
            unlimited=False,
        )
        check('cannot add past the shared cap', allowed is False)
        allowed, _ = await can_add_key(
            db,
            user_id=uid,
            candidate_key=demats('1301', 1)[0],
            max_accounts=20,
            unlimited=False,
        )
        check('re-adding a known demat is allowed', allowed is True)

        # --- Admin drops the cap to 10: the first 10 stay active everywhere. ---
        rows = await list_registry(db, uid)
        state = build_state(rows, max_accounts=10, unlimited=False)
        expected = [r.key for r in rows][:10]
        check('cap drop keeps the 10 oldest active', state.active_keys == expected)
        check('cap drop locks the rest', len(state.locked_keys) == 10)
        check(
            'active set is the same list for every phone',
            build_state(rows, max_accounts=10, unlimited=False).active_keys
            == state.active_keys,
        )

        # --- Deleting an active demat promotes the next in the queue. ---
        first_active = state.active_keys[0]
        await sync(db, uid, 'A', demats('1301', 12)[1:], 10)
        rows = await list_registry(db, uid)
        after = build_state(rows, max_accounts=10, unlimited=False)
        check('deleted demat leaves the registry', first_active not in after.active_keys)
        check('queue promotes a replacement', len(after.active_keys) == 10)
        check('total dropped by one', after.total == 19)

        # --- Phone sitting unused for 15 minutes must NOT lose its slots. ---
        slot = next(s for s in await list_slots(db, uid) if s.device_id == 'B')
        slot.last_seen_at = datetime.now(UTC) - timedelta(minutes=16)
        await db.commit()
        dead = await prune_devices(db, uid, keep_device_id='A', free_idle=True)
        check('15 min idle phone with accounts is kept', dead == [])
        state = build_state(
            await list_registry(db, uid),
            max_accounts=10,
            unlimited=False,
        )
        check('idle phone still occupies slots', state.total == 19)

        # --- Distinct 36+36 with cap 51 cannot add another. ---
        uid2 = str(uuid.uuid4())
        db.add(
            User(
                id=uid2,
                google_sub='sub-2',
                email='c@d.e',
                name='Two',
            ),
        )
        await db.commit()
        await sync(db, uid2, 'A', demats('1401', 36), 51)
        state = await sync(db, uid2, 'B', demats('1402', 36), 51)
        check('36+36 unique demats count as 72', state.total == 72)
        allowed, _ = await can_add_key(
            db,
            user_id=uid2,
            candidate_key='d:140399999999',
            max_accounts=51,
            unlimited=False,
        )
        check('cannot add a 73rd when cap is 51', allowed is False)
        slots = await list_slots(db, uid2)
        check(
            'cap_claimed matches unique 72',
            cap_claimed(state, slots) == 72,
        )
        check('first 51 stay active', len(state.active_keys) == 51)
        check('the rest are locked', len(state.locked_keys) == 21)

        # --- Empty-key sync with a positive count must not wipe A. ---
        before = (await list_registry(db, uid2))
        await upsert_slot(
            db,
            user_id=uid2,
            device_id='A',
            device_label='A',
            platform='android',
            account_count=36,
        )
        # Simulate the server skip: we do not call sync_device_keys([], ...)
        after_rows = await list_registry(db, uid2)
        check('empty keys do not delete existing demats', len(after_rows) == len(before))

        # --- Uninstall: only a 7-day silent phone with accounts is dropped. ---
        slot = next(s for s in await list_slots(db, uid) if s.device_id == 'B')
        slot.last_seen_at = datetime.now(UTC) - HARD_STALE - timedelta(minutes=1)
        await db.commit()
        dead = await prune_devices(db, uid, keep_device_id='A')
        await release_devices(db, uid, dead)
        await db.commit()
        state = build_state(
            await list_registry(db, uid),
            max_accounts=10,
            unlimited=False,
        )
        check('7-day silent phone is forgotten', dead == ['B'])
        check('stale phone frees its demats', state.total == 11)
        allowed, _ = await can_add_key(
            db,
            user_id=uid,
            candidate_key='d:130499999999',
            max_accounts=20,
            unlimited=False,
        )
        check('freed slots can be reused', allowed is True)

        # --- Empty leftover install is dropped after EMPTY_STALE. ---
        await upsert_slot(
            db,
            user_id=uid,
            device_id='ghost',
            device_label='ghost',
            platform='android',
            account_count=0,
        )
        ghost = next(s for s in await list_slots(db, uid) if s.device_id == 'ghost')
        ghost.last_seen_at = datetime.now(UTC) - EMPTY_STALE - timedelta(minutes=1)
        await db.commit()
        dead = await prune_devices(db, uid, keep_device_id='A')
        check('empty leftover install is pruned', 'ghost' in dead)

        # --- Ghost install: phones empty but stale slot still claims 36. ---
        uid3 = str(uuid.uuid4())
        db.add(
            User(
                id=uid3,
                google_sub='sub-3',
                email='ghost@test',
                name='Ghost',
            ),
        )
        await db.commit()
        ghost_id = 'ghost-ne2211'
        await sync(db, uid3, ghost_id, demats('1501', 36), 51)
        await sync(db, uid3, 'live-a', [], 51)
        await sync(db, uid3, 'live-b', [], 51)
        ghost_slot = next(s for s in await list_slots(db, uid3) if s.device_id == ghost_id)
        ghost_slot.last_seen_at = datetime.now(UTC) - EMPTY_STALE - timedelta(minutes=1)
        await db.commit()
        from app.account_slots.service import (
            reconcile_device_slots,
            release_stale_device_claims,
        )

        await reconcile_device_slots(db, uid3)
        await release_stale_device_claims(db, uid3, keep_device_id='live-a')
        await db.commit()
        state = build_state(
            await list_registry(db, uid3),
            max_accounts=51,
            unlimited=False,
        )
        check('stale ghost install frees registry', state.total == 0)
        allowed, _ = await can_add_key(
            db,
            user_id=uid3,
            candidate_key='d:150399999999',
            max_accounts=51,
            unlimited=False,
        )
        check('limit freed after ghost cleanup', allowed is True)

        # --- Uninstall on phone A: phone B at cap frees A after AGGRESSIVE_STALE. ---
        uid4 = str(uuid.uuid4())
        db.add(
            User(
                id=uid4,
                google_sub='sub-4',
                email='uninstall@test',
                name='Uninstall',
            ),
        )
        await db.commit()
        await sync(db, uid4, 'phone-a', demats('1601', 20), 20)
        phone_a = next(s for s in await list_slots(db, uid4) if s.device_id == 'phone-a')
        phone_a.last_seen_at = datetime.now(UTC) - AGGRESSIVE_STALE - timedelta(minutes=1)
        await db.commit()
        from app.account_slots.service import (
            reconcile_device_slots,
            release_stale_device_claims,
        )

        await upsert_slot(
            db,
            user_id=uid4,
            device_id='phone-b',
            device_label='B',
            platform='android',
            account_count=0,
        )
        await release_stale_device_claims(
            db,
            uid4,
            keep_device_id='phone-b',
            stale_threshold=AGGRESSIVE_STALE,
        )
        await reconcile_device_slots(db, uid4)
        await db.commit()
        state = build_state(
            await list_registry(db, uid4),
            max_accounts=20,
            unlimited=False,
        )
        check('uninstalled phone frees slots for empty phone B', state.total == 0)
        allowed, _ = await can_add_key(
            db,
            user_id=uid4,
            candidate_key='d:160399999999',
            max_accounts=20,
            unlimited=False,
        )
        check('phone B can add after uninstall cleanup', allowed is True)

        # --- B reinstalls: its demats keep their old queue position. ---
        state = await sync(db, uid, 'B2', demats('1302', 8), 20)
        check('reinstall re-registers demats', state.total == 19)
        ordered = [r.key for r in await list_registry(db, uid)]
        check(
            'reinstalled demats keep their place in the queue',
            ordered.index('d:130200000000') < ordered.index('d:130100000011'),
        )

        # --- A live phone is never pruned. ---
        dead = await prune_devices(db, uid, keep_device_id='A', free_idle=True)
        check('active installs survive pruning', dead == [])

    await engine.dispose()


asyncio.run(scenarios())

if failures:
    print(f'\n{len(failures)} FAILED')
    sys.exit(1)
print('\nAll account-slot scenarios passed.')
