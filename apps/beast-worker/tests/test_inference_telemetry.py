"""Unit tests for inference telemetry and error sanitization."""

from app.inference import inference_telemetry


def test_sanitize_error_summary_strips_bearer() -> None:
    raw = "upstream said Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxx"
    out = inference_telemetry.sanitize_error_summary(raw)
    assert "Bearer" in out
    assert "eyJ" not in out
    assert "redacted" in out.lower()


def test_sanitize_error_summary_truncates() -> None:
    long = "x" * 500
    out = inference_telemetry.sanitize_error_summary(long, max_len=50)
    assert len(out) <= 50
    assert out.endswith("…")


def test_record_success_keeps_last_failure_fields() -> None:
    inference_telemetry.record_failure(
        failure_class="upstream_http_error",
        error_summary="openai_compat_http_500: boom",
        failover_attempted=True,
        correlation_id="corr-1",
    )
    snap = inference_telemetry.snapshot()
    assert snap["lastFailureClass"] == "upstream_http_error"
    assert snap["lastErrorClass"] == "upstream_http_error"
    assert snap["lastFailureAt"] is not None
    assert snap["lastCorrelationId"] == "corr-1"

    inference_telemetry.record_success(
        backend="openai_compatible",
        latency_ms=42,
        stream=False,
        failover_attempted=False,
        correlation_id="corr-2",
    )
    snap2 = inference_telemetry.snapshot()
    assert snap2["lastFailureClass"] == "upstream_http_error"
    assert snap2["lastErrorSummary"] is not None
    assert snap2["lastBackend"] == "openai_compatible"
    assert snap2["lastLatencyMs"] == 42
    assert snap2["lastSuccessAt"] is not None
    assert snap2["lastFailoverAttempted"] is False
    assert snap2["lastCorrelationId"] == "corr-2"
