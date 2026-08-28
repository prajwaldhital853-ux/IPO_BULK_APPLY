from __future__ import annotations

import base64
from datetime import datetime

ADMIN_PAGE_SIZE = 50
ADMIN_PAGE_SIZE_MAX = 50


def encode_cursor(created_at: datetime, row_id: str) -> str:
    ts = created_at.timestamp()
    raw = f'{ts:.6f}|{row_id}'
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip('=')


def decode_cursor(cursor: str) -> tuple[datetime, str]:
    pad = '=' * (-len(cursor) % 4)
    raw = base64.urlsafe_b64decode((cursor + pad).encode()).decode()
    ts_str, row_id = raw.split('|', 1)
    return datetime.fromtimestamp(float(ts_str)), row_id


def total_pages(total_count: int, page_size: int) -> int:
    if total_count <= 0:
        return 1
    return max(1, (total_count + page_size - 1) // page_size)
