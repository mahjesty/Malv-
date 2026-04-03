from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, Dict, Optional

import httpx

_log = logging.getLogger("malv.worker")


def _get_api_base_url() -> str:
    # Worker needs only the control-plane API to fetch effective inference settings.
    return (os.getenv("MALV_API_BASE_URL") or os.getenv("INFERENCE_CONFIG_API_BASE_URL") or "http://127.0.0.1:8080").rstrip("/")


class InferenceConfigClient:
    """
    Fetches the effective inference backend config from MALV API.

    This is the centralized source of truth so the worker and API never drift
    on inference routing decisions.
    """

    def __init__(self, *, api_key: str, refresh_ms: int = 2000, timeout_s: float = 3.0) -> None:
        self._api_key = api_key
        self._api_base = _get_api_base_url()
        self._refresh_ms = max(250, refresh_ms)
        self._timeout_s = timeout_s

        self._last_revision: Optional[str] = None
        self._last_payload: Optional[Dict[str, Any]] = None
        self._last_fetch_at_ms: float = 0.0
        self._lock = asyncio.Lock()

    async def get_effective_config(self) -> Optional[Dict[str, Any]]:
        now_ms = time.time() * 1000.0
        if self._last_payload and self._last_revision and (now_ms - self._last_fetch_at_ms) < self._refresh_ms:
            return {"configRevision": self._last_revision, "payload": self._last_payload}

        async with self._lock:
            now_ms = time.time() * 1000.0
            if self._last_payload and self._last_revision and (now_ms - self._last_fetch_at_ms) < self._refresh_ms:
                return {"configRevision": self._last_revision, "payload": self._last_payload}

            url = f"{self._api_base}/v1/internal/inference/settings/effective"
            headers = {}
            if self._api_key:
                headers["x-api-key"] = self._api_key

            try:
                async with httpx.AsyncClient(timeout=self._timeout_s) as client:
                    res = await client.get(url, headers=headers)
                    if res.status_code != 200:
                        _log.warning("[MALV] inference config fetch failed HTTP %s", res.status_code)
                        return None
                    body = res.json()
            except Exception as e:
                _log.warning("[MALV] inference config fetch error: %s", e)
                return None

            config_revision = str(body.get("configRevision") or "")
            if not config_revision:
                _log.warning("[MALV] inference config fetch missing configRevision")
                return None

            self._last_revision = config_revision
            self._last_payload = body.get("config") or {}
            self._last_fetch_at_ms = now_ms
            return {"configRevision": config_revision, "payload": self._last_payload}

