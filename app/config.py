from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "Web Monitor"
    debug: bool = False
    host: str = "127.0.0.1"
    port: int = 8765

    data_dir: Path = Path("data")
    db_path: Path = Path("data/web_monitor.db")
    profiles_dir: Path = Path("data/profiles")
    screenshots_dir: Path = Path("data/screenshots")

    headless: bool = True
    browser_timeout_ms: int = 30_000
    preview_timeout_ms: int = 20_000
    preview_selector_timeout_ms: int = 8_000
    preview_render_wait_ms: int = 1_000
    browser_keep_alive: bool = True
    default_interval_minutes: int = 15
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


settings = Settings()
