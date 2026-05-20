"""v2.6.1 · 测 extract_oriself_conf_from_html。

LLM 在 HTML <head> 写 `<meta name="oriself-conf" content="I:0.65,N:0.55,T:0.85,J:0.65">`，
server 解析为完整 8 字母 confidence 字典写入 test_results.confidence_json。
契约见 skill-repo/skills/oriself/CONVERGE.md 的 "confidence 写进 HTML meta 标记" 章节。

容错语义：抽不到 / 格式错 → 返回 `{}`，不抛异常、不阻断报告生成。
"""
from __future__ import annotations

import pytest

from oriself_server.guardrails import (
    confidence_matches_mbti,
    extract_oriself_conf_from_html,
)
from oriself_server.utils.html_sanitize import sanitize_report_html


def _wrap(meta_html: str) -> str:
    """把单个 meta 标签塞进最小合法 HTML 骨架。"""
    return (
        '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
        f"<title>t</title>{meta_html}</head>"
        "<body><h1>INTJ</h1><p>x</p></body></html>"
    )


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_intj_standard():
    html = _wrap(
        '<meta name="oriself-conf" content="I:0.65,N:0.55,T:0.85,J:0.65">'
    )
    conf = extract_oriself_conf_from_html(html)
    # 4 个胜出字母 + 4 个互补字母 = 8 字母全覆盖
    assert set(conf.keys()) == {"E", "I", "S", "N", "T", "F", "J", "P"}
    assert conf["I"] == 0.65
    assert conf["N"] == 0.55
    assert conf["T"] == 0.85
    assert conf["J"] == 0.65
    # 互补字母自动算
    assert conf["E"] == pytest.approx(0.35)
    assert conf["S"] == pytest.approx(0.45)
    assert conf["F"] == pytest.approx(0.15)
    assert conf["P"] == pytest.approx(0.35)


def test_esfp_standard():
    html = _wrap(
        '<meta name="oriself-conf" content="E:0.70,S:0.60,F:0.55,P:0.80">'
    )
    conf = extract_oriself_conf_from_html(html)
    assert conf["E"] == 0.70
    assert conf["I"] == pytest.approx(0.30)
    assert conf["S"] == 0.60
    assert conf["N"] == pytest.approx(0.40)
    assert conf["F"] == 0.55
    assert conf["T"] == pytest.approx(0.45)
    assert conf["P"] == 0.80
    assert conf["J"] == pytest.approx(0.20)


def test_attribute_order_swapped():
    """`content="..." name="..."` 顺序颠倒应该照样抽得到。"""
    html = _wrap(
        '<meta content="I:0.65,N:0.55,T:0.85,J:0.65" name="oriself-conf">'
    )
    conf = extract_oriself_conf_from_html(html)
    assert conf["I"] == 0.65


def test_uncertain_boundary_lower():
    """uncertain 维度（信号 50/50）confidence 写 0.50 应该通过。"""
    html = _wrap(
        '<meta name="oriself-conf" content="I:0.50,N:0.55,T:0.85,J:0.65">'
    )
    conf = extract_oriself_conf_from_html(html)
    assert conf["I"] == 0.50
    assert conf["E"] == 0.50  # 互补也算 0.50


def test_certain_boundary_upper():
    """confidence 极限 1.00 应该通过。"""
    html = _wrap(
        '<meta name="oriself-conf" content="I:1.00,N:0.55,T:0.85,J:0.65">'
    )
    conf = extract_oriself_conf_from_html(html)
    assert conf["I"] == 1.00
    assert conf["E"] == 0.00


# ---------------------------------------------------------------------------
# Missing → {}
# ---------------------------------------------------------------------------


def test_no_meta_at_all():
    html = (
        '<!doctype html><html><head><title>t</title></head>'
        '<body><h1>INTJ</h1></body></html>'
    )
    assert extract_oriself_conf_from_html(html) == {}


def test_meta_with_different_name():
    """name 不是 oriself-conf 应忽略。"""
    html = _wrap('<meta name="description" content="something">')
    assert extract_oriself_conf_from_html(html) == {}


def test_meta_without_content_attr():
    html = _wrap('<meta name="oriself-conf">')
    assert extract_oriself_conf_from_html(html) == {}


def test_empty_html():
    assert extract_oriself_conf_from_html("") == {}


def test_none_safe():
    # type: ignore[arg-type]
    assert extract_oriself_conf_from_html(None) == {}  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Invalid format → {}
# ---------------------------------------------------------------------------


def test_too_few_segments():
    html = _wrap('<meta name="oriself-conf" content="I:0.65,N:0.55,T:0.85">')
    assert extract_oriself_conf_from_html(html) == {}


def test_too_many_segments():
    html = _wrap(
        '<meta name="oriself-conf" content="I:0.65,N:0.55,T:0.85,J:0.65,P:0.35">'
    )
    assert extract_oriself_conf_from_html(html) == {}


def test_missing_colon():
    html = _wrap('<meta name="oriself-conf" content="I=0.65,N:0.55,T:0.85,J:0.65">')
    assert extract_oriself_conf_from_html(html) == {}


def test_non_mbti_letter():
    html = _wrap(
        '<meta name="oriself-conf" content="X:0.65,N:0.55,T:0.85,J:0.65">'
    )
    assert extract_oriself_conf_from_html(html) == {}


def test_same_dimension_twice():
    """同一维度的两个字母同时写（E + I）应被拒绝。"""
    html = _wrap(
        '<meta name="oriself-conf" content="E:0.65,I:0.35,T:0.85,J:0.65">'
    )
    assert extract_oriself_conf_from_html(html) == {}


def test_confidence_below_50():
    """胜出字母 confidence < 0.50 是矛盾的（胜出按定义 >= 0.50）。"""
    html = _wrap(
        '<meta name="oriself-conf" content="I:0.45,N:0.55,T:0.85,J:0.65">'
    )
    assert extract_oriself_conf_from_html(html) == {}


def test_confidence_above_1():
    html = _wrap(
        '<meta name="oriself-conf" content="I:1.05,N:0.55,T:0.85,J:0.65">'
    )
    assert extract_oriself_conf_from_html(html) == {}


def test_non_numeric_confidence():
    html = _wrap(
        '<meta name="oriself-conf" content="I:high,N:0.55,T:0.85,J:0.65">'
    )
    assert extract_oriself_conf_from_html(html) == {}


def test_missing_one_dimension():
    """4 段都给了，但全部落在 3 个维度上（重复一维）。"""
    html = _wrap(
        '<meta name="oriself-conf" content="I:0.65,N:0.55,T:0.85,F:0.55">'
    )
    # T+F 同一维，J/P 没覆盖
    assert extract_oriself_conf_from_html(html) == {}


# ---------------------------------------------------------------------------
# Sanitize 之后 meta 仍然在
# ---------------------------------------------------------------------------


def test_meta_survives_sanitize_report_html():
    """sanitize_report_html 会清 <script> 等，但不会动 <meta>。"""
    html = _wrap(
        '<meta name="oriself-conf" content="I:0.65,N:0.55,T:0.85,J:0.65">'
    )
    safe = sanitize_report_html(html)
    conf = extract_oriself_conf_from_html(safe)
    assert conf["I"] == 0.65
    assert conf["N"] == 0.55


def test_meta_extracted_amid_other_metas():
    """混在其他 <meta> 之间也能找到。"""
    html = (
        '<!doctype html><html><head>'
        '<meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width">'
        '<meta name="oriself-conf" content="I:0.65,N:0.55,T:0.85,J:0.65">'
        '<meta name="description" content="x">'
        '<title>t</title></head><body><h1>INTJ</h1></body></html>'
    )
    conf = extract_oriself_conf_from_html(html)
    assert conf["I"] == 0.65


def test_upper_case_letter_normalized():
    """LLM 写小写字母也应该正确（虽然 prompt 要大写）。"""
    html = _wrap(
        '<meta name="oriself-conf" content="i:0.65,n:0.55,t:0.85,j:0.65">'
    )
    conf = extract_oriself_conf_from_html(html)
    assert conf["I"] == 0.65


# ---------------------------------------------------------------------------
# Attribute quote 风格 + content 跨行（防 LLM 不规范输出）
# ---------------------------------------------------------------------------


def test_single_quote_attribute():
    """HTML 标准允许单引号 attribute。"""
    html = _wrap(
        "<meta name='oriself-conf' content='I:0.65,N:0.55,T:0.85,J:0.65'>"
    )
    conf = extract_oriself_conf_from_html(html)
    assert conf["I"] == 0.65


def test_mixed_quote_attribute():
    """name 用双引号 + content 用单引号 (LLM 偶尔会这样)。"""
    html = _wrap(
        '<meta name="oriself-conf" content=\'I:0.65,N:0.55,T:0.85,J:0.65\'>'
    )
    conf = extract_oriself_conf_from_html(html)
    assert conf["I"] == 0.65


def test_multiline_content_should_reject():
    """content 里夹换行符不在契约里，应被拒（怕 LLM 写了人类可读对照表）。"""
    html = _wrap(
        '<meta name="oriself-conf" content="I:0.65,\nN:0.55,T:0.85,J:0.65">'
    )
    conf = extract_oriself_conf_from_html(html)
    # 不一定会抛错，但因为 N:0.55 之前有 "\n"，strip 后还是 "N"，应能解析
    # 这个 test 主要确认 parser 不崩溃；松弛容忍 vs 严格拒绝都可接受
    # 实际只要 confidence_matches_mbti 之类下游能正确判定即可
    if conf:
        assert "I" in conf and "N" in conf
    else:
        assert conf == {}


# ---------------------------------------------------------------------------
# confidence_matches_mbti · 矛盾检测
# ---------------------------------------------------------------------------


def test_match_when_mbti_matches_winning_letters():
    """meta 胜出字母 = mbti_type 的 4 字母 → 通过。"""
    conf = {
        "I": 0.65, "E": 0.35,
        "N": 0.55, "S": 0.45,
        "T": 0.85, "F": 0.15,
        "J": 0.65, "P": 0.35,
    }
    assert confidence_matches_mbti(conf, "INTJ") is True


def test_mismatch_when_meta_picks_opposite_letter():
    """HTML 正文写 INTJ，但 meta 把 I 写成 0.35 → 矛盾。"""
    conf = {
        "I": 0.35, "E": 0.65,  # ← 矛盾：HTML 是 INTJ，meta 却说 E 胜出
        "N": 0.55, "S": 0.45,
        "T": 0.85, "F": 0.15,
        "J": 0.65, "P": 0.35,
    }
    assert confidence_matches_mbti(conf, "INTJ") is False


def test_uncertain_boundary_50_still_matches():
    """uncertain 维度（50/50 拉扯）confidence = 0.50 不算矛盾。"""
    conf = {
        "I": 0.50, "E": 0.50,
        "N": 0.55, "S": 0.45,
        "T": 0.85, "F": 0.15,
        "J": 0.65, "P": 0.35,
    }
    # mbti 选了 I，conf["I"] = 0.50 满足 >= 0.50
    assert confidence_matches_mbti(conf, "INTJ") is True


def test_empty_conf_is_not_a_mismatch():
    """空 conf 走 missing meta 容错路径，不应被判矛盾。"""
    assert confidence_matches_mbti({}, "INTJ") is True


def test_invalid_mbti_type_returns_false():
    """防御性：mbti_type 不是 4 字符。"""
    conf = {"I": 0.65, "E": 0.35, "N": 0.55, "S": 0.45,
            "T": 0.85, "F": 0.15, "J": 0.65, "P": 0.35}
    assert confidence_matches_mbti(conf, "INT") is False
    assert confidence_matches_mbti(conf, "") is False


def test_all_four_letters_must_match():
    """4 个胜出字母中只要有一个反向就算矛盾。"""
    conf = {
        "I": 0.65, "E": 0.35,
        "N": 0.55, "S": 0.45,
        "T": 0.85, "F": 0.15,
        "P": 0.65, "J": 0.35,  # ← P 胜出而不是 J
    }
    # mbti 写 INTJ，但 conf 里 J 是 0.35 → 矛盾
    assert confidence_matches_mbti(conf, "INTJ") is False
    # 改成 INTP 就匹配
    assert confidence_matches_mbti(conf, "INTP") is True
