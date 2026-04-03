from __future__ import annotations

import asyncio
import inspect
import json
import logging
import time
from typing import Any, Dict, Optional

import httpx

from app.core.http_client import get_http_client
from app.core.settings import Settings
from app.inference.cancel_registry import is_cancelled
from app.inference.models import InferenceRequest, InferenceResponse, StreamDeltaHandler, StreamDoneHandler
from app.inference.prompt_compose import build_prompt_for_provider
from app.inference.providers.base import ProviderMetadata

_log = logging.getLogger("malv.brain")


def _ollama_tag_matches_listed(tag: str, listed: list[str]) -> bool:
    """True if `tag` matches an Ollama model name from /api/tags (exact or name prefix + :tag)."""
    t = tag.strip()
    if not t:
        return False
    for m in listed:
        if m == t or m.startswith(t + ":"):
            return True
    return False


class OllamaInferenceProvider:
    name = "ollama"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._base = settings.inference_base_url.rstrip("/")
        self._default_model = settings.inference_model or ""
        self._meta = ProviderMetadata(
            backend_type="ollama",
            model_name=self._default_model or None,
            supports_stream=True,
        )

    def _model_for(self, req: InferenceRequest) -> str:
        ctx = req.context
        m = (
            req.model
            or ctx.get("malvInferenceModel")
            or ctx.get("inferenceModel")
            or self._default_model
        )
        if not m or not str(m).strip():
            raise ValueError(
                "Ollama model not configured. Set MALV_INFERENCE_MODEL to a pulled tag (see `ollama list`) "
                "or pass inferenceModel in context."
            )
        return str(m).strip()

    async def health(self) -> Dict[str, Any]:
        t0 = time.perf_counter()
        target = (self._default_model or "").strip()
        model_configured = bool(target)

        def _base_payload(
            *,
            reachable: bool,
            ok: bool,
            latency: int,
            models: list[str],
            model_available: bool,
            error: Optional[str] = None,
        ) -> Dict[str, Any]:
            return {
                "ok": ok,
                "reachable": reachable,
                "backend": self.name,
                "latencyMs": latency,
                "models": models[:40],
                "modelConfigured": model_configured,
                "modelAvailable": model_available,
                "streamingSupported": True,
                "metadata": self._meta.as_dict(),
                **({"error": error} if error else {}),
            }

        try:
            client = get_http_client()
            r = await client.get(f"{self._base}/api/tags", timeout=5.0)
            latency = int((time.perf_counter() - t0) * 1000)

            if r.status_code != 200:
                body = (r.text or "")[:300]
                err = f"Ollama /api/tags returned HTTP {r.status_code}: {body}"
                _log.warning("[MALV INFERENCE] Ollama health: server not OK — %s", err)
                return _base_payload(
                    reachable=True,
                    ok=False,
                    latency=latency,
                    models=[],
                    model_available=False,
                    error=err,
                )

            models: list[str] = []
            try:
                data = r.json()
                for m in data.get("models") or []:
                    if isinstance(m, dict) and m.get("name"):
                        models.append(str(m["name"]))
            except Exception as ex:
                _log.warning("[MALV INFERENCE] Ollama health: invalid JSON from /api/tags: %s", ex)

            if not model_configured:
                err = (
                    "MALV_INFERENCE_MODEL is not set. Set it to a model name from `ollama list` "
                    f"(Ollama at {self._base})."
                )
                _log.warning("[MALV INFERENCE] Ollama reachable but %s", err)
                return _base_payload(
                    reachable=True,
                    ok=False,
                    latency=latency,
                    models=models,
                    model_available=False,
                    error=err,
                )

            model_available = _ollama_tag_matches_listed(target, models)
            if not model_available:
                err = f"Model '{target}' not found. Run: ollama pull {target}"
                _log.warning(
                    "[MALV INFERENCE] Ollama reachable but model missing — configured=%r listed=%s — %s",
                    target,
                    models[:12],
                    err,
                )
                return _base_payload(
                    reachable=True,
                    ok=False,
                    latency=latency,
                    models=models,
                    model_available=False,
                    error=err,
                )

            _log.info(
                "[MALV INFERENCE] Ollama health OK model=%r base=%s latency_ms=%d",
                target,
                self._base,
                latency,
            )
            return _base_payload(
                reachable=True,
                ok=True,
                latency=latency,
                models=models,
                model_available=True,
            )

        except httpx.ConnectError as e:
            latency = int((time.perf_counter() - t0) * 1000)
            err = f"Cannot connect to Ollama at {self._base} ({e}). Is `ollama serve` running?"
            _log.warning("[MALV INFERENCE] Ollama health: connection failed — %s", err)
            return _base_payload(
                reachable=False,
                ok=False,
                latency=latency,
                models=[],
                model_available=False,
                error=err,
            )
        except (httpx.ReadTimeout, httpx.ConnectTimeout) as e:
            latency = int((time.perf_counter() - t0) * 1000)
            err = f"Ollama /api/tags timeout reaching {self._base}: {e}"
            _log.warning("[MALV INFERENCE] Ollama health: timeout — %s", err)
            return _base_payload(
                reachable=False,
                ok=False,
                latency=latency,
                models=[],
                model_available=False,
                error=err,
            )
        except Exception as e:
            latency = int((time.perf_counter() - t0) * 1000)
            err = str(e)
            _log.warning("[MALV INFERENCE] Ollama health: unexpected error — %s", err)
            return _base_payload(
                reachable=False,
                ok=False,
                latency=latency,
                models=[],
                model_available=False,
                error=err,
            )

    async def cancel(self, run_id: str) -> bool:
        from app.inference.cancel_registry import cancel_run

        return cancel_run(run_id)

    async def infer(self, req: InferenceRequest) -> InferenceResponse:
        # JSON /v1/infer uses non-streaming generation; use stream_infer() or /v1/infer/stream for deltas.
        return await self._generate_blocking(req)

    async def _generate_blocking(self, req: InferenceRequest) -> InferenceResponse:
        model = self._model_for(req)
        prompt = build_prompt_for_provider(req)
        if req.system_prompt and str(req.system_prompt).strip():
            prompt = f"{str(req.system_prompt).strip()}\n\n{prompt}"
        t0 = time.perf_counter()
        payload: Dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": req.temperature,
                "top_p": req.top_p,
                "num_predict": req.max_tokens,
            },
        }
        if req.stop:
            payload["options"]["stop"] = req.stop

        client = get_http_client()
        timeout = httpx.Timeout(self._settings.inference_timeout_ms / 1000.0)
        attempts = 1 + max(0, self._settings.inference_max_retries)
        last_err: Optional[str] = None
        for attempt in range(attempts):
            try:
                r = await client.post(f"{self._base}/api/generate", json=payload, timeout=timeout)
                r.raise_for_status()
                data = r.json()
                text = (data.get("response") or "").strip()
                done = data.get("done")
                latency = int((time.perf_counter() - t0) * 1000)
                return InferenceResponse(
                    text=text,
                    finish_reason="stop" if done else "unknown",
                    model=model,
                    backend=self.name,
                    latency_ms=latency,
                    streamed=False,
                    raw=data if isinstance(data, dict) else None,
                )
            except httpx.HTTPStatusError as e:
                latency = int((time.perf_counter() - t0) * 1000)
                body = e.response.text[:500] if e.response else ""
                code = e.response.status_code if e.response else None
                if code == 404:
                    _log.error(
                        "[MALV INFERENCE] Ollama returned 404 for model/generate — check MALV_INFERENCE_MODEL "
                        "and run `ollama pull` if needed. body=%s",
                        body,
                    )
                else:
                    _log.error(
                        "[MALV INFERENCE] Ollama HTTP error %s: %s",
                        code if code is not None else "?",
                        body,
                    )
                return InferenceResponse(
                    text="",
                    finish_reason="error",
                    backend=self.name,
                    latency_ms=latency,
                    error=f"ollama_http_{e.response.status_code if e.response else '?'}: {body}",
                )
            except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout) as e:
                last_err = str(e)
                _log.warning(
                    "[MALV INFERENCE] Ollama transient error (attempt %d/%d): %s",
                    attempt + 1,
                    attempts,
                    e,
                )
                if attempt + 1 >= attempts:
                    break
                await asyncio.sleep(0.4 * (attempt + 1))
            except Exception as e:
                latency = int((time.perf_counter() - t0) * 1000)
                _log.error("[MALV INFERENCE] Ollama infer failed: %s", e)
                return InferenceResponse(
                    text="",
                    finish_reason="error",
                    backend=self.name,
                    latency_ms=latency,
                    error=str(e),
                )

        latency = int((time.perf_counter() - t0) * 1000)
        return InferenceResponse(
            text="",
            finish_reason="error",
            backend=self.name,
            latency_ms=latency,
            error=last_err or "ollama_unreachable",
        )

    async def stream_infer(
        self,
        req: InferenceRequest,
        on_delta: StreamDeltaHandler,
        on_done: StreamDoneHandler,
    ) -> None:
        model = self._model_for(req)
        prompt = build_prompt_for_provider(req)
        if req.system_prompt and str(req.system_prompt).strip():
            prompt = f"{str(req.system_prompt).strip()}\n\n{prompt}"
        t0 = time.perf_counter()
        payload: Dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "stream": True,
            "options": {
                "temperature": req.temperature,
                "top_p": req.top_p,
                "num_predict": req.max_tokens,
            },
        }
        if req.stop:
            payload["options"]["stop"] = req.stop

        client = get_http_client()
        timeout = httpx.Timeout(self._settings.inference_timeout_ms / 1000.0)
        full: list[str] = []
        err: Optional[str] = None
        cancelled = False
        try:
            async with client.stream("POST", f"{self._base}/api/generate", json=payload, timeout=timeout) as stream:
                stream.raise_for_status()
                async for line in stream.aiter_lines():
                    if is_cancelled(req.run_id):
                        cancelled = True
                        await stream.aclose()
                        break
                    if not line.strip():
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    piece = obj.get("response") or ""
                    if piece:
                        full.append(piece)
                        dr = on_delta(piece)
                        if inspect.isawaitable(dr):
                            await dr
                    if obj.get("done"):
                        break
        except httpx.HTTPStatusError as e:
            err = f"ollama_stream_http_{e.response.status_code if e.response else '?'}"
        except Exception as e:
            err = str(e)

        latency = int((time.perf_counter() - t0) * 1000)
        text = "".join(full).strip()
        resp = InferenceResponse(
            text=text,
            finish_reason="cancelled" if cancelled else ("error" if err else "stop"),
            model=model,
            backend=self.name,
            latency_ms=latency,
            streamed=True,
            error=err,
            cancelled=cancelled,
        )
        done_res = on_done(resp)
        if inspect.isawaitable(done_res):
            await done_res
