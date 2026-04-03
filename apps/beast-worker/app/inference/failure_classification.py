"""
Standard inference failure classes for logs, telemetry, and operator surfaces.

Values are stable API identifiers — do not rename without updating consumers.
"""

from __future__ import annotations

from typing import Optional

FAILURE_CLASSES = (
    "transport_error",
    "timeout",
    "upstream_http_error",
    "model_error",
    "rate_limited",
    "unknown_error",
)


def classify_failure(error: Optional[str], *, internal_hint: Optional[str] = None) -> str:
    """
    Map provider / router error strings to a standard failure_class.

    internal_hint: optional short tag (e.g. 'no_response', 'cancelled', 'stream_error').
    """
    err = (error or "").strip().lower()
    hint = (internal_hint or "").strip().lower()

    if hint in ("no_response",):
        return "unknown_error"
    if hint in ("cancelled",):
        return "unknown_error"
    if hint in ("stream_error",):
        return classify_failure(error)

    if "openai_compat_http_429" in err or "openai_compat_stream_http_429" in err:
        return "rate_limited"
    if "429" in err and ("openai_compat_http" in err or "openai_compat_stream_http" in err):
        return "rate_limited"
    if "rate limit" in err or "too many requests" in err:
        return "rate_limited"

    if "openai_compat_path_invalid" in err:
        return "upstream_http_error"
    if "openai_compat_http_" in err or "openai_compat_stream_http_" in err:
        return "upstream_http_error"

    if "openai_compat_timeout" in err:
        return "timeout"
    if "timeout" in err or "readtimeout" in err or "connecttimeout" in err:
        return "timeout"

    if "openai_compat_transport" in err:
        return "transport_error"
    if "connection refused" in err or "connecterror" in err or "cannot connect" in err:
        return "transport_error"

    if (
        "empty_assistant" in err
        or "empty_reply" in err
        or err == "empty_reply"
        or "no reply" in err
    ):
        return "model_error"
    if "invalid" in err and "model" in err:
        return "model_error"

    if "no_provider" in err or "inference_chain_returned_no_result" in err:
        return "unknown_error"

    if "openai_compat" in err:
        return "unknown_error"

    if not err:
        return "unknown_error"

    return "unknown_error"
