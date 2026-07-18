"""SQLite result cache keyed by (company_share_id, boid).

Only definitive results are cached (ok=True). Errors are never cached so a
transient failure does not stick.
"""
from __future__ import annotations

import json
import sqlite3
import time
from dataclasses import asdict
from threading import Lock

from .cdsc import CheckResult
from .config import get_settings


class ResultCache:
    def __init__(self, path: str | None = None, ttl: int | None = None) -> None:
        settings = get_settings()
        self._path = path or settings.cache_db
        self._ttl = ttl if ttl is not None else settings.cache_ttl
        self._lock = Lock()
        self._conn = sqlite3.connect(self._path, check_same_thread=False)
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS results (
                company_share_id TEXT NOT NULL,
                boid TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (company_share_id, boid)
            )
            """
        )
        self._conn.commit()

    def get(self, company_share_id: int | str, boid: str) -> CheckResult | None:
        key = (str(company_share_id), boid)
        with self._lock:
            row = self._conn.execute(
                "SELECT payload, created_at FROM results "
                "WHERE company_share_id = ? AND boid = ?",
                key,
            ).fetchone()
        if not row:
            return None
        payload, created_at = row
        if self._ttl and time.time() - created_at > self._ttl:
            return None
        data = json.loads(payload)
        return CheckResult(**data)

    def put(self, company_share_id: int | str, boid: str, result: CheckResult) -> None:
        if not result.ok:
            return
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO results "
                "(company_share_id, boid, payload, created_at) VALUES (?, ?, ?, ?)",
                (
                    str(company_share_id),
                    boid,
                    json.dumps(asdict(result)),
                    int(time.time()),
                ),
            )
            self._conn.commit()
