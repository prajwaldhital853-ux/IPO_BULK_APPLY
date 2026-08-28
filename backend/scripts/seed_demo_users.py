"""Seed demo users for admin-panel pagination / search testing.

Demo users are clearly marked and safe to delete:
  email: demo-user-0001@nepseghar-test.local
  google_sub: demo-seed-0001

Run from backend/ (with .env or DATABASE_URL set):

  python -m scripts.seed_demo_users --count 1000
  python -m scripts.seed_demo_users --clear

Or after deploy (admin JWT required):

  curl -X POST "https://api.nepseghar.com/admin/demo-users/seed?count=1000" \\
    -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.admin.demo_users import clear_demo_users, count_demo_users, ensure_demo_users
from app.config import get_settings
from app.db.session import configure, init_db, run_with_session


async def run(count: int, clear: bool) -> None:
    settings = get_settings()
    configure(settings.database_url)
    await init_db()

    if clear:
        removed = await run_with_session(clear_demo_users)
        print(f'Removed {removed} demo user(s).')
        return

    result = await run_with_session(lambda db: ensure_demo_users(db, target=count))
    if result['created'] == 0:
        print(
            f'Already have {result["total"]} demo users (target {count}). '
            'Use --clear first or pass a higher --count.',
        )
        return
    print(
        f'Created {result["created"]} demo user(s). '
        f'Total demo users: {result["total"]}.',
    )


def main() -> None:
    ap = argparse.ArgumentParser(description='Seed demo users for admin testing.')
    ap.add_argument(
        '--count',
        type=int,
        default=1000,
        help='Target total demo users (default: 1000).',
    )
    ap.add_argument(
        '--clear',
        action='store_true',
        help='Delete all demo users (email demo-user-*@nepseghar-test.local).',
    )
    args = ap.parse_args()
    if args.count < 1 and not args.clear:
        raise SystemExit('--count must be >= 1')
    asyncio.run(run(args.count, args.clear))


if __name__ == '__main__':
    main()
