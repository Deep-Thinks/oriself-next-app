"""major 域 · 管道测试（loader 域过滤 / converge 分支 / compose / schema / DB / e2e）。"""
from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy import inspect as sa_inspect

from oriself_server import database as db_mod
from oriself_server.skill_loader import clear_cache, load_skill_bundle
from oriself_server.skill_runner import (
    ReportRunner,
    SessionState,
    Turn,
    choose_phase_key,
)
from oriself_server.schemas import MajorConvergeOutput, UserPreferences

SKILL_ROOT = (
    Path(__file__).resolve().parent.parent.parent / "skill-repo" / "skills" / "oriself"
)


def setup_function(_):
    clear_cache()


def _mk_state(domain: str, turns=None) -> SessionState:
    return SessionState(
        session_id="t",
        domain=domain,
        turns=turns if turns is not None else [],
        user_preferences=UserPreferences(),
    )


# --------------------------------------------------------------------------- loader

def test_major_files_loaded():
    b = load_skill_bundle(SKILL_ROOT)
    assert "major" in b.domain_md
    for key in (
        "major-onboarding", "major-warmup", "major-exploring",
        "major-midpoint", "major-deep", "major-soft-closing",
    ):
        assert key in b.refs, f"missing {key}"
        assert b.refs[key].body.strip(), f"{key} empty"
        assert b.refs[key].meta.get("domain") == "major"
    assert "converge-major" in b.refs


def test_converge_major_selected_by_domain():
    b = load_skill_bundle(SKILL_ROOT)
    p_major = b.compose_converge_prompt(domain="major")
    p_mbti = b.compose_converge_prompt(domain="mbti")
    assert "专业方向报告" in p_major
    assert "Domain · major" in p_major
    assert "专业方向报告" not in p_mbti
    assert "Domain · mbti" in p_mbti


def test_catalogue_domain_scoped():
    b = load_skill_bundle(SKILL_ROOT)
    major = b.list_all_names("major")
    mbti = b.list_all_names("mbti")
    assert "major-deep" in major and "phase-deep" not in major
    # v3.1：domain 不再是可选 catalogue 项（改为每轮硬注入）
    assert "major" not in major and "mbti" not in major
    assert "situational-questions" in major  # 共享 technique
    assert "exemplary-session" not in major  # mbti 专属示例不漏给 major
    assert "phase-deep" in mbti and "major-deep" not in mbti
    assert "mbti" not in mbti and "major" not in mbti
    # 无参 = 全集（向后兼容）
    alln = b.list_all_names()
    assert "phase-deep" in alln and "major-deep" in alln
    assert "mbti" not in alln and "major" not in alln  # domain 不进 catalogue
    # Skill Index 也按域过滤；domain 组不再出现
    idx = b.build_skill_index_block("major")
    assert "major-deep" in idx and "phase-deep" not in idx
    assert "## domains" not in idx


def test_choose_phase_key_domain_aware():
    mbti = _mk_state("mbti")
    major = _mk_state("major")
    assert choose_phase_key(mbti, 1) == "phase-onboarding"
    assert choose_phase_key(major, 1) == "major-onboarding"
    assert choose_phase_key(major, 2) == "major-warmup"
    assert choose_phase_key(major, 12) == "major-deep"


# --------------------------------------------------------------------------- schema

def test_major_converge_output_no_mbti_pattern():
    html = "<!doctype html><html><head><title>方向</title></head><body>" + ("x" * 1100) + "</body></html>"
    out = MajorConvergeOutput(direction_label="认知科学这一类", card_title="给爱追问的你", report_html=html)
    assert out.direction_label == "认知科学这一类"
    with pytest.raises(ValidationError):
        MajorConvergeOutput(direction_label="x", report_html="")


# --------------------------------------------------------------------------- compose

_MAJOR_HTML = (
    "<!doctype html><html><head><title>给爱追问的你</title>"
    "<meta name=\"oriself-direction\" content=\"认知科学这一类\"></head><body>"
    + ("这是一份专业方向报告。" * 80) + "</body></html>"
)


class _FakeBackend:
    async def complete_text(self, messages, *, timeout=None):
        return _MAJOR_HTML


async def test_compose_major_skips_mbti_checks():
    b = load_skill_bundle(SKILL_ROOT)
    runner = ReportRunner(backend=_FakeBackend(), bundle=b)
    turns = [Turn(round_number=i, user_message=f"u{i}", oriself_text=f"o{i}") for i in range(1, 7)]
    state = _mk_state("major", turns=turns)
    result = await runner.compose(state)
    assert result.output is not None, result.error_reasons
    assert result.output.direction_label == "认知科学这一类"
    assert "<html" in result.output.report_html


# --------------------------------------------------------------------------- DB migration

def test_test_results_has_result_label_column():
    db_mod.reset_for_tests()
    cols = {c["name"] for c in sa_inspect(db_mod.get_engine()).get_columns("test_results")}
    assert "result_label" in cols


def test_legacy_db_gets_result_label_via_init():
    """老库（无 result_label）跑 init_db 后应被加列。"""
    db_mod.reset_for_tests()
    eng = db_mod.get_engine()
    with eng.begin() as conn:
        conn.exec_driver_sql("ALTER TABLE test_results DROP COLUMN result_label")
        cols = {r[1] for r in conn.exec_driver_sql("PRAGMA table_info(test_results)").fetchall()}
        assert "result_label" not in cols
    db_mod.init_db()
    cols2 = {c["name"] for c in sa_inspect(eng).get_columns("test_results")}
    assert "result_label" in cols2


# --------------------------------------------------------------------------- e2e

def test_major_letter_e2e_smoke():
    from fastapi.testclient import TestClient
    from oriself_server.main import create_app

    db_mod.reset_for_tests()
    client = TestClient(create_app())
    r = client.post("/letters", json={"provider": "mock", "domain": "major"})
    assert r.status_code == 200, r.text
    lid = r.json()["letter_id"]
    assert r.json()["domain"] == "major"
    s = client.get(f"/letters/{lid}/state")
    assert s.status_code == 200, s.text
    assert s.json()["domain"] == "major"
