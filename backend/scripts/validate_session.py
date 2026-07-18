"""Phase 1 validation: prove the server-side session beats the WAF.

Two modes:

  # Non-interactive: just prove the session clears the WAF + lists companies
  # and saves a captcha image. Safe to run in CI / on the server.
  python -m backend.scripts.validate_session --auto

  # Interactive: also submit a manual captcha + BOID and print the parsed
  # result for a known company (real end-to-end proof, no ML).
  python -m backend.scripts.validate_session

Run this where the backend will be deployed. A datacenter IP may be WAF-blocked
even though a real browser on a phone is not; if so, set CDSC_PROXY.
"""
from __future__ import annotations

import argparse
import asyncio
import base64

from app.cdsc import CdscSession, interpret_check


async def run(auto: bool) -> None:
    session = CdscSession()
    print("starting session (warming past WAF)...")
    await session.start()

    companies = await session.get_companies()
    print(f"\nGot {len(companies)} companies. First 10:")
    for c in companies[:10]:
        print(f"  {c.id}  {c.name}")
    if not companies:
        raise SystemExit("No companies returned - WAF likely still blocking.")

    captcha = await session.get_captcha()
    with open("captcha.png", "wb") as f:
        f.write(base64.b64decode(captcha.image_base64))
    print(f"\nSaved captcha.png (identifier={captcha.identifier[:8]}...).")

    if auto:
        print("\nAUTO OK: WAF cleared, companies + captcha fetched.")
        await session.close()
        return

    print("Open captcha.png and read the digits.")
    company_share_id = input("companyShareId: ").strip()
    boid = input("BOID (16 digits): ").strip()
    user_captcha = input("captcha digits: ").strip()

    raw = await session.check_raw(
        company_share_id, boid, user_captcha, captcha.identifier
    )
    print("\nraw:", raw)
    print("parsed:", interpret_check(raw))
    await session.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--auto",
        action="store_true",
        help="Non-interactive: only prove WAF clear + list companies.",
    )
    args = ap.parse_args()
    asyncio.run(run(args.auto))


if __name__ == "__main__":
    main()
