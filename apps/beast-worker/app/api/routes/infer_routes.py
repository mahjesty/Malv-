import asyncio
import json
import logging
import os
import time
from typing import Annotated, Any, Literal, Optional

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.settings import Settings, load_settings
from app.inference.correlation import apply_correlation_to_context
from app.inference.cancel_registry import cancel_run, register_run, unregister_run
from app.inference.router import InferenceRouter
from app.inference.inference_config_client import InferenceConfigClient

_log = logging.getLogger("malv.brain")
_router_singleton: Optional[InferenceRouter] = None
_warmup_started = False

_base_settings: Optional[Settings] = None
_config_client: Optional[InferenceConfigClient] = None
_active_config_revision: Optional[str] = None

_RUNTIME_CONFIG_REFRESH_MS = int(os.getenv("INFERENCE_CONFIG_REFRESH_MS", "2000"))


def _apply_runtime_inference_config(base: Settings, cfg: dict[str, Any]) -> Settings:
    """
    Maps API effective inference config → worker Settings.
    """
    backend_type = (cfg.get("backendType") or "").strip().lower()
    enabled = bool(cfg.get("enabled", True))

    updates: dict[str, Any] = {
        "inference_enabled": enabled
    }

    # Keep pydantic settings stable by only overriding inference-related fields.
    if backend_type == "disabled":
        updates["inference_backend"] = base.inference_backend
        updates["inference_enabled"] = False
    else:
        # Backend type maps 1:1 to worker inference_backend names.
        if backend_type in ("openai_compatible", "ollama", "llamacpp", "transformers", "fallback"):
            updates["inference_backend"] = backend_type  # type: ignore[assignment]
        updates["inference_model"] = cfg.get("model") or base.inference_model

        base_url = cfg.get("baseUrl")
        if backend_type == "openai_compatible":
            updates["openai_compat_base_url"] = base_url
            # API internal endpoint provides the secret token; worker needs it.
            updates["openai_compat_api_key"] = cfg.get("apiKey") or None
        elif backend_type == "ollama":
            updates["inference_base_url"] = (base_url or base.inference_base_url) or base.inference_base_url
        elif backend_type == "llamacpp":
            updates["llamacpp_base_url"] = (base_url or base.llamacpp_base_url) or base.llamacpp_base_url
        elif backend_type == "transformers":
            updates["transformers_model_path"] = cfg.get("model") or base.transformers_model_path

    # Fallback controls.
    updates["fallback_enabled"] = bool(cfg.get("fallbackEnabled", base.fallback_enabled))
    updates["fallback_policy"] = cfg.get("fallbackPolicy") or base.fallback_policy
    updates["inference_timeout_ms"] = cfg.get("timeoutMs") or base.inference_timeout_ms

    return base.model_copy(update=updates)


async def _maybe_refresh_runtime_router() -> None:
    global _router_singleton, _active_config_revision
    if _base_settings is None:
        return
    if _config_client is None:
        return

    fetched = await _config_client.get_effective_config()
    if not fetched:
        return

    config_revision = str(fetched.get("configRevision") or "")
    if not config_revision:
        return
    if _active_config_revision == config_revision and _router_singleton is not None:
        return

    payload = fetched.get("payload") or {}
    new_settings = _apply_runtime_inference_config(_base_settings, payload)
    _router_singleton = InferenceRouter(new_settings)
    _active_config_revision = config_revision

    # If transformers are configured, warm them in the background.
    tr = _router_singleton._providers.get("transformers")
    if tr is not None and hasattr(tr, "warmup"):
        async def _w() -> None:
            await tr.warmup()

        try:
            asyncio.create_task(_w())
        except RuntimeError:
            pass


def warm_inference_router() -> None:
    """Eagerly construct the inference router at app startup so .env matches first request."""
    _router()


def _router() -> InferenceRouter:
    global _router_singleton, _warmup_started
    if _router_singleton is None:
        _router_singleton = InferenceRouter(load_settings())
        if not _warmup_started:
            _warmup_started = True
            tr = _router_singleton._providers.get("transformers")
            if tr is not None and hasattr(tr, "warmup"):
                async def _w() -> None:
                    await tr.warmup()

                try:
                    asyncio.create_task(_w())
                except RuntimeError:
                    pass
    return _router_singleton


class InferRequestModel(BaseModel):
    mode: Literal["light", "cpu", "gpu", "beast"] = Field(..., description="Inference mode / routing intent.")
    prompt: str
    context: dict[str, Any] = Field(default_factory=dict)
    run_id: Optional[str] = Field(default=None, alias="runId")
    temperature: float = 0.7
    top_p: float = Field(default=0.9, alias="topP")
    max_tokens: Optional[int] = Field(default=None, alias="maxTokens")
    stop: list[str] = Field(default_factory=list)
    stream: bool = False

    model_config = {"populate_by_name": True}


class InferStreamRequestModel(InferRequestModel):
    pass


class InferResponseModel(BaseModel):
    reply: str
    meta: dict[str, Any] = Field(default_factory=dict)


class InferSmokeResponseModel(BaseModel):
    """Minimal end-to-end check: aggregate health + one short /v1/infer through the live chain."""

    ok: bool
    reason: Optional[str] = None
    primaryBackend: Optional[str] = None
    inferenceReady: Optional[bool] = None
    replyPreview: Optional[str] = None
    chain: Optional[list[str]] = None
    meta: dict[str, Any] = Field(default_factory=dict)


class CancelRequestModel(BaseModel):
    run_id: str = Field(alias="runId")

    model_config = {"populate_by_name": True}


def create_infer_router(router: Optional[APIRouter] = None) -> APIRouter:
    r = router or APIRouter(prefix="/v1")
    settings = load_settings()
    global _base_settings, _config_client
    _base_settings = settings
    _config_client = InferenceConfigClient(api_key=settings.api_key, refresh_ms=_RUNTIME_CONFIG_REFRESH_MS)

    @r.get("/health/inference")
    async def inference_health(x_api_key: Optional[str] = Header(default=None)):
        if settings.api_key and settings.api_key != (x_api_key or ""):
            raise HTTPException(status_code=401, detail="Invalid API key.")
        await _maybe_refresh_runtime_router()
        inf = _router()
        agg = await inf.aggregate_health()
        _log.info(
            "[MALV WORKER] health/inference primary=%s configured=%s ready=%s chain=%s",
            agg.get("primaryBackend"),
            agg.get("inferenceConfigured"),
            agg.get("inferenceReady"),
            agg.get("chain"),
        )
        return {
            "ok": True,
            "ts": int(time.time()),
            "service": "beast-worker",
            # Mirrors API `configRevision` so admin/health can confirm API↔worker alignment without guessing.
            "configRevision": _active_config_revision,
            "inferenceConfigured": agg.get("inferenceConfigured"),
            "inferenceReady": agg.get("inferenceReady"),
            "primaryBackend": agg.get("primaryBackend"),
            "primarySkipReason": agg.get("primarySkipReason"),
            "streamingSupported": agg.get("streamingSupported"),
            "fallbackEnabled": agg.get("fallbackEnabled"),
            "fallbackInChain": agg.get("fallbackInChain"),
            "fallbackOnlyMode": agg.get("fallbackOnlyMode"),
            "failoverToFallbackLikely": agg.get("failoverToFallbackLikely"),
            "backendNotes": agg.get("backendNotes"),
            "providerHealth": agg.get("providers"),
            "chain": agg.get("chain"),
            "selectedModel": agg.get("selectedModel"),
            "inferenceTelemetry": agg.get("inferenceTelemetry"),
        }

    @r.get("/debug/infer-test")
    async def debug_infer_test(x_api_key: Optional[str] = Header(default=None)):
        """
        Debug-only: one short infer through the live router (no browser).
        Remove or protect in production if desired.
        """
        if settings.api_key and settings.api_key != (x_api_key or ""):
            raise HTTPException(status_code=401, detail="Invalid API key.")
        import uuid
        await _maybe_refresh_runtime_router()
        inference = _router()
        rid = str(uuid.uuid4())
        ctx = {"runId": rid, "malvCorrelationId": rid, "malvPromptAlreadyExpanded": True}
        raw = await inference.infer(mode="light", prompt="hello", context=ctx)
        reply = raw.get("reply") if isinstance(raw.get("reply"), str) else ""
        meta = raw.get("meta") if isinstance(raw.get("meta"), dict) else {}
        return {
            "ok": True,
            "prompt": "hello",
            "parsedReply": reply,
            "replyChars": len(reply),
            "meta": meta,
            "rawWorkerResponse": raw,
            "finalBackend": meta.get("inferenceBackend") or meta.get("malvLastBackend"),
        }

    @r.post("/infer/smoke", response_model=InferSmokeResponseModel)
    async def infer_smoke(x_api_key: Optional[str] = Header(default=None)):
        """Runs aggregate health then one short non-streaming infer (for CI / RunPod wiring checks)."""
        if settings.api_key and settings.api_key != (x_api_key or ""):
            raise HTTPException(status_code=401, detail="Invalid API key.")
        await _maybe_refresh_runtime_router()
        inference = _router()
        agg = await inference.aggregate_health()
        primary = agg.get("primaryBackend")
        ready = bool(agg.get("inferenceReady"))
        chain = agg.get("chain")
        if not ready:
            skip = agg.get("primarySkipReason")
            _log.warning("[MALV WORKER] /v1/infer/smoke skipped — inference not ready primary=%s reason=%s", primary, skip)
            return InferSmokeResponseModel(
                ok=False,
                reason=str(skip or "inference_not_ready"),
                primaryBackend=str(primary) if primary is not None else None,
                inferenceReady=False,
                chain=chain if isinstance(chain, list) else None,
            )
        rid = f"smoke-{int(time.time() * 1000)}"
        _log.info("[MALV WORKER] /v1/infer/smoke start primary=%s runId=%s", primary, rid)
        res = await inference.infer(
            mode="light",
            prompt='Reply with exactly one word: OK',
            context={"runId": rid, "malvPromptAlreadyExpanded": True},
            temperature=0.0,
            top_p=1.0,
            max_tokens=16,
            stop=[],
            stream=False,
        )
        reply = (res.get("reply") or "").strip()
        preview = reply[:200] if reply else None
        out_ok = bool(reply)
        _log.info(
            "[MALV WORKER] /v1/infer/smoke done ok=%s primary=%s reply_len=%d",
            out_ok,
            primary,
            len(reply),
        )
        return InferSmokeResponseModel(
            ok=out_ok,
            reason=None if out_ok else "empty_reply_from_infer_chain",
            primaryBackend=str(primary) if primary is not None else None,
            inferenceReady=True,
            replyPreview=preview,
            chain=chain if isinstance(chain, list) else None,
            meta=res.get("meta") if isinstance(res.get("meta"), dict) else {},
        )

    @r.post("/infer/cancel")
    async def infer_cancel(body: CancelRequestModel, x_api_key: Optional[str] = Header(default=None)):
        if settings.api_key and settings.api_key != (x_api_key or ""):
            raise HTTPException(status_code=401, detail="Invalid API key.")
        ok = cancel_run(body.run_id)
        _log.warning("[MALV INFERENCE] /v1/infer/cancel runId=%s accepted=%s", body.run_id, ok)
        return {"ok": True, "cancelAccepted": ok, "runId": body.run_id}

    async def _wait_disconnect(request: Request) -> None:
        while True:
            if await request.is_disconnected():
                return
            await asyncio.sleep(0.2)

    @r.post("/infer", response_model=InferResponseModel)
    async def infer_endpoint(
        request: Request,
        req: InferRequestModel,
        x_api_key: Optional[str] = Header(default=None),
        x_malv_correlation_id: Annotated[Optional[str], Header(alias="X-MALV-Correlation-Id")] = None,
    ):
        inference = _router()
        if settings.api_key and settings.api_key != (x_api_key or ""):
            _log.warning("[MALV BRAIN] error in generation pipeline: invalid API key on /v1/infer")
            raise HTTPException(status_code=401, detail="Invalid API key.")

        await _maybe_refresh_runtime_router()

        ctx = dict(req.context)
        apply_correlation_to_context(ctx, x_malv_correlation_id)
        ingress_cid = ctx.get("malvCorrelationId") or ctx.get("runId") or "unknown"
        _malv_op_mode = ctx.get("malvOperatorMode") or ctx.get("malvBehaviorMode")
        _ctx_chars = (
            len(str(ctx.get("contextBlock") or ""))
            if isinstance(ctx.get("contextBlock"), str)
            else None
        )
        _log.info(
            "[MALV_INFERENCE_TRACE] http_infer_request correlation_id=%s mode=%s prompt_len=%d malv_operator_mode=%s context_block_chars=%s",
            ingress_cid,
            req.mode,
            len(req.prompt),
            _malv_op_mode,
            _ctx_chars,
        )
        rid = req.run_id or ctx.get("runId")
        if rid is not None:
            ctx["runId"] = str(rid)
            register_run(str(rid))

        disconnect_task = asyncio.create_task(_wait_disconnect(request))
        infer_task = asyncio.create_task(
            inference.infer(
                mode=req.mode,
                prompt=req.prompt,
                context=ctx,
                temperature=req.temperature,
                top_p=req.top_p,
                max_tokens=req.max_tokens,
                stop=req.stop,
                stream=req.stream,
            )
        )

        try:
            done, _pending = await asyncio.wait(
                {disconnect_task, infer_task}, return_when=asyncio.FIRST_COMPLETED
            )
            if disconnect_task in done:
                _log.warning("[MALV INFERENCE] client disconnected — cancelling infer runId=%s", rid)
                if rid:
                    cancel_run(str(rid))
                infer_task.cancel()
                try:
                    await infer_task
                except asyncio.CancelledError:
                    pass
                return InferResponseModel(
                    reply="",
                    meta={
                        "cancelled": True,
                        "malvReplySource": "beast_worker",
                        "clientDisconnected": True,
                    },
                )
            disconnect_task.cancel()
            try:
                await disconnect_task
            except asyncio.CancelledError:
                pass
            res = await infer_task
        finally:
            if rid is not None:
                unregister_run(str(rid))

        reply_raw = res.get("reply")
        if reply_raw is None and isinstance(res.get("text"), str):
            reply_raw = res.get("text")
            _log.warning("[MALV WORKER] /v1/infer used legacy 'text' field instead of 'reply'")
        body = reply_raw if isinstance(reply_raw, str) else ""
        out_len = len(body)
        prev = body[:100].replace("\n", " ") + ("…" if len(body) > 100 else "")
        meta_out = dict(res.get("meta") or {})
        meta_out.setdefault("malvInferHttp", {"path": "/v1/infer", "replyChars": out_len})
        _log.info(
            "[MALV WORKER] /v1/infer response_body_chars=%d preview=%r", out_len, prev
        )
        _log.info(
            "[MALV INFERENCE_TRACE] http_infer_done correlation_id=%s reply_chars=%s meta_keys=%s empty_reason=%s malv_operator_mode=%s",
            ingress_cid,
            out_len,
            list(meta_out.keys()),
            meta_out.get("malvEmptyReason"),
            _malv_op_mode,
        )
        if out_len == 0:
            _log.warning(
                "[MALV BRAIN] no reply generated (empty reply string from inference router) trace=%s",
                json.dumps(
                    {
                        "correlation_id": ingress_cid,
                        "malvEmptyReason": meta_out.get("malvEmptyReason"),
                        "malvLastBackend": meta_out.get("malvLastBackend"),
                        "inferenceAttempts": meta_out.get("inferenceAttempts"),
                    },
                    default=str,
                ),
            )
        return InferResponseModel(reply=body, meta=meta_out)

    @r.post("/infer/stream")
    async def infer_stream_endpoint(
        req: InferStreamRequestModel,
        x_api_key: Optional[str] = Header(default=None),
        x_malv_correlation_id: Annotated[Optional[str], Header(alias="X-MALV-Correlation-Id")] = None,
    ):
        if settings.api_key and settings.api_key != (x_api_key or ""):
            raise HTTPException(status_code=401, detail="Invalid API key.")
        await _maybe_refresh_runtime_router()
        inference = _router()
        ctx = dict(req.context)
        apply_correlation_to_context(ctx, x_malv_correlation_id)
        rid = req.run_id or ctx.get("runId")
        if rid is not None:
            ctx["runId"] = str(rid)
            register_run(str(rid))

        async def gen():
            try:
                async for line in inference.infer_stream_sse(
                    mode=req.mode,
                    prompt=req.prompt,
                    context=ctx,
                    temperature=req.temperature,
                    top_p=req.top_p,
                    max_tokens=req.max_tokens,
                ):
                    yield line
            finally:
                if rid is not None:
                    unregister_run(str(rid))

        return StreamingResponse(
            gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
        )

    return r
