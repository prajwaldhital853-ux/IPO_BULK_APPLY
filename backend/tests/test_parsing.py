"""Unit tests for CDSC response parsing (no browser, stdlib only).

Run: python -m backend.tests.test_parsing
"""
from __future__ import annotations

import json
import sys

from app.parsing import (
    CdscBlockedError,
    interpret_check,
    looks_blocked,
    parse_captcha_reload,
    parse_companies,
    parse_home_captcha,
)

failures: list[str] = []


def check(name: str, cond: bool) -> None:
    if cond:
        print(f"  PASS {name}")
    else:
        print(f"  FAIL {name}")
        failures.append(name)


# --- WAF block detection ------------------------------------------------------
check("blocked: html", looks_blocked("<!DOCTYPE html><html>...</html>"))
check("blocked: request rejected", looks_blocked("The requested URL was rejected"))
check("blocked: empty", looks_blocked(""))
check("not blocked: json", not looks_blocked('{"companyShareList": []}'))

# --- companies ----------------------------------------------------------------
home = json.dumps(
    {
        "body": {
            "companyShareList": [
                {"id": 12, "companyName": "Beta Hydro Ltd", "companyCode": "BHL"},
                {"companyShareId": 3, "name": "Alpha Bank Debenture"},
            ],
            "captchaData": {
                "captchaIdentifier": "abc123",
                "captcha": "data:image/png;base64,AAAA",
            },
        }
    }
)
companies = parse_companies(home)
check("companies: count", len(companies) == 2)
check("companies: sorted by name", companies[0].name.startswith("Alpha"))
check("companies: id parsed from companyShareId", companies[0].id == 3)
check("companies: scrip", companies[1].scrip == "BHL")

cap = parse_home_captcha(home)
check("captcha: identifier", cap is not None and cap.identifier == "abc123")
check("captcha: data prefix stripped", cap is not None and cap.image_base64 == "AAAA")

try:
    parse_companies("<html>Request Rejected</html>")
    check("companies: blocked raises", False)
except CdscBlockedError:
    check("companies: blocked raises", True)

# --- captcha reload -----------------------------------------------------------
reload_payload = json.dumps(
    {"captchaData": {"captchaIdentifier": "z9", "image": "QkJC"}}
)
rc = parse_captcha_reload(reload_payload)
check("reload: identifier", rc.identifier == "z9")
check("reload: image", rc.image_base64 == "QkJC")

# --- check interpretation -----------------------------------------------------
allotted = interpret_check(
    {"success": True, "message": "Congratulations, Alloted", "quantity": 10}
)
check("check: allotted ok", allotted.ok and allotted.allotted)
check("check: allotted qty", allotted.quantity == 10)

not_alloted = interpret_check(
    {"success": True, "message": "Sorry, not allotted for the entered BOID."}
)
check("check: not allotted", not_alloted.ok and not not_alloted.allotted)

bad_captcha = interpret_check({"success": False, "message": "Invalid Captcha Provided"})
check("check: needs captcha", bad_captcha.needs_captcha and not bad_captcha.ok)

qty_only = interpret_check({"success": True, "message": "OK", "allotedQuantity": "20"})
check("check: qty-only implies allotted", qty_only.allotted and qty_only.quantity == 20)

print()
if failures:
    print(f"{len(failures)} FAILURE(S): {failures}")
    sys.exit(1)
print("ALL PARSING TESTS PASSED")
