from __future__ import annotations

from typing import Any, Dict, List, Optional, Protocol

from app.inference.models import InferenceRequest, InferenceResponse, StreamDeltaHandler, StreamDoneHandler


class InferenceProvider(Protocol):
    """Pluggable private inference backend."""

    name: str

    async def infer(self, req: InferenceRequest) -> InferenceResponse: ...

    async def stream_infer(
        self,
        req: InferenceRequest,
        on_delta: StreamDeltaHandler,
        on_done: StreamDoneHandler,
    ) -> None:
        """Optional streaming; default impl may call infer() and emit one chunk."""
        ...

    async def health(self) -> Dict[str, Any]: ...

    async def cancel(self, run_id: str) -> bool: ...


class ProviderMetadata:
    __slots__ = ("backend_type", "model_name", "supports_stream", "vram_mb_hint", "cpu_only", "priority")

    def __init__(
        self,
        *,
        backend_type: str,
        model_name: Optional[str] = None,
        supports_stream: bool = False,
        vram_mb_hint: Optional[int] = None,
        cpu_only: bool = False,
        priority: int = 50,
    ) -> None:
        self.backend_type = backend_type
        self.model_name = model_name
        self.supports_stream = supports_stream
        self.vram_mb_hint = vram_mb_hint
        self.cpu_only = cpu_only
        self.priority = priority

    def as_dict(self) -> Dict[str, Any]:
        return {
            "backendType": self.backend_type,
            "modelName": self.model_name,
            "supportsStream": self.supports_stream,
            "vramMbHint": self.vram_mb_hint,
            "cpuOnly": self.cpu_only,
            "priority": self.priority,
        }
