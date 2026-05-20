"""v2.6.1 · 测 quill.py 的页边批注（margin note）机制。

页边批注是一个"每 3 轮给用户一条可纠偏的轻观察"的功能，借 quill 通道
（token 前发 + 持久化 + 不进报告 transcript）实现。频率 / 文案 / 安全
全部 server 硬编码，不让 LLM 自决定。

设计契约（详见 quill.py 注释 + plan §7.1）：
- R1 / R2 不出
- R3, R6, R9, R12, ... 出（current_round >= 3 and current_round % 3 == 0）
- 模板池按 (round // 3 - 1) % len(templates) 轮换
- 禁词正则做兜底校验：MBTI 4 字母 / 外向 / 内向 / 你是 X / 本质上 / 核心是 / ...
"""
from __future__ import annotations

import pytest

from oriself_server.quill import (
    _FORBIDDEN_NOTE_RE,
    _MARGIN_NOTE_TEMPLATES,
    _margin_note_for_round,
    derive_lines,
)


# ---------------------------------------------------------------------------
# 频率：R1/R2 不出；R3, R6, R9 出
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("r", [1, 2, 4, 5, 7, 8, 10, 11, 13, 14, 16, 17])
def test_margin_note_not_emitted(r: int):
    """R1 / R2 / 非 3 的倍数都不出 margin note。"""
    assert _margin_note_for_round(r) is None


@pytest.mark.parametrize("r", [3, 6, 9, 12, 15, 18, 21, 24, 27, 30])
def test_margin_note_emitted_every_3_rounds(r: int):
    """R3 / R6 / R9 / ... 都出 margin note。"""
    note = _margin_note_for_round(r)
    assert note is not None
    # 不应该是空字符串
    assert note.strip()


def test_margin_note_none_input():
    """current_round=None 不出（兼容旧调用）。"""
    assert _margin_note_for_round(None) is None


def test_margin_note_zero_negative():
    """R0 / 负数 都不出。"""
    assert _margin_note_for_round(0) is None
    assert _margin_note_for_round(-1) is None


# ---------------------------------------------------------------------------
# 模板池轮换
# ---------------------------------------------------------------------------


def test_template_rotation():
    """R3 → 模板 0；R6 → 模板 1；R9 → 模板 2；R12 → 模板 0（轮换）。"""
    n = len(_MARGIN_NOTE_TEMPLATES)
    for k in range(0, 6):
        r = (k + 1) * 3  # R3, R6, R9, R12, R15, R18
        expected = _MARGIN_NOTE_TEMPLATES[k % n]
        actual = _margin_note_for_round(r)
        assert actual == expected, f"R{r} expected template {k % n}, got {actual!r}"


def test_template_count_at_least_2():
    """池子至少要有 2 个模板（保证轮换效果）。"""
    assert len(_MARGIN_NOTE_TEMPLATES) >= 2


def test_templates_pass_forbidden_check():
    """所有内置模板必须通过禁词校验（防未来手改时不小心引入断言）。"""
    for tpl in _MARGIN_NOTE_TEMPLATES:
        assert _FORBIDDEN_NOTE_RE.search(tpl) is None, (
            f"内置模板触发了禁词正则：{tpl!r}"
        )


def test_templates_self_correctable():
    """每条模板都必须包含可纠偏的承诺语（'划掉' / '抹掉' / '不准' 之类）。"""
    self_correct_words = ["划掉", "抹掉", "不准", "不像", "推翻", "撕掉", "擦掉"]
    for tpl in _MARGIN_NOTE_TEMPLATES:
        assert any(w in tpl for w in self_correct_words), (
            f"模板缺少可纠偏承诺语：{tpl!r}"
        )


# ---------------------------------------------------------------------------
# 禁词正则
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("bad", [
    "你是 ISTJ 的人",
    "这一段 INTJ 风格很强",
    "你是 一个内向的人",
    "本质上你是个理性派",
    "你的核心是效率",
    "你看上去很外向",
    "这是典型的 ENFP 人格",
])
def test_forbidden_re_catches_personality_assertions(bad: str):
    """禁词正则应该拦住盖章式人格断言。"""
    assert _FORBIDDEN_NOTE_RE.search(bad) is not None, (
        f"应该被拦但没拦：{bad!r}"
    )


@pytest.mark.parametrize("ok", [
    "Oriself 先在这页边上记一句：这里有个小拐弯；这句如果偏了你直接划掉",
    "我感觉你刚说凌晨追 bug 时语气挺亮的——是吗，还是我抓偏了？",
    "你刚说的那个画面，能再讲一下吗",
])
def test_forbidden_re_lets_normal_text_pass(ok: str):
    """普通对话 / 镜面问句不应该被拦。"""
    assert _FORBIDDEN_NOTE_RE.search(ok) is None, (
        f"误拦了正常文本：{ok!r}"
    )


# ---------------------------------------------------------------------------
# derive_lines 集成
# ---------------------------------------------------------------------------


def test_derive_lines_r2_no_margin_note():
    lines, _, _ = derive_lines(
        phase_key="phase-warmup",
        needs=[],
        seen_phases=set(),
        seen_techniques=set(),
        current_round=2,
    )
    # 只有 phase 行
    assert len(lines) == 1
    assert "暧昧" not in lines[0]  # phase-warmup 行
    assert "页边" not in lines[0]


def test_derive_lines_r3_emits_margin_note():
    """R3 + phase-warmup 已 seen → 只出 margin note。"""
    lines, _, _ = derive_lines(
        phase_key="phase-warmup",
        needs=[],
        seen_phases={"phase-warmup", "phase-onboarding"},
        seen_techniques=set(),
        current_round=3,
    )
    assert len(lines) == 1
    assert "页边" in lines[0]


def test_derive_lines_r3_phase_unseen_emits_both():
    """R3 + phase 未 seen → phase 行 + margin note 两行。"""
    lines, _, _ = derive_lines(
        phase_key="phase-warmup",
        needs=[],
        seen_phases=set(),
        seen_techniques=set(),
        current_round=3,
    )
    assert len(lines) == 2
    assert any("斟酌" in l for l in lines)  # phase-warmup line
    assert any(l in _MARGIN_NOTE_TEMPLATES for l in lines)


def test_derive_lines_r6_with_technique():
    """R6 + phase 已 seen + technique 未 seen → technique line + margin note。"""
    lines, _, _ = derive_lines(
        phase_key="phase-deep",
        needs=["reflective-listening"],
        seen_phases={"phase-onboarding", "phase-warmup", "phase-exploring", "phase-deep"},
        seen_techniques=set(),
        current_round=6,
    )
    assert len(lines) == 2
    assert any("念了一遍" in l for l in lines)  # reflective-listening line
    assert any(l in _MARGIN_NOTE_TEMPLATES for l in lines)


def test_derive_lines_no_current_round_backwards_compat():
    """current_round 不传（旧调用） → 行为和 v2.5.3 一致，不出 margin note。"""
    lines, _, _ = derive_lines(
        phase_key="phase-warmup",
        needs=[],
        seen_phases=set(),
        seen_techniques=set(),
        # current_round 故意不传
    )
    assert len(lines) == 1
    assert "页边" not in lines[0]


def test_derive_lines_r9_phase_and_technique_both_seen():
    """R9 + 所有都 seen → 只出 margin note 一行。"""
    lines, _, _ = derive_lines(
        phase_key="phase-deep",
        needs=["reflective-listening", "situational-questions"],
        seen_phases={"phase-onboarding", "phase-warmup", "phase-deep"},
        seen_techniques={"reflective-listening", "situational-questions"},
        current_round=9,
    )
    assert len(lines) == 1
    assert "页边" in lines[0]


def test_derive_lines_rewrite_skips_margin_note():
    """rewrite 路径（is_rewrite=True）应跳过 margin note，避免 DB 持久化多条同 note。"""
    lines, _, _ = derive_lines(
        phase_key="phase-warmup",
        needs=[],
        seen_phases={"phase-warmup", "phase-onboarding"},
        seen_techniques=set(),
        current_round=3,  # 命中 R3 频率
        is_rewrite=True,
    )
    # phase 已 seen, technique 无, is_rewrite 跳过 margin note → 0 行
    assert lines == []


def test_derive_lines_rewrite_still_emits_phase_and_technique():
    """rewrite 跳过的只是 margin note，phase/technique 仍正常出。"""
    lines, _, _ = derive_lines(
        phase_key="phase-deep",
        needs=["reflective-listening"],
        seen_phases=set(),
        seen_techniques=set(),
        current_round=6,
        is_rewrite=True,
    )
    # phase-deep 行 + reflective-listening 行，但 NO margin note
    assert len(lines) == 2
    assert any("笔尖停" in l for l in lines)
    assert any("念了一遍" in l for l in lines)
    assert not any(l in _MARGIN_NOTE_TEMPLATES for l in lines)


def test_derive_lines_normal_path_unchanged_by_is_rewrite_default():
    """is_rewrite 默认 False，老调用语义不变。"""
    lines, _, _ = derive_lines(
        phase_key="phase-warmup",
        needs=[],
        seen_phases={"phase-warmup", "phase-onboarding"},
        seen_techniques=set(),
        current_round=3,
        # is_rewrite 不传，默认 False
    )
    # 应该出 margin note
    assert len(lines) == 1
    assert lines[0] in _MARGIN_NOTE_TEMPLATES


def test_derive_lines_margin_note_not_added_to_seen_sets():
    """margin note 应该独立于 phase/technique 系统，不影响 seen 集合。"""
    seen_phases = {"phase-warmup"}
    seen_techniques = set()
    _, new_seen_phases, new_seen_techniques = derive_lines(
        phase_key="phase-warmup",
        needs=[],
        seen_phases=seen_phases,
        seen_techniques=seen_techniques,
        current_round=3,
    )
    # seen_phases 不应该因为 margin note 而扩张
    assert new_seen_phases == {"phase-warmup"}
    assert new_seen_techniques == set()
