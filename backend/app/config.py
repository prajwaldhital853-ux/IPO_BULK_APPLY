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

    @property
    def google_client_id_list(self) -> list[str]:
        return [x.strip() for x in self.google_client_ids.split(",") if x.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
