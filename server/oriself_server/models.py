"""
SQLAlchemy ORM 模型 · v2.4。

变化（vs v2.3）：
- `Conversation` 表砍三分之二：删 action_json / action_type / dimension_targeted
  / turn_state / retry_count；新增 oriself_text / raw_stream / status_sentinel
  / discarded
- `EvidenceRecord` 表**删除**（v2.4 不再逐轮抽 evidence）
- `TestSession.skill_version` 默认 "2.4.0"
- `TestResult` 基本保留（报告落库）
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TestSession(Base):
    __tablename__ = "test_sessions"

    session_id = Column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    provider = Column(String(20), nullable=False)
    domain = Column(String(20), nullable=False, default="mbti")
    # 实际版本在建 letter 时由 SKILL.md frontmatter 写入（见 routes/letters.create_letter）；
    # 这个 default 只是兜底，不该再当真值用。
    skill_version = Column(String(16), nullable=False, default="unknown")
    status = Column(String(20), default="active")  # active | completed | failed
    # v2.4 · 收敛 prompt 需要的偏好信息；R2 服务端解析后写入
    prefs_json = Column(Text)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    conversations = relationship(
        "Conversation", back_populates="session", cascade="all, delete-orphan"
    )
    result = relationship(
        "TestResult", back_populates="session", uselist=False, cascade="all, delete-orphan"
    )


class Conversation(Base):
    """一轮对话的持久化形态。

    v2.4：
    - `oriself_text` · LLM 输出去除 STATUS 行后的可见文本
    - `raw_stream` · 完整原文（含 STATUS），审计用
    - `status_sentinel` · CONTINUE / CONVERGE / NEED_USER
    - `discarded` · 用户点「重写这轮」后旧轮标 true；不进 transcript
    """
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(
        String(36), ForeignKey("test_sessions.session_id"), nullable=False
    )
    round_number = Column(Integer, nullable=False)
    user_message = Column(Text, nullable=False)
    oriself_text = Column(Text, nullable=False, default="")
    raw_stream = Column(Text)
    status_sentinel = Column(String(16), default="CONTINUE")
    discarded = Column(Boolean, default=False, nullable=False)
    # v3.1 · 本轮 LLM 自评的"画像清晰度" [0,1]（从末尾 `CLARITY:` 哨兵抽出）。
    # 存原始每轮值；前端顶栏进度条按会话 running-max 单调展示。缺失为 NULL。
    clarity = Column(Float, nullable=True)
    # v2.5.3 · 本轮展示给用户的 Oriself 笔触（JSON 数组：["Oriself 想多问一些", ...]）。
    # 永久留在回看页上，和 oriself_text 一起构成这一轮的完整呈现。
    quill_json = Column(Text, nullable=True)
    # v2.6 · 真模型按需加载（Phase D · tool-use loop） · 7 个 trace 字段。
    # 静态模式（ORISELF_SKILL_LOADING=static）下这些列为 NULL。on-demand 模式下：
    # - tool_calls_json: Pass 1 LLM 调用清单原文（含 raw_arguments / parse error）
    # - loaded_skill_names: 实际加载的 skill 名字数组（去重过滤后），JSON array
    # - pass1_violations_json: 6 项校验里命中的 [{kind, detail}, ...]
    # - chosen_phase_key: LLM 这一轮选了哪个 phase
    # - phase_match_rn: 是否与 v2.5 choose_phase_key 推算结果一致（仅观测）
    # - skill_loader_mode: "static" / "on-demand"
    # - model: 配合 sess.provider 一起做 benchmark 复盘用
    tool_calls_json = Column(Text, nullable=True)
    loaded_skill_names = Column(Text, nullable=True)
    pass1_violations_json = Column(Text, nullable=True)
    chosen_phase_key = Column(String(32), nullable=True)
    phase_match_rn = Column(Boolean, nullable=True)
    skill_loader_mode = Column(String(16), nullable=True)
    model = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    session = relationship("TestSession", back_populates="conversations")

    __table_args__ = (
        # 同一 (session_id, round_number) 允许：
        #   · 最多一条 active（discarded=False）—— 由 `_persist_turn` 在应用层去重
        #   · 任意条 discarded（每次用户点「重写」都会产生一条）
        # 过去这里有 UniqueConstraint(session_id, round_number, discarded)，
        # 但它把"任意条 discarded"也限成了一条 → 第二次重写同一轮时触发
        # IntegrityError → 500。应用层检查已经够，DB 层不再兜底。
        Index("ix_conv_session_round_desc", "session_id", "round_number"),
        Index("ix_conv_session_status", "session_id", "status_sentinel"),
    )


class TestResult(Base):
    __tablename__ = "test_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(
        String(36),
        ForeignKey("test_sessions.session_id"),
        unique=True,
        nullable=False,
    )
    mbti_type = Column(String(8), nullable=False)
    # major 域的方向标签（如"认知科学这一类"）；mbti 域为 NULL。
    # major 报告无四字母，mbti_type 列写占位 "MAJOR"，真实方向放这里。
    result_label = Column(String(64), nullable=True)
    # v2.5.2 起 converge 不再产生结构化 insight/card/confidence（LLM 直吐 HTML）。
    # 保留列以便读取旧数据；新写入时全为 NULL。
    insight_json = Column(Text, nullable=True)        # 3 段洞见序列化（废弃）
    card_json = Column(Text, nullable=True)           # 名片结构化数据（废弃）
    confidence_json = Column(Text, nullable=True)     # confidence_per_dim 序列化（废弃）

    # Issue · 可分享报告（v2.2+）
    issue_slug = Column(String(32), unique=True, index=True)
    issue_title = Column(String(200))
    issue_html = Column(Text)
    issue_is_public = Column(Boolean, default=False, nullable=False)
    issue_generated_at = Column(DateTime)

    created_at = Column(DateTime, default=_utcnow)

    session = relationship("TestSession", back_populates="result")


class Feedback(Base):
    __tablename__ = "feedbacks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    letter_id = Column(String(36), ForeignKey("test_sessions.session_id"), nullable=True)
    issue_slug = Column(String(32), nullable=True, index=True)

    rating = Column(Integer, nullable=True)
    text = Column(Text, nullable=False)
    contact = Column(String(200), nullable=True)
    user_agent = Column(String(500), nullable=True)

    created_at = Column(DateTime, default=_utcnow, index=True)

    __table_args__ = (
        Index("ix_feedback_letter", "letter_id"),
    )


class AnalyticsEvent(Base):
    """v2.7 · 最薄漏斗埋点。

    设计原则（plan v0.3 §1.A-6）：
    - 只埋"用户视角事件"，不埋"server 视角处理完成"——避开 v2.6.1 logger.info 重复
    - ip_hash 不存原 IP，单向 sha256（隐私 + 反作弊）
    - props_json 字段不强 schema，允许各 event 自由附 letter_id / round / trigger 等
    - 不做查询优化（没有 unique constraint / 复合索引）——这是 v2.7 的最简版，
      若埋点量起来再考虑物化视图 / clickhouse 迁移
    """

    __tablename__ = "analytics_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event = Column(String(64), nullable=False, index=True)
    # props_json: JSON 字符串，每个 event 自由扩展（letter_id / round / trigger / slug 等）
    props_json = Column(Text, nullable=True)
    # session_id 可选 · 关联到 test_sessions（漏斗按 letter 维度聚合时用）
    session_id = Column(
        String(36), ForeignKey("test_sessions.session_id"), nullable=True
    )
    ip_hash = Column(String(64), nullable=True, index=True)
    user_agent = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=_utcnow, index=True)

    __table_args__ = (
        Index("ix_analytics_event_created", "event", "created_at"),
        Index("ix_analytics_session", "session_id"),
    )
