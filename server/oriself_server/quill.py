"""
Quill · v2.5.3 · 给用户看的"Oriself 此刻的笔触"。

设计初衷：
- 让用户在 token 流出前看到一行浅灰的铅笔批注，知道 Oriself 在酝酿什么
- 绝不泄露工程术语（phase_key / technique / 装配 / 加载 / 字节 / 百分比）
- 同 phase / 同 technique 在一封信里只显示一次，避免啰嗦

文案铁则（在 CODE REVIEW 里请守住）：
  禁止使用 "靠近 / 贴近 / 贴得 / 凑近 / 走近 / 更近" 及任何身体距离隐喻——
  会有人际入侵感。改用"时间停留 / 视线停留 / 笔触"类隐喻。
  第二人称统一用 "Oriself" + "你"；不出现 "TA / 他 / 她 / 系统 / 模型"。
"""
from __future__ import annotations

import re
from typing import Iterable, List, Optional, Set, Tuple


# phase_key → 一行浅灰批注
_PHASE_LINES = {
    "phase-onboarding":   "Oriself 正在读你递过来的第一句话",
    "phase-warmup":       "Oriself 在斟酌怎么开口",
    "phase-exploring":    "Oriself 想多问一些",
    "phase-midpoint":     "Oriself 停下来，把前半程听到的摊在桌上",
    "phase-deep":         "Oriself 把笔尖停在这一行",
    "phase-soft-closing": "Oriself 开始把这封信慢慢收拢",
}

# technique name → 一行浅灰批注
_TECHNIQUE_LINES = {
    "reflective-listening":  "Oriself 把你刚说的，在心里念了一遍",
    "situational-questions": "Oriself 想到了一个画面，想让你也看看",
    "contradiction-probing": "Oriself 在你说的话里停了一下",
}


def phase_line(phase_key: str) -> str:
    return _PHASE_LINES.get(phase_key, "")


def technique_line(name: str) -> str:
    return _TECHNIQUE_LINES.get(name, "")


# ---------------------------------------------------------------------------
# v2.6.1 · 页边批注（margin note）
#
# 目的：每 2-3 轮给用户一条**可纠偏**的轻观察，不进 oriself_text（避免回灌 →
# CONVERGE 自我强化偏差）。借 quill 通道：token 前发 + 持久化 + 回看展示 +
# 不进报告 transcript。
#
# 频率：server 端硬编码 R3 / R6 / R9 / ... 触发，不让 LLM 自决定。
# 文案：固定模板池轮换，不让 LLM 自由生成。
# 安全：禁词正则做确定性兜底，命中即跳过。
# ---------------------------------------------------------------------------


# 页边批注模板池。多个轻巧模板按轮号选取（避免单调）。
# 全部用书信隐喻——和 quill 已有的"笔触/铅笔/视线"系一致。
# **严格自检**：每条都必须可被用户一句话推翻 / 划掉 / 抹掉。
# 6 条 → 30 轮信里最多 10 次 margin note 会循环约 1.67 圈，重复感不强。
_MARGIN_NOTE_TEMPLATES: Tuple[str, ...] = (
    "Oriself 先在这页边上记一句：这里有个小拐弯；这句如果偏了你直接划掉",
    "Oriself 在这页角落里轻轻写了一行：这一段我先记下来；不像你就划掉",
    "Oriself 把刚才的话在页边描了一笔：这个点我想多停一会；不准请直接抹掉",
    "Oriself 在页眉处停了一下笔：这里我想多读两遍；不像就划掉",
    "Oriself 用浅笔在这一行旁标了个圈：这个画面我先收住；不准你直接擦掉",
    "Oriself 把这一段在书脊上轻折了一下：这一处我想再听一遍；偏了你撕掉这角",
)

# 禁词正则 · 命中则跳过该轮 margin note。
# 作为最后一道确定性兜底，防未来手改模板时不小心写进盖章式断言。
# - [EI][SN][TF][JP]: MBTI 4 字母组合
# - 人格类型词：外向 / 内向 / 理性 / 感性 / 人格 / 类型
# - 盖章式断言：你是 X（短前缀） / 本质上 / 核心是
_FORBIDDEN_NOTE_RE = re.compile(
    r"[EI][SN][TF][JP]"
    r"|外向|内向|理性|感性|人格|类型"
    r"|你是\s*[^，。\s]"
    r"|本质上|核心是"
)


def _margin_note_for_round(current_round: Optional[int]) -> Optional[str]:
    """页边批注生成器：每 3 轮（R3, R6, R9, ...）出一条；R1/R2 不出。

    模板池按 `(round // 3 - 1) % len(templates)` 轮换：
        R3 → 模板 0；R6 → 模板 1；R9 → 模板 2；R12 → 模板 0；...

    禁词正则校验作为兜底（防未来误改模板）。命中 → 返回 None。
    """
    if current_round is None or current_round < 3 or current_round % 3 != 0:
        return None
    idx = (current_round // 3 - 1) % len(_MARGIN_NOTE_TEMPLATES)
    candidate = _MARGIN_NOTE_TEMPLATES[idx]
    if _FORBIDDEN_NOTE_RE.search(candidate):
        return None
    return candidate


def derive_lines(
    *,
    phase_key: str,
    needs: Iterable[str],
    seen_phases: Set[str],
    seen_techniques: Set[str],
    current_round: Optional[int] = None,
    is_rewrite: bool = False,
) -> Tuple[List[str], Set[str], Set[str]]:
    """计算本轮要显示的 quill 行 + 更新后的 seen 集合。

    规则：
    - phase 若在 seen_phases 里 → 不再显示
    - needs 里每个 technique 若在 seen_techniques 里 → 不再显示
    - phase 行 + 1 行 technique = 最多 2 行（不含 margin note）
    - **v2.6.1 · 页边批注**：current_round 命中 (R≥3 且 R%3==0) → 额外
      append 一条固定模板（独立于 phase/technique 系统，不进 seen 集合）
    - **rewrite 同轮去重**：`is_rewrite=True` 时不出 margin note。同一 R3/R6
      的多次重写不应在 DB 持久化多条同样的 note（codex review 建议）
    - 返回的 seen_* 已合并本轮新出现的键，方便调用方写回

    不显示的 phase/technique 也算"已见"——本次虽然没展示，
    但 session 内它确实出现过，后续同样不重复写给用户看。

    `current_round` 为 None 时（兼容旧调用），不出 margin note。
    """
    new_seen_phases = set(seen_phases)
    new_seen_techniques = set(seen_techniques)
    lines: List[str] = []

    if phase_key and phase_key not in new_seen_phases:
        line = phase_line(phase_key)
        if line:
            lines.append(line)
        new_seen_phases.add(phase_key)

    # 最多选 1 个 technique 呈现（避免同轮出两条 technique 显得像清单）
    for tech in needs:
        if not tech or tech in new_seen_techniques:
            continue
        line = technique_line(tech)
        new_seen_techniques.add(tech)
        if line and len([l for l in lines if l != ""]) < 2:
            # 已有 phase 行就只塞 1 个 technique 凑够 2；未见过的 technique 都记进 seen
            lines.append(line)
            break  # 出第一条就收手

    # 其余 needs 里没展示的（因为只挑第一条）仍然要标记成"已见"，后续轮不再露脸
    for tech in needs:
        if tech:
            new_seen_techniques.add(tech)

    # v2.6.1 · 页边批注 · 每 3 轮独立触发，不进 seen 集合
    # rewrite 路径跳过：同 R3/R6 多次重写不应在 DB 持久化多条同 note
    if not is_rewrite:
        note = _margin_note_for_round(current_round)
        if note:
            lines.append(note)

    return lines, new_seen_phases, new_seen_techniques
