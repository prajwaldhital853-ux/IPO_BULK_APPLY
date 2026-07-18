# NEPSE GHAR - CDSC backend

Server-side IPO result checker for CDSC (`iporesult.cdsc.com.np`), used **only**
for IPOs not covered by the 11 live issue managers in the app.

What it does:
- Keeps a headless Chromium session that passes the CDSC F5 WAF.
- Solves the numeric captcha with an **own ONNX model** (fast, ~free), with
  **2Captcha as fallback** when the model misses.
- Caches results by `(companyShareId, boid)` so repeats cost nothing.

## Endpoints
- `GET  /health`
- `GET  /cdsc/companies` -> `{ companies: [{id, name, scrip}] }`
- `POST /cdsc/check` body `{ "companyShareId": 123, "boids": ["13..","13.."] }`
  -> `{ companyShareId, results: [{boid, ok, allotted, quantity, message, cached}] }`

All routes except `/health` require header `X-API-Key: <API_KEY>`.

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
python -m train.collect --count 5000 --out data/raw      # gather captchas

# Label by hand (recommended to start): opens http://127.0.0.1:8765
python -m train.label_ui
# Or pay once via 2Captcha for whatever is still unlabeled:
TWOCAPTCHA_API_KEY=... python -m train.label --raw data/raw --out data/labeled

python -m train.train --data data/labeled --out models/captcha.onnx
```
Hand UI: type 5 digits (auto-saves), `S` skip, `Z` undo. Resume-safe — already
labeled files are skipped. You can stop anytime; remaining images can later be
filled with 2Captcha. Ship only if val per-digit accuracy > ~0.97.

## Phase 1 sanity check (no ML)
```bash
python -m scripts.validate_session --auto
```
Proves the session clears the WAF and fetches companies + a captcha.

**Windows tip:** if Playwright Chromium gets `Request Rejected` but normal Chrome
works, attach to real Chrome instead:

1. Close extra Chrome windows if needed, then start a debug Chrome:
   ```bat
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir=%TEMP%\cdsc-chrome-debug https://iporesult.cdsc.com.np/
   ```
2. In `.env` set `CHROME_CDP_URL=http://127.0.0.1:9222`
3. Re-run `python -m scripts.validate_session --auto`

Keep that Chrome window open while collecting / running the API.

## Deploy (recommended: small VPS + Docker)
- Hetzner CX22 (~EUR 4/mo) or DigitalOcean/Vultr (~$6/mo), 2 GB RAM.
```bash
docker build -t nepseghar-cdsc .
docker run -d --restart unless-stopped -p 8080:8080 --env-file .env \
  -v "$PWD/models:/app/models" nepseghar-cdsc
```
If the datacenter IP gets WAF-blocked, set `CDSC_PROXY` to a residential proxy.

## App wiring
The mobile app calls this via the `cdsc` provider in
`mobile/src/services/issuemanager`. Set `EXPO_PUBLIC_CDSC_BACKEND_URL` and
`EXPO_PUBLIC_CDSC_BACKEND_KEY` in the app env.
