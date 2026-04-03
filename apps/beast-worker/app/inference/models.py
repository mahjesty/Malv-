from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Literal, Optional

InferMode = Literal["light", "cpu", "gpu", "beast"]
FinishReason = Literal["stop", "length", "cancelled", "error", "unknown"]


@dataclass
class InferenceRequest:
    """Per-turn inference; malv_correlation_id matches API chat runId when set."""

    run_id: Optional[str] = None
    malv_correlation_id: Optional[str] = None
    prompt: str = ""
    system_prompt: Optional[str] = None
    messages: Optional[List[Dict[str, Any]]] = None
    context: Dict[str, Any] = field(default_factory=dict)
    mode: InferMode = "light"
    model: Optional[str] = None
    temperature: float = 0.7
    top_p: float = 0.9
    max_tokens: int = 256
    stop: List[str] = field(default_factory=list)
    stream: bool = False
    input_mode: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TokenUsage:
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None


@dataclass
class InferenceResponse:
    text: str = ""
    finish_reason: FinishReason = "unknown"
    usage: Optional[TokenUsage] = None
    model: Optional[str] = None
    backend: str = ""
    latency_ms: int = 0
    streamed: bool = False
    raw: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    fallback: bool = False
    cancelled: bool = False

    def to_worker_body(self) -> Dict[str, Any]:
        return {
            "reply": self.text,
            "meta": {
                "finishReason": self.finish_reason,
                "usage": (
                    {
                        "promptTokens": self.usage.prompt_tokens,
                        "completionTokens": self.usage.completion_tokens,
                        "totalTokens": self.usage.total_tokens,
                    }
                    if self.usage
                    else None
                ),
                "model": self.model,
                "inferenceBackend": self.backend,
                "latencyMs": self.latency_ms,
                "streamed": self.streamed,
                "raw": self.raw,
                "error": self.error,
                "malvInferenceFallback": self.fallback,
                "cancelled": self.cancelled,
            },
        }


StreamDeltaHandler = Callable[[str], Any]
StreamDoneHandler = Callable[[InferenceResponse], Any]
