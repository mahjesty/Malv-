from app.core.settings import Settings
from app.inference.models import InferenceRequest
from app.inference.providers.openai_compatible import OpenAiCompatibleInferenceProvider


def _provider() -> OpenAiCompatibleInferenceProvider:
    settings = Settings(
        inference_backend="openai_compatible",
        openai_compat_base_url="http://127.0.0.1:8000/v1",
        inference_model="qwen-test"
    )
    return OpenAiCompatibleInferenceProvider(settings)


def test_messages_for_prepends_system_prompt_when_history_has_no_system() -> None:
    provider = _provider()
    req = InferenceRequest(
        system_prompt="MALV identity lock",
        messages=[{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}]
    )
    out = provider._messages_for(req)
    assert out[0] == {"role": "system", "content": "MALV identity lock"}
    assert out[1]["role"] == "user"
    assert out[2]["role"] == "assistant"


def test_messages_for_avoids_duplicate_when_leading_system_matches() -> None:
    provider = _provider()
    req = InferenceRequest(
        system_prompt="MALV identity lock",
        messages=[
            {"role": "system", "content": "MALV identity lock"},
            {"role": "user", "content": "hi"}
        ]
    )
    out = provider._messages_for(req)
    assert len([m for m in out if m["role"] == "system"]) == 1
    assert out[0]["content"] == "MALV identity lock"


def test_messages_for_system_only_when_messages_empty() -> None:
    provider = _provider()
    req = InferenceRequest(system_prompt="MALV identity lock", messages=[])
    out = provider._messages_for(req)
    assert out == [{"role": "system", "content": "MALV identity lock"}]


def test_messages_for_preserves_history_order_after_system() -> None:
    provider = _provider()
    req = InferenceRequest(
        system_prompt="MALV identity lock",
        messages=[
            {"role": "assistant", "content": "a1"},
            {"role": "user", "content": "u2"},
            {"role": "assistant", "content": "a3"}
        ]
    )
    out = provider._messages_for(req)
    assert [m["content"] for m in out] == ["MALV identity lock", "a1", "u2", "a3"]
