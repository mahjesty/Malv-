from __future__ import annotations

import logging
import time
from typing import Any, Dict

from app.core.settings import Settings
from app.inference.models import InferenceRequest, InferenceResponse, StreamDeltaHandler, StreamDoneHandler
from app.inference.providers.base import ProviderMetadata

_log = logging.getLogger("malv.brain")


class FallbackInferenceProvider:
    """
    Last-resort MALV-native copy when no private model answered.
    Clearly not real neural inference — honest, operator-tone guidance.
    """

    name = "fallback"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._meta = ProviderMetadata(backend_type="fallback", model_name=None, supports_stream=False)

    async def health(self) -> Dict[str, Any]:
        return {
            "ok": self._settings.fallback_enabled,
            "reachable": True,
            "backend": self.name,
            "streamingSupported": False,
            "metadata": self._meta.as_dict(),
        }

    async def cancel(self, run_id: str) -> bool:
        return False

    def _compose(self, req: InferenceRequest) -> str:
        mode = req.mode
        hint = ""
        if self._settings.inference_backend == "ollama":
            hint = (
                "Configure Ollama on your private host, pull a model, set MALV_INFERENCE_BACKEND=ollama and "
                "MALV_INFERENCE_MODEL to that tag, and point MALV_INFERENCE_BASE_URL at your instance."
            )
        elif self._settings.inference_backend == "llamacpp":
            hint = (
                "Run llama.cpp server on infrastructure you control, set MALV_INFERENCE_BACKEND=llamacpp, "
                "MALV_LLAMACPP_BASE_URL, and MALV_LLAMACPP_MODE (completion or openai_chat) to match the server."
            )
        elif self._settings.inference_backend == "transformers":
            hint = (
                "Set MALV_MODEL_PATH or MALV_TRANSFORMERS_MODEL_PATH to a local directory or private model id "
                "and ensure PyTorch/Transformers are installed in this worker environment."
            )
        elif self._settings.inference_backend == "openai_compatible":
            hint = (
                "Point MALV_OPENAI_COMPAT_BASE_URL at your vLLM (or other OpenAI-compatible) server, set "
                "MALV_INFERENCE_MODEL to the model id returned by GET /v1/models, and verify network reachability from this worker."
            )
        else:
            hint = (
                "Pick a private backend: MALV_INFERENCE_BACKEND=ollama | llamacpp | transformers | openai_compatible | vllm, "
                "or keep transformers with a local model path."
            )

        return (
            "MALV could not produce a reply from a live private model this round. "
            "This message is the worker fallback — not model output — so you are not misled about provenance.\n\n"
            f"{hint}\n\n"
            f"I received your message (routing mode `{mode}`). "
            "Once a self-hosted backend is healthy, the same prompt path will use your weights only — no external AI APIs."
        )

    async def infer(self, req: InferenceRequest) -> InferenceResponse:
        if not self._settings.fallback_enabled:
            return InferenceResponse(
                text="",
                finish_reason="error",
                backend=self.name,
                error="fallback_disabled",
            )
        t0 = time.perf_counter()
        text = self._compose(req)
        latency = int((time.perf_counter() - t0) * 1000)
        _log.warning("[MALV INFERENCE] fallback provider synthesizing reply (not model inference) runId=%s", req.run_id)
        return InferenceResponse(
            text=text,
            finish_reason="stop",
            backend=self.name,
            latency_ms=latency,
            fallback=True,
        )

    async def stream_infer(
        self,
        req: InferenceRequest,
        on_delta: StreamDeltaHandler,
        on_done: StreamDoneHandler,
    ) -> None:
        import inspect

        r = await self.infer(req)
        dr = on_delta(r.text)
        if inspect.isawaitable(dr):
            await dr
        r.streamed = True
        done_res = on_done(r)
        if inspect.isawaitable(done_res):
            await done_res
