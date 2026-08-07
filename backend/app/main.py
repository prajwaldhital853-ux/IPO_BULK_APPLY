from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from .legal_html import PRIVACY_HTML, TERMS_HTML

from .auth import router as auth_router
from .admin.routes import router as admin_router
from .public_routes import router as public_router
from .push.routes import router as push_router
from .notes.routes import router as notes_router
from .auth.blacklist import init_blacklist
from .auth.deps import CurrentUser, get_current_user, get_optional_user
from .auth.rate_limit import cdsc_user_limiter
from .cache import ResultCache
from .captcha_model import CaptchaModel
from .cdsc import CdscBlockedError, CdscSession, CdscSessionError, CheckResult
from .company_cache import CompanyListCache
from .config import get_settings
from .db.session import configure, init_db, run_with_session
from .schemas import (
    CheckRequest,
    CheckResponse,
    CheckRow,
    CompaniesResponse,
    CompanyOut,
)
from .solver import Solver
from .twocaptcha import TwoCaptchaError, solve_image_base64

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("cdsc-backend")

session = CdscSession()
model = CaptchaModel()
cache = ResultCache()
company_cache = CompanyListCache()
solver = Solver(session, model)
_check_semaphore: asyncio.Semaphore | None = None
_company_refresh_task: asyncio.Task | None = None
_company_refresh_lock: asyncio.Lock | None = None
_broker_flow_refresh_task: asyncio.Task | None = None
_financial_reports_refresh_task: asyncio.Task | None = None
_light_boards_refresh_task: asyncio.Task | None = None


def _refresh_lock() -> asyncio.Lock:
    global _company_refresh_lock
    if _company_refresh_lock is None:
        _company_refresh_lock = asyncio.Lock()
    return _company_refresh_lock


async def _pull_companies_from_cdsc(*, force: bool = False) -> dict[str, object]:
    """Fetch live CDSC list and merge into SQLite cache. Proxy/session used here."""
    settings = get_settings()
    if (
        not force
        and not company_cache.is_stale(settings.cdsc_companies_cache_ttl)
    ):
        snap = company_cache.get_active()
        return {
            "skipped": True,
            "reason": "fresh",
            "count": len(snap.companies),
            "fetched_at": snap.fetched_at,
            "newly_added": [],
            "newly_added_count": 0,
        }

    async with _refresh_lock():
        # Re-check inside lock to avoid stampedes.
        if (
            not force
            and not company_cache.is_stale(settings.cdsc_companies_cache_ttl)
        ):
            snap = company_cache.get_active()
            return {
                "skipped": True,
                "reason": "fresh",
                "count": len(snap.companies),
                "fetched_at": snap.fetched_at,
                "newly_added": [],
                "newly_added_count": 0,
            }

        if not session.ready:
            try:
                await session.start()
            except Exception as e:  # noqa: BLE001
                log.warning("CDSC session start failed during company refresh: %s", e)
                raise

        rows = await session.get_companies()
        live = [(c.id, c.name, c.scrip) for c in rows]
        meta = company_cache.merge_live(live)
        meta["skipped"] = False
        return meta


async def _company_refresh_loop() -> None:
    settings = get_settings()
    interval = max(0, int(settings.cdsc_companies_refresh_seconds))
    if interval <= 0:
        log.info("CDSC company background refresh disabled")
        return

    # Small delay so startup warm-up can finish first.
    await asyncio.sleep(15)
    while True:
        try:
            meta = await _pull_companies_from_cdsc(force=False)
            if not meta.get("skipped"):
                log.info(
                    "Background CDSC company sync: %s companies, +%s new",
                    meta.get("count"),
                    meta.get("newly_added_count"),
                )
        except Exception as e:  # noqa: BLE001
            log.warning("Background CDSC company sync failed: %s", e)
        await asyncio.sleep(interval)


async def _broker_flow_refresh_loop() -> None:
    """Keep Merolagani premium boards warm in Postgres for all users."""
    settings = get_settings()
    interval = max(0, int(settings.broker_flow_refresh_seconds))
    if interval <= 0:
        log.info("Broker flow background refresh disabled")
        return

    await asyncio.sleep(20)
    while True:
        try:
            from .broker_flow import refresh_broker_flow_cache

            async def _run(db):
                return await refresh_broker_flow_cache(db, force=False)

            meta = await run_with_session(_run)
            if meta and not meta.get("skipped"):
                log.info(
                    "Background broker-flow sync: session=%s trades=%s",
                    meta.get("sessionDate"),
                    meta.get("tradesScanned"),
                )
        except Exception as e:  # noqa: BLE001
            log.warning("Background broker-flow sync failed: %s", e)
        await asyncio.sleep(interval)


async def _financial_reports_refresh_loop() -> None:
    """Keep financial reports Postgres cache warm for all users."""
    settings = get_settings()
    interval = max(0, int(settings.financial_reports_refresh_seconds))
    if interval <= 0:
        log.info("Financial reports background refresh disabled")
        return

    await asyncio.sleep(45)
    while True:
        try:
            from .financial_reports_cache import refresh_financial_reports_cache

            async def _run(db):
                return await refresh_financial_reports_cache(db, force=False)

            meta = await run_with_session(_run)
            if meta and not meta.get("skipped"):
                log.info(
                    "Background financial-reports sync: rows=%s",
                    meta.get("rows"),
                )
        except Exception as e:  # noqa: BLE001
            log.warning("Background financial-reports sync failed: %s", e)
        await asyncio.sleep(interval)


async def _light_boards_refresh_loop() -> None:
    """Keep 52W / Unlock / Broker Favorites Postgres cache warm."""
    settings = get_settings()
    interval = max(0, int(settings.light_boards_refresh_seconds))
    if interval <= 0:
        log.info("Light boards background refresh disabled")
        return

    await asyncio.sleep(35)
    while True:
        try:
            from .light_boards_cache import refresh_light_boards_cache

            async def _run(db):
                return await refresh_light_boards_cache(db, force=False)

            meta = await run_with_session(_run)
            if meta and not meta.get("skipped"):
                log.info(
                    "Background light-boards sync: %s",
                    meta.get("counts"),
                )
        except Exception as e:  # noqa: BLE001
            log.warning("Background light-boards sync failed: %s", e)
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _check_semaphore, _company_refresh_task, _broker_flow_refresh_task
    global _financial_reports_refresh_task, _light_boards_refresh_task
    settings = get_settings()
    configure(settings.database_url)
    await init_db()
    from .site_settings import get_or_create_settings, sync_admin_credentials_from_env

    async def _seed(session):
        await get_or_create_settings(session)
        await sync_admin_credentials_from_env(session)

    await run_with_session(_seed)
    await init_blacklist(settings.redis_url or None)
    _check_semaphore = asyncio.Semaphore(settings.max_concurrency)
    try:
        await asyncio.wait_for(session.start(), timeout=60.0)
    except Exception as e:  # noqa: BLE001
        log.warning("CDSC warm-up deferred: %s", e)

    # Best-effort initial company sync (uses cache if CDSC is blocked).
    try:
        await _pull_companies_from_cdsc(force=False)
    except Exception as e:  # noqa: BLE001
        log.warning("Initial CDSC company sync deferred: %s", e)

    # Never block boot on Merolagani / ShareHub warm — nginx 502s while lifespan waits.
    async def _seed_flow_later() -> None:
        await asyncio.sleep(8)
        try:
            from .broker_flow import refresh_broker_flow_cache

            async def _seed_flow(db):
                return await refresh_broker_flow_cache(db, force=True)

            await run_with_session(_seed_flow)
        except Exception as e:  # noqa: BLE001
            log.warning("Initial broker-flow sync deferred: %s", e)

    async def _seed_fin_later() -> None:
        await asyncio.sleep(30)
        try:
            from .financial_reports_cache import refresh_financial_reports_cache

            async def _seed_fin(db):
                return await refresh_financial_reports_cache(db, force=True)

            await run_with_session(_seed_fin)
        except Exception as e:  # noqa: BLE001
            log.warning("Initial financial-reports sync deferred: %s", e)

    async def _seed_light_later() -> None:
        await asyncio.sleep(15)
        try:
            from .light_boards_cache import refresh_light_boards_cache

            async def _seed_light(db):
                return await refresh_light_boards_cache(db, force=True)

            await run_with_session(_seed_light)
        except Exception as e:  # noqa: BLE001
            log.warning("Initial light-boards sync deferred: %s", e)

    _company_refresh_task = asyncio.create_task(_company_refresh_loop())
    _broker_flow_refresh_task = asyncio.create_task(_broker_flow_refresh_loop())
    _financial_reports_refresh_task = asyncio.create_task(
        _financial_reports_refresh_loop()
    )
    _light_boards_refresh_task = asyncio.create_task(_light_boards_refresh_loop())
    asyncio.create_task(_seed_flow_later())
    asyncio.create_task(_seed_fin_later())
    asyncio.create_task(_seed_light_later())
    yield
    for task in (
        _company_refresh_task,
        _broker_flow_refresh_task,
        _financial_reports_refresh_task,
        _light_boards_refresh_task,
    ):
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    await session.close()


app = FastAPI(title="NEPSE GHAR backend", lifespan=lifespan)

_settings = get_settings()
_origins = [o.strip() for o in _settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins if _origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(public_router)
app.include_router(push_router)
app.include_router(notes_router)


def require_key(x_api_key: str = Header(default="")) -> None:
    if x_api_key != get_settings().api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


async def require_cdsc_access(
    x_api_key: str = Header(default=""),
    user: CurrentUser | None = Depends(get_optional_user),
) -> str:
    settings = get_settings()
    if user is not None:
        if not await cdsc_user_limiter.check(user.id):
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        return f"user:{user.id}"
    if settings.cdsc_require_jwt:
        raise HTTPException(
            status_code=401,
            detail="Bearer JWT required for CDSC endpoints",
        )
    require_key(x_api_key)
    if not await cdsc_user_limiter.check(f"key:{x_api_key[:8]}"):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    return "api_key"


async def allow_captcha_solve(
    x_api_key: str = Header(default=""),
    user: CurrentUser | None = Depends(get_optional_user),
) -> str:
    """Permissive auth for the captcha-solve OCR helper.

    This endpoint only turns a captcha image into digits (no portal access, no
    user data), so we never hard-401 it — the in-app result checker must be able
    to auto-solve even when a JWT isn't attached. Still rate-limited to prevent
    abuse.
    """
    ident = (
        f"user:{user.id}"
        if user is not None
        else (f"key:{x_api_key[:8]}" if x_api_key else "anon-captcha")
    )
    if not await cdsc_user_limiter.check(ident):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    return ident


@app.get("/privacy", response_class=HTMLResponse)
async def privacy_policy() -> HTMLResponse:
    """Public privacy policy page for Google Play / store listing."""
    return HTMLResponse(content=PRIVACY_HTML)


@app.get("/terms", response_class=HTMLResponse)
async def terms_of_service() -> HTMLResponse:
    """Public terms page."""
    return HTMLResponse(content=TERMS_HTML)


@app.get("/health")
async def health() -> dict[str, object]:
    snap = company_cache.get_active()
    age = company_cache.age_seconds()
    return {
        "ok": True,
        "session_ready": session.ready,
        "model_available": model.available,
        "companyCacheCount": len(snap.companies),
        "companyCacheAgeSeconds": age,
        "companyCacheFetchedAt": snap.fetched_at or None,
    }


@app.get("/ping")
async def ping() -> dict[str, str]:
    """Lightweight keep-alive for uptime/cron pings (Render free tier)."""
    return {"status": "ok"}


@app.get("/cdsc/companies", response_model=CompaniesResponse)
async def companies(
    refresh: bool = False,
    _: str = Depends(require_cdsc_access),
) -> CompaniesResponse:
    """Return CDSC companies from cache; refresh from CDSC when stale or forced.

    Query: ?refresh=true forces a live pull (uses proxy/session).
    """
    settings = get_settings()
    snap = company_cache.get_active()
    stale = company_cache.is_stale(settings.cdsc_companies_cache_ttl)
    newly_added_count = 0
    served_from_cache = True

    should_live = refresh or stale or not snap.companies
    if should_live:
        try:
            meta = await _pull_companies_from_cdsc(force=refresh or not snap.companies)
            newly_added_count = int(meta.get("newly_added_count") or 0)
            served_from_cache = bool(meta.get("skipped"))
            snap = company_cache.get_active()
            stale = company_cache.is_stale(settings.cdsc_companies_cache_ttl)
        except (CdscBlockedError, CdscSessionError) as e:
            if snap.companies:
                log.warning("CDSC live company pull failed; serving cache: %s", e)
            else:
                raise HTTPException(status_code=503, detail=str(e)) from e
        except Exception as e:  # noqa: BLE001
            if snap.companies:
                log.warning("CDSC live company pull failed; serving cache: %s", e)
            else:
                raise HTTPException(status_code=502, detail=str(e)) from e

    if not snap.companies:
        raise HTTPException(
            status_code=503,
            detail="No CDSC companies in cache and live fetch failed",
        )

    return CompaniesResponse(
        companies=[
            CompanyOut(id=c.id, name=c.name, scrip=c.scrip) for c in snap.companies
        ],
        cached=served_from_cache,
        fetched_at=snap.fetched_at or None,
        newly_added_count=newly_added_count,
        stale=stale,
    )


@app.post("/cdsc/companies/refresh")
async def refresh_companies(_: str = Depends(require_cdsc_access)) -> dict[str, object]:
    """Force a live CDSC company sync (admin / cron / manual)."""
    try:
        meta = await _pull_companies_from_cdsc(force=True)
    except CdscBlockedError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except CdscSessionError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(e)) from e
    snap = company_cache.get_active()
    return {
        "ok": True,
        "count": len(snap.companies),
        "fetchedAt": snap.fetched_at,
        "newlyAdded": meta.get("newly_added") or [],
        "newlyAddedCount": meta.get("newly_added_count") or 0,
        "skipped": bool(meta.get("skipped")),
    }


async def _check_one(company_share_id: int, boid: str) -> CheckRow:
    cached = cache.get(company_share_id, boid)
    if cached is not None:
        return CheckRow(
            boid=boid,
            ok=cached.ok,
            allotted=cached.allotted,
            quantity=cached.quantity,
            message=cached.message,
            cached=True,
        )

    assert _check_semaphore is not None
    async with _check_semaphore:
        result: CheckResult = await solver.check(company_share_id, boid)
    cache.put(company_share_id, boid, result)
    return CheckRow(
        boid=boid,
        ok=result.ok,
        allotted=result.allotted,
        quantity=result.quantity,
        message=result.message,
        cached=False,
    )


class SolveCaptchaRequest(BaseModel):
    image_base64: str


class SolveCaptchaResponse(BaseModel):
    text: str
    confidence: float
    method: str


@app.post("/cdsc/solve-captcha", response_model=SolveCaptchaResponse)
async def solve_captcha(
    req: SolveCaptchaRequest,
    _: str = Depends(allow_captcha_solve),
) -> SolveCaptchaResponse:
    """Solve a CDSC numeric captcha image using ONNX, then 2Captcha fallback.

    The mobile in-app result checker grabs the captcha <img> as a PNG data URL
    and posts it here; the trained model is far more reliable on CDSC's grid
    captchas than generic OCR. When the model is unavailable or too weak, fall
    back to 2Captcha so the phone-side public checker stays automated.
    """
    settings = get_settings()
    model_error = ""

    if model.available:
        try:
            pred = await asyncio.to_thread(model.predict_robust, req.image_base64)
            if (
                len(pred.text) >= settings.cdsc_captcha_digits
                and pred.confidence >= 0.30
            ):
                return SolveCaptchaResponse(
                    text=pred.text[: settings.cdsc_captcha_digits],
                    confidence=pred.confidence,
                    method=pred.method,
                )
            model_error = (
                f'low-confidence model read "{pred.text}" ({pred.confidence:.2f})'
            )
        except Exception as e:  # noqa: BLE001
            model_error = str(e)
    else:
        model_error = "Captcha model not available"

    try:
        solved = await solve_image_base64(
            req.image_base64, settings.cdsc_captcha_digits
        )
    except TwoCaptchaError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Captcha solve failed ({model_error}); 2Captcha: {e}",
        ) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"Captcha solve failed ({model_error}); 2Captcha: {e}",
        ) from e

    return SolveCaptchaResponse(text=solved, confidence=1.0, method="2captcha")


@app.post("/cdsc/check", response_model=CheckResponse)
async def check(
    req: CheckRequest,
    _: str = Depends(require_cdsc_access),
) -> CheckResponse:
    rows = await asyncio.gather(
        *(_check_one(req.company_share_id, b) for b in req.boids)
    )
    return CheckResponse(company_share_id=req.company_share_id, results=list(rows))
