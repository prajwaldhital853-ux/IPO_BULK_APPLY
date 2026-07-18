"""Minimal 2Captcha client for the normal image captcha (fallback only)."""
from __future__ import annotations

import asyncio

import httpx

from .config import get_settings


class TwoCaptchaError(RuntimeError):
    pass


async def solve_image_base64(image_b64: str, digits: int = 5) -> str:
    settings = get_settings()
    if not settings.twocaptcha_enabled or not settings.twocaptcha_api_key:
        raise TwoCaptchaError("2Captcha not configured")

    clean = image_b64.split(",", 1)[-1] if image_b64.startswith("data:") else image_b64

    async with httpx.AsyncClient(timeout=60) as client:
        submit = await client.post(
            "https://2captcha.com/in.php",
            data={
                "key": settings.twocaptcha_api_key,
                "method": "base64",
                "body": clean,
                "numeric": "1",  # digits only
                "min_len": str(digits),
                "max_len": str(digits),
                "json": "1",
            },
        )
        payload = submit.json()
        if payload.get("status") != 1:
            raise TwoCaptchaError(f"submit failed: {payload.get('request')}")
        captcha_id = payload["request"]

        for _ in range(24):  # up to ~2 min
            await asyncio.sleep(5)
            res = await client.get(
                "https://2captcha.com/res.php",
                params={
                    "key": settings.twocaptcha_api_key,
                    "action": "get",
                    "id": captcha_id,
                    "json": "1",
                },
            )
            data = res.json()
            if data.get("status") == 1:
                return str(data["request"])
            if data.get("request") != "CAPCHA_NOT_READY":
                raise TwoCaptchaError(f"solve failed: {data.get('request')}")
    raise TwoCaptchaError("2Captcha timed out")
