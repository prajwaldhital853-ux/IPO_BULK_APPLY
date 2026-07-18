# MeroShare client — implementation notes

## Confirmed login (DevTools 2026)

| Item | Value |
|------|--------|
| URL | `POST https://webbackend.cdsc.com.np/api/meroShare/auth/` |
| Body | `{ "clientId": <number>, "username": "...", "password": "..." }` |
| Captcha | **Not required** on current portal |
| Token | Response header **`Authorization`** (JWT) |

## clientId vs DP code

- Login `clientId` is the capital **dropdown id** (e.g. `174`), from `GET /api/meroShare/capital/`.
- Labels show a 5-digit **code** (e.g. `13700`).
- Runtime resolves either via `resolveClientId()` — older accounts that stored only the code still work.

## Apply (community-confirmed + CDSC scripts)

| Item | Value |
|------|--------|
| Issues | `POST /api/meroShare/companyShare/applicableIssue/` |
| Banks | `GET /api/meroShare/bank/` then `GET /api/meroShare/bank/{bankId}` |
| Can apply | `GET /api/meroShare/applicantForm/customerType/{companyShareId}/{demat}` |
| Apply | `POST /api/meroShare/applicantForm/share/apply` |
| Payload | demat, boid, accountNumber, customerId, accountBranchId, accountTypeId, appliedKitta, crnNumber, transactionPIN, companyShareId, bankId |

Demat is typically `130` + DP code + username (BOID short form). Prefer `ownDetail.demat` when available.

## App defaults

- Add account → **live login verify**
- Apply screen → **Live** mode by default (toggle Dry-run for demo)
- History lock → only after **successful live** apply
- Prefer testing Live Apply with **one account** first

## If live apply fails

1. Re-add account so DP is picked from live capital list.
2. Confirm an IPO is actually open (refresh openings).
3. Capture Apply Payload from Chrome DevTools when applying once in the portal and compare fields.
