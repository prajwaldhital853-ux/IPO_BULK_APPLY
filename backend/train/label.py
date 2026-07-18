"""One-time labeling of collected captchas via 2Captcha.

Reads data/raw/*.png, solves each with 2Captcha, and copies to
data/labeled/<label>_<uuid>.png. This bootstraps ground truth cheaply
(~$0.5-1 per 1000). After this, the trained model makes 2Captcha rare.

Usage:
    TWOCAPTCHA_API_KEY=... python -m backend.train.label --raw data/raw --out data/labeled
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import pathlib

from app.config import get_settings
from app.twocaptcha import solve_image_base64


async def main(raw: str, out: str) -> None:
    settings = get_settings()
    if not settings.twocaptcha_api_key:
        raise SystemExit("Set TWOCAPTCHA_API_KEY to label the dataset.")
    digits = settings.cdsc_captcha_digits

    raw_dir = pathlib.Path(raw)
    out_dir = pathlib.Path(out)
    out_dir.mkdir(parents=True, exist_ok=True)

    images = sorted(raw_dir.glob("*.png"))
    print(f"labeling {len(images)} images")
    done = 0
    for path in images:
        try:
            b64 = base64.b64encode(path.read_bytes()).decode()
            label = await solve_image_base64(b64, digits)
            if len(label) != digits or not label.isdigit():
                print(f"skip {path.name}: bad label '{label}'")
                continue
            (out_dir / f"{label}_{path.stem}.png").write_bytes(path.read_bytes())
            done += 1
            if done % 50 == 0:
                print(f"labeled {done}")
        except Exception as e:  # noqa: BLE001
            print(f"skip {path.name}: {e}")
    print(f"done: {done} labeled -> {out_dir}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="data/raw")
    ap.add_argument("--out", default="data/labeled")
    args = ap.parse_args()
    asyncio.run(main(args.raw, args.out))
