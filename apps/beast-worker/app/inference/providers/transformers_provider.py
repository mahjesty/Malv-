from __future__ import annotations

import asyncio
import inspect
import logging
import time
from typing import Any, Dict, Literal, Optional

from app.core.settings import Settings
from app.inference.cancel_registry import is_cancelled
from app.inference.models import InferenceRequest, InferenceResponse, StreamDeltaHandler, StreamDoneHandler
from app.inference.prompt_compose import build_prompt_for_provider
from app.inference.providers.base import ProviderMetadata
from app.providers.local_engine import GenerationConfig, LocalInferenceEngine

_log = logging.getLogger("malv.brain")

InferDevice = Literal["cpu", "cuda", "auto"]


class TransformersInferenceProvider:
    name = "transformers"

    def __init__(self, settings: Settings) -> None:
        path = settings.transformers_model_path
        if not path:
            raise RuntimeError("Transformers provider requires MALV_MODEL_PATH or MALV_TRANSFORMERS_MODEL_PATH.")
        self._settings = settings
        self.engine = LocalInferenceEngine(
            path,
            use_gpu=settings.use_gpu,
            gpu_device=settings.gpu_device,
        )
        self._meta = ProviderMetadata(
            backend_type="transformers",
            model_name=path,
            supports_stream=False,
            cpu_only=not settings.use_gpu,
        )
        self._ready = False
        self._warmup_error: Optional[str] = None

    async def warmup(self) -> None:
        if not self._settings.transformers_eager_load:
            return
        try:
            await asyncio.to_thread(self.engine.warmup)
            self._ready = True
            _log.info("[MALV INFERENCE] Transformers eager load OK model_path=%s", self._settings.transformers_model_path)
        except Exception as e:
            self._warmup_error = str(e)
            _log.error("[MALV INFERENCE] Transformers eager load failed: %s", e)

    async def health(self) -> Dict[str, Any]:
        ready = self._ready or not self._settings.transformers_eager_load
        err = self._warmup_error
        return {
            "ok": err is None,
            "reachable": True,
            "backend": self.name,
            "modelPath": self._settings.transformers_model_path,
            "weightsReady": ready,
            "eagerLoadError": err,
            "streamingSupported": False,
            "metadata": self._meta.as_dict(),
        }

    async def cancel(self, run_id: str) -> bool:
        from app.inference.cancel_registry import cancel_run

        return cancel_run(run_id)

    def _device_for_mode(self, mode: str) -> InferDevice:
        if mode in ("gpu", "beast"):
            return "auto" if self._settings.use_gpu else "cpu"
        if mode in ("cpu", "light"):
            return "cpu"
        return "auto" if self._settings.use_gpu else "cpu"

    async def infer(self, req: InferenceRequest) -> InferenceResponse:
        if is_cancelled(req.run_id):
            return InferenceResponse(
                text="",
                finish_reason="cancelled",
                backend=self.name,
                cancelled=True,
            )
        prompt = build_prompt_for_provider(req)
        if req.system_prompt and str(req.system_prompt).strip():
            prompt = f"{str(req.system_prompt).strip()}\n\n{prompt}"
        device = self._device_for_mode(req.mode)
        gen_cfg = GenerationConfig(
            max_new_tokens=req.max_tokens,
            temperature=req.temperature,
            top_p=req.top_p,
        )
        t0 = time.perf_counter()
        try:
            text = await asyncio.to_thread(self.engine.generate, prompt, device=device, gen_cfg=gen_cfg)
            latency = int((time.perf_counter() - t0) * 1000)
            out = (text or "").strip()
            if not out:
                _log.warning("[MALV INFERENCE] Transformers returned empty text after generation")
                return InferenceResponse(
                    text="",
                    finish_reason="length",
                    backend=self.name,
                    latency_ms=latency,
                    error="empty_generation",
                )
            return InferenceResponse(
                text=out,
                finish_reason="stop",
                model=self._settings.transformers_model_path,
                backend=self.name,
                latency_ms=latency,
            )
        except Exception as e:
            latency = int((time.perf_counter() - t0) * 1000)
            _log.error("[MALV INFERENCE] Transformers infer failed: %s", e)
            return InferenceResponse(
                text="",
                finish_reason="error",
                backend=self.name,
                latency_ms=latency,
                error=str(e),
            )

    async def stream_infer(
        self,
        req: InferenceRequest,
        on_delta: StreamDeltaHandler,
        on_done: StreamDoneHandler,
    ) -> None:
        r = await self.infer(req)
        if r.text:
            chunk_size = 96
            for i in range(0, len(r.text), chunk_size):
                if is_cancelled(req.run_id):
                    r.cancelled = True
                    r.finish_reason = "cancelled"
                    break
                piece = r.text[i : i + chunk_size]
                dr = on_delta(piece)
                if inspect.isawaitable(dr):
                    await dr
                await asyncio.sleep(0)
        r.streamed = True
        done_res = on_done(r)
        if inspect.isawaitable(done_res):
            await done_res
