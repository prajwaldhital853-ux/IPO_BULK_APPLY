from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .models import Base

_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def configure(database_url: str) -> None:
    global _engine, _session_factory
    _engine = create_async_engine(database_url, echo=False)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


def _apply_sqlite_patches(sync_conn) -> None:
    """Add columns introduced after first deploy (create_all does not alter tables)."""
    insp = inspect(sync_conn)
    tables = set(insp.get_table_names())
    if 'user_feedback' in tables:
        cols = {c['name'] for c in insp.get_columns('user_feedback')}
        if 'status' not in cols:
            sync_conn.execute(
                text(
                    "ALTER TABLE user_feedback "
                    "ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'new'"
                )
            )


async def init_db() -> None:
    if _engine is None:
        raise RuntimeError('Database not configured')
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if _engine.url.get_backend_name() == 'sqlite':
            await conn.run_sync(_apply_sqlite_patches)


async def run_with_session(coro) -> None:
    """Run a coroutine with a one-off DB session (startup tasks)."""
    if _session_factory is None:
        raise RuntimeError('Database not configured')
    async with _session_factory() as session:
        await coro(session)
        await session.commit()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    if _session_factory is None:
        raise RuntimeError('Database not configured')
    async with _session_factory() as session:
        yield session
