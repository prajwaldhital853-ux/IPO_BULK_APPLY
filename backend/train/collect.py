"""Collect raw CDSC captcha images for training.

Downloads N captchas via a live CDSC session and saves them as PNGs under
data/raw/<uuid>.png. Run this on your dev machine (or the VPS) when results are
open so the portal serves captchas.

Usage:
    python -m backend.train.collect --count 5000 --out data/raw
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import pathlib
import uuid

from app.cdsc import CdscSession


async def main(count: int, out: str) -> None:
    out_dir = pathlib.Path(out)
    out_dir.mkdir(parents=True, exist_ok=True)
    session = CdscSession()
    await session.start()
    saved = 0
    try:
        # Prime one captcha, then reload repeatedly (cheaper than full home).
        captcha = await session.get_captcha()
        while saved < count:
            try:
                img = base64.b64decode(captcha.image_base64)
                (out_dir / f"{uuid.uuid4().hex}.png").write_bytes(img)
                saved += 1
                if saved % 100 == 0:
                    print(f"saved {saved}/{count}")
                captcha = await session.reload_captcha(captcha.identifier)
            except Exception as e:  # noqa: BLE001
                print("reload failed, refetching:", e)
                captcha = await session.get_captcha()
                await asyncio.sleep(1.0)
    finally:
        await session.close()
    print(f"done: {saved} images in {out_dir}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=5000)
    ap.add_argument("--out", default="data/raw")
    args = ap.parse_args()
    asyncio.run(main(args.count, args.out))
