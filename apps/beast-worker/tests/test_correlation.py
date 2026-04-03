"""Correlation context merging (header + JSON body)."""

from app.inference.correlation import apply_correlation_to_context, ctx_correlation_id, effective_correlation_id
from app.inference.models import InferenceRequest


def test_apply_correlation_header_wins_over_body_run_id() -> None:
    ctx: dict = {"runId": "job-a"}
    apply_correlation_to_context(ctx, "header-cid")
    assert ctx["malvCorrelationId"] == "header-cid"


def test_apply_correlation_falls_back_to_run_id() -> None:
    ctx: dict = {"runId": "job-b"}
    apply_correlation_to_context(ctx, None)
    assert ctx["malvCorrelationId"] == "job-b"


def test_effective_correlation_id() -> None:
    req = InferenceRequest(malv_correlation_id="x", run_id="y")
    assert effective_correlation_id(req) == "x"
    req2 = InferenceRequest(malv_correlation_id=None, run_id="z")
    assert effective_correlation_id(req2) == "z"


def test_ctx_correlation_id_order() -> None:
    assert ctx_correlation_id({"malvCorrelationId": "m", "runId": "r"}) == "m"
