# NEPSE GHAR - CDSC backend

Server-side IPO result checker for CDSC (`iporesult.cdsc.com.np`), used **only**
for IPOs not covered by the 11 live issue managers in the app.

What it does:
- Keeps a headless Chromium session that passes the CDSC F5 WAF.
- Solves the numeric captcha with an **own ONNX model** (fast, ~free), with
  **2Captcha as fallback** when the model misses.
- Caches **result checks** by `(companyShareId, boid)` so repeats cost nothing.
- Caches the **CDSC company dropdown list** in SQLite and refreshes in the
  background so most app opens never hit CDSC just to load the list. New IPOs
  are merged automatically when a refresh sees them.

## Endpoints
- `GET  /health`
- `GET  /cdsc/companies` -> cached list; live refresh when stale (`?refresh=true` forces)
- `POST /cdsc/companies/refresh` -> force live sync (returns `newlyAdded`)
- `POST /cdsc/check` body `{ "companyShareId": 123, "boids": ["13..","13.."] }`
  -> `{ companyShareId, results: [{boid, ok, allotted, quantity, message, cached}] }`

Auth: Bearer JWT (default) or `X-API-Key` when `CDSC_REQUIRE_JWT=false`.

## Company list cache (no Upstash / Redis required)

Uses the same SQLite file as result cache (`CACHE_DB`, default `cache.sqlite`).

| Env | Default | Meaning |
|-----|---------|---------|
| `CDSC_COMPANIES_CACHE_TTL` | `21600` (6h) | Serve from cache until this age |
| `CDSC_COMPANIES_REFRESH_SECONDS` | `3600` (1h) | Background sync interval (`0` = off) |

On each successful sync, new `companyShareId`s are inserted and show up in the
app dropdown on the next load. If live CDSC is blocked, the last good cache is
still returned.

**You do not need Upstash for this.** Upstash/Redis is only optional for JWT
blacklist (`REDIS_URL`) if you already use it.

## What you must set up on the VPS (your part)

1. **Buy a residential or mobile proxy** (CDSC WAF blocks Tokyo datacenter IPs).
2. SSH to the VPS and edit backend env:
   ```bash
   nano /var/www/IPO_BULK_APPLY/backend/.env
   ```
   Add/set:
   ```env
   CDSC_PROXY=http://USER:PASS@HOST:PORT
   CDSC_COMPANIES_CACHE_TTL=21600
   CDSC_COMPANIES_REFRESH_SECONDS=3600
   ```
3. Deploy latest code and restart:
   ```bash
   cd /var/www/IPO_BULK_APPLY
   git pull
   systemctl restart nepseghar
   ```
4. Prove WAF is clear:
   ```bash
   cd /var/www/IPO_BULK_APPLY/backend
   source .venv/bin/activate   # your venv path
   python -m scripts.validate_session --auto
   ```
5. Optional: force company sync once:
   ```bash
   curl -sS -X POST https://api.nepseghar.com/cdsc/companies/refresh \
     -H "Authorization: Bearer <user-or-admin-jwt>"
   ```
6. Check cache health:
   ```bash
   curl -sS https://api.nepseghar.com/health
   ```
   Look for `companyCacheCount` and `companyCacheAgeSeconds`.

Without a working `CDSC_PROXY` (or Chrome CDP), company sync and checks will
keep failing with WAF rejects — the cache only helps *after* at least one
successful pull.

## Run locally
```bash
cd backend
python -m venv .venv && . .venv/Scripts/activate   # Windows
pip install -r requirements.txt
python -m playwright install chromium
cp .env.example .env   # set API_KEY, optionally TWOCAPTCHA_API_KEY
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

## Build the captcha model (one time)
```bash
pip install -r requirements-train.txt
python -m train.collect --count 5000 --out data/raw

python -m train.label_ui
# Or: TWOCAPTCHA_API_KEY=... python -m train.label --raw data/raw --out data/labeled

python -m train.train --data data/labeled --out models/captcha.onnx
```

## Phase 1 sanity check (no ML)
```bash
python -m scripts.validate_session --auto
```

**Windows tip:** if Playwright Chromium gets `Request Rejected` but normal Chrome
works, attach to real Chrome instead and set `CHROME_CDP_URL=http://127.0.0.1:9222`.

## Deploy
If the datacenter IP gets WAF-blocked, set `CDSC_PROXY` to a residential proxy.

## App wiring
The mobile app calls this via the `cdsc` provider in
`mobile/src/services/issuemanager`. Set `EXPO_PUBLIC_CDSC_BACKEND_URL` and
`EXPO_PUBLIC_CDSC_BACKEND_KEY` in the app env.
