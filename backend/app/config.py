from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    port: int = 8080
    api_key: str = "change-me-shared-secret"

    cdsc_base: str = "https://iporesult.cdsc.com.np"
    cdsc_captcha_digits: int = 5

    captcha_model_path: str = "models/captcha.onnx"

    twocaptcha_api_key: str = ""
    twocaptcha_enabled: bool = True

    cdsc_proxy: str = ""

    # Prefer attaching to a real Chrome (bypasses WAF fingerprinting):
    #   chrome.exe --remote-debugging-port=9222
    # then set CHROME_CDP_URL=http://127.0.0.1:9222
    chrome_cdp_url: str = ""
    # When not using CDP: "chrome" | "msedge" | "" (Playwright Chromium)
    chrome_channel: str = ""

    headless: bool = True
    max_concurrency: int = 2

    cache_db: str = "cache.sqlite"
    cache_ttl: int = 86400

    # Auth
    database_url: str = "sqlite+aiosqlite:///./auth.db"
    redis_url: str = ""
    jwt_secret: str = "change-me-jwt-secret-min-32-chars!!"
    jwt_access_ttl: int = 900
    jwt_refresh_days: int = 30
    google_client_ids: str = ""
    cors_origins: str = "*"
    cdsc_require_jwt: bool = True

    # Admin dashboard
    admin_email: str = 'kalashfinancialsolution@gmail.com'
    admin_password: str = 'admin123'
    admin_otp_ttl_minutes: int = 10
    app_env: str = 'development'

    # Email OTP — Render blocks SMTP; use HTTP API providers on PaaS
    # auto = try sendgrid → resend → brevo → smtp (first configured wins per send, with fallback)
    email_provider: str = 'auto'  # auto | smtp | brevo | resend | sendgrid
    brevo_api_key: str = ''
    resend_api_key: str = ''
    resend_from: str = ''
    sendgrid_api_key: str = ''
    sendgrid_from: str = ''

    # Gmail SMTP (works on VPS/local only — blocked on Render)
    smtp_host: str = 'smtp.gmail.com'
    smtp_port: int = 587
    smtp_user: str = ''
    smtp_password: str = ''
    smtp_from: str = ''

    # Payment details shown in mobile app subscription screen (seed defaults)
    payment_qr_text: str = 'NEPSE GHAR Premium|Kalash Financial Solution'
    payment_bank_name: str = 'Kalash Financial Solution Pvt. Ltd.'
    payment_account_name: str = 'Kalash Financial Solution'
    payment_account_number: str = '0123456789'
    payment_whatsapp: str = '9779709133067'

    # Cron / push jobs (Render Cron Jobs). Prefer dedicated secret; falls back to api_key.
    cron_secret: str = ''

    # Absolute public API URL (logo in emails, etc.)
    public_base_url: str = 'https://ipo-bulk-apply-vti5.onrender.com'

    @property
    def effective_cron_secret(self) -> str:
        return (self.cron_secret or self.api_key or '').strip()

    @property
    def effective_public_base_url(self) -> str:
        return (self.public_base_url or '').strip().rstrip('/')

    @property
    def google_client_id_list(self) -> list[str]:
        return [x.strip() for x in self.google_client_ids.split(",") if x.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
