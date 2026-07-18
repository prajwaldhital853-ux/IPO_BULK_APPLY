from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .auth import router as auth_router
from .auth.blacklist import init_blacklist
from .auth.deps import CurrentUser, get_current_user, get_optional_user
from .auth.rate_limit import cdsc_user_limiter
from .cache import ResultCache
from .captcha_model import CaptchaModel
from .cdsc import CdscBlockedError, CdscSession, CdscSessionError, CheckResult
from .config import get_settings
from .db.session import configure, init_db
from .schemas import (
    CheckRequest,
    CheckResponse,
    CheckRow,
    CompaniesResponse,
    CompanyOut,
)
from .solver import Solver

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("cdsc-backend")

session = CdscSession()
model = CaptchaModel()
cache = ResultCache()
solver = Solver(session, model)
_check_semaphore: asyncio.Semaphore | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _check_semaphore
    settings = get_settings()
    configure(settings.database_url)
    await init_db()
    await init_blacklist(settings.redis_url or None)
    _check_semaphore = asyncio.Semaphore(settings.max_concurrency)
    try:
        await asyncio.wait_for(session.start(), timeout=60.0)
    except Exception as e:  # noqa: BLE001
        log.warning("CDSC warm-up deferred: %s", e)
    yield
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


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "ok": True,
        "session_ready": session.ready,
        "model_available": model.available,
    }


@app.get("/cdsc/companies", response_model=CompaniesResponse)
async def companies(_: str = Depends(require_cdsc_access)) -> CompaniesResponse:
    try:
        rows = await session.get_companies()
    except CdscBlockedError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except CdscSessionError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(e)) from e
    return CompaniesResponse(
        companies=[CompanyOut(id=c.id, name=c.name, scrip=c.scrip) for c in rows]
    )


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


@app.post("/cdsc/check", response_model=CheckResponse)
async def check(
    req: CheckRequest,
    _: str = Depends(require_cdsc_access),
) -> CheckResponse:
    rows = await asyncio.gather(
        *(_check_one(req.company_share_id, b) for b in req.boids)
    )
    return CheckResponse(company_share_id=req.company_share_id, results=list(rows))
