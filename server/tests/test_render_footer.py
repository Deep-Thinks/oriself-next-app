"""Task 2.4 · 渲染期幂等注入归因页脚（裸域名，结构性保证）。

截图是主要传播媒介，报告页脚是截图里唯一的品牌面。归因是结构性保证（活在
代码里），在 RENDER 时注入裸域名——不污染 LLM 原始产物、历史报告也自动受益。
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from oriself_server import database as db_mod
from oriself_server.database import session_scope
from oriself_server.main import create_app
from oriself_server.models import TestResult as ResultRow
from oriself_server.models import TestSession as SessionRow

# 复用 §5 公开收录测试里的 seed helper。
from tests.test_issues_public import _seed_completed_issue


def _seed_issue_with_html(slug: str, html: str) -> None:
    """直插一行带自定义 issue_html 的报告——用于覆盖无 </body>/</html> 的 fallback。"""
    with session_scope() as db:
        sess = SessionRow(provider="mock", domain="mbti", skill_version="test")
        db.add(sess)
        db.flush()
        db.add(
            ResultRow(
                session_id=sess.session_id,
                mbti_type="INTJ",
                issue_slug=slug,
                issue_title="自定义 HTML",
                issue_html=html,
                issue_is_public=False,
                issue_owner_token="tok",
                insight_json="{}",
                card_json="{}",
                confidence_json="{}",
            )
        )


def test_render_injects_attribution_footer_once():
    """Test A · issue_html 不含域名 → render 后正文恰好含一次 next.oriself.com。"""
    db_mod.reset_for_tests()
    # 默认 seed 的 html 是 <!doctype html><html><body>x</body></html>，不含域名。
    _seed_completed_issue(slug="intj-footer0001")
    client = TestClient(create_app())

    res = client.get("/issues/intj-footer0001/render")
    assert res.status_code == 200, res.text
    body = res.text
    assert "next.oriself.com" in body
    assert body.count("next.oriself.com") == 1, "归因页脚必须恰好注入一次"


def test_render_does_not_double_inject_when_domain_present():
    """Test B · issue_html 正文已含域名 → 不二次注入（仍只 1 次）。"""
    db_mod.reset_for_tests()
    _seed_issue_with_html(
        slug="intj-footer0002",
        html="<!doctype html><html><body>已经写了 next.oriself.com</body></html>",
    )
    client = TestClient(create_app())

    res = client.get("/issues/intj-footer0002/render")
    assert res.status_code == 200, res.text
    assert res.text.count("next.oriself.com") == 1, "正文已含域名时不得二次注入"


def test_render_footer_fallback_without_closing_tags():
    """Test C · 无 </body> 也无 </html> → 裸 append fallback，仍恰好一次。"""
    db_mod.reset_for_tests()
    # 注意：不能用默认 _seed_completed_issue（它的 html 有 </body>）。
    _seed_issue_with_html(
        slug="intj-footer0003",
        html="<!doctype html><main>x</main>",
    )
    client = TestClient(create_app())

    res = client.get("/issues/intj-footer0003/render")
    assert res.status_code == 200, res.text
    body = res.text
    assert "next.oriself.com" in body
    assert body.count("next.oriself.com") == 1, "裸 append fallback 也必须恰好一次"
    # fallback 走的是末尾追加，域名应出现在原始正文之后。
    assert body.index("next.oriself.com") > body.index("</main>")
