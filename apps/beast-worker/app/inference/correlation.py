"""Per-turn correlation id: aligns API `runId` / `malvCorrelationId` with worker + provider logs."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, Optional

if TYPE_CHECKING:
    from app.inference.models import InferenceRequest


def ctx_correlation_id(context: Dict[str, Any]) -> Optional[str]:
    """Prefer explicit malvCorrelationId; fall back to runId (same value when API sets both)."""
    for k in ("malvCorrelationId", "malv_correlation_id", "runId", "run_id"):
        v = context.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return None


def apply_correlation_to_context(ctx: Dict[str, Any], header_value: Optional[str]) -> None:
    """Merge HTTP header with JSON context so InferenceRequest sees a single id."""
    h = (header_value or "").strip()
    if h:
        ctx["malvCorrelationId"] = h
    if not ctx.get("malvCorrelationId"):
        rid = ctx.get("runId") or ctx.get("run_id")
        if rid is not None and str(rid).strip():
            ctx["malvCorrelationId"] = str(rid).strip()


def effective_correlation_id(req: InferenceRequest) -> str:
    """Stable id for structured logs (never empty; never contains secrets)."""
    cid = (req.malv_correlation_id or req.run_id or "").strip()
    return cid or "unknown"
