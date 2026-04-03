import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")

_log_boot = logging.getLogger("malv.worker")


def _load_env_file_minimal(path: Path) -> None:
    """Parse KEY=value lines when python-dotenv is not installed (matches load_dotenv override=False)."""
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, _, rest = line.partition("=")
        key = key.strip()
        if not key:
            continue
        val = rest.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
            val = val[1:-1]
        # Same as load_dotenv(override=True): repo .env wins over inherited shell exports.
        os.environ[key] = val


# Repo root .env then apps/api/.env — matches API `envload.ts` + ConfigModule (api .env overrides root).
_repo_root = Path(__file__).resolve().parent.parent.parent.parent
_env_path = _repo_root / ".env"
_api_env_path = _repo_root / "apps" / "api" / ".env"
try:
    from dotenv import load_dotenv

    load_dotenv(_env_path, override=True)
    if _api_env_path.is_file():
        load_dotenv(_api_env_path, override=True)
except ImportError:
    _load_env_file_minimal(_env_path)
    _load_env_file_minimal(_api_env_path)
    _log_boot.warning(
        "python-dotenv not installed — loaded %s (+ %s) with a minimal parser; "
        "install deps (e.g. `pip install python-dotenv`) for full .env support.",
        _env_path,
        _api_env_path,
    )

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.infer_routes import create_infer_router, warm_inference_router
from app.core.http_client import close_http_client


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    from app.core.settings import load_settings

    s = load_settings()
    from app.core.openai_compat_urls import openai_compat_chat_completions_url, openai_compat_models_url

    raw_backend = (os.getenv("MALV_INFERENCE_BACKEND") or "").strip() or None
    raw_base = (os.getenv("MALV_OPENAI_COMPAT_BASE_URL") or "").strip()
    raw_model = (os.getenv("MALV_INFERENCE_MODEL") or "").strip()
    # load_settings() already normalizes openai_compat_base_url to …/v1
    api_root = (s.openai_compat_base_url or "").strip()
    _log_boot.info(
        "[MALV] worker startup env_files root=%s api_overlay=%s (same order as @malv/api envload)",
        _env_path,
        str(_api_env_path) if _api_env_path.is_file() else "(missing)",
    )
    _log_boot.info(
        "[MALV] worker inference runtime (effective): %s",
        json.dumps(
            {
                "MALV_INFERENCE_BACKEND": raw_backend or s.inference_backend,
                "MALV_OPENAI_COMPAT_BASE_URL_raw": raw_base[:200] if raw_base else None,
                "MALV_OPENAI_COMPAT_API_ROOT_resolved": api_root,
                "resolved_models_url": openai_compat_models_url(api_root) if api_root else None,
                "resolved_chat_completions_url": openai_compat_chat_completions_url(api_root) if api_root else None,
                "MALV_INFERENCE_MODEL": raw_model or s.inference_model,
                "inference_backend": s.inference_backend,
                "fallback_enabled": s.fallback_enabled,
                "inference_failover": list(s.inference_failover),
                "ollama_base": s.inference_base_url,
                "llamacpp_base": s.llamacpp_base_url,
            },
            default=str,
        ),
    )
    warm_inference_router()
    yield
    await close_http_client()


def create_app() -> FastAPI:
    app = FastAPI(title="MALV Beast Worker", version="0.1.0", lifespan=_lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"]
    )

    app.include_router(create_infer_router())

    @app.get("/health")
    async def health():
        return {"ok": True, "service": "beast-worker"}

    @app.get("/metrics")
    async def metrics():
        # Minimal metrics surface; integrate Prometheus in next iteration.
        return {"ok": True}

    return app


app = create_app()

if __name__ == "__main__":
    _port = int(os.getenv("BEAST_WORKER_PORT", "9090"))
    uvicorn.run(app, host="0.0.0.0", port=_port)

