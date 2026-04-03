from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List, Optional

import httpx

from app.core.http_client import get_http_client
from app.core.settings import Settings
from app.inference.cancel_registry import is_cancelled
from app.inference.models import InferenceRequest, InferenceResponse, StreamDeltaHandler, StreamDoneHandler
from app.inference.prompt_compose import build_prompt_for_provider
from app.inference.providers.base import ProviderMetadata

_log = logging.getLogger("malv.brain")


def _openai_chat_messages(req: InferenceRequest, prompt: str) -> List[Dict[str, str]]:
    """System + user for OpenAI-style chat; user-only when no system_prompt."""
    messages: List[Dict[str, str]] = []
    if req.system_prompt:
        messages.append({"role": "system", "content": req.system_prompt.strip()})
    messages.append({"role": "user", "content": prompt})
    return messages


def _extract_completion_text(data: Any) -> str:
    if not isinstance(data, dict):
        return ""
    if "content" in data and isinstance(data["content"], str):
        return data["content"].strip()
    ch = data.get("choices")
    if isinstance(ch, list) and ch:
        c0 = ch[0]
        if isinstance(c0, dict):
            if "text" in c0:
                return str(c0["text"] or "").strip()
            if "message" in c0 and isinstance(c0["message"], dict):
                return str(c0["message"].get("content") or "").strip()
    return ""


class LlamaCppInferenceProvider:
    name = "llamacpp"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._base = settings.llamacpp_base_url.rstrip("/")
        self._mode = settings.llamacpp_mode
        self._default_model = settings.inference_model or "gpt-3.5-turbo"
        self._meta = ProviderMetadata(
            backend_type="llamacpp",
            model_name=self._default_model,
            supports_stream=True,
        )

    async def health(self) -> Dict[str, Any]:
        t0 = time.perf_counter()
        client = get_http_client()
        for path in ("/health", "/v1/models", "/"):
            try:
                r = await client.get(f"{self._base}{path}", timeout=5.0)
                latency = int((time.perf_counter() - t0) * 1000)
                ok = r.status_code < 500
                return {
                    "ok": ok and r.status_code < 400,
                    "reachable": True,
                    "backend": self.name,
                    "latencyMs": latency,
                    "probePath": path,
                    "statusCode": r.status_code,
                    "streamingSupported": True,
                    "metadata": self._meta.as_dict(),
                }
            except Exception:
                continue
        latency = int((time.perf_counter() - t0) * 1000)
        return {
            "ok": False,
            "reachable": False,
            "backend": self.name,
            "latencyMs": latency,
            "error": "llamacpp_unreachable",
            "streamingSupported": True,
            "metadata": self._meta.as_dict(),
        }

    async def cancel(self, run_id: str) -> bool:
        from app.inference.cancel_registry import cancel_run

        return cancel_run(run_id)

    async def infer(self, req: InferenceRequest) -> InferenceResponse:
        return await self._infer_blocking(req, stream=False)

    async def _infer_blocking(self, req: InferenceRequest, *, stream: bool) -> InferenceResponse:
        prompt = build_prompt_for_provider(req)
        t0 = time.perf_counter()
        client = get_http_client()
        timeout = httpx.Timeout(self._settings.inference_timeout_ms / 1000.0)

        try:
            if self._mode == "openai_chat":
                messages = _openai_chat_messages(req, prompt)
                payload: Dict[str, Any] = {
                    "model": req.model or self._default_model,
                    "messages": messages,
                    "max_tokens": req.max_tokens,
                    "temperature": req.temperature,
                    "top_p": req.top_p,
                    "stream": stream,
                }
                if req.stop:
                    payload["stop"] = req.stop
                r = await client.post(f"{self._base}/v1/chat/completions", json=payload, timeout=timeout)
                r.raise_for_status()
                data = r.json()
                text = ""
                if isinstance(data, dict):
                    ch = data.get("choices") or []
                    if ch and isinstance(ch[0], dict):
                        msg = ch[0].get("message") or {}
                        text = str(msg.get("content") or "").strip()
                latency = int((time.perf_counter() - t0) * 1000)
                return InferenceResponse(
                    text=text,
                    finish_reason="stop",
                    model=str(payload.get("model")),
                    backend=self.name,
                    latency_ms=latency,
                    streamed=stream,
                    raw=data if isinstance(data, dict) else None,
                )

            payload = {
                "prompt": prompt,
                "n_predict": req.max_tokens,
                "temperature": req.temperature,
                "top_p": req.top_p,
                "stream": stream,
            }
            if req.stop:
                payload["stop"] = req.stop
            r = await client.post(f"{self._base}/completion", json=payload, timeout=timeout)
            r.raise_for_status()
            data = r.json()
            text = _extract_completion_text(data)
            latency = int((time.perf_counter() - t0) * 1000)
            return InferenceResponse(
                text=text,
                finish_reason="stop",
                backend=self.name,
                latency_ms=latency,
                streamed=stream,
                raw=data if isinstance(data, dict) else None,
            )
        except httpx.HTTPStatusError as e:
            latency = int((time.perf_counter() - t0) * 1000)
            body = e.response.text[:500] if e.response else ""
            _log.error("[MALV INFERENCE] llama.cpp HTTP %s: %s", e.response.status_code if e.response else "?", body)
            return InferenceResponse(
                text="",
                finish_reason="error",
                backend=self.name,
                latency_ms=latency,
                error=f"llamacpp_http_{e.response.status_code if e.response else '?'}: {body}",
            )
        except Exception as e:
            latency = int((time.perf_counter() - t0) * 1000)
            _log.error("[MALV INFERENCE] llama.cpp infer failed: %s", e)
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
        import inspect

        prompt = build_prompt_for_provider(req)
        t0 = time.perf_counter()
        client = get_http_client()
        timeout = httpx.Timeout(self._settings.inference_timeout_ms / 1000.0)
        full: list[str] = []
        err: Optional[str] = None
        cancelled = False

        try:
            if self._mode == "openai_chat":
                messages = _openai_chat_messages(req, prompt)
                payload: Dict[str, Any] = {
                    "model": req.model or self._default_model,
                    "messages": messages,
                    "max_tokens": req.max_tokens,
                    "temperature": req.temperature,
                    "top_p": req.top_p,
                    "stream": True,
                }
                async with client.stream(
                    "POST", f"{self._base}/v1/chat/completions", json=payload, timeout=timeout
                ) as stream:
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
                            delta = ch[0].get("delta") or {}
                            piece = delta.get("content") or ""
                            if piece:
                                full.append(piece)
                                dr = on_delta(piece)
                                if inspect.isawaitable(dr):
                                    await dr
            else:
                payload = {
                    "prompt": prompt,
                    "n_predict": req.max_tokens,
                    "temperature": req.temperature,
                    "top_p": req.top_p,
                    "stream": True,
                }
                async with client.stream(
                    "POST", f"{self._base}/completion", json=payload, timeout=timeout
                ) as stream:
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
                        piece = obj.get("content") or ""
                        if piece:
                            full.append(piece)
                            dr = on_delta(piece)
                            if inspect.isawaitable(dr):
                                await dr
                        if obj.get("stop"):
                            break
        except Exception as e:
            err = str(e)

        latency = int((time.perf_counter() - t0) * 1000)
        text = "".join(full).strip()
        resp = InferenceResponse(
            text=text,
            finish_reason="cancelled" if cancelled else ("error" if err else "stop"),
            backend=self.name,
            latency_ms=latency,
            streamed=True,
            error=err,
            cancelled=cancelled,
        )
        done_res = on_done(resp)
        if inspect.isawaitable(done_res):
            await done_res
