"""Realtime ASR WebSocket proxy.

Browser audio never goes directly to DashScope. The browser streams PCM chunks
to this route; the server holds the API key, proxies audio upstream, and stores
an archive for regression debugging.
"""
from __future__ import annotations

import asyncio
import json
import os
import secrets
from pathlib import Path
from typing import Optional

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..asr import (
    AsrArchive,
    build_finish_task_message,
    build_run_task_message,
    normalize_dashscope_event,
)


router = APIRouter(prefix="/asr", tags=["asr"])

DEFAULT_SAMPLE_RATE = 16000
DEFAULT_FORMAT = "pcm"
DEFAULT_MAX_SENTENCE_SILENCE = 500
MAX_AUDIO_BYTES = 25 * 1024 * 1024
MAX_SESSION_SECONDS = 180


def _asr_enabled() -> bool:
    return os.environ.get("ORISELF_ASR_ENABLED", "").strip() == "1"


def _api_key() -> str:
    return (
        os.environ.get("ORISELF_ASR_API_KEY")
        or os.environ.get("DASHSCOPE_API_KEY")
        or ""
    ).strip()


def _archive_enabled() -> bool:
    return os.environ.get("ORISELF_ASR_ARCHIVE_ENABLED", "1").strip() != "0"


def _archive_root() -> Path:
    return Path(os.environ.get("ORISELF_ASR_ARCHIVE_DIR", "data/asr-archive")).resolve()


def _dashscope_url() -> str:
    return os.environ.get(
        "ORISELF_ASR_WS_URL",
        "wss://dashscope.aliyuncs.com/api-ws/v1/inference/",
    )


async def _connect_dashscope():
    key = _api_key()
    return await websockets.connect(
        _dashscope_url(),
        additional_headers={"Authorization": f"bearer {key}"},
        max_size=4 * 1024 * 1024,
    )


def _json_dumps(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False)


@router.websocket("/ws")
async def asr_ws(websocket: WebSocket):
    await websocket.accept()
    if not _asr_enabled():
        await websocket.send_json({"type": "asr.error", "message": "ASR_DISABLED"})
        await websocket.close(code=1008)
        return
    if not _api_key():
        await websocket.send_json({"type": "asr.error", "message": "ASR_API_KEY_MISSING"})
        await websocket.close(code=1011)
        return

    session_id = (
        websocket.query_params.get("session_id")
        or websocket.query_params.get("letter_id")
        or "anonymous"
    )
    utterance_id = secrets.token_hex(8)
    task_id = secrets.token_hex(16)
    sample_rate = DEFAULT_SAMPLE_RATE
    audio_format = DEFAULT_FORMAT
    archive: Optional[AsrArchive] = None
    if _archive_enabled():
        archive = AsrArchive(
            root=_archive_root(),
            session_id=session_id,
            utterance_id=utterance_id,
            sample_rate=sample_rate,
            audio_format=audio_format,
        )

    upstream = None
    final_text = ""
    last_partial_text = ""
    upstream_task_id: Optional[str] = task_id
    error: Optional[str] = None
    audio_bytes = 0
    finish_sent = False

    try:
        upstream = await _connect_dashscope()
        await upstream.send(
            _json_dumps(
                build_run_task_message(
                    task_id=task_id,
                    sample_rate=sample_rate,
                    audio_format=audio_format,
                    max_sentence_silence=DEFAULT_MAX_SENTENCE_SILENCE,
                )
            )
        )

        while True:
            try:
                raw = await asyncio.wait_for(upstream.recv(), timeout=15)
            except TimeoutError:
                error = "ASR_UPSTREAM_START_TIMEOUT"
                await websocket.send_json({"type": "asr.error", "message": error})
                return
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue
            normalized = normalize_dashscope_event(message)
            if normalized is None:
                continue
            upstream_task_id = normalized.get("task_id") or upstream_task_id
            if normalized["type"] == "asr.started":
                break
            if normalized["type"] == "asr.error":
                error = str(normalized.get("message") or "ASR_TASK_FAILED")
                await websocket.send_json(normalized)
                return

        await websocket.send_json(
            {
                "type": "asr.ready",
                "session_id": session_id,
                "utterance_id": utterance_id,
                "sample_rate": sample_rate,
                "format": audio_format,
            }
        )

        async def recv_upstream() -> None:
            nonlocal final_text, last_partial_text, upstream_task_id, error
            while True:
                raw = await upstream.recv()
                try:
                    message = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                normalized = normalize_dashscope_event(message)
                if normalized is None:
                    continue
                upstream_task_id = normalized.get("task_id") or upstream_task_id
                if normalized["type"] == "asr.started":
                    continue
                if normalized["type"] == "asr.partial":
                    last_partial_text = normalized.get("text") or last_partial_text
                if normalized["type"] == "asr.final":
                    final_text = normalized.get("text") or final_text
                if normalized["type"] == "asr.error":
                    error = str(normalized.get("message") or "ASR_TASK_FAILED")
                await websocket.send_json(normalized)
                if normalized["type"] in {"asr.finished", "asr.error"}:
                    return

        async def recv_client() -> None:
            nonlocal audio_bytes, error, finish_sent
            while True:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    raise WebSocketDisconnect()
                chunk = message.get("bytes")
                text = message.get("text")
                if chunk:
                    audio_bytes += len(chunk)
                    if audio_bytes > MAX_AUDIO_BYTES:
                        error = "ASR_AUDIO_TOO_LARGE"
                        await websocket.send_json({"type": "asr.error", "message": error})
                        return
                    if archive is not None:
                        archive.write_audio(chunk)
                    await upstream.send(chunk)
                elif text:
                    try:
                        data = json.loads(text)
                    except json.JSONDecodeError:
                        continue
                    if data.get("type") == "stop":
                        if not finish_sent:
                            await upstream.send(_json_dumps(build_finish_task_message(task_id)))
                            finish_sent = True
                        return

        upstream_task = asyncio.create_task(recv_upstream())
        client_task = asyncio.create_task(recv_client())
        try:
            await asyncio.wait_for(client_task, timeout=MAX_SESSION_SECONDS)
            if audio_bytes > 0:
                await asyncio.wait_for(upstream_task, timeout=30)
        except TimeoutError:
            error = "ASR_SESSION_TIMEOUT"
            await websocket.send_json({"type": "asr.error", "message": error})
        finally:
            for task in (upstream_task, client_task):
                if not task.done():
                    task.cancel()
            await asyncio.gather(upstream_task, client_task, return_exceptions=True)
            if client_task.done() and error is None and not finish_sent:
                try:
                    await upstream.send(_json_dumps(build_finish_task_message(task_id)))
                    finish_sent = True
                except Exception:
                    pass
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        error = "ASR_INTERNAL_ERROR"
        try:
            await websocket.send_json({"type": "asr.error", "message": error})
        except Exception:
            pass
        if os.environ.get("ORISELF_DEBUG_ASR") == "1":
            raise exc
    finally:
        if archive is not None:
            archive.close(
                final_text=final_text or last_partial_text,
                task_id=upstream_task_id,
                request_id=None,
                error=error,
            )
        if upstream is not None:
            try:
                await upstream.close()
            except Exception:
                pass
        try:
            await websocket.close()
        except Exception:
            pass
