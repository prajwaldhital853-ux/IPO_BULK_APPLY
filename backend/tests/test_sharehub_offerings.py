"""Unit tests for ShareHub offering classification (no server required).

Run from backend/: python -m tests.test_sharehub_offerings
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.push.sharehub_offerings import (  # noqa: E402
    SharehubOffering,
    effective_close,
    is_offering_closed,
    is_offering_current,
)


def _row(**kwargs) -> SharehubOffering:
    base = dict(
        sharehub_id=1,
        symbol='TEST',
        name='Test Company',
        offering_type='Ipo',
        status='Open',
        opening_date=date(2026, 8, 1),
        closing_date=date(2026, 8, 10),
        extended_closing_date=None,
        match_key='test|test|generalpublic',
    )
    base.update(kwargs)
    return SharehubOffering(**base)


def test_current_window() -> None:
    today = date(2026, 8, 5)
    assert is_offering_current(_row(), today)
    assert not is_offering_closed(_row(), today)


def test_last_day_still_current() -> None:
    today = date(2026, 8, 10)
    assert is_offering_current(_row(), today)
    assert not is_offering_closed(_row(), today)


def test_closed_after_window() -> None:
    today = date(2026, 8, 11)
    row = _row(status='Closed')
    assert not is_offering_current(row, today)
    assert is_offering_closed(row, today)


def test_effective_close_prefers_extended() -> None:
    row = _row(extended_closing_date=date(2026, 8, 15))
    assert effective_close(row) == date(2026, 8, 15)


if __name__ == '__main__':
    test_current_window()
    test_last_day_still_current()
    test_closed_after_window()
    test_effective_close_prefers_extended()
    print('All sharehub offering tests passed.')
