"""
FastAPI routes · 漏斗埋点（最薄版本）。

v2.7 设计原则（plan v0.3 §1.A-6）：
- 只埋"用户视角事件"，server 处理完成 round 这种已经有 logger.info 不再重复
- 8 个白名单事件，其他 event 一律 400 拒收（防垃圾埋点扩散）
- ip_hash sha256(salt + ip) 单向，不存原 IP；salt 走 ORISELF_ANALYTICS_IP_SALT
  环境变量。原始 sha256(ip) 不安全：IPv4 空间小，离线 rainbow table 反查成本低。
- props_json schema 不固定，allow event 自由附 letter_id / round / trigger 等
- 落到 analytics_events 表；不做 OLAP 处理，留给离线分析

事件清单：
    landing_enter_clicked       Landing「进入 →」点击
    letter_created              POST /letters 成功（前端 mount 时探测发出）
    round_reached               props: {round: int, letter_id}
    converge_clicked            props: {trigger: "manual"/"auto", letter_id}
    converge_result_success     props: {letter_id, issue_slug}
    converge_result_failed      props: {letter_id, reason?}
    issue_opened                props: {slug, letter_id?}
    arrival_dismissed           props: {trigger: "auto"/"keyboard"/"看信"/"复制地址", slug}
"""
from __future__ import annotations

import hashlib
import json
import os
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..database import get_sessionmaker
from ..models import AnalyticsEvent


# 防 IP rainbow-table 反查的 salt · 生产请通过 ORISELF_ANALYTICS_IP_SALT 设非默认值。
# 默认值仅作为开发兜底——任何能拿到代码的攻击者可绕过；prod 务必覆盖。
_IP_SALT = os.environ.get(
    "ORISELF_ANALYTICS_IP_SALT", "oriself-default-salt-CHANGE-IN-PROD"
)


router = APIRouter(prefix="/analytics", tags=["analytics"])


# 白名单 · 任何其他事件名直接 400 拒收
ALLOWED_EVENTS = {
    "landing_enter_clicked",
    "letter_created",
    "round_reached",
    "converge_clicked",
    "converge_result_success",
    "converge_result_failed",
    "issue_opened",
    "arrival_dismissed",
}


def get_db():
    SessionLocal = get_sessionmaker()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ip_hash(request: Request) -> Optional[str]:
    """sha256(salt + client_ip) · 不可逆，仅用于聚合同源事件 / 反垃圾。

    salt 防 IPv4 rainbow-table 反查；生产从 ORISELF_ANALYTICS_IP_SALT 注入。
    """
    if request.client is None:
        return None
    ip = request.client.host
    if not ip:
        return None
    return hashlib.sha256((_IP_SALT + ip).encode("utf-8")).hexdigest()


class EventPayload(BaseModel):
    event: str = Field(min_length=1, max_length=64)
    props: Optional[dict[str, Any]] = None
    session_id: Optional[str] = Field(default=None, max_length=36)

    @field_validator("event")
    @classmethod
    def _validate_event(cls, v: str) -> str:
        if v not in ALLOWED_EVENTS:
            raise ValueError(f"unknown event: {v!r}")
        return v


class EventResponse(BaseModel):
    ok: bool


@router.post("/event", response_model=EventResponse, status_code=201)
def record_event(
    payload: EventPayload,
    request: Request,
    db: Session = Depends(get_db),
):
    """记录一条埋点。失败不阻塞前端（前端 fetch 静默 try/catch）。"""
    # props_json size guard · 防爆表（10KB 上限够任何 8 个事件用）
    props_text: Optional[str] = None
    if payload.props is not None:
        props_text = json.dumps(payload.props, ensure_ascii=False)
        if len(props_text) > 10_000:
            raise HTTPException(status_code=400, detail="props 过大")

    evt = AnalyticsEvent(
        event=payload.event,
        props_json=props_text,
        session_id=payload.session_id,
        ip_hash=_ip_hash(request),
        user_agent=(request.headers.get("user-agent") or "")[:500],
    )
    db.add(evt)
    db.commit()
    return EventResponse(ok=True)
