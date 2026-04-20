import os
from pathlib import Path

from dotenv import load_dotenv


load_dotenv()


class Settings:
    def __init__(self) -> None:
        self.data_dir = self._resolve_path("DATA_DIR", "data")
        self.export_dir = self._resolve_path("EXPORT_DIR", "exports")
        self.export_interval_seconds = int(os.getenv("EXPORT_INTERVAL_SECONDS", "10"))
        self.dash_refresh_seconds = int(os.getenv("DASH_REFRESH_SECONDS", "1"))
        self.port = int(os.getenv("PORT", "8000"))
        self.frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
        self.session_cookie_name = os.getenv("SESSION_COOKIE_NAME", "ea_session")
        self.session_ttl_seconds = int(os.getenv("SESSION_TTL_SECONDS", "1209600"))  # 14 days
        self.postgres_dsn = os.getenv("POSTGRES_DSN", os.getenv("DATABASE_URL", "")).strip()

    def _resolve_path(self, env_name: str, relative_dir: str) -> str:
        env_path = os.getenv(env_name)
        if env_path:
            return env_path

        repo_root = Path(__file__).resolve().parents[2]
        root_path = repo_root / relative_dir
        backend_path = repo_root / "backend" / relative_dir
        if root_path.exists():
            return str(root_path)
        return str(backend_path)


settings = Settings()

