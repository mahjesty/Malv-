import asyncio
from typing import Any

from app.core.settings import Settings
from app.inference.models import InferenceRequest
from app.inference.providers.openai_compatible import OpenAiCompatibleInferenceProvider
from app.inference.providers import openai_compatible as provider_module


class _FakeResponse:
    def __init__(self, payload: dict[str, Any], status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return self._payload


class _FakeStreamResponse:
    def __init__(self, lines: list[str], status_code: int = 200) -> None:
        self._lines = lines
        self.status_code = status_code

    async def __aenter__(self) -> "_FakeStreamResponse":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    def raise_for_status(self) -> None:
        return None

    async def aiter_lines(self):
        for line in self._lines:
            yield line

    async def aclose(self) -> None:
        return None


class _FakeClient:
    def __init__(self, *, post_payload: dict[str, Any], stream_lines: list[str]) -> None:
        self._post_payload = post_payload
        self._stream_lines = stream_lines

    async def post(self, *_args, **_kwargs):
        return _FakeResponse(self._post_payload)

    def stream(self, *_args, **_kwargs):
        return _FakeStreamResponse(self._stream_lines)


def _provider() -> OpenAiCompatibleInferenceProvider:
    settings = Settings(
        inference_backend="openai_compatible",
        openai_compat_base_url="http://127.0.0.1:8000/v1",
        inference_model="qwen-test",
    )
    return OpenAiCompatibleInferenceProvider(settings)


def test_infer_preserves_upstream_length_finish_reason() -> None:
    provider = _provider()
    req = InferenceRequest(prompt="hello")
    fake_client = _FakeClient(
        post_payload={
            "choices": [{"message": {"role": "assistant", "content": "partial reply"}, "finish_reason": "length"}]
        },
        stream_lines=[],
    )
    original_get_http_client = provider_module.get_http_client
    provider_module.get_http_client = lambda: fake_client
    try:
        resp = asyncio.run(provider.infer(req))
    finally:
        provider_module.get_http_client = original_get_http_client
    assert resp.finish_reason == "length"
    assert resp.text == "partial reply"


def test_stream_infer_preserves_final_chunk_finish_reason_length() -> None:
    provider = _provider()
    req = InferenceRequest(prompt="hello", run_id="run-1")
    fake_client = _FakeClient(
        post_payload={},
        stream_lines=[
            'data: {"choices":[{"delta":{"content":"partial "},"finish_reason":null}]}',
            'data: {"choices":[{"delta":{"content":"reply"},"finish_reason":"length"}]}',
            "data: [DONE]",
        ],
    )
    original_get_http_client = provider_module.get_http_client
    provider_module.get_http_client = lambda: fake_client
    done: dict[str, Any] = {}

    async def _run() -> None:
        await provider.stream_infer(
            req,
            on_delta=lambda _piece: None,
            on_done=lambda resp: done.update({"finish_reason": resp.finish_reason, "text": resp.text}),
        )

    try:
        asyncio.run(_run())
    finally:
        provider_module.get_http_client = original_get_http_client
    assert done["finish_reason"] == "length"
    assert done["text"] == "partial reply"
