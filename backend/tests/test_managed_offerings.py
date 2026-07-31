"""Unit tests for managed offering helpers (no server required).

Run from backend/: python -m tests.test_managed_offerings
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Allow `python -m tests.test_managed_offerings` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.models import Base
from app.managed_offerings import (
    build_match_key,
    create_managed_offering,
    delete_managed_offering,
    list_managed_offerings,
    update_managed_offering,
)

failures: list[str] = []


def check(name: str, cond: bool) -> None:
    if cond:
        print(f'  PASS {name}')
    else:
        print(f'  FAIL {name}')
        failures.append(name)


check(
    'match key normalizes name/symbol/audience',
    build_match_key(
        name='7% Laxmi Sunrise Debenture 2092',
        symbol='LSBD2092',
        audience='For General Public',
    )
    == build_match_key(
        name='7% Laxmi Sunrise Debenture 2092',
        symbol='lsbd2092',
        audience='GeneralPublic',
    ),
)

check(
    'match key distinguishes audiences',
    build_match_key(name='Acme', symbol='ACME', audience='GeneralPublic')
    != build_match_key(name='Acme', symbol='ACME', audience='ForeignEmployment'),
)


async def _crud() -> None:
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with factory() as db:
        row = await create_managed_offering(
            db,
            name='Test Hydro Limited',
            symbol='THL',
            offering_type='Ipo',
            audience='GeneralPublic',
            issue_manager='NMB Capital',
            status='Open',
            units=1_000_000,
            applied_units=100_000,
            applicants=500,
            price=100,
            opening_date='2026-07-30',
            closing_date='2026-08-04',
            active=True,
        )
        await db.commit()
        check('create assigns id', bool(row.id))
        check('create builds match key', 'testhydrolimited' in row.match_key)

        rows = await list_managed_offerings(db, active_only=True)
        check('list returns created row', len(rows) == 1)

        try:
            await create_managed_offering(
                db,
                name='Test Hydro Limited',
                symbol='THL',
                audience='GeneralPublic',
            )
            check('duplicate match key rejected', False)
        except ValueError:
            check('duplicate match key rejected', True)

        updated = await update_managed_offering(
            db,
            row.id,
            name='Test Hydro Limited',
            symbol='THL',
            offering_type='Ipo',
            audience='GeneralPublic',
            issue_manager='NMB Capital Limited',
            status='Closed',
            units=1_000_000,
            applied_units=900_000,
            applicants=900,
            price=100,
            opening_date='2026-07-30',
            closing_date='2026-08-04',
            active=True,
        )
        await db.commit()
        check('update status', updated.status == 'Closed')
        check('update applied units', updated.applied_units == 900_000)

        inactive = await update_managed_offering(
            db,
            row.id,
            name='Test Hydro Limited',
            symbol='THL',
            offering_type='Ipo',
            status='Closed',
            active=False,
        )
        await db.commit()
        active_only = await list_managed_offerings(db, active_only=True)
        all_rows = await list_managed_offerings(db, active_only=False)
        check('active_only hides inactive', len(active_only) == 0)
        check('admin list includes inactive', len(all_rows) == 1 and not inactive.active)

        await delete_managed_offering(db, row.id)
        await db.commit()
        check(
            'delete removes row',
            len(await list_managed_offerings(db, active_only=False)) == 0,
        )

        try:
            await create_managed_offering(db, name='', symbol='X')
            check('empty name rejected', False)
        except ValueError:
            check('empty name rejected', True)

        try:
            await create_managed_offering(
                db,
                name='Bad Date Co',
                opening_date='30-07-2026',
            )
            check('bad date rejected', False)
        except ValueError:
            check('bad date rejected', True)

    await engine.dispose()


asyncio.run(_crud())

if failures:
    print(f'\n{len(failures)} FAILED')
    sys.exit(1)
print('\nAll managed offering tests passed.')
