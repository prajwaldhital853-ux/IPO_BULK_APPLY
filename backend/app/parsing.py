"""Pure CDSC response parsing/interpretation (no I/O, no Playwright).

Kept separate from cdsc.py so it is unit-testable without a browser and so
markup/endpoint fixes are localized.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

# F5 BIG-IP WAF block page: "The requested URL was rejected... Your support ID is:"
_BLOCK_RE = re.compile(
    r"was rejected|request rejected|support id|^\s*<", re.IGNORECASE
)


class CdscBlockedError(RuntimeError):
    """WAF returned an HTML rejection instead of JSON."""


class CdscSessionError(RuntimeError):
    """Session could not be established / portal unreachable."""


@dataclass
class Captcha:
    identifier: str
    image_base64: str


@dataclass
class Company:
    id: int
    name: str
    scrip: str | None = None


@dataclass
class CheckResult:
    ok: bool
    allotted: bool
    quantity: int | None
    message: str
    needs_captcha: bool = False


def looks_blocked(text: str) -> bool:
    if not text:
        return True
    return bool(_BLOCK_RE.search(text.strip()[:200]))


def _strip_data_prefix(image: str) -> str:
    return re.sub(r"^data:image/[a-zA-Z+]+;base64,", "", image or "").strip()


def _parse_captcha(raw: dict[str, Any]) -> Captcha | None:
    identifier = str(
        raw.get("captchaIdentifier") or raw.get("captchaId") or raw.get("id") or ""
    )
    image = _strip_data_prefix(
        str(raw.get("captcha") or raw.get("captchaImage") or raw.get("image") or "")
    )
    if not identifier or not image:
        return None
    return Captcha(identifier=identifier, image_base64=image)


def _extract_body(data: dict[str, Any]) -> dict[str, Any]:
    body = data.get("body")
    return body if isinstance(body, dict) else data


def parse_companies(text: str) -> list[Company]:
    if looks_blocked(text):
        raise CdscBlockedError("CDSC WAF blocked the company list request")
    data = json.loads(text)
    body = _extract_body(data)
    rows = (
        body.get("companyShareList")
        or body.get("companyShares")
        or data.get("companyShareList")
        or []
    )
    out: list[Company] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        cid = int(
            r.get("id")
            or r.get("companyShareId")
            or r.get("companyShareID")
            or r.get("value")
            or 0
        )
        if not cid:
            continue
        name = str(
            r.get("name")
            or r.get("companyName")
            or r.get("companyShareName")
            or r.get("label")
            or f"Company {cid}"
        )
        scrip = r.get("scrip") or r.get("companyCode") or r.get("script")
        out.append(Company(id=cid, name=name, scrip=str(scrip) if scrip else None))
    out.sort(key=lambda c: c.name.lower())
    return out


def parse_home_captcha(text: str) -> Captcha | None:
    data = json.loads(text)
    body = _extract_body(data)
    nested = body.get("captchaData") or data.get("captchaData") or body
    return _parse_captcha(nested if isinstance(nested, dict) else {})


def parse_captcha_reload(text: str) -> Captcha:
    if looks_blocked(text):
        raise CdscBlockedError("Captcha reload blocked by WAF")
    data = json.loads(text)
    body = _extract_body(data)
    nested = body.get("captchaData") or body
    captcha = _parse_captcha(nested if isinstance(nested, dict) else {})
    if not captcha:
        raise CdscSessionError("Could not parse reloaded captcha")
    return captcha


def interpret_check(data: dict[str, Any]) -> CheckResult:
    success = bool(data.get("success") or data.get("ok"))
    message = str(
        data.get("message")
        or data.get("msg")
        or data.get("error")
        or ("OK" if success else "No result")
    )
    lower = message.lower()

    if re.search(r"captcha|security\s*code|invalid\s*code", lower):
        return CheckResult(False, False, None, message, needs_captcha=True)

    qty_raw = (
        data.get("quantity")
        or data.get("allotedQuantity")
        or data.get("allottedQuantity")
        or data.get("kitta")
        or data.get("appliedKitta")
    )
    quantity: int | None = None
    if qty_raw is not None:
        try:
            quantity = int(float(qty_raw))
        except (TypeError, ValueError):
            quantity = None

    not_allotted = bool(re.search(r"not\s*allot|sorry", lower))
    allotted = (
        success
        and not not_allotted
        and (
            bool(re.search(r"congrat|allot", lower))
            or (quantity is not None and quantity > 0)
        )
    )
    return CheckResult(
        ok=True,
        allotted=allotted,
        quantity=quantity if allotted else None,
        message=message,
    )
