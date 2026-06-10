"""
FastAPI routes · 报告（Issue）访问。

Issue 是一封信收敛后由 LLM 生成的完整 HTML 报告——每个 MBTI 类型有完全独立
的视觉设计。访问模型是 capability-URL：slug 由 secrets 随机生成、收敛后只回给
本人，链接本身即访问凭证——不分享就没人知道，本人凭链接始终能看。

`issue_is_public` 不再是访问门，只表示「是否同意收录进未来的公开展示墙」。

提供：
- `GET /issues/{slug}`            · 元数据（JSON）
- `GET /issues/{slug}/render`     · 完整 HTML 文档，供前端 iframe 沙箱嵌入
- `PATCH /issues/{slug}/publish`  · 切换 issue_is_public（展示墙开关；compare_digest(owner_token) 鉴权）

鉴权模型：访问凭 slug（capability-URL）；翻转收录状态凭 owner_token（compare_digest 比对）。
letter_id 是 owner-only capability，仅 owner 浏览器持有，不出现在任何公开元数据里（Batch 0 / D-A）。
"""
from __future__ import annotations

import secrets
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_sessionmaker
from ..models import TestResult


router = APIRouter(prefix="/issues", tags=["issues"])


# 兜底归因页脚 · 渲染期幂等注入（详见 render_issue）。裸域名，靠 opacity 继承前景色。
ATTRIBUTION = (
    '<footer style="margin:48px 0 24px;text-align:center;'
    'font-family:ui-monospace,monospace;font-size:10px;letter-spacing:0.18em;'
    'opacity:0.45;">next.oriself.com</footer>'
)


def get_db():
    SessionLocal = get_sessionmaker()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


# letter_id 不出现在公开元数据：它是 owner capability（仅 owner 浏览器持有），见 Batch 0 / D-A。
class IssueResponse(BaseModel):
    slug: str
    title: str
    mbti_type: str
    is_public: bool
    created_at: datetime
    domain: str = "mbti"             # mbti | major
    result_label: Optional[str] = None  # major 方向标签；mbti 为 None
    excerpt: Optional[str] = None    # §4.3 · 报告纯文本摘录；存量旧行为 None


def _issue_domain(result) -> str:
    """从落库占位推断域：major 报告的 mbti_type 列写的是占位 "MAJOR"。"""
    return "major" if (result.mbti_type or "").upper() == "MAJOR" else "mbti"


class PublishRequest(BaseModel):
    is_public: bool
    owner_token: str


class PublicIssueItem(BaseModel):
    slug: str
    title: str
    mbti_type: str
    domain: str = "mbti"
    result_label: Optional[str] = None
    excerpt: Optional[str] = None    # §4.3 · 报告纯文本摘录；存量旧行为 None
    generated_at: datetime


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/public", response_model=list[PublicIssueItem])
def list_public_issues(db: Session = Depends(get_db)):
    """收录进公开展示墙的命题（issue_is_public=1 且有渲染内容）。喂 sitemap + 画廊。

    注意：必须声明在 `GET /{slug}` 之前，否则 `/public` 会被当成 slug 捕获（FastAPI 按
    声明顺序匹配路由）。
    """
    rows = (
        db.query(TestResult)
        .filter(TestResult.issue_is_public.is_(True))
        .filter(TestResult.issue_html.isnot(None))
        .order_by(TestResult.issue_generated_at.desc())
        .all()
    )
    return [
        PublicIssueItem(
            slug=r.issue_slug,
            title=r.issue_title or r.mbti_type,
            mbti_type=r.mbti_type,
            domain=_issue_domain(r),
            result_label=r.result_label,
            excerpt=r.issue_excerpt,
            generated_at=r.issue_generated_at or r.created_at,
        )
        for r in rows
    ]


@router.get("/{slug}", response_model=IssueResponse)
def get_issue(slug: str, db: Session = Depends(get_db)):
    """元数据。凭 slug 即可访问（capability-URL）。"""
    result = (
        db.query(TestResult)
        .filter(TestResult.issue_slug == slug)
        .first()
    )
    if result is None or not result.issue_html:
        raise HTTPException(status_code=404, detail="issue not found")
    return IssueResponse(
        slug=result.issue_slug,
        title=result.issue_title or result.mbti_type,
        mbti_type=result.mbti_type,
        is_public=result.issue_is_public,
        created_at=result.issue_generated_at or result.created_at,
        domain=_issue_domain(result),
        result_label=result.result_label,
        excerpt=result.issue_excerpt,
    )


@router.get("/{slug}/render")
def render_issue(slug: str, db: Session = Depends(get_db)):
    """
    完整 HTML 文档，供前端 iframe 嵌入。

    安全：LLM 生成的 HTML 不可信，必须通过 iframe sandbox 隔离。
    本端点返回 CSP sandbox 头，禁用 top-level navigation / forms / popups。
    """
    result = (
        db.query(TestResult)
        .filter(TestResult.issue_slug == slug)
        .first()
    )
    if result is None or not result.issue_html:
        return HTMLResponse(
            content="<!doctype html><title>404</title><h1>Issue not found</h1>",
            status_code=404,
        )

    # 关键：沙箱化 LLM 生成的 HTML
    headers = {
        "Content-Security-Policy": (
            "sandbox allow-scripts allow-same-origin; "
            "default-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com data:; "
            "img-src * data:; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' data: https://fonts.gstatic.com;"
        ),
        "X-Content-Type-Options": "nosniff",
    }

    # 渲染期幂等注入兜底归因页脚（结构性保证，活在代码里；品味/样式归 skill prompt）。
    # · 截图是主要传播媒介，页脚是截图里唯一的品牌面 → 必须在代码层保证它一定在。
    # · 用裸域名（不是完整 /issues/{slug} URL）：完整 URL 会把 capability-slug 烙进
    #   截图像素 = 等于把访问权发出去；且裸域名与 skill 的签名约定保持一致。
    # · 页脚靠 opacity 继承报告前景色，能融进任何审美。
    # · 正文已含域名时跳过注入——这是 skill 任务落地后新报告的预期路径（注入只服务
    #   历史报告）；正文恰巧含域名的报告也会跳过注入——这是可接受的边界。
    html = result.issue_html
    if "next.oriself.com" not in html:
        # 注入点 fallback 链：</body> → </html> → 裸 append
        # （guardrails 只强制 <html>...</html>，不强制 <body>）
        for anchor in ("</body>", "</html>"):
            if anchor in html:
                html = html.replace(anchor, ATTRIBUTION + anchor, 1)
                break
        else:
            html = html + ATTRIBUTION
    return HTMLResponse(content=html, headers=headers)


@router.patch("/{slug}/publish", response_model=IssueResponse)
def publish_issue(
    slug: str, req: PublishRequest, db: Session = Depends(get_db)
):
    """
    切换 issue_is_public（是否收录进未来的公开展示墙）。

    注意：这不影响访问——任何持有 slug 的人都能看 issue。此开关只决定将来
    展示墙是否列出它。鉴权：compare_digest 比对 converge 时下发的 owner_token，
    仅本人可翻转；owner_token 不出现在任何公开元数据里。
    """
    result = (
        db.query(TestResult)
        .filter(TestResult.issue_slug == slug)
        .first()
    )
    if result is None or not result.issue_html:
        raise HTTPException(status_code=404, detail="issue not found")
    # §5 · 鉴权：仅持有 converge 时下发的 owner_token 的本人可翻转收录状态。
    # compare_digest 防时序侧信道；旧库 token 为 NULL → 一律 403（无法公开）。
    if not result.issue_owner_token or not secrets.compare_digest(
        result.issue_owner_token, req.owner_token
    ):
        raise HTTPException(status_code=403, detail="not the owner of this issue")
    result.issue_is_public = req.is_public
    db.commit()
    db.refresh(result)
    return IssueResponse(
        slug=result.issue_slug,
        title=result.issue_title or result.mbti_type,
        mbti_type=result.mbti_type,
        is_public=result.issue_is_public,
        created_at=result.issue_generated_at or result.created_at,
        domain=_issue_domain(result),
        result_label=result.result_label,
        excerpt=result.issue_excerpt,
    )
