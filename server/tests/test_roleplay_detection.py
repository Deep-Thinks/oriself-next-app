"""v2.6.1 · 测角色扮演 / 架空世界沉浸检测。

修复 ba29e5fc 事故的 prompt 端配套：用户在前 3 轮（或 opening_mood）出现
角色代入 / 架空世界沉浸时，CONVERGE 阶段在 meta_block 后追加提示，让 LLM
把这段叙事当作 S/N 维度里的 N 信号源，而不是当噪音清掉。

设计原则（plan §7.5 / Codex Round 2）：
- 实时扫 prompt 层，**不入库 flag**（避免 schema 迁移 / 撤回成本）
- 只扫前 3 个 live user_message + opening_mood
- 命中只提升注意力（在 prompt 里追加 hint block），不直接改判 N
"""
from __future__ import annotations

import pytest

from oriself_server.skill_runner import (
    SessionState,
    Turn,
    _detect_roleplay_in_session,
    _ROLEPLAY_HINT_BLOCK,
    _ROLEPLAY_RE,
)
from oriself_server.schemas import UserPreferences


def _make_session(
    user_messages: list[str],
    opening_mood: str | None = None,
) -> SessionState:
    """构造一个最小 SessionState 用于测试 detect。"""
    turns = [
        Turn(round_number=i + 1, user_message=msg)
        for i, msg in enumerate(user_messages)
    ]
    prefs = None
    if opening_mood:
        prefs = UserPreferences(opening_mood=opening_mood)
    return SessionState(
        session_id="test-session-xxxxxxxx",
        domain="mbti",
        turns=turns,
        user_preferences=prefs,
    )


# ---------------------------------------------------------------------------
# _ROLEPLAY_RE 正向匹配
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("text", [
    "幻想自己是主角从青茅山开始打通关",  # ba29e5fc 原话
    "幻想是异世界的修士",
    "如果我是钢铁侠",
    "我想当一名魔法师",
    "我要当主角",
    "我当魔法师",
    "我是蛊真人里的主角",
    "我是修真者",
    "我是玄幻小说里的人物",
    "我是游戏玩家",
    "我是穿越者",
    "代入主角视角",
    "代入",
    "从青茅山开始打通关",
    "从第一关开始通关",
    # codex review 追加（v2.6.1 扩展关键词）
    "我想扮演主角",
    "我们扮演一下",
    "异世界穿越后",
    "这个世界观很有意思",
    "带入角色后我会..",
    "成为这个游戏的主角",
    "成为英雄",
])
def test_re_matches_roleplay_phrases(text: str):
    """正向 case：典型角色代入 / 架空叙事都应被检测到。"""
    assert _ROLEPLAY_RE.search(text) is not None, f"应命中但没命中：{text!r}"


@pytest.mark.parametrize("text", [
    "今天上班好累",
    "我妈又打电话来问什么时候回家",
    "凌晨三点还在追一个 bug",
    "想换工作但没下定决心",
    "刚跑完步坐在公园长椅上",
    "吃了顿火锅但同事吵了一架",
    "周末去看了电影",
    # codex review 追加：工作语境角色不应被误判
    "假设我是公司 CEO",
    "假设我是这个项目的负责人",
    "假设我是面试官",
    "假设我是 PM",
    "我当 leader 之后压力很大",
    "我想当 manager",
    "我想当主持人",
    "我要当组长",
    "如果我是这个团队的 leader",
    "我是产品经理",
    "我是项目负责人",
])
def test_re_does_not_match_normal_life(text: str):
    """负向 case：日常生活叙事 + 工作语境角色不应被误判。"""
    assert _ROLEPLAY_RE.search(text) is None, f"误命中：{text!r}"


# ---------------------------------------------------------------------------
# _detect_roleplay_in_session
# ---------------------------------------------------------------------------


def test_detects_in_first_3_user_messages():
    session = _make_session([
        "幻想自己是主角",
        "继续聊",
        "再继续",
    ])
    assert _detect_roleplay_in_session(session) is True


def test_detects_only_in_round_1():
    session = _make_session([
        "幻想自己是修真者",
        "今天上班好累",
        "想换工作",
    ])
    assert _detect_roleplay_in_session(session) is True


def test_detects_only_in_round_3():
    session = _make_session([
        "今天上班好累",
        "我妈打电话",
        "我想当魔法师",  # R3
    ])
    assert _detect_roleplay_in_session(session) is True


def test_does_not_detect_at_round_4():
    """只扫前 3 轮：第 4 轮才出现角色叙事不命中（按设计）。"""
    session = _make_session([
        "今天上班",
        "去看电影",
        "好累",
        "我是蛊真人里的主角",  # R4
    ])
    assert _detect_roleplay_in_session(session) is False


def test_detects_in_opening_mood():
    """opening_mood（用户在 R2 输入的偏好）是 ba29e5fc 真实命中路径。"""
    session = _make_session(
        user_messages=["你好"],
        opening_mood="幻想自己是主角从青茅山开始打通关",
    )
    assert _detect_roleplay_in_session(session) is True


def test_no_match_no_session_pref():
    """无角色叙事 + 无 opening_mood → False。"""
    session = _make_session([
        "最近在想换工作的事",
        "我妈一直催我",
        "工作上和老板意见不合",
    ])
    assert _detect_roleplay_in_session(session) is False


def test_empty_session():
    """新建空 session（无 turns / 无 prefs）→ False。"""
    session = _make_session(user_messages=[])
    assert _detect_roleplay_in_session(session) is False


def test_discarded_turns_not_counted():
    """discarded turn 不算（live_turns 自动跳过）。"""
    t1 = Turn(round_number=1, user_message="幻想自己是主角", discarded=True)
    t2 = Turn(round_number=1, user_message="今天上班好累", discarded=False)
    session = SessionState(
        session_id="x" * 8,
        domain="mbti",
        turns=[t1, t2],
    )
    # t1 被 discard，live_turns 只剩 t2 → 不命中
    assert _detect_roleplay_in_session(session) is False


# ---------------------------------------------------------------------------
# _build_converge_messages 集成
# ---------------------------------------------------------------------------


def test_converge_messages_includes_hint_when_roleplay():
    """命中角色扮演时，meta_block 后应追加 _ROLEPLAY_HINT_BLOCK。"""
    from oriself_server.llm_client import MockBackend
    from oriself_server.skill_runner import ReportRunner

    backend = MockBackend()
    runner = ReportRunner(backend=backend)
    session = _make_session(
        user_messages=["幻想自己是主角从青茅山开始打通关", "继续聊", "再聊"],
    )
    msgs = runner._build_converge_messages(session)
    # 第二条 message 是 meta_block + transcript
    user_content = msgs[1].content
    assert "角色 / 架空叙事提示" in user_content
    assert "N 信号源" in user_content
    assert "ba29e5fc" in user_content  # hint block 里引用了根因案例


def test_converge_messages_no_hint_when_normal():
    """无角色叙事时，meta_block 后不应有 hint block。"""
    from oriself_server.llm_client import MockBackend
    from oriself_server.skill_runner import ReportRunner

    backend = MockBackend()
    runner = ReportRunner(backend=backend)
    session = _make_session(
        user_messages=["今天上班好累", "想换工作", "和老板吵架"],
    )
    msgs = runner._build_converge_messages(session)
    user_content = msgs[1].content
    assert "角色 / 架空叙事提示" not in user_content


def test_converge_messages_includes_hint_for_opening_mood_only():
    """user_message 都是日常叙事，但 opening_mood 是角色代入 → 应命中。"""
    from oriself_server.llm_client import MockBackend
    from oriself_server.skill_runner import ReportRunner

    backend = MockBackend()
    runner = ReportRunner(backend=backend)
    session = _make_session(
        user_messages=["最近压力大", "睡不着", "心情不好"],
        opening_mood="幻想自己是修真者",
    )
    msgs = runner._build_converge_messages(session)
    assert "角色 / 架空叙事提示" in msgs[1].content
