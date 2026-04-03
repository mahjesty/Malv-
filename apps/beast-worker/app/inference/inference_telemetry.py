"""
In-process inference observability (last success, latency, failure class).
Not durable across restarts. Secrets must never be stored — use sanitize_error_summary().
"""

from __future__ import annotations

import logging
import re
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

_lock = threading.Lock()

_log = logging.getLogger("malv.brain")

_state: Dict[str, Any] = {
    "lastSuccessAtMs": None,
    "lastSuccessAt": None,
    "lastFailureAtMs": None,
    "lastFailureAt": None,
    "lastLatencyMs": None,
    "lastBackend": None,
    "lastStream": None,
    "lastFailoverAttempted": None,
    "lastCorrelationId": None,
    "lastFailureClass": None,
    "lastErrorClass": None,
    "lastErrorSummary": None,
}


def _iso_utc(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sanitize_error_summary(raw: Optional[str], *, max_len: int = 240) -> str:
    """Truncate and strip patterns that could contain secrets (Bearer tokens, long base64)."""
    if not raw:
        return ""
    s = str(raw).strip().replace("\n", " ")
    s = re.sub(r"(?i)bearer\s+[A-Za-z0-9_\-\.]+", "Bearer <redacted>", s)
    s = re.sub(r"(?i)(api[_-]?key|token|password|secret)\s*[:=]\s*\S+", lambda m: f"{m.group(1)}=<redacted>", s)
    if len(s) > max_len:
        s = s[: max_len - 1] + "…"
    return s


def snapshot() -> Dict[str, Any]:
    with _lock:
        return dict(_state)


def record_success(
    *,
    backend: str,
    latency_ms: int,
    stream: bool,
    failover_attempted: bool,
    correlation_id: str,
) -> None:
    now_ms = int(time.time() * 1000)
    with _lock:
        _state["lastSuccessAtMs"] = now_ms
        _state["lastSuccessAt"] = _iso_utc(now_ms)
        _state["lastLatencyMs"] = int(latency_ms)
        _state["lastBackend"] = backend
        _state["lastStream"] = bool(stream)
        _state["lastFailoverAttempted"] = bool(failover_attempted)
        _state["lastCorrelationId"] = correlation_id


def record_failure(
    *,
    error_summary: str,
    failover_attempted: bool,
    correlation_id: str,
    failure_class: Optional[str] = None,
    error_class: Optional[str] = None,
) -> None:
    """Record a failed inference. Prefer failure_class (standard names); error_class is legacy alias."""
    fc = failure_class or error_class or "unknown_error"
    safe = sanitize_error_summary(error_summary)
    now_ms = int(time.time() * 1000)
    with _lock:
        _state["lastFailoverAttempted"] = bool(failover_attempted)
        _state["lastCorrelationId"] = correlation_id
        _state["lastFailureClass"] = fc
        _state["lastFailureAtMs"] = now_ms
        _state["lastFailureAt"] = _iso_utc(now_ms)
        _state["lastErrorClass"] = fc
        _state["lastErrorSummary"] = safe
    _log.warning(
        "[MALV INFERENCE] telemetry_failure correlation_id=%s failure_class=%s message=%s",
        correlation_id,
        fc,
        safe or "(empty)",
    )
