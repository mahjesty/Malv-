"""Single place to turn an InferenceRequest into provider-ready prompt text (MALV tone preserved)."""

from __future__ import annotations

from typing import Any, Dict

from app.inference.malv_brain_prompt import wrap_infer_prompt
from app.inference.models import InferMode, InferenceRequest


def build_prompt_for_provider(req: InferenceRequest) -> str:
    """
    API usually sends malvPromptAlreadyExpanded=True with a full MALV prompt from malv-brain-prompt.ts.
    If False, apply worker-side MALV framing (legacy / direct worker callers).
    """
    ctx: Dict[str, Any] = req.context
    if ctx.get("malvPromptAlreadyExpanded"):
        return req.prompt

    ctx_block = str(ctx.get("contextBlock") or "")[:12000]
    mode: InferMode = req.mode  # type: ignore[assignment]
    if req.system_prompt:
        return (
            f"{req.system_prompt.strip()}\n\n### Context\n{ctx_block or '(no extra context block)'}\n\n"
            f"### User message\n{req.prompt}\n\n### Your reply (MALV)\n"
        )
    return wrap_infer_prompt(user_prompt=req.prompt, mode=mode, context_summary=ctx_block)
