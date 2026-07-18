"""Captcha-solving cascade for a single CDSC result check.

Order: own model (with retry on a fresh captcha) -> 2Captcha fallback.
A wrong captcha is detectable from the check response, which powers the retry.
"""
from __future__ import annotations

import logging

from .captcha_model import CaptchaModel
from .cdsc import CdscSession, CheckResult, interpret_check
from .config import get_settings
from .twocaptcha import TwoCaptchaError, solve_image_base64

log = logging.getLogger("solver")

MODEL_ATTEMPTS = 3
MIN_CONFIDENCE = 0.30  # below this we don't even submit; get a fresh captcha


class Solver:
    def __init__(self, session: CdscSession, model: CaptchaModel) -> None:
        self._session = session
        self._model = model
        self._digits = get_settings().cdsc_captcha_digits

    async def check(
        self, company_share_id: int | str, boid: str
    ) -> CheckResult:
        last_msg = "Captcha solve failed"

        # 1) Own model, retrying with a fresh captcha each time.
        if self._model.available:
            for attempt in range(MODEL_ATTEMPTS):
                try:
                    captcha = await self._session.get_captcha()
                    pred = self._model.predict(captcha.image_base64)
                    if (
                        len(pred.text) != self._digits
                        or pred.confidence < MIN_CONFIDENCE
                    ):
                        last_msg = f"low-confidence model read ({pred.confidence:.2f})"
                        continue
                    raw = await self._session.check_raw(
                        company_share_id, boid, pred.text, captcha.identifier
                    )
                    result = interpret_check(raw)
                    if not result.needs_captcha:
                        return result
                    last_msg = result.message
                except Exception as e:  # noqa: BLE001 - surface to fallback
                    last_msg = str(e)
                    log.warning("model attempt %d failed: %s", attempt, e)

        # 2) 2Captcha fallback (paid, rare).
        try:
            captcha = await self._session.get_captcha()
            solved = await solve_image_base64(captcha.image_base64, self._digits)
            raw = await self._session.check_raw(
                company_share_id, boid, solved, captcha.identifier
            )
            result = interpret_check(raw)
            if result.needs_captcha:
                return CheckResult(
                    ok=False,
                    allotted=False,
                    quantity=None,
                    message="Captcha rejected by CDSC after fallback",
                )
            return result
        except TwoCaptchaError as e:
            return CheckResult(
                ok=False,
                allotted=False,
                quantity=None,
                message=f"Captcha unsolved ({last_msg}); fallback: {e}",
            )
        except Exception as e:  # noqa: BLE001
            return CheckResult(
                ok=False,
                allotted=False,
                quantity=None,
                message=f"Check failed: {e}",
            )
