import os
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.core.openai_compat_urls import normalize_openai_compat_api_root

InferenceBackendName = Literal[
    "ollama", "llamacpp", "transformers", "openai_compatible", "fallback", "lightweight_local"
]
InferenceFallbackPolicy = Literal["always_allow", "allow_on_error", "disabled"]


def _truthy(val: Optional[str], default: bool = False) -> bool:
    if val is None or val == "":
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


def _split_csv(val: str) -> List[str]:
    return [p.strip().lower() for p in val.split(",") if p.strip()]


class Settings(BaseModel):
    api_key: str = ""
    model_path: Optional[str] = Field(default=None, description="Legacy: MALV_MODEL_PATH")

    default_max_new_tokens: int = 256

    inference_backend: InferenceBackendName = "ollama"
    """Primary backend; env MALV_INFERENCE_BACKEND (ollama|llamacpp|transformers|openai_compatible|vllm|fallback)."""

    inference_enabled: bool = True
    """When false, inference is offline (no live model calls)."""

    inference_failover: List[InferenceBackendName] = Field(default_factory=list)
    inference_model: Optional[str] = Field(
        default=None,
        description="Ollama/llamacpp model id; env MALV_INFERENCE_MODEL (required for ollama primary to be 'ready').",
    )
    inference_base_url: str = Field(
        default="http://127.0.0.1:11434",
        description="Ollama base URL; env MALV_INFERENCE_BASE_URL (no trailing slash).",
    )
    inference_timeout_ms: int = 120_000
    inference_stream_default: bool = False
    inference_max_retries: int = 0

    # llama-server / OpenAI-compat model HTTP (e.g. :8081). Not the FastAPI beast-worker listen port (BEAST_WORKER_PORT, default 9090).
    llamacpp_base_url: str = "http://127.0.0.1:8081"
    llamacpp_mode: Literal["completion", "openai_chat"] = "completion"

    transformers_model_path: Optional[str] = None

    use_gpu: bool = True
    gpu_device: int = 0

    transformers_eager_load: bool = False
    fallback_enabled: bool = True

    fallback_policy: InferenceFallbackPolicy = "allow_on_error"

    openai_compat_base_url: Optional[str] = Field(
        default=None,
        description="OpenAI-compatible API root (…/v1). Env MALV_OPENAI_COMPAT_BASE_URL: host, host/v1, or "
        "host/<proxy>/v1 — normalized to canonical …/v1; GET {root}/models, POST {root}/chat/completions.",
    )
    openai_compat_api_key: Optional[str] = Field(
        default=None,
        description="Optional Bearer token for remote; env MALV_OPENAI_COMPAT_API_KEY.",
    )

    # Optional second OpenAI-compatible endpoint (local CPU / dev) — routed via malvInferenceBackend=lightweight_local.
    lightweight_inference_enabled: bool = False
    lightweight_openai_compat_base_url: Optional[str] = Field(
        default=None,
        description="Env MALV_LIGHTWEIGHT_OPENAI_COMPAT_BASE_URL — normalized …/v1 like primary OpenAI-compat.",
    )
    lightweight_inference_model: Optional[str] = Field(
        default=None,
        description="Env MALV_LIGHTWEIGHT_INFERENCE_MODEL — must exist on lightweight GET /v1/models.",
    )
    lightweight_openai_compat_api_key: Optional[str] = Field(
        default=None,
        description="Env MALV_LIGHTWEIGHT_OPENAI_COMPAT_API_KEY; falls back to openai_compat_api_key when unset.",
    )
    lightweight_inference_timeout_ms: Optional[int] = Field(
        default=None,
        description="Env MALV_LIGHTWEIGHT_INFERENCE_TIMEOUT_MS; unset uses inference_timeout_ms.",
    )


def load_settings() -> Settings:
    api_key = os.getenv("BEAST_WORKER_API_KEY", "")

    transformers_model_path = os.getenv("MALV_TRANSFORMERS_MODEL_PATH") or os.getenv("MALV_MODEL_PATH")
    model_path = transformers_model_path

    default_max_new_tokens = int(os.getenv("MALV_DEFAULT_MAX_NEW_TOKENS", "256"))

    raw_backend = os.getenv("MALV_INFERENCE_BACKEND", "").strip().lower()
    if raw_backend == "vllm":
        raw_backend = "openai_compatible"
    if raw_backend in ("dev_fast", "cpu_fallback"):
        raw_backend = "lightweight_local"
    failover_raw = os.getenv("MALV_INFERENCE_FAILOVER", "").strip()

    openai_compat_base = normalize_openai_compat_api_root(os.getenv("MALV_OPENAI_COMPAT_BASE_URL") or "")

    inference_enabled = True
    if raw_backend in ("offline", "disabled"):
        inference_enabled = False
        raw_backend = "ollama"

    if raw_backend in ("ollama", "llamacpp", "transformers", "openai_compatible", "fallback", "lightweight_local"):
        inference_backend: InferenceBackendName = raw_backend  # type: ignore[assignment]
    elif transformers_model_path:
        inference_backend = "transformers"
    elif openai_compat_base:
        # Match repo template: remote OpenAI-compatible (vLLM) without forcing MALV_INFERENCE_BACKEND.
        inference_backend = "openai_compatible"
    else:
        # No backend set and no remote URL — default local Ollama.
        inference_backend = "ollama"

    # Unset/empty → default True; must stay aligned with API `malvFallbackEnabledFromEnv` (apps/api).
    fallback_enabled = _truthy(os.getenv("MALV_FALLBACK_ENABLED"), True)

    raw_policy = (os.getenv("INFERENCE_FALLBACK_POLICY") or "").strip().lower()
    if raw_policy not in ("always_allow", "allow_on_error", "disabled"):
        # Default: production can disable fallback by default; dev keeps it on.
        node_env = (os.getenv("NODE_ENV") or "").strip().lower()
        fallback_policy: InferenceFallbackPolicy = "disabled" if node_env == "production" else "allow_on_error"
    else:
        fallback_policy = raw_policy  # type: ignore[assignment]

    inference_failover: List[InferenceBackendName] = []
    def _norm_failover_name(name: str) -> Optional[str]:
        if name == "vllm":
            return "openai_compatible"
        if name in ("dev_fast", "cpu_fallback"):
            return "lightweight_local"
        if name in ("ollama", "llamacpp", "transformers", "openai_compatible", "fallback", "lightweight_local"):
            return name
        return None

    if failover_raw:
        for name in _split_csv(failover_raw):
            mapped = _norm_failover_name(name)
            if mapped:
                inference_failover.append(mapped)  # type: ignore[arg-type]
    else:
        if inference_backend == "ollama":
            if transformers_model_path:
                inference_failover.append("transformers")
            if fallback_enabled:
                inference_failover.append("fallback")
        elif inference_backend == "llamacpp":
            if transformers_model_path:
                inference_failover.append("transformers")
            if fallback_enabled:
                inference_failover.append("fallback")
        elif inference_backend == "transformers":
            if fallback_enabled:
                inference_failover.append("fallback")
        elif inference_backend == "openai_compatible":
            if fallback_enabled:
                inference_failover.append("fallback")
        elif inference_backend == "lightweight_local":
            if openai_compat_base and fallback_enabled:
                inference_failover.append("openai_compatible")
            if fallback_enabled:
                inference_failover.append("fallback")
        else:
            inference_failover = []

    inference_model_raw = (os.getenv("MALV_INFERENCE_MODEL") or "").strip()
    inference_model = inference_model_raw or None
    inference_base_url = os.getenv("MALV_INFERENCE_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    inference_timeout_ms = int(os.getenv("MALV_INFERENCE_TIMEOUT_MS", "120000"))
    inference_stream_default = _truthy(os.getenv("MALV_INFERENCE_STREAM"), False)
    inference_max_retries = int(os.getenv("MALV_INFERENCE_MAX_RETRIES", "0"))

    llamacpp_base_url = os.getenv("MALV_LLAMACPP_BASE_URL", "http://127.0.0.1:8081").rstrip("/")
    raw_ll_mode = os.getenv("MALV_LLAMACPP_MODE", "completion").strip().lower()
    llamacpp_mode: Literal["completion", "openai_chat"] = (
        "openai_chat" if raw_ll_mode in ("openai", "openai_chat", "chat") else "completion"
    )

    use_gpu = _truthy(os.getenv("MALV_USE_GPU"), True)
    gpu_device = int(os.getenv("MALV_GPU_DEVICE", "0"))

    transformers_eager_load = _truthy(os.getenv("MALV_TRANSFORMERS_EAGER_LOAD"), False)

    openai_compat_api_key = (os.getenv("MALV_OPENAI_COMPAT_API_KEY") or "").strip() or None

    lw_base = normalize_openai_compat_api_root(os.getenv("MALV_LIGHTWEIGHT_OPENAI_COMPAT_BASE_URL") or "")
    lw_model = (os.getenv("MALV_LIGHTWEIGHT_INFERENCE_MODEL") or "").strip() or None
    lw_key = (os.getenv("MALV_LIGHTWEIGHT_OPENAI_COMPAT_API_KEY") or "").strip() or None
    lw_timeout_raw = (os.getenv("MALV_LIGHTWEIGHT_INFERENCE_TIMEOUT_MS") or "").strip()
    lw_timeout = int(lw_timeout_raw) if lw_timeout_raw.isdigit() else None
    lightweight_enabled_flag = _truthy(os.getenv("MALV_LIGHTWEIGHT_INFERENCE_ENABLED"), False)
    lightweight_inference_enabled = bool(lightweight_enabled_flag and lw_base and lw_model)

    return Settings(
        api_key=api_key,
        model_path=model_path,
        default_max_new_tokens=default_max_new_tokens,
        inference_backend=inference_backend,
        inference_failover=inference_failover,
        inference_model=inference_model,
        inference_base_url=inference_base_url,
        inference_timeout_ms=inference_timeout_ms,
        inference_stream_default=inference_stream_default,
        inference_max_retries=inference_max_retries,
        llamacpp_base_url=llamacpp_base_url,
        llamacpp_mode=llamacpp_mode,
        transformers_model_path=transformers_model_path,
        use_gpu=use_gpu,
        gpu_device=gpu_device,
        transformers_eager_load=transformers_eager_load,
        fallback_enabled=fallback_enabled,
        fallback_policy=fallback_policy,
        inference_enabled=inference_enabled,
        openai_compat_base_url=openai_compat_base,
        openai_compat_api_key=openai_compat_api_key,
        lightweight_inference_enabled=lightweight_inference_enabled,
        lightweight_openai_compat_base_url=lw_base or None,
        lightweight_inference_model=lw_model,
        lightweight_openai_compat_api_key=lw_key,
        lightweight_inference_timeout_ms=lw_timeout,
    )
