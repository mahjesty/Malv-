from __future__ import annotations

import logging
from typing import Optional

import httpx

_log = logging.getLogger("malv.brain")

_client: Optional[httpx.AsyncClient] = None


def get_http_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            http2=False,
            limits=httpx.Limits(max_keepalive_connections=32, max_connections=64),
            follow_redirects=True,
        )
        _log.info("[MALV WORKER] httpx AsyncClient initialized (connection reuse enabled)")
    return _client


async def close_http_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
        _log.info("[MALV WORKER] httpx AsyncClient closed")
