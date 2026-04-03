"""
Strict probe of OpenAI-compatible GET {api_root}/models with retries.

Used by OpenAiCompatibleInferenceProvider.health() and startup diagnostics.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.core.http_client import get_http_client

_log = logging.getLogger("malv.brain")

# Attempt delays (seconds) after first failure.
_DEFAULT_BACKOFF = (0.4, 1.0, 2.0)


async def fetch_models_json_with_retry(
    *,
    models_url: str,
    headers: Dict[str, str],
    timeout_s: float = 8.0,
    backoffs: Tuple[float, ...] = _DEFAULT_BACKOFF,
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int, int]:
    """
    GET /v1/models until 200 + JSON with non-empty `data` list (or at least parseable list).

    Returns: (data dict or None, error string or None, http_status, attempt_count)
    """
    client = get_http_client()
    last_err: Optional[str] = None
    last_status = 0
    attempt = 0
    delays = (0.0,) + backoffs

    for wait in delays:
        if wait > 0:
            await asyncio.sleep(wait)
        attempt += 1
        try:
            r = await client.get(models_url, headers=headers, timeout=timeout_s)
            last_status = r.status_code
            if r.status_code != 200:
                body = (r.text or "")[:500]
                last_err = f"HTTP {r.status_code}: {body}"
                _log.warning(
                    "[MALV] model backend GET /models attempt %d/%d status=%s url=%s",
                    attempt,
                    len(delays),
                    r.status_code,
                    models_url,
                )
                continue
            try:
                data = r.json()
            except Exception as ex:
                last_err = f"invalid JSON: {ex}"
                _log.warning("[MALV] model backend GET /models invalid JSON attempt=%d: %s", attempt, ex)
                continue
            listed = _list_model_ids_from_payload(data)
            if not listed:
                last_err = "GET /models returned 200 but no models in `data`"
                _log.warning("[MALV] model backend GET /models empty data list attempt=%d", attempt)
                continue
            _log.info(
                "[MALV] model backend OK GET /models models_count=%d attempt=%d latency_url=%s",
                len(listed),
                attempt,
                models_url,
            )
            return data, None, last_status, attempt
        except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout, httpx.RemoteProtocolError) as e:
            last_err = f"{type(e).__name__}: {e}"
            _log.warning(
                "[MALV] model backend GET /models transport error attempt %d: %s",
                attempt,
                last_err,
            )
        except Exception as e:
            last_err = str(e)
            _log.warning("[MALV] model backend GET /models error attempt %d: %s", attempt, last_err)

    _log.error(
        "[MALV] model backend unreachable or invalid — GET %s failed after %d attempts last_status=%s last_err=%s",
        models_url,
        attempt,
        last_status,
        last_err,
    )
    return None, last_err or "unknown", last_status, attempt


def _list_model_ids_from_payload(data: Any) -> List[str]:
    out: List[str] = []
    if not isinstance(data, dict):
        return out
    for item in data.get("data") or []:
        if isinstance(item, dict) and item.get("id"):
            out.append(str(item["id"]))
    return out
