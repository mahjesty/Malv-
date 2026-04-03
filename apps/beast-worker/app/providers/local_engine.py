from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal, Optional

_log = logging.getLogger("malv.brain")

InferDevice = Literal["cpu", "cuda", "auto"]


@dataclass
class GenerationConfig:
    max_new_tokens: int = 256
    temperature: float = 0.7
    top_p: float = 0.9


class LocalInferenceEngine:
    """
    Loads a local/private model from disk and runs inference locally.
    This service does NOT call external model APIs.
    """

    def __init__(self, model_path: str, *, use_gpu: bool = True, gpu_device: int = 0) -> None:
        self.model_path = model_path
        self._use_gpu = use_gpu
        self._gpu_device = gpu_device
        self._tokenizer = None
        self._model = None

    def warmup(self) -> None:
        """Eager load weights (optional at worker boot)."""
        self._lazy_load()
        _log.info("[MALV INFERENCE] Transformers model loaded (warmup) path=%s", self.model_path)

    def _lazy_load(self) -> None:
        if self._tokenizer is not None and self._model is not None:
            return

        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer  # type: ignore
        except Exception as e:  # pragma: no cover
            raise RuntimeError(
                "Transformers is required for local inference. Install dependencies in the beast-worker environment."
            ) from e

        import torch  # type: ignore

        if self._use_gpu and torch.cuda.is_available():
            try:
                torch.cuda.set_device(self._gpu_device)
            except Exception as e:
                _log.warning("[MALV INFERENCE] cuda set_device failed, continuing with auto map: %s", e)
            device_map = "auto"
            torch_dtype = torch.float16
        else:
            if not self._use_gpu:
                _log.info("[MALV INFERENCE] MALV_USE_GPU=false — loading Transformers weights on CPU")
            device_map = None
            torch_dtype = None

        self._tokenizer = AutoTokenizer.from_pretrained(self.model_path, use_fast=True)
        if self._tokenizer.pad_token is None and self._tokenizer.eos_token is not None:
            self._tokenizer.pad_token = self._tokenizer.eos_token

        self._model = AutoModelForCausalLM.from_pretrained(
            self.model_path,
            device_map=device_map,
            torch_dtype=torch_dtype,
            low_cpu_mem_usage=True,
        )

    def generate(self, prompt: str, *, device: InferDevice, gen_cfg: GenerationConfig) -> str:
        self._lazy_load()
        assert self._tokenizer is not None and self._model is not None

        import torch  # type: ignore

        gen_kwargs: dict[str, Any] = {
            "max_new_tokens": gen_cfg.max_new_tokens,
            "do_sample": True,
            "temperature": gen_cfg.temperature,
            "top_p": gen_cfg.top_p,
            "pad_token_id": self._tokenizer.pad_token_id,
        }

        if device == "cpu" or not self._use_gpu:
            inputs = self._tokenizer(prompt, return_tensors="pt")
            with torch.no_grad():
                out = self._model.generate(**inputs, **gen_kwargs)
        else:
            inputs = self._tokenizer(prompt, return_tensors="pt")
            if device == "cuda":
                inputs = {k: v.to(f"cuda:{self._gpu_device}") for k, v in inputs.items()}
            with torch.no_grad():
                out = self._model.generate(**inputs, **gen_kwargs)

        text = self._tokenizer.decode(out[0], skip_special_tokens=True)
        if text.startswith(prompt):
            continuation = text[len(prompt) :].strip()
            if not continuation:
                _log.warning(
                    "[MALV WORKER] local_engine: generation matched prompt only (empty continuation) "
                    "decoded_total_chars=%d prompt_chars=%d",
                    len(text),
                    len(prompt),
                )
            return continuation
        out_s = text.strip()
        if not out_s:
            _log.warning("[MALV WORKER] local_engine: decode produced empty strip() output")
        return out_s
