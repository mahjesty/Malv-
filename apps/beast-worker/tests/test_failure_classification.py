"""Unit tests for standard failure_class mapping."""

from app.inference.failure_classification import FAILURE_CLASSES, classify_failure


def test_failure_classes_tuple_is_stable() -> None:
    assert "transport_error" in FAILURE_CLASSES
    assert "unknown_error" in FAILURE_CLASSES
    assert len(FAILURE_CLASSES) == 6


def test_classify_openai_transport() -> None:
    assert classify_failure("openai_compat_transport: connection refused") == "transport_error"


def test_classify_openai_timeout() -> None:
    assert classify_failure("openai_compat_timeout: ReadTimeout") == "timeout"


def test_classify_upstream_http() -> None:
    assert classify_failure("openai_compat_http_502: bad gateway") == "upstream_http_error"
    assert classify_failure("openai_compat_path_invalid: ...") == "upstream_http_error"


def test_classify_rate_limited() -> None:
    assert classify_failure("openai_compat_http_429: slow down") == "rate_limited"


def test_classify_model_error() -> None:
    assert classify_failure("empty_assistant_content") == "model_error"


def test_classify_hints() -> None:
    assert classify_failure(None, internal_hint="no_response") == "unknown_error"
    assert classify_failure(None, internal_hint="cancelled") == "unknown_error"
