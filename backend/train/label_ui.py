"""Tiny local captcha labeler: type once → Enter saves.

Usage (from backend/):
    python -m train.label_ui
    # opens http://127.0.0.1:8765

There is no automatic "is this correct?" check without 2Captcha/OCR — only you
can read the image. Keep it fast: type 5 digits, auto-saves, Z undoes mistakes.

Press H (or "Model hint") when a captcha is confusing — your trained ONNX model
suggests a read. It does not auto-save; you confirm or fix before Enter.

Keyboard:
    digits     type once (auto-saves at 5)
    Enter      save
    H          model hint (mock read — review before saving)
    S / Esc    skip
    Z          undo last save
"""
from __future__ import annotations

import argparse
import base64
import pathlib
import webbrowser
from dataclasses import dataclass, field
from functools import lru_cache

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

from app.captcha_model import CaptchaModel, Prediction
from app.config import get_settings
from app.twocaptcha import TwoCaptchaError, solve_image_base64

HINT_CONF_WARN = 0.62
HINT_CONF_2CAPTCHA = 0.48

HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CDSC captcha labeler</title>
  <style>
    :root {
      --bg: #0f1419;
      --panel: #1a2332;
      --text: #e7ecf3;
      --muted: #8b9bb4;
      --accent: #3d9cf0;
      --ok: #3ecf8e;
      --bad: #ff7b7b;
      --hint: #c9a227;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: radial-gradient(1200px 600px at 50% -10%, #1e3a5f 0%, var(--bg) 55%);
      color: var(--text);
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
    }
    .card {
      width: min(560px, 100%);
      background: var(--panel);
      border: 1px solid #2a3a52;
      border-radius: 16px;
      padding: 28px 28px 22px;
      box-shadow: 0 20px 50px rgba(0,0,0,.35);
    }
    h1 { margin: 0 0 4px; font-size: 1.25rem; font-weight: 650; }
    .sub { color: var(--muted); font-size: .9rem; margin-bottom: 18px; }
    .progress {
      height: 8px; background: #0d1218; border-radius: 99px; overflow: hidden;
      margin-bottom: 10px;
    }
    .progress > i {
      display: block; height: 100%; width: 0%;
      background: linear-gradient(90deg, var(--accent), var(--ok));
      transition: width .2s ease;
    }
    .stats {
      display: flex; justify-content: space-between;
      font-size: .85rem; color: var(--muted); margin-bottom: 18px;
    }
    .stats b { color: var(--text); font-weight: 600; }
    .frame {
      background: #fff; border-radius: 10px; padding: 18px;
      display: flex; align-items: center; justify-content: center;
      min-height: 120px; margin-bottom: 18px;
    }
    .frame img {
      max-width: 100%; height: auto; image-rendering: pixelated;
      transform: scale(1.75); transform-origin: center;
    }
    .frame.empty { color: #333; font-size: .95rem; }
    input#digits {
      width: 100%; font-size: 2rem; letter-spacing: .35em; text-align: center;
      padding: 14px; border-radius: 10px; border: 2px solid #334861;
      background: #0d1218; color: var(--text); outline: none;
      font-variant-numeric: tabular-nums;
    }
    input#digits:focus { border-color: var(--accent); }
    .row { display: flex; gap: 10px; margin-top: 14px; }
    button {
      flex: 1; padding: 12px 14px; border-radius: 10px; border: 0;
      font-size: .95rem; font-weight: 600; cursor: pointer;
    }
    button.primary { background: var(--accent); color: #041018; }
    button.ghost { background: #243247; color: var(--text); }
    .keys {
      margin-top: 16px; font-size: .8rem; color: var(--muted);
      line-height: 1.55;
    }
    .keys kbd {
      display: inline-block; min-width: 1.4em; padding: 1px 6px;
      border: 1px solid #3a4d68; border-radius: 5px;
      background: #121a26; color: var(--text); font-size: .75rem;
    }
    .toast {
      margin-top: 12px; min-height: 1.2em; font-size: .85rem; color: var(--ok);
    }
    .toast.err { color: var(--bad); }
    .hint-box {
      margin-bottom: 14px; padding: 12px 14px; border-radius: 10px;
      background: #121a26; border: 1px dashed #4a6080;
      font-size: .88rem; color: var(--muted); line-height: 1.45;
    }
    .hint-digits { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
    .hint-msg { text-align: center; color: var(--muted); font-size: .82rem; }
    .hint-digit {
      min-width: 2.1em; padding: 4px 6px; border-radius: 6px;
      background: #0d1218; border: 1px solid #334861;
      font-size: .95rem; font-weight: 700; letter-spacing: .05em; text-align: center;
    }
    .hint-digit.low { border-color: var(--bad); color: var(--bad); }
    .hint-digit.ok { border-color: var(--ok); color: var(--ok); }
    .hint-digit span { display: block; font-size: .62rem; font-weight: 500; color: var(--muted); margin-top: 2px; }
    .hint-box.empty { display: none; }
    .done-box { text-align: center; padding: 28px 8px; }
    .done-box h2 { margin: 0 0 8px; color: var(--ok); }
  </style>
</head>
<body>
  <div class="card">
    <h1>CDSC captcha labeler</h1>
    <div class="sub">Type 5 digits → auto-saves. Wrong? press <b style="color:var(--text)">Z</b> to undo.</div>
    <div class="progress"><i id="bar"></i></div>
    <div class="stats">
      <span>Labeled <b id="labeled">0</b></span>
      <span>Left <b id="left">0</b></span>
      <span>Total <b id="total">0</b></span>
    </div>
    <div id="main">
      <div class="frame" id="frame"><span class="empty">Loading…</span></div>
      <div class="hint-box empty" id="hintBox">
        <div class="hint-digits" id="hintDigits"></div>
      </div>
      <input id="digits" type="text" inputmode="numeric" autocomplete="off"
             maxlength="5" placeholder="•••••" autofocus />
      <div class="row">
        <button class="primary" id="saveBtn" type="button">Save &amp; next</button>
        <button class="ghost" id="hintBtn" type="button">Model hint (H)</button>
        <button class="ghost" id="skipBtn" type="button">Skip</button>
        <button class="ghost" id="undoBtn" type="button">Undo (Z)</button>
      </div>
      <div class="keys">
        <kbd>0</kbd>–<kbd>9</kbd> type &nbsp;·&nbsp;
        <kbd>Enter</kbd> save &nbsp;·&nbsp;
        <kbd>H</kbd> model hint &nbsp;·&nbsp;
        <kbd>S</kbd> / <kbd>Esc</kbd> skip &nbsp;·&nbsp;
        <kbd>Z</kbd> undo last
      </div>
      <div class="toast" id="toast"></div>
    </div>
  </div>
  <script>
    const digits = document.getElementById('digits');
    const frame = document.getElementById('frame');
    const toast = document.getElementById('toast');
    const bar = document.getElementById('bar');
    const hintBox = document.getElementById('hintBox');
    const hintDigits = document.getElementById('hintDigits');
    let current = null;
    let busy = false;

    function clearHint() {
      hintBox.className = 'hint-box empty';
      hintDigits.innerHTML = '';
    }

    function showHint(data) {
      const text = data.text || '';
      const modelAvailable = data.model_available !== false;
      if (!modelAvailable) {
        hintBox.className = 'hint-box';
        hintDigits.innerHTML = '<div class="hint-msg">Model not found — train models/captcha.onnx first</div>';
        return;
      }
      if (!text) {
        hintBox.className = 'hint-box';
        hintDigits.innerHTML = '<div class="hint-msg">Could not read this image</div>';
        return;
      }
      hintBox.className = 'hint-box';
      hintDigits.innerHTML = (data.digit_confs || []).map(function(d, i) {
        const p = Math.round(100 * (d.confidence || 0));
        const cls = (d.confidence || 0) < 0.62 ? 'hint-digit low' : 'hint-digit ok';
        return '<div class="' + cls + '">' + (text[i] || '?') + '<span>' + p + '%</span></div>';
      }).join('');
      digits.value = text;
      digits.focus();
      digits.select();
    }

    function setStats(s) {
      document.getElementById('labeled').textContent = s.labeled;
      document.getElementById('left').textContent = s.remaining;
      document.getElementById('total').textContent = s.total;
      const pct = s.total ? (100 * s.labeled / s.total) : 0;
      bar.style.width = pct + '%';
    }

    function showDone(s) {
      document.getElementById('main').innerHTML =
        '<div class="done-box"><h2>All caught up</h2>' +
        '<p>Labeled <b>' + s.labeled + '</b> / ' + s.total +
        '. You can train now, or top up remaining with 2Captcha later.</p></div>';
      setStats(s);
    }

    async function loadNext() {
      busy = true;
      toast.textContent = '';
      toast.className = 'toast';
      clearHint();
      const r = await fetch('/api/next');
      const data = await r.json();
      setStats(data);
      if (!data.id) {
        showDone(data);
        busy = false;
        return;
      }
      current = data.id;
      frame.innerHTML = '<img alt="captcha" src="/api/image/' + data.id + '?t=' + Date.now() + '" />';
      digits.value = '';
      digits.focus();
      busy = false;
    }

    async function save() {
      if (busy || !current) return;
      const label = digits.value.replace(/\\D/g, '');
      if (label.length !== 5) {
        toast.className = 'toast err';
        toast.textContent = 'Need exactly 5 digits';
        return;
      }
      busy = true;
      const r = await fetch('/api/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: current, label }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.className = 'toast err';
        toast.textContent = data.detail || 'Save failed';
        busy = false;
        return;
      }
      toast.className = 'toast';
      toast.textContent = 'Saved ' + label + ' — Z to undo';
      await loadNext();
    }

    async function hint() {
      if (busy || !current) return;
      busy = true;
      toast.textContent = '';
      toast.className = 'toast';
      try {
        const r = await fetch('/api/hint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: current }),
        });
        const data = await r.json();
        if (!r.ok) {
          toast.className = 'toast err';
          toast.textContent = data.detail || 'Hint failed';
          busy = false;
          return;
        }
        showHint(data);
        toast.textContent = data.text
          ? 'Hint filled — edit if wrong, Enter to save'
          : 'No model hint available';
      } catch (e) {
        toast.className = 'toast err';
        toast.textContent = 'Hint request failed';
      }
      busy = false;
    }

    async function skip() {
      if (busy || !current) return;
      busy = true;
      await fetch('/api/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: current }),
      });
      toast.textContent = 'Skipped';
      await loadNext();
    }

    async function undo() {
      if (busy) return;
      busy = true;
      const r = await fetch('/api/undo', { method: 'POST' });
      const data = await r.json();
      if (!r.ok) {
        toast.className = 'toast err';
        toast.textContent = data.detail || 'Nothing to undo';
        busy = false;
        return;
      }
      toast.className = 'toast';
      toast.textContent = 'Undid ' + (data.label || '');
      await loadNext();
    }

    digits.addEventListener('input', () => {
      digits.value = digits.value.replace(/\\D/g, '').slice(0, 5);
      if (digits.value.length === 5) save();
    });
    digits.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.target === digits && /\\d/.test(e.key)) return;
      if (e.key === 's' || e.key === 'S' || e.key === 'Escape') {
        e.preventDefault(); skip();
      } else if (e.key === 'z' || e.key === 'Z') {
        if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); undo(); }
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault(); hint();
      }
    });
    document.getElementById('saveBtn').onclick = save;
    document.getElementById('hintBtn').onclick = hint;
    document.getElementById('skipBtn').onclick = skip;
    document.getElementById('undoBtn').onclick = undo;
    loadNext();
  </script>
</body>
</html>
"""


@dataclass
class LabelStore:
    raw_dir: pathlib.Path
    out_dir: pathlib.Path
    digits: int
    queue: list[str] = field(default_factory=list)
    history: list[tuple[str, str]] = field(default_factory=list)  # (stem, label)
    total: int = 0

    def refresh(self) -> None:
        self.out_dir.mkdir(parents=True, exist_ok=True)
        labeled_stems = set()
        for p in self.out_dir.glob("*.png"):
            parts = p.stem.split("_", 1)
            if len(parts) == 2 and parts[0].isdigit():
                labeled_stems.add(parts[1])
            else:
                labeled_stems.add(p.stem)
        raw = sorted(self.raw_dir.glob("*.png"))
        self.total = len(raw)
        self.queue = [p.stem for p in raw if p.stem not in labeled_stems]

    @property
    def labeled_count(self) -> int:
        return self.total - len(self.queue)

    def stats(self) -> dict:
        return {
            "labeled": self.labeled_count,
            "remaining": len(self.queue),
            "total": self.total,
        }

    def peek(self) -> str | None:
        return self.queue[0] if self.queue else None

    def raw_path(self, stem: str) -> pathlib.Path:
        path = self.raw_dir / f"{stem}.png"
        if not path.is_file():
            raise HTTPException(404, f"Missing raw image {stem}")
        return path

    def save(self, stem: str, label: str) -> None:
        if len(label) != self.digits or not label.isdigit():
            raise HTTPException(400, f"Label must be {self.digits} digits")
        if not self.queue or self.queue[0] != stem:
            if stem not in self.queue:
                raise HTTPException(409, "Image already labeled or unknown")
            self.queue.remove(stem)
        else:
            self.queue.pop(0)
        src = self.raw_path(stem)
        dest = self.out_dir / f"{label}_{stem}.png"
        dest.write_bytes(src.read_bytes())
        self.history.append((stem, label))

    def skip(self, stem: str) -> None:
        if self.queue and self.queue[0] == stem:
            self.queue.pop(0)
            self.queue.append(stem)
        elif stem in self.queue:
            self.queue.remove(stem)
            self.queue.append(stem)

    def undo(self) -> tuple[str, str]:
        if not self.history:
            raise HTTPException(400, "Nothing to undo")
        stem, label = self.history.pop()
        path = self.out_dir / f"{label}_{stem}.png"
        if path.is_file():
            path.unlink()
        if stem not in self.queue:
            self.queue.insert(0, stem)
        return stem, label


class LabelIn(BaseModel):
    id: str
    label: str = Field(min_length=1, max_length=8)


class IdIn(BaseModel):
    id: str


@lru_cache
def _captcha_model() -> CaptchaModel:
    return CaptchaModel()


def predict_raw_captcha(path: pathlib.Path) -> tuple[Prediction | None, bool]:
    """Return (prediction, model_available)."""
    model = _captcha_model()
    if not model.available:
        return None, False
    try:
        b64 = base64.b64encode(path.read_bytes()).decode("ascii")
        pred = model.predict_robust(b64)
        return pred, True
    except Exception:
        return None, True


def _hint_payload(pred: Prediction) -> dict:
    digit_confs = [
        {"digit": pred.text[i], "confidence": pred.digit_confs[i]}
        for i in range(len(pred.text))
    ] if pred.digit_confs else []
    return {
        "text": pred.text,
        "confidence": pred.confidence,
        "digit_confs": digit_confs,
        "method": pred.method,
        "low_confidence": pred.confidence < HINT_CONF_WARN,
    }


async def _maybe_2captcha_hint(b64: str, digits: int) -> Prediction | None:
    settings = get_settings()
    if not settings.twocaptcha_enabled or not settings.twocaptcha_api_key:
        return None
    try:
        text = await solve_image_base64(b64, digits=digits)
        text = text.strip()
        if len(text) != digits or not text.isdigit():
            return None
        return Prediction(
            text=text,
            confidence=0.85,
            digit_confs=tuple([0.85] * digits),
            method="2Captcha fallback",
        )
    except TwoCaptchaError:
        return None


def create_app(store: LabelStore) -> FastAPI:
    app = FastAPI(title="CDSC label UI")

    @app.get("/", response_class=HTMLResponse)
    def home() -> str:
        return HTML

    @app.get("/api/next")
    def next_item() -> dict:
        stem = store.peek()
        return {"id": stem, **store.stats()}

    @app.get("/api/image/{stem}")
    def image(stem: str) -> FileResponse:
        return FileResponse(store.raw_path(stem), media_type="image/png")

    @app.post("/api/label")
    def label(body: LabelIn) -> dict:
        store.save(body.id, body.label.strip())
        return {"ok": True, **store.stats()}

    @app.post("/api/skip")
    def skip(body: IdIn) -> dict:
        store.skip(body.id)
        return {"ok": True, **store.stats()}

    @app.post("/api/undo")
    def undo() -> dict:
        stem, label = store.undo()
        return {"ok": True, "id": stem, "label": label, **store.stats()}

    @app.post("/api/hint")
    async def hint(body: IdIn) -> dict:
        path = store.raw_path(body.id)
        b64 = base64.b64encode(path.read_bytes()).decode("ascii")
        pred, available = predict_raw_captcha(path)
        if not available:
            return {
                "ok": True,
                "model_available": False,
                "text": "",
                "confidence": 0.0,
                "digit_confs": [],
                "method": "",
                "low_confidence": True,
            }
        if pred is None:
            raise HTTPException(500, "Model failed to read this captcha")
        if pred.confidence < HINT_CONF_2CAPTCHA:
            alt = await _maybe_2captcha_hint(b64, store.digits)
            if alt is not None:
                pred = alt
        return {"ok": True, "model_available": True, **_hint_payload(pred)}

    return app


def main() -> None:
    ap = argparse.ArgumentParser(description="Local captcha labeling UI")
    ap.add_argument("--raw", default="data/raw")
    ap.add_argument("--out", default="data/labeled")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    digits = get_settings().cdsc_captcha_digits
    store = LabelStore(
        raw_dir=pathlib.Path(args.raw),
        out_dir=pathlib.Path(args.out),
        digits=digits,
    )
    if not store.raw_dir.is_dir():
        raise SystemExit(f"Raw folder not found: {store.raw_dir}")
    store.refresh()
    model = _captcha_model()
    model_note = (
        f"model hint: ON ({get_settings().captcha_model_path})"
        if model.available
        else f"model hint: OFF (missing {get_settings().captcha_model_path})"
    )
    print(f"raw={store.total}  already_labeled={store.labeled_count}  left={len(store.queue)}")
    print(f"Open http://{args.host}:{args.port}  ·  {model_note}")
    app = create_app(store)
    if not args.no_browser:
        webbrowser.open(f"http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
