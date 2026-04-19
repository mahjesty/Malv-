"""
Remote OpenAI-compatible HTTP inference (vLLM, llama.cpp --api-style openai, etc.).

Configured via MALV_OPENAI_COMPAT_BASE_URL (API root, normalized to …/v1) and MALV_INFERENCE_MODEL.

Endpoints (after normalization):
  GET  {api_root}/models
  POST {api_root}/chat/completions
"""

from __future__ import annotations

import inspect
import json
import logging
import time
from typing import Any, Dict, List, Literal, Optional

import httpx

from app.core.http_client import get_http_client
from app.core.openai_compat_urls import (
    normalize_openai_compat_api_root,
    openai_compat_chat_completions_url,
    openai_compat_models_url,
)
from app.core.settings import Settings
from app.inference.cancel_registry import is_cancelled
from app.inference.correlation import effective_correlation_id
from app.inference.failure_classification import classify_failure
from app.inference.inference_telemetry import sanitize_error_summary
from app.inference.models import InferenceRequest, InferenceResponse, StreamDeltaHandler, StreamDoneHandler
from app.inference.prompt_compose import build_prompt_for_provider
from app.inference.providers.base import ProviderMetadata
from app.inference.openai_compat_probe import fetch_models_json_with_retry

_log = logging.getLogger("malv.brain")


def _safe_url_for_log(url: str) -> str:
    """Strip query strings so accidental tokens in URLs never hit logs."""
    if not url:
        return ""
    if "?" in url:
        return url.split("?", 1)[0] + "?<redacted>"
    return url


def _normalize_assistant_content(content: Any) -> str:
    """OpenAI-compatible APIs may return string content or a list of typed parts (multimodal / vLLM)."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: List[str] = []
        for p in content:
            if isinstance(p, str):
                parts.append(p)
            elif isinstance(p, dict):
                t = p.get("type")
                if t == "text" and p.get("text") is not None:
                    parts.append(str(p.get("text") or ""))
                elif "text" in p:
                    parts.append(str(p.get("text") or ""))
        return "".join(parts).strip()
    return str(content).strip()


def _extract_chat_text(data: Any) -> str:
    if not isinstance(data, dict):
        return ""
    ch = data.get("choices")
    if isinstance(ch, list) and ch:
        c0 = ch[0]
        if isinstance(c0, dict):
            msg = c0.get("message")
            if isinstance(msg, dict):
                text = _normalize_assistant_content(msg.get("content"))
                if text:
                    return text
                # Some servers put assistant text only on the choice (legacy / proxies)
                if msg.get("refusal"):
                    _log.warning(
                        "[MALV INFERENCE] assistant message has refusal, no text: %s",
                        str(msg.get("refusal"))[:200],
                    )
                return ""
            if "text" in c0:
                return str(c0.get("text") or "").strip()
    return ""


def _normalize_upstream_finish_reason(reason: Any) -> str:
    if not isinstance(reason, str):
        return "unknown"
    v = reason.strip().lower()
    if not v:
        return "unknown"
    # Preserve known upstream semantics so API can derive completion/continuation policy.
    if v in ("stop", "length", "content_filter"):
        return v
    return v


def _normalized_system_content(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content.strip()
    return str(content).strip()


def _list_model_ids(data: Any) -> List[str]:
    out: List[str] = []
    if not isinstance(data, dict):
        return out
    for item in data.get("data") or []:
        if isinstance(item, dict) and item.get("id"):
            out.append(str(item["id"]))
    return out


def _model_matches_configured(configured: str, listed: List[str]) -> bool:
    c = configured.strip()
    if not c or not listed:
        return False
    for m in listed:
        if m == c or m.endswith(c) or c in m:
            return True
    return False


class OpenAiCompatibleInferenceProvider:
    """OpenAI-compatible /v1/chat/completions (e.g. vLLM on RunPod)."""

    def __init__(self, settings: Settings, *, slot: Literal["primary", "lightweight"] = "primary") -> None:
        self._settings = settings
        self._slot = slot
        if slot == "lightweight":
            self.name = "lightweight_local"
            raw_root = (settings.lightweight_openai_compat_base_url or "").strip()
            self._api_root = normalize_openai_compat_api_root(raw_root) or ""
            key = (settings.lightweight_openai_compat_api_key or settings.openai_compat_api_key or "").strip()
            self._api_key = key or None
            self._default_model = (settings.lightweight_inference_model or "").strip()
            to_ms = settings.lightweight_inference_timeout_ms or settings.inference_timeout_ms
            self._timeout_s = max(1.0, to_ms / 1000.0)
            self._meta = ProviderMetadata(
                backend_type="lightweight_local",
                model_name=self._default_model or None,
                supports_stream=True,
                cpu_only=True,
                priority=20,
            )
        else:
            self.name = "openai_compatible"
            self._api_root = normalize_openai_compat_api_root((settings.openai_compat_base_url or "").strip()) or ""
            key = (settings.openai_compat_api_key or "").strip()
            self._api_key = key or None
            self._default_model = (settings.inference_model or "").strip()
            self._timeout_s = max(1.0, settings.inference_timeout_ms / 1000.0)
            self._meta = ProviderMetadata(
                backend_type="openai_compatible",
                model_name=self._default_model or None,
                supports_stream=True,
            )
        self._models_url = openai_compat_models_url(self._api_root) if self._api_root else ""
        self._chat_url = openai_compat_chat_completions_url(self._api_root) if self._api_root else ""
        if self._api_root:
            _log.info(
                "[MALV INFERENCE] structured backend=%s phase=init api_root=%s models_url=%s chat_url=%s",
                self.name,
                self._api_root,
                _safe_url_for_log(self._models_url),
                _safe_url_for_log(self._chat_url),
            )

    def _headers(self) -> Dict[str, str]:
        h: Dict[str, str] = {"Content-Type": "application/json"}
        if self._api_key:
            h["Authorization"] = f"Bearer {self._api_key}"
        return h

    def _model_for(self, req: InferenceRequest) -> str:
        ctx = req.context
        m = (
            req.model
            or ctx.get("malvInferenceModel")
            or ctx.get("inferenceModel")
            or self._default_model
        )
        if not m or not str(m).strip():
            hint = (
                "Set MALV_LIGHTWEIGHT_INFERENCE_MODEL for the lightweight slot."
                if self._slot == "lightweight"
                else "Set MALV_INFERENCE_MODEL to the served model id (must match /v1/models on the remote)"
            )
            raise ValueError(
                "OpenAI-compatible model not configured. "
                f"{hint} or pass inferenceModel / malvInferenceModel in context."
            )
        return str(m).strip()

    def _messages_for(self, req: InferenceRequest) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        if req.messages and isinstance(req.messages, list):
            for m in req.messages:
                if isinstance(m, dict) and m.get("role") is not None:
                    out.append(
                        {
                            "role": str(m.get("role", "user")),
                            # Preserve multimodal parts (e.g., [{type:"text"}, {type:"image_url"}]) when provided.
                            "content": m.get("content", ""),
                        }
                    )

        system_prompt = _normalized_system_content(req.system_prompt)
        if system_prompt:
            has_identical_leading_system = (
                len(out) > 0
                and str(out[0].get("role", "")).strip().lower() == "system"
                and _normalized_system_content(out[0].get("content")) == system_prompt
            )
            if not has_identical_leading_system:
                out = [{"role": "system", "content": system_prompt}, *out]

        if out:
            return out

        prompt = build_prompt_for_provider(req)
        messages: List[Dict[str, Any]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})
        elif req.context.get("malvPromptAlreadyExpanded"):
            messages.append({"role": "user", "content": prompt})
        else:
            messages.append({"role": "user", "content": prompt})
        return messages

    async def health(self) -> Dict[str, Any]:
        t0 = time.perf_counter()
        target = self._default_model
        model_configured = bool(target)

        def _payload(
            *,
            reachable: bool,
            ok: bool,
            latency: int,
            models: List[str],
            model_listed: bool,
            error: Optional[str] = None,
            path_misconfigured: bool = False,
        ) -> Dict[str, Any]:
            out: Dict[str, Any] = {
                "ok": ok,
                "reachable": reachable,
                "backend": self.name,
                "latencyMs": latency,
                "apiRoot": self._api_root,
                "baseUrl": self._api_root,
                "resolvedModelsUrl": self._models_url,
                "resolvedChatUrl": self._chat_url,
                "models": models[:80],
                "modelConfigured": model_configured,
                "modelListed": model_listed,
                "streamingSupported": True,
                "metadata": self._meta.as_dict(),
            }
            if error:
                out["error"] = error
            if path_misconfigured:
                out["pathMisconfigured"] = True
            return out

        if not self._api_root:
            env_hint = (
                "MALV_LIGHTWEIGHT_OPENAI_COMPAT_BASE_URL is not set"
                if self._slot == "lightweight"
                else "MALV_OPENAI_COMPAT_BASE_URL is not set"
            )
            return _payload(
                reachable=False,
                ok=False,
                latency=0,
                models=[],
                model_listed=False,
                error=env_hint,
            )

        try:
            models_url = self._models_url
            t_probe = time.perf_counter()
            data, probe_err, last_http_status, probe_attempts = await fetch_models_json_with_retry(
                models_url=models_url,
                headers=self._headers(),
                timeout_s=8.0,
            )
            latency = int((time.perf_counter() - t_probe) * 1000)

            if data is None:
                path_bad = last_http_status == 404
                err = probe_err or "[MALV] model backend unreachable or invalid"
                if path_bad:
                    err = (
                        f"GET models returned HTTP 404 at {models_url!r} — "
                        "OpenAI-compatible route not found; check MALV_OPENAI_COMPAT_BASE_URL "
                        "(must resolve to API root ending in /v1)."
                    )
                    _log.error(
                        "[MALV INFERENCE] OpenAI-compatible endpoint path invalid — attempted URL: %s",
                        models_url,
                    )
                    return _payload(
                        reachable=last_http_status > 0,
                        ok=False,
                        latency=latency,
                        models=[],
                        model_listed=False,
                        error=err,
                        path_misconfigured=True,
                    )
                _log.error("[MALV] model backend unreachable or invalid — probe_attempts=%s", probe_attempts)
                return _payload(
                    reachable=last_http_status > 0 or probe_err is not None,
                    ok=False,
                    latency=latency,
                    models=[],
                    model_listed=False,
                    error=err,
                )

            listed = _list_model_ids(data)

            if not model_configured:
                err = (
                    "MALV_INFERENCE_MODEL is not set. Set it to a model id listed by the remote "
                    f"GET {self._models_url} ."
                )
                _log.warning("[MALV INFERENCE] openai_compatible reachable but %s", err)
                return _payload(
                    reachable=True,
                    ok=False,
                    latency=latency,
                    models=listed,
                    model_listed=False,
                    error=err,
                )

            model_listed = _model_matches_configured(target, listed)
            if not model_listed:
                err = (
                    f"Model '{target}' not found in /v1/models. Listed (sample): {listed[:12]!r}. "
                    "Fix MALV_INFERENCE_MODEL to match the remote id."
                )
                _log.warning("[MALV INFERENCE] openai_compatible model missing — %s", err)
                return _payload(
                    reachable=True,
                    ok=False,
                    latency=latency,
                    models=listed,
                    model_listed=False,
                    error=err,
                )

            _log.info(
                "[MALV INFERENCE] openai_compatible health OK model=%r api_root=%s models_url=%s latency_ms=%d",
                target,
                self._api_root,
                self._models_url,
                latency,
            )
            return _payload(
                reachable=True,
                ok=True,
                latency=latency,
                models=listed,
                model_listed=True,
            )

        except httpx.ConnectError as e:
            latency = int((time.perf_counter() - t0) * 1000)
            err = f"Cannot connect to OpenAI-compatible API at {self._api_root} ({e})."
            _log.warning("[MALV INFERENCE] openai_compatible health: %s", err)
            return _payload(
                reachable=False,
                ok=False,
                latency=latency,
                models=[],
                model_listed=False,
                error=err,
            )
        except (httpx.ReadTimeout, httpx.ConnectTimeout) as e:
            latency = int((time.perf_counter() - t0) * 1000)
            err = f"Timeout reaching {self._models_url}: {e}"
            _log.warning("[MALV INFERENCE] openai_compatible health: %s", err)
            return _payload(
                reachable=False,
                ok=False,
                latency=latency,
                models=[],
                model_listed=False,
                error=err,
            )
        except Exception as e:
            latency = int((time.perf_counter() - t0) * 1000)
            err = str(e)
            _log.warning("[MALV INFERENCE] openai_compatible health: unexpected — %s", err)
            return _payload(
                reachable=False,
                ok=False,
                latency=latency,
                models=[],
                model_listed=False,
                error=err,
            )

    async def cancel(self, run_id: str) -> bool:
        from app.inference.cancel_registry import cancel_run

        return cancel_run(run_id)

    async def infer(self, req: InferenceRequest) -> InferenceResponse:
        return await self._chat_completions(req, stream=False)

    async def _chat_completions(self, req: InferenceRequest, *, stream: bool) -> InferenceResponse:
        model = self._model_for(req)
        messages = self._messages_for(req)
        cid = effective_correlation_id(req)
        t0 = time.perf_counter()
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": req.max_tokens,
            "temperature": req.temperature,
            "top_p": req.top_p,
            "stream": stream,
        }
        if req.stop:
            payload["stop"] = req.stop

        client = get_http_client()
        timeout = httpx.Timeout(self._timeout_s)
        url = self._chat_url

        msg_n = len(messages)
        msg_chars = sum(len(str(m.get("content", "") or "")) for m in messages)
        role_counts: Dict[str, int] = {}
        for m in messages:
            rname = str(m.get("role", ""))
            role_counts[rname] = role_counts.get(rname, 0) + 1
        _log.info(
            "[MALV INFERENCE] structured backend=openai_compatible phase=request_start correlation_id=%s "
            "model=%r run_id=%s stream=%s failover_attempted=false chat_url=%s",
            cid,
            model,
            req.run_id,
            stream,
            _safe_url_for_log(url),
        )
        _log.info(
            "[MALV INFERENCE] vllm_outbound POST payload summary model=%r messages_count=%d "
            "messages_total_chars=%d role_counts=%s endpoint=%s",
            model,
            msg_n,
            msg_chars,
            role_counts,
            _safe_url_for_log(url),
        )

        try:
            r = await client.post(url, json=payload, headers=self._headers(), timeout=timeout)
            if r.status_code == 404:
                latency = int((time.perf_counter() - t0) * 1000)
                _log.error(
                    "[MALV INFERENCE] structured backend=openai_compatible ok=false phase=chat_completions "
                    "failure_class=%s status=404 correlation_id=%s latency_ms=%d run_id=%s chat_url=%s",
                    classify_failure("openai_compat_path_invalid: ..."),
                    cid,
                    latency,
                    req.run_id,
                    _safe_url_for_log(url),
                )
                return InferenceResponse(
                    text="",
                    finish_reason="error",
                    backend=self.name,
                    latency_ms=latency,
                    error=(
                        "openai_compat_path_invalid: POST chat/completions returned HTTP 404 — "
                        f"check MALV_OPENAI_COMPAT_BASE_URL (url={_safe_url_for_log(url)!r})"
                    ),
                )
            r.raise_for_status()
            data = r.json()
            text = _extract_chat_text(data)
            latency = int((time.perf_counter() - t0) * 1000)
            c0 = data.get("choices", [{}])[0] if isinstance(data.get("choices"), list) and data.get("choices") else {}
            upstream_finish_reason = c0.get("finish_reason") if isinstance(c0, dict) else None
            mapped_finish_reason = _normalize_upstream_finish_reason(upstream_finish_reason)
            _log.debug(
                "[MALV INFERENCE] finish_reason_map %s",
                {
                    "backend": self.name,
                    "stream": stream,
                    "upstream_finish_reason": upstream_finish_reason,
                    "mapped_finish_reason": mapped_finish_reason,
                    "correlation_id": cid,
                    "run_id": req.run_id,
                },
            )
            if not (text or "").strip():
                msg = c0.get("message") if isinstance(c0, dict) else {}
                content = msg.get("content") if isinstance(msg, dict) else None
                finish_reason = c0.get("finish_reason") if isinstance(c0, dict) else None
                raw_snippet = json.dumps(data, default=str)[:900]
                _log.error(
                    "[MALV INFERENCE] empty assistant content provider=openai_compatible "
                    "finish_reason=%s content_type=%s correlation_id=%s model=%r run_id=%s "
                    "choice0_keys=%s raw_snippet=%s",
                    finish_reason,
                    type(content).__name__,
                    cid,
                    model,
                    req.run_id,
                    list(c0.keys()) if isinstance(c0, dict) else [],
                    raw_snippet,
                )
                _log.warning(
                    "[MALV INFERENCE] structured backend=openai_compatible ok=false phase=chat_completions "
                    "failure_class=%s correlation_id=%s model=%r run_id=%s latency_ms=%d stream=%s "
                    "choice0_keys=%s content_type=%s content_preview=%r",
                    classify_failure("empty_assistant_content"),
                    cid,
                    model,
                    req.run_id,
                    latency,
                    stream,
                    list(c0.keys()) if isinstance(c0, dict) else [],
                    type(content).__name__,
                    (repr(content)[:400] if content is not None else None),
                )
                return InferenceResponse(
                    text="",
                    finish_reason="error",
                    model=model,
                    backend=self.name,
                    latency_ms=latency,
                    streamed=False,
                    raw=data if isinstance(data, dict) else None,
                    error="empty_assistant_content",
                )
            _log.info(
                "[MALV INFERENCE] structured backend=openai_compatible ok=true phase=chat_completions "
                "correlation_id=%s model=%r run_id=%s latency_ms=%d stream=%s reply_chars=%d failover_attempted=false",
                cid,
                model,
                req.run_id,
                latency,
                stream,
                len(text),
            )
            return InferenceResponse(
                text=text,
                finish_reason=mapped_finish_reason,
                model=model,
                backend=self.name,
                latency_ms=latency,
                streamed=stream,
                raw=data if isinstance(data, dict) else None,
            )
        except httpx.HTTPStatusError as e:
            latency = int((time.perf_counter() - t0) * 1000)
            body = e.response.text if e.response else ""
            code = e.response.status_code if e.response else None
            _log.error(
                "[MALV INFERENCE] structured backend=openai_compatible ok=false phase=chat_completions "
                "failure_class=%s correlation_id=%s status=%s run_id=%s latency_ms=%d stream=%s body_len=%d",
                classify_failure(f"openai_compat_http_{code}: "),
                cid,
                code,
                req.run_id,
                latency,
                stream,
                len(body),
            )
            return InferenceResponse(
                text="",
                finish_reason="error",
                backend=self.name,
                latency_ms=latency,
                error=f"openai_compat_http_{code}: {sanitize_error_summary(body, max_len=200)}",
            )
        except httpx.ConnectError as e:
            latency = int((time.perf_counter() - t0) * 1000)
            err_s = f"openai_compat_transport: {sanitize_error_summary(str(e), max_len=200)}"
            _log.error(
                "[MALV INFERENCE] structured backend=openai_compatible ok=false phase=chat_completions "
                "failure_class=%s correlation_id=%s run_id=%s latency_ms=%d stream=%s err_type=%s",
                classify_failure(err_s),
                cid,
                req.run_id,
                latency,
                stream,
                type(e).__name__,
            )
            return InferenceResponse(
                text="",
                finish_reason="error",
                backend=self.name,
                latency_ms=latency,
                error=err_s,
            )
        except httpx.TimeoutException as e:
            latency = int((time.perf_counter() - t0) * 1000)
            err_s = f"openai_compat_timeout: {sanitize_error_summary(str(e), max_len=200)}"
            _log.error(
                "[MALV INFERENCE] structured backend=openai_compatible ok=false phase=chat_completions "
                "failure_class=%s correlation_id=%s run_id=%s latency_ms=%d stream=%s err_type=%s",
                classify_failure(err_s),
                cid,
                req.run_id,
                latency,
                stream,
                type(e).__name__,
            )
            return InferenceResponse(
                text="",
                finish_reason="error",
                backend=self.name,
                latency_ms=latency,
                error=err_s,
            )
        except Exception as e:
            latency = int((time.perf_counter() - t0) * 1000)
            err_s = sanitize_error_summary(str(e), max_len=240)
            _log.error(
                "[MALV INFERENCE] structured backend=openai_compatible ok=false phase=chat_completions "
                "failure_class=%s correlation_id=%s run_id=%s latency_ms=%d stream=%s err_type=%s",
                classify_failure(err_s),
                cid,
                req.run_id,
                latency,
                stream,
                type(e).__name__,
            )
            return InferenceResponse(
                text="",
                finish_reason="error",
                backend=self.name,
                latency_ms=latency,
                error=err_s,
            )

    async def stream_infer(
        self,
        req: InferenceRequest,
        on_delta: StreamDeltaHandler,
        on_done: StreamDoneHandler,
    ) -> None:
        model = self._model_for(req)
        messages = self._messages_for(req)
        t0 = time.perf_counter()
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": req.max_tokens,
            "temperature": req.temperature,
            "top_p": req.top_p,
            "stream": True,
        }
        if req.stop:
            payload["stop"] = req.stop

        client = get_http_client()
        timeout = httpx.Timeout(self._timeout_s)
        url = self._chat_url
        full: list[str] = []
        err: Optional[str] = None
        cancelled = False
        upstream_finish_reason: Any = None
        cid = effective_correlation_id(req)

        _log.info(
            "[MALV INFERENCE] structured backend=openai_compatible phase=stream_start correlation_id=%s "
            "model=%r run_id=%s stream=true failover_attempted=false chat_url=%s",
            cid,
            model,
            req.run_id,
            _safe_url_for_log(url),
        )
        _log.info(
            "[MALV INFERENCE] vllm_outbound_stream POST payload summary model=%r messages_count=%d "
            "messages_total_chars=%d endpoint=%s",
            model,
            len(messages),
            sum(len(str(m.get("content", "") or "")) for m in messages),
            _safe_url_for_log(url),
        )

        try:
            async with client.stream("POST", url, json=payload, headers=self._headers(), timeout=timeout) as stream:
                if stream.status_code == 404:
                    err = (
                        "openai_compat_path_invalid: POST chat/completions returned HTTP 404 — "
                        f"check MALV_OPENAI_COMPAT_BASE_URL (url={_safe_url_for_log(url)!r})"
                    )
                    _log.error(
                        "[MALV INFERENCE] structured backend=openai_compatible ok=false phase=stream "
                        "failure_class=%s status=404 correlation_id=%s run_id=%s chat_url=%s",
                        classify_failure(err),
                        cid,
                        req.run_id,
                        _safe_url_for_log(url),
                    )
                else:
                    stream.raise_for_status()
                    async for line in stream.aiter_lines():
                        if is_cancelled(req.run_id):
                            cancelled = True
                            await stream.aclose()
                            break
                        if not line.startswith("data:"):
                            continue
                        data_s = line[5:].strip()
                        if data_s == "[DONE]":
                            break
                        try:
                            obj = json.loads(data_s)
                        except json.JSONDecodeError:
                            continue
                        ch = obj.get("choices") or []
                        if ch and isinstance(ch[0], dict):
                            if ch[0].get("finish_reason") is not None:
                                upstream_finish_reason = ch[0].get("finish_reason")
                            delta = ch[0].get("delta") or {}
                            piece = delta.get("content") or ""
                            if piece:
                                full.append(piece)
                                dr = on_delta(piece)
                                if inspect.isawaitable(dr):
                                    await dr
        except httpx.HTTPStatusError as e:
            code = e.response.status_code if e.response else None
            err = f"openai_compat_stream_http_{code}: {sanitize_error_summary(e.response.text if e.response else '', max_len=120)}"
            _log.error(
                "[MALV INFERENCE] structured backend=openai_compatible ok=false phase=stream "
                "failure_class=%s correlation_id=%s run_id=%s detail=%s",
                classify_failure(err),
                cid,
                req.run_id,
                err,
            )
        except httpx.ConnectError as e:
            err = f"openai_compat_transport: {sanitize_error_summary(str(e), max_len=200)}"
            _log.error(
                "[MALV INFERENCE] structured backend=openai_compatible ok=false phase=stream "
                "failure_class=%s correlation_id=%s run_id=%s err_type=%s",
                classify_failure(err),
                cid,
                req.run_id,
                type(e).__name__,
            )
        except httpx.TimeoutException as e:
            err = f"openai_compat_timeout: {sanitize_error_summary(str(e), max_len=200)}"
            _log.error(
                "[MALV INFERENCE] structured backend=openai_compatible ok=false phase=stream "
                "failure_class=%s correlation_id=%s run_id=%s err_type=%s",
                classify_failure(err),
                cid,
                req.run_id,
                type(e).__name__,
            )
        except Exception as e:
            err = sanitize_error_summary(str(e), max_len=240)
            _log.error(
                "[MALV INFERENCE] structured backend=openai_compatible ok=false phase=stream "
                "failure_class=%s correlation_id=%s run_id=%s err_type=%s",
                classify_failure(err),
                cid,
                req.run_id,
                type(e).__name__,
            )

        latency = int((time.perf_counter() - t0) * 1000)
        text = "".join(full).strip()
        err_out = sanitize_error_summary(err, max_len=240) if err else None
        mapped_finish_reason = _normalize_upstream_finish_reason(upstream_finish_reason)
        _log.debug(
            "[MALV INFERENCE] finish_reason_map %s",
            {
                "backend": self.name,
                "stream": True,
                "upstream_finish_reason": upstream_finish_reason,
                "mapped_finish_reason": mapped_finish_reason,
                "correlation_id": cid,
                "run_id": req.run_id,
            },
        )
        resp = InferenceResponse(
            text=text,
            finish_reason="cancelled" if cancelled else ("error" if err_out else mapped_finish_reason),
            model=model,
            backend=self.name,
            latency_ms=latency,
            streamed=True,
            error=err_out,
            cancelled=cancelled,
        )
        done_res = on_done(resp)
        if inspect.isawaitable(done_res):
            await done_res
        fc = classify_failure(err)
        _log.info(
            "[MALV INFERENCE] structured backend=openai_compatible phase=stream_complete ok=%s "
            "failure_class=%s correlation_id=%s model=%r run_id=%s latency_ms=%d reply_chars=%d cancelled=%s",
            err_out is None and not cancelled,
            fc,
            cid,
            model,
            req.run_id,
            latency,
            len(text),
            cancelled,
        )
