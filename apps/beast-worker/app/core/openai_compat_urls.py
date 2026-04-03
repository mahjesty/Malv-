"""
OpenAI-compatible (vLLM, llama.cpp --api-style openai) URL helpers.

MALV_OPENAI_COMPAT_BASE_URL may be:
  - https://host
  - https://host:port
  - https://host/v1
  - https://host/<proxy-prefix>/v1   (RunPod-style; path before /v1 is preserved)

Canonical API root always ends with /v1 (no trailing slash). Endpoints:
  GET  {api_root}/models
  POST {api_root}/chat/completions
"""

from __future__ import annotations

from typing import Optional


def normalize_openai_compat_api_root(raw: str) -> Optional[str]:
    """
    Return the canonical OpenAI-compatible API root (…/v1).

    Does not strip a trailing /v1 (previous behavior); that produced the same
    effective URLs for simple hosts but made debugging harder. Keeping /v1 in
    the stored root avoids ever composing /v1/v1/... when appending /models.
    """
    s = raw.strip().rstrip("/")
    if not s:
        return None
    if s.lower().endswith("/v1"):
        return s
    return f"{s}/v1"


def openai_compat_models_url(api_root: str) -> str:
    return f"{api_root.rstrip('/')}/models"


def openai_compat_chat_completions_url(api_root: str) -> str:
    return f"{api_root.rstrip('/')}/chat/completions"
