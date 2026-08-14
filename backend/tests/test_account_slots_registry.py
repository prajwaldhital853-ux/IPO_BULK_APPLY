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
    list_registry,
    release_devices,
    sync_device_keys,
)
from app.account_slots.service import IDLE_FREE, list_slots, prune_devices, upsert_slot
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

        # --- Phone B uninstalls: its demats free up once it stops reporting. ---
        slot = next(s for s in await list_slots(db, uid) if s.device_id == 'B')
        slot.last_seen_at = datetime.now(UTC) - IDLE_FREE - timedelta(minutes=1)
        await db.commit()
        dead = await prune_devices(db, uid, keep_device_id='A', free_idle=True)
        await release_devices(db, uid, dead)
        await db.commit()
        state = build_state(
            await list_registry(db, uid),
            max_accounts=10,
            unlimited=False,
        )
        check('uninstalled phone is forgotten', dead == ['B'])
        check('uninstalled phone frees its demats', state.total == 11)
        allowed, _ = await can_add_key(
            db,
            user_id=uid,
            candidate_key='d:130499999999',
            max_accounts=20,
            unlimited=False,
        )
        check('freed slots can be reused', allowed is True)

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
