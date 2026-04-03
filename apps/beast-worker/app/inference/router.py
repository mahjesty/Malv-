from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

from app.core.settings import InferenceBackendName, Settings
from app.inference import inference_telemetry
from app.inference.correlation import effective_correlation_id
from app.inference.failure_classification import classify_failure
from app.inference.models import InferMode, InferenceRequest, InferenceResponse
from app.inference.providers.fallback import FallbackInferenceProvider
from app.inference.providers.llamacpp import LlamaCppInferenceProvider
from app.inference.providers.ollama import OllamaInferenceProvider
from app.inference.providers.openai_compatible import OpenAiCompatibleInferenceProvider
from app.inference.providers.transformers_provider import TransformersInferenceProvider

_log = logging.getLogger("malv.brain")


def _ctx_str(context: dict[str, Any], *keys: str) -> Optional[str]:
    for k in keys:
        v = context.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return None


def _normalize_backend(name: Optional[str]) -> Optional[InferenceBackendName]:
    if not name:
        return None
    n = name.strip().lower()
    if n in ("ollama", "llamacpp", "transformers", "openai_compatible", "vllm", "fallback"):
        return "openai_compatible" if n == "vllm" else n  # type: ignore[return-value]
    return None


class StreamAdapter:
    async def adapt(self, reply: str) -> str:
        return reply


class SandboxActionRouter:
    async def stage(self, *, prompt: str) -> dict[str, Any]:
        return {"sandbox_required": False, "actions": []}


class TaskClassifier:
    def classify(self, *, mode: InferMode, prompt: str) -> InferMode:
        if mode in ("beast", "gpu"):
            return "beast"
        if len(prompt) > 280:
            return "gpu"
        return "light"


class PolicyGate:
    def authorize(self, *, context: dict[str, Any]) -> dict[str, Any]:
        return {"allow_inference": True, "vault_included": bool(context.get("vaultIncluded", False))}


class ModelCapabilityMap:
    def __init__(self) -> None:
        self.supports_multimodal = False
        self.supports_transcription = False
        self.supports_reasoning = True
        self.supports_long_context = True


class InferenceRouter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.capabilities = ModelCapabilityMap()
        self.classifier = TaskClassifier()
        self.policy = PolicyGate()
        self.stream = StreamAdapter()
        self.sandbox_router = SandboxActionRouter()

        self._providers: Dict[str, Any] = {}
        self._chain_order: List[str] = []
        self._build_providers_and_chain()

        _log.info(
            "[MALV ROUTER] boot primary=%s chain=%s fallback_enabled=%s transformers_path=%s ollama_base=%s llamacpp_base=%s openai_compat_base=%s",
            settings.inference_backend,
            self._chain_order,
            settings.fallback_enabled,
            bool(settings.transformers_model_path),
            settings.inference_base_url,
            settings.llamacpp_base_url,
            settings.openai_compat_base_url or "",
        )

    def _instantiate(self, name: InferenceBackendName) -> Optional[Any]:
        if name == "ollama":
            return OllamaInferenceProvider(self.settings)
        if name == "llamacpp":
            return LlamaCppInferenceProvider(self.settings)
        if name == "transformers":
            if not self.settings.transformers_model_path:
                _log.warning("[MALV ROUTER] skip transformers — no MALV_MODEL_PATH / MALV_TRANSFORMERS_MODEL_PATH")
                return None
            return TransformersInferenceProvider(self.settings)
        if name == "openai_compatible":
            if not (self.settings.openai_compat_base_url or "").strip():
                _log.warning(
                    "[MALV ROUTER] skip openai_compatible — set MALV_OPENAI_COMPAT_BASE_URL (remote OpenAI-compatible API, e.g. vLLM)"
                )
                return None
            return OpenAiCompatibleInferenceProvider(self.settings)
        if name == "fallback":
            return FallbackInferenceProvider(self.settings)
        return None

    def _build_providers_and_chain(self) -> None:
        if not self.settings.inference_enabled:
            self._providers = {}
            self._chain_order = []
            _log.warning("[MALV ROUTER] inference disabled (inference_enabled=false) — no providers instantiated")
            return

        seen: set[str] = set()
        order: List[InferenceBackendName] = []

        primary = self.settings.inference_backend
        if primary not in seen:
            order.append(primary)
            seen.add(primary)

        for fb in self.settings.inference_failover:
            if fb not in seen:
                order.append(fb)
                seen.add(fb)

        if self.settings.fallback_enabled and self.settings.fallback_policy != "disabled" and "fallback" not in seen:
            order.append("fallback")
            seen.add("fallback")

        for name in order:
            p = self._instantiate(name)
            if p is not None:
                self._providers[name] = p
                self._chain_order.append(name)

        if not self._chain_order:
            fb = FallbackInferenceProvider(self.settings)
            self._providers["fallback"] = fb
            self._chain_order = ["fallback"]
            _log.warning("[MALV ROUTER] no backends instantiated — using fallback only")

    def _select_chain(self, context: dict[str, Any]) -> List[Tuple[str, Any]]:
        override = _normalize_backend(_ctx_str(context, "malvInferenceBackend", "inferenceBackend"))
        if not override:
            return [(n, self._providers[n]) for n in self._chain_order if n in self._providers]

        if override not in self._providers:
            _log.warning("[MALV ROUTER] requested backend %s not in active chain — using default chain", override)
            return [(n, self._providers[n]) for n in self._chain_order if n in self._providers]

        rest = [n for n in self._chain_order if n != override]
        chain = [override] + rest
        out: List[Tuple[str, Any]] = []
        seen: set[str] = set()
        for n in chain:
            if n in seen:
                continue
            seen.add(n)
            p = self._providers.get(n)
            if p is not None:
                out.append((n, p))
        _log.info("[MALV ROUTER] per-request backend override=%s effective_chain=%s", override, [x[0] for x in out])
        return out

    def _request_from_legacy(
        self,
        *,
        mode: InferMode,
        prompt: str,
        context: dict[str, Any],
        temperature: float,
        top_p: float,
        max_tokens: int,
        stop: List[str],
        stream: bool,
    ) -> InferenceRequest:
        run_id = _ctx_str(context, "runId", "run_id")
        malv_cid = _ctx_str(context, "malvCorrelationId", "malv_correlation_id") or run_id
        model = _ctx_str(context, "malvInferenceModel", "inferenceModel")
        msgs = context.get("messages")
        messages = msgs if isinstance(msgs, list) else None
        sys_p = context.get("systemPrompt") or context.get("system_prompt")
        system_prompt = str(sys_p) if sys_p else None
        im = context.get("inputMode") or context.get("input_mode")
        return InferenceRequest(
            run_id=run_id,
            malv_correlation_id=malv_cid,
            prompt=prompt,
            system_prompt=system_prompt,
            messages=messages,
            context=context,
            mode=mode,
            model=model,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            stop=list(stop) if stop else [],
            stream=stream,
            input_mode=str(im) if im is not None else None,
        )

    async def infer(
        self,
        *,
        mode: InferMode,
        prompt: str,
        context: dict[str, Any],
        temperature: float = 0.7,
        top_p: float = 0.9,
        max_tokens: Optional[int] = None,
        stop: Optional[List[str]] = None,
        stream: bool = False,
    ) -> dict[str, Any]:
        classified = self.classifier.classify(mode=mode, prompt=prompt)
        gate = self.policy.authorize(context=context)
        if not gate["allow_inference"]:
            return {"reply": "Request blocked by policy gate.", "meta": gate}

        if not self.settings.inference_enabled:
            return {
                "reply": "Inference is currently disabled by MALV operator configuration.",
                "meta": {"inferenceEnabled": False, "inferenceBackend": self.settings.inference_backend},
            }

        req = self._request_from_legacy(
            mode=classified,
            prompt=prompt,
            context=context,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens or self.settings.default_max_new_tokens,
            stop=stop or [],
            stream=stream,
        )

        cid = effective_correlation_id(req)
        _log.info(
            "[MALV WORKER] infer start classified=%s correlation_id=%s runId=%s prompt_chars=%d chain=%s",
            classified,
            cid,
            req.run_id,
            len(prompt),
            [x[0] for x in self._select_chain(context)],
        )

        chain = self._select_chain(context)
        last: Optional[InferenceResponse] = None
        attempts: List[dict[str, Any]] = []

        # Fallback policy:
        # - disabled: never attempt template fallback
        # - allow_on_error: fallback only after primary health/test fails
        # - always_allow: fallback behaves permissively (after primary fails at runtime)
        if self.settings.inference_backend == "fallback":
            allow_fallback_now = bool(self.settings.fallback_enabled)
        else:
            allow_fallback_now = bool(self.settings.fallback_enabled and self.settings.fallback_policy != "disabled")
            if self.settings.fallback_policy == "allow_on_error":
                allow_fallback_now = not await self._primary_is_ready_for_policy()

        for name, provider in chain:
            if name == "fallback" and not allow_fallback_now:
                _log.warning("[MALV INFERENCE] skipping fallback due to fallback policy (allow_on_error/primary_ready)")
                continue
            t0 = time.perf_counter()
            _log.info(
                "[MALV INFERENCE] provider_try backend=%s correlation_id=%s runId=%s",
                name,
                effective_correlation_id(req),
                req.run_id,
            )
            try:
                resp = await provider.infer(req)
            except asyncio.CancelledError:
                _log.warning("[MALV INFERENCE] cancelled during provider=%s runId=%s", name, req.run_id)
                raise
            except Exception as e:
                _log.error("[MALV INFERENCE] provider=%s raised: %s", name, e)
                attempts.append({"backend": name, "error": str(e)})
                last = InferenceResponse(text="", finish_reason="error", backend=name, error=str(e))
                continue

            elapsed = int((time.perf_counter() - t0) * 1000)
            attempts.append(
                {
                    "backend": name,
                    "latencyMs": elapsed,
                    "chars": len(resp.text or ""),
                    "error": resp.error,
                    "fallback": resp.fallback,
                }
            )

            if resp.cancelled:
                last = resp
                break

            if (resp.text or "").strip() and not resp.error:
                last = resp
                _log.info(
                    "[MALV INFERENCE] provider_ok backend=%s correlation_id=%s latency_ms=%d chars=%d",
                    name,
                    effective_correlation_id(req),
                    resp.latency_ms,
                    len(resp.text),
                )
                break

            if resp.error and name != "fallback":
                if name == "openai_compatible" and resp.error and "openai_compat_path_invalid" in resp.error:
                    _log.error(
                        "[MALV INFERENCE] openai_compatible misconfigured (wrong API path); "
                        "failing over to next backend — %s",
                        resp.error,
                    )
                else:
                    _log.warning(
                        "[MALV INFERENCE] provider_empty_or_error backend=%s error=%s — trying next backend in chain",
                        name,
                        resp.error,
                    )
            last = resp

        if last is None:
            _log.error("[MALV INFERENCE] no response after chain — emergency fallback copy")
            fb = self._providers.get("fallback")
            if fb:
                last = await fb.infer(req)
            else:
                last = InferenceResponse(
                    text="MALV inference chain produced no response.",
                    finish_reason="error",
                    backend="none",
                    error="no_provider",
                )

        if last is not None and last.fallback and last.backend == "fallback":
            tried = [a.get("backend") for a in attempts]
            errs = [a.get("error") for a in attempts if a.get("error")]
            if any(b and b != "fallback" for b in tried):
                _log.warning(
                    "[MALV INFERENCE] using fallback provider (not live model output); "
                    "backends_tried=%s inference_errors=%s",
                    tried,
                    errs,
                )

        shaped = await self.stream.adapt(last.text)

        # Never return a blank body to the API: if primary chain left empty text, run template fallback.
        if last is not None and not last.cancelled and not (shaped or "").strip():
            fb = self._providers.get("fallback")
            if fb is not None and allow_fallback_now and last.backend != "fallback":
                _log.warning(
                    "[MALV INFERENCE] router empty primary output — invoking template fallback "
                    "correlation_id=%s last_backend=%s last_error=%s",
                    effective_correlation_id(req),
                    last.backend,
                    last.error,
                )
                fb_resp = await fb.infer(req)
                attempts.append(
                    {
                        "backend": "fallback",
                        "latencyMs": int(fb_resp.latency_ms or 0),
                        "chars": len(fb_resp.text or ""),
                        "error": fb_resp.error,
                        "fallback": True,
                    }
                )
                last = fb_resp
                shaped = await self.stream.adapt(last.text)

        if last is not None and not last.cancelled and not (shaped or "").strip():
            err_bits: List[str] = []
            if last and getattr(last, "error", None):
                err_bits.append(f"last_backend_error={last.error}")
            if attempts:
                for a in attempts:
                    e = a.get("error")
                    b = a.get("backend")
                    if e:
                        err_bits.append(f"{b}:{e}")
            detail = (" " + " | ".join(err_bits[:6])) if err_bits else ""
            if len(detail) > 1400:
                detail = detail[:1400] + "…"
            emergency = (
                "MALV could not obtain a reply from the configured model backend. "
                "Verify GET {MALV_OPENAI_COMPAT_BASE_URL}/models returns HTTP 200 with at least one model, "
                "that MALV_INFERENCE_MODEL matches a listed id (exact id from /v1/models), "
                "that MALV_OPENAI_COMPAT_BASE_URL resolves to an API root ending in /v1, "
                "and restart the beast-worker after .env changes."
                f"{detail}"
            )
            _log.error(
                "[MALV INFERENCE] reply still empty after fallback — emergency operator message correlation_id=%s "
                "attempts=%s",
                effective_correlation_id(req),
                json.dumps(attempts, default=str)[:4000],
            )
            last = InferenceResponse(
                text=emergency,
                finish_reason="error",
                backend=last.backend if last else "unknown",
                latency_ms=getattr(last, "latency_ms", 0) or 0,
                error="emergency_empty_all_backends",
            )
            shaped = emergency

        sandbox_stage = await self.sandbox_router.stage(prompt=prompt)

        failover_attempted = len(attempts) > 1
        _log.info(
            "[MALV_INFERENCE_TRACE] router_chain_end correlation_id=%s run_id=%s "
            "failover_attempted=%s attempt_count=%d final_backend=%s reply_chars=%d chain_order=%s",
            effective_correlation_id(req),
            req.run_id,
            failover_attempted,
            len(attempts),
            last.backend if last else None,
            len(shaped or ""),
            [n for n, _ in chain],
        )
        self._record_inference_telemetry(
            last=last,
            req_stream=req.stream,
            failover_attempted=failover_attempted,
            correlation_id=effective_correlation_id(req),
        )

        body = last.to_worker_body()
        body["reply"] = shaped
        meta = body.get("meta") or {}
        meta.update(
            {
                "classifiedMode": classified,
                "capabilities": self.capabilities.__dict__,
                "inferenceAttempts": attempts,
                "malvReplySource": "beast_worker",
                **sandbox_stage,
            }
        )
        if last.fallback:
            meta["malvWorkerFallback"] = True
        if last.cancelled:
            meta["cancelled"] = True

        head = (shaped or "")[:120].replace("\n", " ")
        _log.info(
            "[MALV WORKER] infer_return correlation_id=%s backend=%s reply_chars=%d preview=%r",
            effective_correlation_id(req),
            last.backend,
            len(shaped or ""),
            head + ("…" if len(shaped or "") > 120 else ""),
        )
        if not (shaped or "").strip() and not last.cancelled:
            meta["malvEmptyReason"] = last.error or "empty_after_chain"
            meta["malvLastBackend"] = last.backend
            meta["malvLastFinishReason"] = last.finish_reason
            meta["malvChainOrder"] = [n for n, _ in chain]
            _log.warning(
                "[MALV WORKER] infer_return empty after adapt — API may use fallback brain trace=%s",
                json.dumps(
                    {
                        "correlation_id": effective_correlation_id(req),
                        "run_id": req.run_id,
                        "last_backend": last.backend,
                        "last_error": last.error,
                        "finish_reason": last.finish_reason,
                        "attempts": attempts,
                    },
                    default=str,
                ),
            )

        return {"reply": shaped, "meta": meta}

    def _record_inference_telemetry(
        self,
        *,
        last: Optional[InferenceResponse],
        req_stream: bool,
        failover_attempted: bool,
        correlation_id: str,
    ) -> None:
        if last is None:
            inference_telemetry.record_failure(
                failure_class=classify_failure(None, internal_hint="no_response"),
                error_summary="inference_chain_returned_no_result",
                failover_attempted=failover_attempted,
                correlation_id=correlation_id,
            )
            return
        if last.cancelled:
            inference_telemetry.record_failure(
                failure_class=classify_failure(None, internal_hint="cancelled"),
                error_summary="inference_cancelled",
                failover_attempted=failover_attempted,
                correlation_id=correlation_id,
            )
            return
        if (last.text or "").strip():
            inference_telemetry.record_success(
                backend=last.backend or "unknown",
                latency_ms=int(last.latency_ms or 0),
                stream=req_stream,
                failover_attempted=failover_attempted,
                correlation_id=correlation_id,
            )
            return
        err = last.error or "empty_reply"
        inference_telemetry.record_failure(
            failure_class=classify_failure(err),
            error_summary=err,
            failover_attempted=failover_attempted,
            correlation_id=correlation_id,
        )

    async def infer_stream_sse(
        self,
        *,
        mode: InferMode,
        prompt: str,
        context: dict[str, Any],
        temperature: float = 0.7,
        top_p: float = 0.9,
        max_tokens: Optional[int] = None,
    ):
        """Yield SSE lines for stream endpoint."""
        classified = self.classifier.classify(mode=mode, prompt=prompt)
        gate = self.policy.authorize(context=context)
        if not gate["allow_inference"]:
            yield f"event: error\ndata: {{\"message\": \"policy_block\"}}\n\n"
            return

        if not self.settings.inference_enabled:
            yield f"event: error\ndata: {{\"message\": \"inference_disabled\"}}\n\n"
            return

        req = self._request_from_legacy(
            mode=classified,
            prompt=prompt,
            context=context,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens or self.settings.default_max_new_tokens,
            stop=[],
            stream=True,
        )
        chain = self._select_chain(context)
        provider = None
        backend_name = ""
        for name, p in chain:
            provider = p
            backend_name = name
            break

        import json

        _log.info(
            "[MALV INFERENCE] stream_start backend=%s correlation_id=%s runId=%s",
            backend_name,
            effective_correlation_id(req),
            req.run_id,
        )

        q: asyncio.Queue = asyncio.Queue()
        total_chars = 0

        async def push_delta(t: str) -> None:
            nonlocal total_chars
            total_chars += len(t)
            await q.put(("delta", t))

        async def on_done(r: InferenceResponse) -> None:
            await q.put(("done", r))

        async def runner() -> None:
            try:
                await provider.stream_infer(req, push_delta, on_done)
            except Exception as e:
                await q.put(("error", str(e)))

        task = asyncio.create_task(runner())
        final_resp: Optional[InferenceResponse] = None
        try:
            while True:
                kind, data = await q.get()
                if kind == "delta":
                    payload = json.dumps({"type": "assistant_delta", "text": data})
                    yield f"data: {payload}\n\n"
                elif kind == "done":
                    final_resp = data  # type: ignore[assignment]
                    break
                elif kind == "error":
                    payload = json.dumps({"type": "error", "message": data})
                    yield f"data: {payload}\n\n"
                    inference_telemetry.record_failure(
                        failure_class=classify_failure(str(data), internal_hint="stream_error"),
                        error_summary=str(data),
                        failover_attempted=False,
                        correlation_id=effective_correlation_id(req),
                    )
                    break
        finally:
            try:
                await asyncio.wait_for(task, timeout=2.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        if final_resp:
            payload = json.dumps(
                {
                    "type": "done",
                    "backend": backend_name,
                    "latencyMs": final_resp.latency_ms,
                    "cancelled": final_resp.cancelled,
                    "finishReason": final_resp.finish_reason,
                }
            )
            yield f"data: {payload}\n\n"
            self._record_inference_telemetry(
                last=final_resp,
                req_stream=True,
                failover_attempted=False,
                correlation_id=effective_correlation_id(req),
            )
        _log.info(
            "[MALV INFERENCE] structured backend=%s phase=stream_done correlation_id=%s stream=true chars=%d",
            backend_name,
            effective_correlation_id(req),
            total_chars,
        )

    def _explain_backend_health(self, name: str, h: dict[str, Any]) -> str:
        """Human/debug reason this backend is not usable as the live primary brain (empty if usable)."""
        if name == "fallback":
            return "fallback_is_template_provider_not_neural_inference"
        if not h:
            return "health_not_run"
        if name == "ollama":
            err = h.get("error")
            if err:
                return str(err)
            if not h.get("reachable"):
                return "ollama_unreachable_check_MALV_INFERENCE_BASE_URL"
            if not h.get("modelConfigured"):
                return "MALV_INFERENCE_MODEL_not_set"
            if not h.get("modelAvailable"):
                return "model_not_listed_on_ollama_instance_pull_or_fix_name"
            return ""
        if name == "llamacpp":
            if not h.get("reachable"):
                return str(h.get("error") or "llamacpp_unreachable_check_MALV_LLAMACPP_BASE_URL")
            if not h.get("ok"):
                return "llamacpp_probe_failed"
            return ""
        if name == "transformers":
            if not self.settings.transformers_model_path:
                return "no_MALV_MODEL_PATH"
            if h.get("eagerLoadError"):
                return f"transformers_eager_load_error:{h.get('eagerLoadError')}"
            if not h.get("weightsReady", True):
                return "transformers_weights_not_ready_enable_MALV_TRANSFORMERS_EAGER_LOAD_or_first_infer"
            if not h.get("ok"):
                return "transformers_health_not_ok"
            return ""
        if name == "openai_compatible":
            if h.get("pathMisconfigured"):
                return "openai_compatible_endpoint_path_invalid_GET_models_returned_404_check_MALV_OPENAI_COMPAT_BASE_URL"
            err = h.get("error")
            if err:
                return str(err)
            if not h.get("reachable"):
                return "openai_compatible_unreachable_check_MALV_OPENAI_COMPAT_BASE_URL"
            if not h.get("modelConfigured"):
                return "MALV_INFERENCE_MODEL_not_set"
            if not h.get("modelListed"):
                return "model_id_not_listed_on_remote_GET_v1_models"
            if not h.get("ok"):
                return "openai_compatible_health_not_ok"
            return ""
        return str(h.get("error") or "unknown_backend_state")

    async def _primary_is_ready_for_policy(self) -> bool:
        """
        For fallback_policy=allow_on_error:
        We probe the configured primary backend health once, and allow fallback only if it is not ready.
        """
        primary = self.settings.inference_backend
        if primary == "fallback":
            # Primary is already the fallback template provider.
            fb = self._providers.get("fallback")
            if not fb:
                return False
            try:
                h = await fb.health()
            except Exception:
                return False
            return bool(h.get("ok", True))

        p = self._providers.get(primary)
        if not p:
            return False
        try:
            h = await p.health()
        except Exception:
            return False

        if primary == "ollama":
            if h.get("error"):
                return False
            if not h.get("reachable"):
                return False
            if not h.get("modelConfigured"):
                return False
            if not h.get("modelAvailable"):
                return False
            return True
        if primary == "llamacpp":
            return bool(h.get("ok") and h.get("reachable"))
        if primary == "transformers":
            if h.get("eagerLoadError"):
                return False
            if not h.get("weightsReady", True):
                return False
            return bool(h.get("ok"))
        if primary == "openai_compatible":
            if h.get("pathMisconfigured"):
                return False
            return bool(h.get("ok") and h.get("reachable") and h.get("modelListed"))

        return False

    async def aggregate_health(self) -> dict[str, Any]:
        if not self.settings.inference_enabled:
            return {
                "primaryBackend": "disabled",
                "inferenceConfigured": False,
                "inferenceReady": False,
                "streamingSupported": False,
                "fallbackEnabled": False,
                "fallbackInChain": False,
                "fallbackProviderOk": False,
                "fallbackOnlyMode": False,
                "failoverToFallbackLikely": False,
                "primarySkipReason": "inference_disabled",
                "backendNotes": {"disabled": "inference_offline"},
                "providers": {},
                "chain": [],
                "selectedModel": self.settings.inference_model,
                "inferenceTelemetry": inference_telemetry.snapshot(),
                "fallbackPolicy": self.settings.fallback_policy,
                "fallbackActive": False,
                "effectiveBackend": "disabled"
            }

        primary = self.settings.inference_backend
        per: dict[str, Any] = {}
        backend_notes: dict[str, str] = {}

        for name in self._chain_order:
            p = self._providers.get(name)
            if not p:
                backend_notes[name] = "provider_not_instantiated"
                continue
            try:
                h = await p.health()
            except Exception as e:
                h = {"ok": False, "error": str(e), "backend": name}
            per[name] = h
            note = self._explain_backend_health(name, h)
            if note:
                backend_notes[name] = note

        inference_configured = primary in ("ollama", "llamacpp", "transformers", "openai_compatible", "fallback")

        ph = per.get(primary) or {}
        primary_skip = ""
        inference_ready = False
        streaming_supported = False

        if primary == "fallback":
            primary_skip = "MALV_INFERENCE_BACKEND_is_fallback_no_private_model_primary"
            inference_ready = bool(self.settings.fallback_enabled)
            streaming_supported = False
        elif primary == "ollama":
            primary_skip = self._explain_backend_health("ollama", ph)
            inference_ready = not primary_skip
            streaming_supported = bool(ph.get("streamingSupported")) and inference_ready
        elif primary == "llamacpp":
            primary_skip = self._explain_backend_health("llamacpp", ph)
            inference_ready = not primary_skip and bool(ph.get("ok") and ph.get("reachable"))
            streaming_supported = bool(ph.get("streamingSupported")) and inference_ready
        elif primary == "transformers":
            primary_skip = self._explain_backend_health("transformers", ph)
            inference_ready = not primary_skip and bool(ph.get("ok"))
            streaming_supported = bool(ph.get("streamingSupported")) and inference_ready
        elif primary == "openai_compatible":
            primary_skip = self._explain_backend_health("openai_compatible", ph)
            inference_ready = not primary_skip and bool(ph.get("ok") and ph.get("reachable") and ph.get("modelListed"))
            streaming_supported = bool(ph.get("streamingSupported")) and inference_ready

        fallback_in_chain = "fallback" in self._chain_order
        fb_health = per.get("fallback") or {}
        fallback_provider_ok = bool(fb_health.get("ok", True))

        fallback_active_now = fallback_in_chain and fallback_provider_ok
        if primary == "fallback":
            # If the operator explicitly selected the fallback template as the backend, treat it as active regardless of fallback policy mode.
            fallback_active_now = fallback_provider_ok
        else:
            if self.settings.fallback_policy == "disabled":
                fallback_active_now = False
            elif self.settings.fallback_policy == "allow_on_error":
                fallback_active_now = fallback_active_now and not inference_ready

        return {
            "primaryBackend": primary,
            "inferenceConfigured": inference_configured,
            "inferenceReady": inference_ready,
            "streamingSupported": streaming_supported,
            "fallbackEnabled": bool(self.settings.fallback_enabled),
            "fallbackInChain": bool(fallback_active_now),
            "fallbackActive": bool(fallback_active_now),
            "fallbackPolicy": self.settings.fallback_policy,
            "fallbackProviderOk": fallback_provider_ok,
            "fallbackOnlyMode": primary == "fallback" and not self.settings.transformers_model_path,
            "failoverToFallbackLikely": bool(
                fallback_in_chain and fallback_provider_ok and primary != "fallback" and not inference_ready and self.settings.fallback_policy != "disabled"
            ),
            "primarySkipReason": primary_skip or None,
            "backendNotes": backend_notes,
            "providers": per,
            "chain": self._chain_order,
            "selectedModel": self.settings.inference_model,
            "inferenceTelemetry": inference_telemetry.snapshot(),
            "effectiveBackend": primary if inference_ready else ("fallback" if fallback_active_now else None),
        }
