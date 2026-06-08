"""Realtime ASR V0 tests."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from oriself_server.asr import (
    AsrArchive,
    build_finish_task_message,
    build_run_task_message,
    normalize_dashscope_event,
)
from oriself_server.main import create_app


def test_build_run_task_message_for_fun_asr_realtime():
    msg = build_run_task_message(
        task_id="abc123",
        sample_rate=16000,
        audio_format="pcm",
        max_sentence_silence=500,
    )

    assert msg["header"] == {
        "action": "run-task",
        "task_id": "abc123",
        "streaming": "duplex",
    }
    payload = msg["payload"]
    assert payload["task_group"] == "audio"
    assert payload["task"] == "asr"
    assert payload["function"] == "recognition"
    assert payload["model"] == "fun-asr-realtime"
    assert payload["input"] == {}
    assert payload["parameters"] == {
        "sample_rate": 16000,
        "format": "pcm",
        "max_sentence_silence": 500,
    }


def test_build_finish_task_message():
    assert build_finish_task_message("abc123") == {
        "header": {
            "action": "finish-task",
            "task_id": "abc123",
            "streaming": "duplex",
        },
        "payload": {"input": {}},
    }


def test_normalize_dashscope_partial_and_final_events():
    partial = normalize_dashscope_event(
        {
            "header": {"event": "result-generated", "task_id": "abc123"},
            "payload": {
                "output": {
                    "sentence": {
                        "text": "我正在测试",
                        "sentence_end": False,
                        "begin_time": 0,
                        "end_time": None,
                    }
                }
            },
        }
    )
    final = normalize_dashscope_event(
        {
            "header": {"event": "result-generated", "task_id": "abc123"},
            "payload": {
                "output": {
                    "sentence": {
                        "text": "我正在测试。",
                        "sentence_end": True,
                        "begin_time": 0,
                        "end_time": 1200,
                        "words": [
                            {
                                "begin_time": 0,
                                "end_time": 200,
                                "text": "我",
                                "punctuation": "",
                            }
                        ],
                    }
                },
                "usage": {"duration": 2},
            },
        }
    )

    assert partial == {
        "type": "asr.partial",
        "text": "我正在测试",
        "is_final": False,
        "task_id": "abc123",
        "begin_time": 0,
        "end_time": None,
        "usage": None,
        "words": None,
    }
    assert final == {
        "type": "asr.final",
        "text": "我正在测试。",
        "is_final": True,
        "task_id": "abc123",
        "begin_time": 0,
        "end_time": 1200,
        "usage": {"duration": 2},
        "words": [
            {
                "begin_time": 0,
                "end_time": 200,
                "text": "我",
                "punctuation": "",
            }
        ],
    }


def test_archive_writes_pcm_and_metadata(tmp_path: Path):
    archive = AsrArchive(
        root=tmp_path,
        session_id="session-123",
        utterance_id="utt-abc",
        sample_rate=16000,
        audio_format="pcm",
    )

    archive.write_audio(b"\x01\x02")
    archive.write_audio(b"\x03\x04")
    archive.close(
        final_text="我正在测试。",
        task_id="task-123",
        request_id="request-123",
        error=None,
    )

    audio_path = tmp_path / "session-123" / "utt-abc.pcm"
    meta_path = tmp_path / "session-123" / "utt-abc.json"
    assert audio_path.read_bytes() == b"\x01\x02\x03\x04"
    meta = json.loads(meta_path.read_text())
    assert meta["session_id"] == "session-123"
    assert meta["utterance_id"] == "utt-abc"
    assert meta["sample_rate"] == 16000
    assert meta["format"] == "pcm"
    assert meta["byte_count"] == 4
    assert meta["final_text"] == "我正在测试。"
    assert meta["task_id"] == "task-123"
    assert meta["request_id"] == "request-123"
    assert meta["error"] is None
    assert meta["created_at"]
    assert meta["closed_at"]


def test_archive_sanitizes_session_id_path(tmp_path: Path):
    archive = AsrArchive(
        root=tmp_path,
        session_id="../escape",
        utterance_id="utt-abc",
        sample_rate=16000,
        audio_format="pcm",
    )
    archive.write_audio(b"x")
    archive.close(final_text="", task_id=None, request_id=None, error=None)

    assert archive.audio_path.resolve().is_relative_to(tmp_path.resolve())
    assert (tmp_path / "_escape" / "utt-abc.pcm").exists()


class FakeDashScopeWebSocket:
    def __init__(self) -> None:
        self.sent: list[object] = []
        self.closed = False
        self._messages = [
            json.dumps({"header": {"event": "task-started", "task_id": "task-1"}}),
            json.dumps(
                {
                    "header": {"event": "result-generated", "task_id": "task-1"},
                    "payload": {
                        "output": {
                            "sentence": {
                                "text": "正在测试",
                                "sentence_end": False,
                            }
                        }
                    },
                }
            ),
            json.dumps(
                {
                    "header": {"event": "result-generated", "task_id": "task-1"},
                    "payload": {
                        "output": {
                            "sentence": {
                                "text": "正在测试。",
                                "sentence_end": True,
                            }
                        }
                    },
                }
            ),
            json.dumps({"header": {"event": "task-finished", "task_id": "task-1"}}),
        ]

    async def send(self, data: object) -> None:
        self.sent.append(data)

    async def recv(self) -> str:
        if not self._messages:
            raise RuntimeError("fake upstream exhausted")
        return self._messages.pop(0)

    async def close(self) -> None:
        self.closed = True


class FakeDashScopePartialOnlyWebSocket:
    def __init__(self) -> None:
        self.sent: list[object] = []
        self.closed = False
        self._messages = [
            json.dumps({"header": {"event": "task-started", "task_id": "task-1"}}),
            json.dumps(
                {
                    "header": {"event": "result-generated", "task_id": "task-1"},
                    "payload": {
                        "output": {
                            "sentence": {
                                "text": "测试",
                                "sentence_end": False,
                            }
                        }
                    },
                }
            ),
            json.dumps({"header": {"event": "task-finished", "task_id": "task-1"}}),
        ]

    async def send(self, data: object) -> None:
        self.sent.append(data)

    async def recv(self) -> str:
        if not self._messages:
            raise RuntimeError("fake upstream exhausted")
        return self._messages.pop(0)

    async def close(self) -> None:
        self.closed = True


def test_asr_ws_proxies_audio_and_archives(monkeypatch, tmp_path: Path):
    from oriself_server.routes import asr as asr_route

    fake = FakeDashScopeWebSocket()

    async def fake_connect():
        return fake

    monkeypatch.setenv("ORISELF_ASR_ENABLED", "1")
    monkeypatch.setenv("ORISELF_ASR_API_KEY", "test-key")
    monkeypatch.setenv("ORISELF_ASR_ARCHIVE_DIR", str(tmp_path))
    monkeypatch.setattr(asr_route, "_connect_dashscope", fake_connect)

    client = TestClient(create_app())
    with client.websocket_connect("/asr/ws?session_id=session-1") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "asr.ready"
        assert hello["session_id"] == "session-1"
        assert hello["utterance_id"]

        ws.send_bytes(b"\x01\x02\x03\x04")
        ws.send_json({"type": "stop"})
        partial = ws.receive_json()
        final = ws.receive_json()
        finished = ws.receive_json()

    assert partial["type"] == "asr.partial"
    assert partial["text"] == "正在测试"
    assert final["type"] == "asr.final"
    assert final["text"] == "正在测试。"
    assert finished["type"] == "asr.finished"

    run_task = json.loads(fake.sent[0])
    assert run_task["header"]["action"] == "run-task"
    assert fake.sent[1] == b"\x01\x02\x03\x04"
    finish_task = json.loads(fake.sent[-1])
    assert finish_task["header"]["action"] == "finish-task"
    text_actions = [
        json.loads(x)["header"]["action"] for x in fake.sent if isinstance(x, str)
    ]
    assert text_actions.count("finish-task") == 1
    assert fake.closed is True

    session_dir = tmp_path / "session-1"
    pcm_files = list(session_dir.glob("*.pcm"))
    meta_files = list(session_dir.glob("*.json"))
    assert len(pcm_files) == 1
    assert len(meta_files) == 1
    assert pcm_files[0].read_bytes() == b"\x01\x02\x03\x04"
    meta = json.loads(meta_files[0].read_text())
    assert meta["session_id"] == "session-1"
    assert meta["final_text"] == "正在测试。"
    assert meta["byte_count"] == 4
    assert meta["task_id"] == "task-1"


def test_asr_ws_archives_last_partial_when_no_final(monkeypatch, tmp_path: Path):
    from oriself_server.routes import asr as asr_route

    fake = FakeDashScopePartialOnlyWebSocket()

    async def fake_connect():
        return fake

    monkeypatch.setenv("ORISELF_ASR_ENABLED", "1")
    monkeypatch.setenv("ORISELF_ASR_API_KEY", "test-key")
    monkeypatch.setenv("ORISELF_ASR_ARCHIVE_DIR", str(tmp_path))
    monkeypatch.setattr(asr_route, "_connect_dashscope", fake_connect)

    client = TestClient(create_app())
    with client.websocket_connect("/asr/ws?session_id=session-1") as ws:
        assert ws.receive_json()["type"] == "asr.ready"
        ws.send_bytes(b"\x01\x02")
        ws.send_json({"type": "stop"})
        partial = ws.receive_json()
        finished = ws.receive_json()

    assert partial["type"] == "asr.partial"
    assert partial["text"] == "测试"
    assert finished["type"] == "asr.finished"

    meta_files = list((tmp_path / "session-1").glob("*.json"))
    assert len(meta_files) == 1
    meta = json.loads(meta_files[0].read_text())
    assert meta["final_text"] == "测试"
    assert meta["error"] is None


def test_asr_ws_disabled_by_default(monkeypatch):
    monkeypatch.delenv("ORISELF_ASR_ENABLED", raising=False)
    client = TestClient(create_app())
    with client.websocket_connect("/asr/ws?letter_id=letter-1") as ws:
        assert ws.receive_json() == {
            "type": "asr.error",
            "message": "ASR_DISABLED",
        }
        with pytest.raises(Exception):
            ws.receive_json()
