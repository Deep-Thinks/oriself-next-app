"""major 域文案 · 魂结构断言（D1-D14 落地校验）。"""
from pathlib import Path

from oriself_server.skill_loader import clear_cache, load_skill_bundle

SKILL_ROOT = (
    Path(__file__).resolve().parent.parent.parent / "skill-repo" / "skills" / "oriself"
)


def setup_function(_):
    clear_cache()


def test_major_domain_lens_has_soul_elements():
    body = load_skill_bundle(SKILL_ROOT).domain_md["major"]
    assert "stub" not in body.lower()
    assert "意义三问" in body or "三个问题" in body          # D6
    assert "赝品" in body or "什么东西配叫热爱" in body         # D4
    assert "决策闸门" in body or "本轮只做一件事" in body        # D5
    assert "内核" in body and "外壳" in body                  # D2/D12
    assert "信得过的大人" in body or "信得过的成年人" in body     # D14
    assert "不要" in body and ("被 AI" in body or "AI 干掉" in body or "AI 取代" in body)  # D9
    assert "分数" in body or "院校" in body                   # D1（不碰语境）


def test_major_phases_have_decision_gate_and_arc():
    b = load_skill_bundle(SKILL_ROOT)
    phases = {k: b.refs[k].body for k in (
        "major-onboarding", "major-warmup", "major-exploring",
        "major-midpoint", "major-deep", "major-soft-closing")}
    for k, body in phases.items():
        assert "stub" not in body.lower(), f"{k} still stub"
        assert "决策闸门" in body or "本轮只做一件事" in body, f"{k} missing decision gate"
    assert "日常" in phases["major-onboarding"]
    assert "不问" in phases["major-onboarding"]  # 开场不一上来问热爱
    assert "一步步" in phases["major-deep"] or "付出" in phases["major-deep"] or "代价" in phases["major-deep"]
    assert "不再" in phases["major-soft-closing"] or "收束" in phases["major-soft-closing"]


def test_converge_major_contract_and_no_mbti():
    b = load_skill_bundle(SKILL_ROOT)
    body = b.refs["converge-major"].body
    assert "stub" not in body.lower()
    assert "oriself-direction" in body                       # meta 契约
    assert "大类" in body and ("交叉方向" in body or "不是" in body or "未必" in body)  # D13 命名诚实
    assert "试探" in body or "现在就能" in body                 # D7 低成本试探
    assert "内核" in body and "壳" in body and ("别认死" in body or "会变" in body)  # D2
    assert "不写四字母" in body or "不是 MBTI" in body          # 明确弃用 mbti 机制
    assert "doctype" in body.lower() and "script" in body.lower()  # 安全契约
    # D2 四标尺 + D1 显式
    assert "源头追问" in body and "判断与责任" in body
    assert "不做分数" in body or "不碰" in body or "不做录取" in body
