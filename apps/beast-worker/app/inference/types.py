from typing import Any, Dict, Literal, Optional

InferMode = Literal["light", "cpu", "gpu", "beast"]


class InferRequest:
    def __init__(self, mode: InferMode, prompt: str, context: Optional[Dict[str, Any]] = None):
        self.mode = mode
        self.prompt = prompt
        self.context = context or {}

