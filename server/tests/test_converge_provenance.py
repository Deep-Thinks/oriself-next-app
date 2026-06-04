"""v2.6.4 · 守卫 #3 · converge 输入端证据来源治理（ba29e5fc 防固化）。

不是运行时内容过滤器：只断言 converge 的 transcript 把"用户原话(一手证据)"和
"oriself 自己的提问/镜面(非事实)"明确分开标注，并注入正向来源约定 framing。
模型自己写过的盖章断言原文**仍保留**在输入里（不删词），只是被降权标注——
确认我们改的是"该把谁当证据"，而不是"谁能说什么词"。
"""
from __future__ import annotations

from oriself_server.llm_client import make_backend
from oriself_server.skill_runner import ReportRunner, SessionState, Turn


def _session_with_assertion() -> SessionState:
    """复刻 ba29e5fc 形态：oriself 早轮写了盖章式断言，用户原话其实指向别处。"""
    return SessionState(
        session_id="ba29e5fc-test-0001",
        domain="mbti",
        turns=[
            Turn(
                round_number=1,
                user_message="最近在追一部修真小说，停不下来",
                oriself_text="你听起来是个很理性、很 INTJ 的人。",  # 模型自己的盖章断言
            ),
            Turn(
                round_number=2,
                user_message="对啊我能给你讲三天那个蛊界的设定",
                oriself_text="那一刻你在哪？",
            ),
        ],
    )


def test_converge_transcript_labels_provenance():
    rr = ReportRunner(backend=make_backend("mock"))
    msgs = rr._build_converge_messages(_session_with_assertion())
    user_msg = next(m for m in msgs if m.role == "user")
    body = user_msg.content

    # 用户行标成一手证据
    assert "用户原话（一手证据）" in body
    # oriself 行标成"非事实"
    assert "不是关于 TA 的事实" in body
    # 正向来源约定 framing 注入
    assert "证据来源约定" in body
    assert "判型只用" in body
    # 模型自己写的盖章断言原文仍在（不删词，只是被降权标注）
    assert "很 INTJ 的人" in body


def test_provenance_framing_in_user_message_not_system():
    """framing 拼进 user message，不碰 system 段（保 cache_breakpoint 命中）。"""
    rr = ReportRunner(backend=make_backend("mock"))
    msgs = rr._build_converge_messages(_session_with_assertion())
    system_msg = next(m for m in msgs if m.role == "system")
    assert "证据来源约定" not in system_msg.content
    assert system_msg.cache_breakpoint is True
