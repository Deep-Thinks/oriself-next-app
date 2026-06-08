"""v2.4 smoke tests · 保证核心 happy path 不炸。"""
from __future__ import annotations

import asyncio
import os
import uuid

import pytest

from oriself_server.guardrails import (
    parse_status_sentinel,
    verify_report_html_consistency,
    verify_report_html_shape,
)
from oriself_server.llm_client import PROVIDER_PRESETS, Message, make_backend
from oriself_server.schemas import ConvergeOutput, UserPreferences
from oriself_server.skill_loader import load_skill_bundle
from oriself_server.skill_runner import (
    ReportRunner,
    SessionState,
    TurnRunner,
    advance_state,
    choose_phase_key,
)


# ---------------------------------------------------------------------------
# provider preset · 缓存死区防回归（v3.1.2）
# ---------------------------------------------------------------------------


def test_gemini_default_model_avoids_cache_deadzone():
    """env 未设时的 gemini 默认模型必须避开隐式缓存死区。

    实测 gemini-3.5-flash 在 prompt ≥8k token 时 Gemini 隐式缓存断崖归零
    （本应用每轮均值 ~10k 正中死区）；gemini-3-flash-preview 无此死区。
    若未来有人把 default 改回 *-3.5-flash，这条断言会拦住。
    """
    preset = PROVIDER_PRESETS["gemini"]
    assert preset["default_model"] == "gemini-3-flash-preview"
    assert "3.5-flash" not in preset["default_model"]


def test_gemini_model_env_overrides_default(monkeypatch):
    """`ORISELF_GEMINI_MODEL` 必须优先于 default_model（env 优先语义不被 preset 重构改坏）。"""
    preset = PROVIDER_PRESETS["gemini"]
    monkeypatch.delenv("ORISELF_GEMINI_MODEL", raising=False)
    assert (
        os.environ.get(preset["model_env"], preset["default_model"])
        == "gemini-3-flash-preview"
    )
    monkeypatch.setenv("ORISELF_GEMINI_MODEL", "some-other-model")
    assert os.environ.get(preset["model_env"], preset["default_model"]) == "some-other-model"


# ---------------------------------------------------------------------------
# STATUS sentinel
# ---------------------------------------------------------------------------


def test_status_parse_basic():
    p = parse_status_sentinel("你好\n\nSTATUS: CONTINUE")
    assert p.status == "CONTINUE"
    assert p.status_explicit is True
    assert p.visible_text == "你好"


def test_status_parse_converge():
    p = parse_status_sentinel("结束吧\nSTATUS: CONVERGE\n")
    assert p.status == "CONVERGE"
    assert p.visible_text == "结束吧"


def test_status_parse_missing_defaults_continue():
    p = parse_status_sentinel("没写 status 行")
    assert p.status == "CONTINUE"
    assert p.status_explicit is False


def test_status_lowercase_not_recognized():
    p = parse_status_sentinel("正文\nstatus: continue")
    assert p.status == "CONTINUE"
    assert p.status_explicit is False


def test_status_only_yields_empty_visible():
    # 守卫 #1 契约：整段只有 STATUS 行 → 剥除后 visible 为空。
    # routes/letters.py 据此发 ORISELF_EMPTY_REPLY、不入库、round 不进。
    p = parse_status_sentinel("STATUS: CONTINUE")
    assert p.status == "CONTINUE"
    assert p.visible_text.strip() == ""


def test_status_only_with_blank_lines_yields_empty_visible():
    p = parse_status_sentinel("\n\nSTATUS: CONVERGE\n")
    assert p.visible_text.strip() == ""


# ---------------------------------------------------------------------------
# CLARITY sentinel（v3.1 · 顶栏进度条自评信号）
# ---------------------------------------------------------------------------


def test_clarity_parse_basic():
    p = parse_status_sentinel("你好，最近怎么样？\n\nCLARITY: 0.62\nSTATUS: CONTINUE")
    assert p.status == "CONTINUE"
    assert p.clarity == 0.62
    # 两行哨兵都被剥除，可见文本干净
    assert "CLARITY" not in p.visible_text
    assert "STATUS" not in p.visible_text
    assert p.visible_text == "你好，最近怎么样？"


def test_clarity_missing_is_none():
    p = parse_status_sentinel("只有 status\nSTATUS: CONTINUE")
    assert p.clarity is None


def test_clarity_percent_normalized():
    # 模型偶发写成百分数 → 归一到 [0,1]
    p = parse_status_sentinel("正文?\nCLARITY: 62%\nSTATUS: CONVERGE")
    assert p.clarity == 0.62
    p2 = parse_status_sentinel("正文?\nCLARITY: 88\nSTATUS: CONTINUE")
    assert p2.clarity == 0.88


def test_clarity_clamped_and_zero():
    p = parse_status_sentinel("q?\nCLARITY: 0\nSTATUS: NEED_USER")
    assert p.clarity == 0.0


def test_clarity_only_still_empty_visible():
    # 守卫契约：仅剩 CLARITY + STATUS 两行机器哨兵 → visible 必须为空，
    # 否则空回复护栏会被绕过、前端渲染空气泡。
    p = parse_status_sentinel("CLARITY: 0.5\nSTATUS: CONTINUE")
    assert p.visible_text.strip() == ""


def test_clarity_invalid_value_line_still_stripped():
    # codex 复审 P1 · 脏值（解析不出数字）也必须从 visible 剥除，
    # 否则机器哨兵会泄漏给用户、并绕过空回复护栏。
    for junk in ("abc", "high"):
        p = parse_status_sentinel(f"正文?\nCLARITY: {junk}\nSTATUS: CONTINUE")
        assert "CLARITY" not in p.visible_text, junk
        assert p.visible_text == "正文?", junk
        assert p.clarity is None, junk
    # 负值 clamp 到 0；科学计数法正常解析
    assert parse_status_sentinel("q?\nCLARITY: -0.2\nSTATUS: CONTINUE").clarity == 0.0
    assert parse_status_sentinel("q?\nCLARITY: 1e-1\nSTATUS: CONTINUE").clarity == 0.1


def test_clarity_running_max_includes_discarded_after_rewrite():
    """codex 复审 P1 · 重写后水位不回落：MAX 算上 discarded 轮。"""
    from fastapi.testclient import TestClient
    from oriself_server import database as db_mod
    from oriself_server.main import create_app

    db_mod.reset_for_tests()
    client = TestClient(create_app())
    lid = client.post("/letters", json={"provider": "mock", "domain": "mbti"}).json()[
        "letter_id"
    ]
    for i in range(4):
        client.post(f"/letters/{lid}/turn", json={"user_message": f"第 {i+1} 轮"})
    before = client.get(f"/letters/{lid}/state").json()["clarity_max"]
    assert before is not None and before > 0
    # 重写第 4 轮：旧轮被 discard、新轮重生。即便新轮 clarity 更低，水位也不能回落。
    client.post(f"/letters/{lid}/turn/rewrite", json={})
    after = client.get(f"/letters/{lid}/state").json()["clarity_max"]
    assert after >= before, f"重写后水位回落了：{before} → {after}"


# ---------------------------------------------------------------------------
# Guardrails · report_html
# ---------------------------------------------------------------------------


def test_html_shape_rejects_script():
    r = verify_report_html_shape("<html><body><script>alert(1)</script></body></html>")
    assert not r.passed
    assert any("script" in reason.lower() for reason in r.reasons)


def test_html_shape_rejects_event_handler():
    r = verify_report_html_shape('<html><body><div onclick="evil()">x</div></body></html>')
    assert not r.passed


def test_html_shape_accepts_clean():
    r = verify_report_html_shape(
        "<!DOCTYPE html><html><body><p>clean</p></body></html>"
    )
    assert r.passed


def test_html_consistency_mismatch():
    html = "<html><title>INFJ</title><body>The INFP one</body></html>"
    r = verify_report_html_consistency(html, "INFJ")
    assert not r.passed


def test_html_consistency_ok():
    html = "<html><title>INFJ</title><body>INFJ consistent</body></html>"
    r = verify_report_html_consistency(html, "INFJ")
    assert r.passed


# ---------------------------------------------------------------------------
# Phase picker
# ---------------------------------------------------------------------------


def test_phase_r1_onboarding():
    s = SessionState(session_id="x", domain="mbti")
    # v2.5.0 · phase 命名去掉数字前缀
    assert choose_phase_key(s, 1) == "phase-onboarding"


def test_phase_midpoint():
    prefs = UserPreferences(target_rounds=20)
    s = SessionState(session_id="x", domain="mbti", user_preferences=prefs)
    assert choose_phase_key(s, 10) == "phase-midpoint"


def test_phase_soft_closing():
    prefs = UserPreferences(target_rounds=20)
    s = SessionState(session_id="x", domain="mbti", user_preferences=prefs)
    assert choose_phase_key(s, 18) == "phase-soft-closing"


# ---------------------------------------------------------------------------
# Mock stream + compose end-to-end
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mock_stream_turn_emits_status():
    backend = make_backend("mock")
    bundle = load_skill_bundle()
    runner = TurnRunner(backend=backend, bundle=bundle)
    session = SessionState(session_id=str(uuid.uuid4()), domain="mbti")

    status = "?"
    visible = ""
    async for kind, payload in runner.stream_turn(session, "嗨"):
        if kind == "status":
            status = payload
        elif kind == "visible":
            visible = payload

    assert status in ("CONTINUE", "CONVERGE", "NEED_USER")
    assert visible
    assert "STATUS" not in visible  # sentinel 已剥


@pytest.mark.asyncio
async def test_mock_compose_report():
    backend = make_backend("mock")
    bundle = load_skill_bundle()
    runner = TurnRunner(backend=backend, bundle=bundle)
    reporter = ReportRunner(backend=backend, bundle=bundle)
    session = SessionState(session_id=str(uuid.uuid4()), domain="mbti")

    # 跑 3 轮
    for i in range(3):
        visible = ""
        status = "CONTINUE"
        async for kind, payload in runner.stream_turn(session, f"第 {i+1} 轮用户回复"):
            if kind == "visible":
                visible = payload
            elif kind == "status":
                status = payload
        session = advance_state(session, f"第 {i+1} 轮用户回复", visible, status)

    result = await reporter.compose(session)
    assert result.output is not None
    assert result.output.mbti_type
    assert len(result.output.report_html) >= 1000
    assert result.output.mbti_type in result.output.report_html


# ---------------------------------------------------------------------------
# CLARITY · 端到端（migration + done 帧 running-max + state 回灌）· v3.1
# ---------------------------------------------------------------------------


def _sse_done(sse_text: str):
    """从 SSE 文本里抽 `event: done` 的整个 data dict。"""
    import json as _json

    blocks = sse_text.split("\n\n")
    for b in blocks:
        if "event: done" in b:
            for line in b.splitlines():
                if line.startswith("data:"):
                    return _json.loads(line[len("data:"):].strip())
    return {}


def test_clarity_progress_journey_paced():
    """v3.1 纠偏 · 进度条显示值按 ~20 轮旅程铺，clarity 只调速、不主导。"""
    from oriself_server.routes.letters import _clarity_progress

    # 第 6 轮（target 20）≈ 30%，不是纯 clarity 那种 50%+
    p6 = _clarity_progress(6, 0.5, 20)
    p10 = _clarity_progress(10, 0.5, 20)
    p20 = _clarity_progress(20, 0.9, 20)
    assert 0.20 <= p6 <= 0.35, p6
    assert 0.40 <= p10 <= 0.55, p10   # 中期 ≈ 一半
    assert p20 >= 0.85, p20           # 接近满
    # 早熟保护：第 7 轮即便 clarity 飙到 0.95，也远没满（旅程封顶）
    assert _clarity_progress(7, 0.95, 20) < 0.40
    # round 0（建了信封没发消息）→ None（隐藏）
    assert _clarity_progress(0, 0.5, 20) is None
    # 单调：同 clarity 下轮数越大进度越大；同轮下 clarity 越大进度越大（调速）
    assert _clarity_progress(8, 0.5, 20) > _clarity_progress(6, 0.5, 20)
    assert _clarity_progress(6, 0.8, 20) > _clarity_progress(6, 0.2, 20)


def test_major_progress_uses_shorter_target():
    """v3.1 修正 · 进度条 target 与对话/phase 逻辑一致：major(默认~15) 进度比 mbti(20) 快。

    回归此前 bug：routes 用 effective_target_rounds(恒 20) 算 progress，major 进度条按
    20 轮铺、系统性低估、永远到不了 80%（实测两个 major 画像收束在 R13 时进度条才 ~0.62）。
    修复后用 _effective_target_for_session（含 D11：major 未显式设 target ⇒ 15）。
    """
    from fastapi.testclient import TestClient
    from oriself_server import database as db_mod
    from oriself_server.main import create_app

    db_mod.reset_for_tests()
    client = TestClient(create_app())

    def progress_at_round4(domain):
        lid = client.post(
            "/letters", json={"provider": "mock", "domain": domain}
        ).json()["letter_id"]
        p = None
        for i in range(4):
            resp = client.post(
                f"/letters/{lid}/turn", json={"user_message": f"第 {i+1} 轮"}
            )
            p = _sse_done(resp.text)["progress"]
        return p

    # mock 按轮号给 clarity（两域同轮同 clarity），唯一差异是 target ⇒ 旅程分数
    p_major = progress_at_round4("major")
    p_mbti = progress_at_round4("mbti")
    assert p_major > p_mbti, (
        f"major({p_major}) 进度应快于 mbti({p_mbti})——major target 15 < mbti 20；"
        "若相等说明 routes 又回退成了恒定 target"
    )


def test_conversations_has_clarity_column():
    from oriself_server import database as db_mod
    from sqlalchemy import inspect as sa_inspect

    db_mod.reset_for_tests()
    cols = {c["name"] for c in sa_inspect(db_mod.get_engine()).get_columns("conversations")}
    assert "clarity" in cols


def test_legacy_db_gets_clarity_via_init():
    """老库（无 clarity 列）跑 init_db 后应被加列。"""
    from oriself_server import database as db_mod
    from sqlalchemy import inspect as sa_inspect

    db_mod.reset_for_tests()
    eng = db_mod.get_engine()
    with eng.begin() as conn:
        conn.exec_driver_sql("ALTER TABLE conversations DROP COLUMN clarity")
        cols = {r[1] for r in conn.exec_driver_sql("PRAGMA table_info(conversations)").fetchall()}
        assert "clarity" not in cols
    db_mod.init_db()
    cols2 = {c["name"] for c in sa_inspect(eng).get_columns("conversations")}
    assert "clarity" in cols2


@pytest.mark.parametrize("domain", ["mbti", "major"])
def test_clarity_running_max_monotonic_e2e(domain):
    """两域都验：done 帧 clarity / progress 单调非降、∈[0,1]；state 回灌一致；
    且 progress 因旅程封顶明显低于同轮的 clarity（不会早熟饱和）。"""
    from fastapi.testclient import TestClient
    from oriself_server import database as db_mod
    from oriself_server.main import create_app

    db_mod.reset_for_tests()
    client = TestClient(create_app())
    r = client.post("/letters", json={"provider": "mock", "domain": domain})
    assert r.status_code == 200, r.text
    lid = r.json()["letter_id"]

    clar, prog = [], []
    for i in range(4):
        resp = client.post(f"/letters/{lid}/turn", json={"user_message": f"第 {i+1} 轮"})
        assert resp.status_code == 200, resp.text
        d = _sse_done(resp.text)
        assert d.get("clarity") is not None, f"done 缺 clarity（{domain} 轮 {i+1}）"
        assert d.get("progress") is not None, f"done 缺 progress（{domain} 轮 {i+1}）"
        assert 0.0 <= d["clarity"] <= 1.0 and 0.0 <= d["progress"] <= 1.0
        clar.append(d["clarity"])
        prog.append(d["progress"])

    assert clar == sorted(clar), f"clarity 不单调：{clar}"
    assert prog == sorted(prog), f"progress 不单调：{prog}"
    # 旅程封顶：第 4 轮（4/20）progress 应明显低于同轮 clarity，证明没有早熟饱和
    assert prog[-1] < clar[-1], f"progress({prog[-1]}) 没被旅程压住 vs clarity({clar[-1]})"
    s = client.get(f"/letters/{lid}/state").json()
    assert abs(s["clarity_max"] - clar[-1]) < 1e-9
    assert abs(s["progress"] - prog[-1]) < 1e-9
