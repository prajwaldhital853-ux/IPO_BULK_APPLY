"""Persistent CDSC company-list cache.

Serves the dropdown from disk so most app opens never hit CDSC.
Background refresh merges newly listed IPOs into the cache.
"""
from __future__ import annotations

import json
import logging
import sqlite3
import time
from dataclasses import dataclass
from threading import Lock

from .config import get_settings

log = logging.getLogger("cdsc-company-cache")


@dataclass
class CachedCompany:
    id: int
    name: str
    scrip: str | None = None


@dataclass
class CompanyCacheSnapshot:
    companies: list[CachedCompany]
    fetched_at: int  # unix seconds; 0 = never
    source: str  # "cache" | "live" | "empty"


class CompanyListCache:
    def __init__(self, path: str | None = None) -> None:
        settings = get_settings()
        self._path = path or settings.cache_db
        self._lock = Lock()
        self._conn = sqlite3.connect(self._path, check_same_thread=False)
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS company_list_meta (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                fetched_at INTEGER NOT NULL,
                payload TEXT NOT NULL
            )
            """
        )
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS company_list (
                company_share_id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                scrip TEXT,
                first_seen_at INTEGER NOT NULL,
                last_seen_at INTEGER NOT NULL,
                active INTEGER NOT NULL DEFAULT 1
            )
            """
        )
        self._conn.commit()

    def age_seconds(self) -> int | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT fetched_at FROM company_list_meta WHERE id = 1"
            ).fetchone()
        if not row or not row[0]:
            return None
        return max(0, int(time.time()) - int(row[0]))

    def is_stale(self, ttl_seconds: int) -> bool:
        age = self.age_seconds()
        if age is None:
            return True
        return age >= max(60, ttl_seconds)

    def get_active(self) -> CompanyCacheSnapshot:
        with self._lock:
            meta = self._conn.execute(
                "SELECT fetched_at FROM company_list_meta WHERE id = 1"
            ).fetchone()
            rows = self._conn.execute(
                "SELECT company_share_id, name, scrip FROM company_list "
                "WHERE active = 1 ORDER BY name COLLATE NOCASE"
            ).fetchall()
        fetched_at = int(meta[0]) if meta else 0
        companies = [
            CachedCompany(
                id=int(r[0]),
                name=str(r[1]),
                scrip=(str(r[2]).strip() if r[2] else None) or None,
            )
            for r in rows
        ]
        return CompanyCacheSnapshot(
            companies=companies,
            fetched_at=fetched_at,
            source="cache" if companies else "empty",
        )

    def merge_live(
        self,
        live: list[tuple[int, str, str | None]],
    ) -> dict[str, object]:
        """
        Upsert live CDSC companies. New IDs are activated; missing IDs stay in
        history but are marked inactive so the dropdown only shows current list
        while we still remember first_seen for analytics.
        """
        now = int(time.time())
        live_ids = {int(cid) for cid, _, _ in live}
        newly_added: list[int] = []

        with self._lock:
            existing = {
                int(r[0]): r
                for r in self._conn.execute(
                    "SELECT company_share_id, name, first_seen_at FROM company_list"
                ).fetchall()
            }

            for cid, name, scrip in live:
                cid_i = int(cid)
                clean_name = (name or "").strip() or f"Company {cid_i}"
                clean_scrip = (scrip or "").strip() or None
                if cid_i not in existing:
                    newly_added.append(cid_i)
                    self._conn.execute(
                        "INSERT INTO company_list "
                        "(company_share_id, name, scrip, first_seen_at, last_seen_at, active) "
                        "VALUES (?, ?, ?, ?, ?, 1)",
                        (cid_i, clean_name, clean_scrip, now, now),
                    )
                else:
                    self._conn.execute(
                        "UPDATE company_list SET name = ?, scrip = ?, "
                        "last_seen_at = ?, active = 1 WHERE company_share_id = ?",
                        (clean_name, clean_scrip, now, cid_i),
                    )

            # Mark companies not in the latest CDSC payload as inactive.
            for cid_i in existing:
                if cid_i not in live_ids:
                    self._conn.execute(
                        "UPDATE company_list SET active = 0, last_seen_at = ? "
                        "WHERE company_share_id = ?",
                        (now, cid_i),
                    )

            payload = json.dumps(
                [{"id": c, "name": n, "scrip": s} for c, n, s in live]
            )
            self._conn.execute(
                "INSERT OR REPLACE INTO company_list_meta (id, fetched_at, payload) "
                "VALUES (1, ?, ?)",
                (now, payload),
            )
            self._conn.commit()

        if newly_added:
            log.info(
                "CDSC company cache: +%d new compan(y/ies): %s",
                len(newly_added),
                newly_added[:20],
            )
        else:
            log.info("CDSC company cache refreshed (%d companies, no new IDs)", len(live))

        return {
            "fetched_at": now,
            "count": len(live),
            "newly_added": newly_added,
            "newly_added_count": len(newly_added),
        }
