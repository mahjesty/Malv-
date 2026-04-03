from __future__ import annotations

import asyncio
import logging
from typing import Dict, Optional

_log = logging.getLogger("malv.brain")

_events: Dict[str, asyncio.Event] = {}


def register_run(run_id: str) -> asyncio.Event:
    ev = asyncio.Event()
    _events[run_id] = ev
    _log.info("[MALV INFERENCE] cancel registry register runId=%s", run_id)
    return ev


def unregister_run(run_id: str) -> None:
    _events.pop(run_id, None)
    _log.info("[MALV INFERENCE] cancel registry unregister runId=%s", run_id)


def cancel_run(run_id: str) -> bool:
    ev = _events.get(run_id)
    if ev is None:
        _log.warning("[MALV INFERENCE] cancel requested for unknown runId=%s", run_id)
        return False
    ev.set()
    _log.warning("[MALV INFERENCE] cancellation flagged runId=%s", run_id)
    return True


def is_cancelled(run_id: Optional[str]) -> bool:
    if not run_id:
        return False
    ev = _events.get(run_id)
    return ev.is_set() if ev else False
