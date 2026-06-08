"""Realtime ASR helpers.

V0 keeps ASR separate from the letter conversation loop: speech is transcribed
into the browser composer, and only user-confirmed text is sent to /letters.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_segment(value: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip(".")
    return safe or "anonymous"


def build_run_task_message(
    *,
    task_id: str,
    sample_rate: int,
    audio_format: str,
    max_sentence_silence: Optional[int] = None,
) -> dict[str, Any]:
    parameters: dict[str, Any] = {
        "sample_rate": sample_rate,
        "format": audio_format,
    }
    if max_sentence_silence is not None:
        parameters["max_sentence_silence"] = max_sentence_silence
    return {
        "header": {
            "action": "run-task",
            "task_id": task_id,
            "streaming": "duplex",
        },
        "payload": {
            "task_group": "audio",
            "task": "asr",
            "function": "recognition",
            "model": "fun-asr-realtime",
            "parameters": parameters,
            "input": {},
        },
    }


def build_finish_task_message(task_id: str) -> dict[str, Any]:
    return {
        "header": {
            "action": "finish-task",
            "task_id": task_id,
            "streaming": "duplex",
        },
        "payload": {"input": {}},
    }


def normalize_dashscope_event(message: dict[str, Any]) -> Optional[dict[str, Any]]:
    header = message.get("header") if isinstance(message, dict) else None
    if not isinstance(header, dict):
        return None
    event = header.get("event")
    task_id = header.get("task_id")

    if event == "result-generated":
        payload = message.get("payload")
        if not isinstance(payload, dict):
            return None
        output = payload.get("output")
        sentence = output.get("sentence") if isinstance(output, dict) else None
        if not isinstance(sentence, dict):
            return None
        text = sentence.get("text")
        if not isinstance(text, str):
            return None
        is_final = bool(sentence.get("sentence_end"))
        return {
            "type": "asr.final" if is_final else "asr.partial",
            "text": text,
            "is_final": is_final,
            "task_id": task_id,
            "begin_time": sentence.get("begin_time"),
            "end_time": sentence.get("end_time"),
            "usage": payload.get("usage"),
            "words": sentence.get("words"),
        }

    if event == "task-started":
        return {"type": "asr.started", "task_id": task_id}
    if event == "task-finished":
        return {
            "type": "asr.finished",
            "task_id": task_id,
            "usage": (message.get("payload") or {}).get("usage")
            if isinstance(message.get("payload"), dict)
            else None,
        }
    if event == "task-failed":
        return {
            "type": "asr.error",
            "task_id": task_id,
            "error_code": header.get("error_code"),
            "message": header.get("error_message") or "ASR_TASK_FAILED",
        }
    return None


class AsrArchive:
    """Append-only audio archive for ASR regression debugging."""

    def __init__(
        self,
        *,
        root: Path,
        session_id: str,
        utterance_id: str,
        sample_rate: int,
        audio_format: str,
    ) -> None:
        self.root = root
        self.session_id = _safe_segment(session_id)
        self.utterance_id = _safe_segment(utterance_id)
        self.sample_rate = sample_rate
        self.audio_format = audio_format
        self.created_at = _utc_iso()
        self.byte_count = 0

        self.dir = root / self.session_id
        self.dir.mkdir(parents=True, exist_ok=True)
        self.audio_path = self.dir / f"{self.utterance_id}.{audio_format}"
        self.meta_path = self.dir / f"{self.utterance_id}.json"
        self._file = self.audio_path.open("wb")

    def write_audio(self, chunk: bytes) -> None:
        if not chunk:
            return
        self._file.write(chunk)
        self.byte_count += len(chunk)

    def close(
        self,
        *,
        final_text: str,
        task_id: Optional[str],
        request_id: Optional[str],
        error: Optional[str],
    ) -> None:
        if not self._file.closed:
            self._file.close()
        meta = {
            "session_id": self.session_id,
            "utterance_id": self.utterance_id,
            "sample_rate": self.sample_rate,
            "format": self.audio_format,
            "byte_count": self.byte_count,
            "final_text": final_text,
            "task_id": task_id,
            "request_id": request_id,
            "error": error,
            "created_at": self.created_at,
            "closed_at": _utc_iso(),
            "audio_path": str(self.audio_path),
        }
        self.meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2))
