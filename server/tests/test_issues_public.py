"""§5 · 公开收录闭环测试：默认私有 + owner_token 下发 + GET /issues/public + publish 鉴权。"""
from __future__ import annotations

from fastapi.testclient import TestClient

from oriself_server import database as db_mod
from oriself_server.database import session_scope
from oriself_server.main import create_app
# 别名导入：避免 pytest 把以 "Test" 开头的 ORM 类当测试类去收集（PytestCollectionWarning）。
from oriself_server.models import Conversation
from oriself_server.models import TestResult as ResultRow
from oriself_server.models import TestSession as SessionRow


def _seed_convergeable_session(provider: str = "mock", domain: str = "mbti", rounds: int = 6) -> str:
    """建一个已聊够轮、最后一轮 STATUS=CONVERGE 的 session，让 POST /result 能过收束闸门。"""
    with session_scope() as db:
        sess = SessionRow(provider=provider, domain=domain, skill_version="test")
        db.add(sess)
        db.flush()
        sid = sess.session_id
        for i in range(1, rounds + 1):
            db.add(
                Conversation(
                    session_id=sid,
                    round_number=i,
                    user_message=f"第 {i} 轮用户回复",
                    oriself_text=f"Oriself 第 {i} 轮回应",
                    status_sentinel="CONVERGE" if i == rounds else "CONTINUE",
                    discarded=False,
                )
            )
        return sid


def _seed_completed_issue(
    slug: str,
    public: bool = False,
    token: str = "tok123",
    excerpt: str | None = None,
) -> str:
    with session_scope() as db:
        sess = SessionRow(provider="mock", domain="mbti", skill_version="test")
        db.add(sess)
        db.flush()
        db.add(
            ResultRow(
                session_id=sess.session_id,
                mbti_type="INTJ",
                issue_slug=slug,
                issue_title="一份关于掌控权的账目自审",
                issue_html="<!doctype html><html><body>x</body></html>",
                issue_is_public=public,
                issue_owner_token=token,
                issue_excerpt=excerpt,
                insight_json="{}",
                card_json="{}",
                confidence_json="{}",
            )
        )
        return sess.session_id


def test_new_report_is_private_and_returns_owner_token():
    db_mod.reset_for_tests()
    letter_id = _seed_convergeable_session()
    client = TestClient(create_app())

    res = client.post(f"/letters/{letter_id}/result")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["owner_token"], "converge 必须下发 owner_token"
    slug = body["issue_slug"]
    assert slug

    # 默认私有
    meta = client.get(f"/issues/{slug}")
    assert meta.status_code == 200, meta.text
    assert meta.json()["is_public"] is False
    # 公开 GET 绝不泄漏 owner_token
    assert "owner_token" not in meta.json()


def test_public_endpoint_lists_only_public_renderable():
    db_mod.reset_for_tests()
    _seed_completed_issue(slug="intj-private0001", public=False, token="a")
    _seed_completed_issue(
        slug="enfp-public0002", public=True, token="b", excerpt="这是一段公开命题的摘录"
    )
    client = TestClient(create_app())

    r = client.get("/issues/public")
    assert r.status_code == 200, r.text
    items = r.json()
    slugs = [i["slug"] for i in items]
    assert "enfp-public0002" in slugs
    assert "intj-private0001" not in slugs
    assert all("generated_at" in i for i in items)
    # §4.3 · 公开清单透出 excerpt
    pub = next(i for i in items if i["slug"] == "enfp-public0002")
    assert pub["excerpt"] == "这是一段公开命题的摘录"


def test_issue_meta_carries_excerpt():
    """§4.3 · GET /issues/{slug} 透出 issue_excerpt（喂 meta description）。"""
    db_mod.reset_for_tests()
    _seed_completed_issue(
        slug="intj-excerpt001", public=False, token="t", excerpt="掌控权这件事的一段自审"
    )
    client = TestClient(create_app())

    meta = client.get("/issues/intj-excerpt001")
    assert meta.status_code == 200, meta.text
    assert meta.json()["excerpt"] == "掌控权这件事的一段自审"


def test_public_route_not_shadowed_by_slug():
    db_mod.reset_for_tests()
    client = TestClient(create_app())
    # /issues/public 必须命中 list 处理器，而非被当成 slug="public"
    r = client.get("/issues/public")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_publish_requires_owner_token():
    db_mod.reset_for_tests()
    _seed_completed_issue(slug="intj-tok00001", public=False, token="secret-token")
    client = TestClient(create_app())

    # 错误 token → 403，且不改状态
    bad = client.patch(
        "/issues/intj-tok00001/publish",
        json={"is_public": True, "owner_token": "nope"},
    )
    assert bad.status_code == 403, bad.text
    assert client.get("/issues/intj-tok00001").json()["is_public"] is False

    # 正确 token → 200 且翻转
    ok = client.patch(
        "/issues/intj-tok00001/publish",
        json={"is_public": True, "owner_token": "secret-token"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["is_public"] is True
