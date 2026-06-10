"""Analytics endpoint smoke tests · v2.7 A-6."""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from oriself_server.database import reset_for_tests
from oriself_server.main import create_app
from oriself_server.models import AnalyticsEvent


@pytest.fixture
def client():
    reset_for_tests()
    app = create_app()
    return TestClient(app)


def test_record_landing_event_201(client):
    r = client.post(
        "/analytics/event",
        json={"event": "landing_enter_clicked"},
    )
    assert r.status_code == 201, r.text
    assert r.json() == {"ok": True}


def test_record_event_with_props(client):
    r = client.post(
        "/analytics/event",
        json={
            "event": "round_reached",
            "props": {"round": 6, "letter_id": "abc-123"},
        },
    )
    assert r.status_code == 201


def test_unknown_event_rejected(client):
    r = client.post(
        "/analytics/event",
        json={"event": "random_event_name"},
    )
    # pydantic field_validator raises → FastAPI 返回 422 (validation error)
    assert r.status_code == 422


def test_event_persists_with_ip_hash_and_ua(client):
    r = client.post(
        "/analytics/event",
        json={"event": "issue_opened", "props": {"slug": "infp-abcd1234"}},
        headers={"User-Agent": "test-agent/1.0"},
    )
    assert r.status_code == 201

    # 直读 DB 验证落库内容
    from oriself_server.database import get_sessionmaker

    SessionLocal = get_sessionmaker()
    with SessionLocal() as db:
        evt = db.query(AnalyticsEvent).order_by(AnalyticsEvent.id.desc()).first()
        assert evt is not None
        assert evt.event == "issue_opened"
        assert evt.props_json is not None
        assert json.loads(evt.props_json) == {"slug": "infp-abcd1234"}
        assert evt.user_agent == "test-agent/1.0"
        # ip_hash 是 sha256 hex(64 chars) 或 None（TestClient 没设 client ip 时）
        assert evt.ip_hash is None or len(evt.ip_hash) == 64


def test_oversized_props_rejected(client):
    huge = {"x": "y" * 11_000}
    r = client.post(
        "/analytics/event",
        json={"event": "round_reached", "props": huge},
    )
    assert r.status_code == 400


def test_all_whitelisted_events_accepted(client):
    """每个白名单事件都能落库。数据驱动自 ALLOWED_EVENTS，避免硬编码计数走样。"""
    from oriself_server.routes.analytics import ALLOWED_EVENTS

    events = sorted(ALLOWED_EVENTS)
    for e in events:
        r = client.post("/analytics/event", json={"event": e})
        assert r.status_code == 201, f"{e} failed: {r.text}"

    from oriself_server.database import get_sessionmaker

    SessionLocal = get_sessionmaker()
    with SessionLocal() as db:
        count = db.query(AnalyticsEvent).count()
        assert count == len(events)


def test_new_letter_from_issue_event_accepted(client):
    """Task 2.2/2.5 · 受众分流转化点击事件入白名单，props 透传落库。"""
    r = client.post(
        "/analytics/event",
        json={"event": "new_letter_from_issue", "props": {"slug": "x", "domain": "mbti"}},
    )
    assert r.status_code == 201, r.text

    from oriself_server.database import get_sessionmaker

    SessionLocal = get_sessionmaker()
    with SessionLocal() as db:
        evt = db.query(AnalyticsEvent).order_by(AnalyticsEvent.id.desc()).first()
        assert evt is not None
        assert evt.event == "new_letter_from_issue"
        assert json.loads(evt.props_json) == {"slug": "x", "domain": "mbti"}


def test_issue_published_event_accepted(client):
    """Task 5.2/2.5 · 公开收录开关翻转事件入白名单。"""
    r = client.post(
        "/analytics/event",
        json={"event": "issue_published", "props": {"slug": "x", "is_public": True}},
    )
    assert r.status_code == 201, r.text
