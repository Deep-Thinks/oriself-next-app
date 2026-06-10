"""Batch 0 / D-A · P0 · slug 持有者不得经公开元数据拿到 letter_id（owner capability 链）。"""
from __future__ import annotations

from fastapi.testclient import TestClient

from oriself_server import database as db_mod
from oriself_server.main import create_app
# 复用 §5 测试的 seed helper（同 tests 包内导入）
from tests.test_issues_public import _seed_completed_issue


def test_issue_meta_does_not_leak_letter_id():
    db_mod.reset_for_tests()
    client = TestClient(create_app())
    _seed_completed_issue(slug="intj-capa0001", public=False, token="tok-a")
    meta = client.get("/issues/intj-capa0001").json()
    assert "letter_id" not in meta


def test_result_token_unreachable_from_slug_alone():
    """端到端口径：仅凭 slug，元数据里没有任何字段等于 session_id。"""
    db_mod.reset_for_tests()
    client = TestClient(create_app())
    sid = _seed_completed_issue(slug="enfp-capa0002", public=False, token="tok-b")
    meta = client.get("/issues/enfp-capa0002").json()
    assert sid not in meta.values()
