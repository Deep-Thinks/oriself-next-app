"""
OriSelfGuardrails · v2.5.2。

哲学转向：
- v2.0-2.3 我们用 50+ 条规则拒 LLM 输出。实操发现 R1 第一句就可能全部
  retry 到 fallback 模板，用户看到的永远是同一段兜底文案。
- v2.4 只保留**会让系统真的坏掉**的硬拦截：
    1. 对话轮数 ≤ MAX_ROUNDS（算力预算）
    2. report_html 无 XSS 向量（安全边界）
    3. report_html 里 4 字母 MBTI 串唯一（单一真相源）
- v2.5.2 converge 不再走 JSON：LLM 直吐 HTML。本文件新增：
    · verify_report_html_parseable（HTML 语法完整性）
    · extract_mbti_from_html（从可见文本抽 4 字母 token，去重保序）
    · extract_card_title_from_html（抽 <title> 作 card 标题）
- 对话轮的"品味"约束（治疗师腔 / 模板词 / 反射引原话等）全部在 SKILL.md + phase
  文件的散文指令。LLM 偶尔没做好 → 用户点「重写这轮」，不在服务端 retry。
- 报告生成（converge）允许 3 次 retry，这里定义守护规则。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Dict, List, Optional, Tuple

from .schemas import MAX_ROUNDS


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------


@dataclass
class GuardrailResult:
    passed: bool
    reasons: List[str] = field(default_factory=list)

    @classmethod
    def ok(cls) -> "GuardrailResult":
        return cls(passed=True)

    @classmethod
    def fail(cls, *reasons: str) -> "GuardrailResult":
        return cls(passed=False, reasons=list(reasons))

    def merge(self, other: "GuardrailResult") -> "GuardrailResult":
        return GuardrailResult(
            passed=self.passed and other.passed,
            reasons=self.reasons + other.reasons,
        )


# ---------------------------------------------------------------------------
# 对话轮 · 唯一的硬检查：轮数预算
# ---------------------------------------------------------------------------


def check_round_budget(round_count: int) -> GuardrailResult:
    """轮数到 MAX_ROUNDS 即触发硬收束。

    这个"不合格"不会打回 LLM 重写，而是让 runner 直接切到 converge 流程。
    """
    if round_count >= MAX_ROUNDS:
        return GuardrailResult.fail(
            f"round_count={round_count} reached MAX_ROUNDS={MAX_ROUNDS}"
        )
    return GuardrailResult.ok()


# ---------------------------------------------------------------------------
# 报告轮 · report_html 安全 + 字母一致性
# ---------------------------------------------------------------------------


_RE_SCRIPT = re.compile(r"<\s*script\b", re.IGNORECASE)
_RE_IFRAME = re.compile(r"<\s*(iframe|object|embed|form|input)\b", re.IGNORECASE)
_RE_EVENT_HANDLER = re.compile(r"\son\w+\s*=", re.IGNORECASE)
_RE_JS_URL = re.compile(r"javascript\s*:", re.IGNORECASE)
_RE_TEMPLATE_PLACEHOLDER = re.compile(r"\{\{\s*[\w_.-]+\s*\}\}")
# 4 字母 MBTI 串（按维度合法字母各取一个，恰好连写）
_RE_MBTI_TOKEN = re.compile(r"(?<![A-Za-z])[EI][SN][TF][JP](?![A-Za-z])")


def verify_report_html_shape(html: str) -> GuardrailResult:
    """安全边界 · report_html 不得含 JS 执行向量、iframe、未替换占位符。

    合法手段（不拦）：
    - 外部字体（Google Fonts 等）、外部 CSS、data: URIs、外部图片
    """
    if not html:
        return GuardrailResult.fail("report_html is empty")
    reasons: List[str] = []
    # 骨架检查：doctype + html 标签
    low = html.lower()
    if "<!doctype" not in low:
        reasons.append("report_html 缺少 <!DOCTYPE html> 开头")
    if "<html" not in low or "</html>" not in low:
        reasons.append("report_html 缺少完整 <html>...</html> 标签")
    if _RE_SCRIPT.search(html):
        reasons.append("report_html 含 <script>（禁止 JS 执行）")
    if _RE_IFRAME.search(html):
        reasons.append("report_html 含 <iframe>/<object>/<embed>/<form>/<input>")
    if _RE_EVENT_HANDLER.search(html):
        reasons.append("report_html 含事件处理器（onclick/onerror 等）")
    if _RE_JS_URL.search(html):
        reasons.append("report_html 含 javascript: URL")
    m = _RE_TEMPLATE_PLACEHOLDER.search(html)
    if m:
        reasons.append(
            f"report_html 含未替换的模板占位符 {m.group(0)!r}；"
            "请把服务端给的真实值（session_id_short / today_*）直接写进 HTML"
        )
    return GuardrailResult.ok() if not reasons else GuardrailResult.fail(*reasons)


# ---------------------------------------------------------------------------
# v2.5.2 · HTML 解析 + 信息抽取
# ---------------------------------------------------------------------------


class _TextCollector(HTMLParser):
    """扫一遍 HTML，输出：

    - `.text_parts`: 非 <style>/<script> 标签下的纯文本片段
    - `.title`: <title> 内的文本（首次遇到）
    - `.well_formed`: True 表示解析过程中没触发致命错误
    """

    # 不计入文本抽取的标签（内容不是"页面可见文本"）
    _SKIP_TAGS = {"style", "script"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.text_parts: List[str] = []
        self.title: Optional[str] = None
        self._in_title: bool = False
        self._skip_stack: List[str] = []
        self.well_formed: bool = True
        self.error: Optional[str] = None

    def handle_starttag(self, tag: str, attrs) -> None:  # type: ignore[override]
        tag_low = tag.lower()
        if tag_low in self._SKIP_TAGS:
            self._skip_stack.append(tag_low)
        if tag_low == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:  # type: ignore[override]
        tag_low = tag.lower()
        if self._skip_stack and self._skip_stack[-1] == tag_low:
            self._skip_stack.pop()
        if tag_low == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:  # type: ignore[override]
        if self._in_title:
            if self.title is None:
                self.title = data.strip()
            else:
                # 标题里多段文本拼接
                self.title = (self.title + data).strip()
        if self._skip_stack:
            return
        if data:
            self.text_parts.append(data)

    def error(self, message: str) -> None:  # noqa: D401  (HTMLParser 历史 API)
        self.well_formed = False
        if self.error is None:
            self.error = message


def _parse_html(html: str) -> _TextCollector:
    p = _TextCollector()
    try:
        p.feed(html)
        p.close()
    except Exception as exc:  # html.parser 在极脏 HTML 上极少抛；抛了就按不合格处理
        p.well_formed = False
        p.error = str(exc)
    return p


def verify_report_html_parseable(html: str) -> GuardrailResult:
    """HTML 必须能被 Python 标准库 html.parser 完整扫完。

    这是"能不能被浏览器渲染"的最低门槛代理。比 BeautifulSoup 更严格一点
    （HTMLParser 对未闭合的诸如 `<foo attr=\"...` 会抛），比 html5lib 更宽松。
    """
    if not html or not html.strip():
        return GuardrailResult.fail("HTML 为空")
    p = _parse_html(html)
    if not p.well_formed:
        return GuardrailResult.fail(
            f"HTML 解析失败：{p.error or '未知错误'}"
        )
    # 没解析出任何可见文本，视为坏 HTML（通常是 LLM 吐了一大段 markdown）
    total_text = "".join(p.text_parts).strip()
    if len(total_text) < 30:
        return GuardrailResult.fail(
            f"HTML 里可见文本过少（{len(total_text)} 字符），"
            "疑似截断或仅输出了样式/脚本块"
        )
    return GuardrailResult.ok()


class _MetaConfCollector(HTMLParser):
    """专门抽 <meta name="oriself-conf" content="..."> 的 content 字符串。

    用独立 parser 而不是复用 _TextCollector：meta 在 <head> 里，
    _TextCollector 是为可见文本抽取设计的，把两件事拆开更干净。
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.content: Optional[str] = None

    def handle_starttag(self, tag: str, attrs) -> None:  # type: ignore[override]
        if tag.lower() != "meta":
            return
        attr_dict = {
            (k or "").lower(): v for k, v in attrs if v is not None
        }
        if attr_dict.get("name", "").lower() == "oriself-conf":
            # 首个命中即记下；不覆盖后续（异常重复时取第一个）
            if self.content is None:
                self.content = attr_dict.get("content")


# 维度对：每对里第一个字母固定为 "通常被视为外向/感知/思考/判断" 那一面。
# 解析时只关心字母属于哪个 pair，顺序无关。
_DIM_PAIRS: Tuple[Tuple[str, str], ...] = (
    ("E", "I"),
    ("S", "N"),
    ("T", "F"),
    ("J", "P"),
)
_ALL_MBTI_LETTERS = frozenset("EISNTFJP")


def _parse_oriself_conf(raw: str) -> Dict[str, float]:
    """解析 "I:0.65,N:0.55,T:0.85,J:0.65" 形式为完整 8 字母 confidence 字典。

    规则（详见 CONVERGE.md "confidence 写进 HTML meta 标记" 章节）：
    - 4 段，逗号分隔
    - 每段 "<胜出字母>:<float>"，胜出字母 ∈ {E,I,S,N,T,F,J,P}
    - 4 个胜出字母必须覆盖 4 个维度（每维度恰好一个）
    - 数值范围 [0.50, 1.00]
    - 互补字母 confidence 由本函数自动算（1 - 胜出 confidence）

    返回完整 8 字母字典；任何违反 → 返回空 {}。**不抛异常**——meta 容错。
    """
    parts = [p.strip() for p in raw.split(",")]
    if len(parts) != 4:
        return {}

    result: Dict[str, float] = {}
    seen_pair_idx: set[int] = set()
    for part in parts:
        if ":" not in part:
            return {}
        letter, _, val = part.partition(":")
        letter = letter.strip().upper()
        if letter not in _ALL_MBTI_LETTERS:
            return {}
        pair_idx: Optional[int] = None
        for i, pair in enumerate(_DIM_PAIRS):
            if letter in pair:
                pair_idx = i
                break
        if pair_idx is None:
            return {}
        if pair_idx in seen_pair_idx:
            return {}  # 同一维度被写了两次
        seen_pair_idx.add(pair_idx)
        try:
            conf = float(val.strip())
        except ValueError:
            return {}
        if not (0.50 <= conf <= 1.00):
            return {}
        result[letter] = round(conf, 4)
        pair = _DIM_PAIRS[pair_idx]
        other = pair[0] if pair[1] == letter else pair[1]
        result[other] = round(1.0 - conf, 4)

    # 4 个维度全部覆盖
    if len(seen_pair_idx) != 4 or len(result) != 8:
        return {}
    return result


def extract_oriself_conf_from_html(html: str) -> Dict[str, float]:
    """从 <meta name="oriself-conf" content="…"> 抽 confidence 字典。

    完整契约见 `skill-repo/skills/oriself/CONVERGE.md` 的 "confidence 写进
    HTML meta 标记" 章节。LLM 在 HTML <head> 里写：

        <meta name="oriself-conf" content="I:0.65,N:0.55,T:0.85,J:0.65">

    本函数：
    - 用 HTMLParser 找 meta（兼容 attribute 任意顺序）
    - 用 `_parse_oriself_conf` 校验 + 解析格式
    - 自动计算互补字母 confidence（1 - 胜出 confidence）

    抽不到 / 格式错误 → 返回 `{}`。**不抛异常**——meta 是数据可追溯性
    的努力，不是硬阻断；缺失时 server 写空 `confidence_json` 但仍然落库。
    """
    if not html:
        return {}
    collector = _MetaConfCollector()
    try:
        collector.feed(html)
        collector.close()
    except Exception:
        return {}
    raw = collector.content
    if not raw:
        return {}
    return _parse_oriself_conf(raw)


def confidence_matches_mbti(conf: Dict[str, float], mbti_type: str) -> bool:
    """检查 confidence dict 里"胜出字母"是否与 HTML 正文里的 mbti_type 一致。

    胜出字母 = confidence >= 0.50 的字母（边界 0.50 视为胜出，覆盖 uncertain
    维度允许 [0.50, 0.55] 的语义）。

    用于侦测**矛盾报告**：LLM 在可见 HTML 写 `INTJ` 但在 meta 里写
    `E:0.65,N:0.55,T:0.85,J:0.65`。这种"可信但错误"的数据会污染 confidence_json，
    应在 ReportRunner.compose 阶段触发 retry，而不是写进 DB。

    - 空 conf → 返回 True（meta 缺失走容错路径，不算矛盾）。
    - mbti_type 不是 4 字符 → 返回 False（防御性，理论上不会发生）。
    """
    if not conf:
        return True
    if not mbti_type or len(mbti_type) != 4:
        return False
    for letter in mbti_type.upper():
        c = conf.get(letter)
        if c is None or c < 0.50:
            return False
    return True


def extract_card_title_from_html(html: str) -> Optional[str]:
    """从 <title>…</title> 抽 card 标题；没抽到返回 None。"""
    if not html:
        return None
    p = _parse_html(html)
    if not p.title:
        return None
    title = p.title.strip()
    return title or None


def extract_mbti_from_html(html: str) -> List[str]:
    """从 HTML 的"可见文本"（剔除 <style>/<script>）里扫 4 字母 MBTI token。

    返回去重保序列表。调用方按下列策略决策：
    - len() == 1 → 合格，这就是 mbti_type
    - len() == 0 → 失败（LLM 忘了写 MBTI）
    - len() > 1  → 失败（多种 MBTI 同时出现 = 一致性违反）
    """
    if not html:
        return []
    p = _parse_html(html)
    # 用空白把相邻标签的文本分隔开，避免 `<h1>INTP</h1><p>context…` 这种被拼成
    # `INTPcontext…` 导致 token 边界误判。
    visible = " ".join(part for part in p.text_parts if part)
    if p.title:
        visible = p.title + " " + visible
    tokens = _RE_MBTI_TOKEN.findall(visible)
    # 去重保序
    seen: List[str] = []
    for t in tokens:
        if t not in seen:
            seen.append(t)
    return seen


def resolve_mbti_or_fail(html: str) -> Tuple[Optional[str], GuardrailResult]:
    """把 extract_mbti_from_html 的三分支决策包装成 (mbti, result)。

    成功：返回 (mbti_type, ok)
    失败：返回 (None, fail_result)
    """
    tokens = extract_mbti_from_html(html)
    if not tokens:
        return None, GuardrailResult.fail(
            "HTML 可见文本里找不到 4 字母 MBTI（如 'INTP'）。"
            "请在显眼位置明确写出 TA 的 MBTI 类型。"
        )
    if len(tokens) > 1:
        return None, GuardrailResult.fail(
            f"HTML 里出现多种 MBTI 字母串 {tokens}；"
            "必须只出现一种 —— 全文所有 4 字母位置都写成同一个类型。"
        )
    return tokens[0], GuardrailResult.ok()


def verify_report_html_consistency(html: str, mbti_type: str) -> GuardrailResult:
    """字母一致性 · HTML 里每一处 4 字母 MBTI 串都必须等于给定值。

    v2.5.2 起主要用于**回归校验**：ReportRunner 已经通过 resolve_mbti_or_fail
    把 mbti 从 HTML 抽出来，此函数给已有测试保留同名 API（HTML 中的四字母必须唯一
    且匹配），语义上等价于 resolve_mbti_or_fail + 等值比较。
    """
    if not html or not mbti_type:
        return GuardrailResult.ok()
    tokens = extract_mbti_from_html(html)
    if not tokens:
        return GuardrailResult.fail(
            f"report_html 里没找到任何 4 字母 MBTI；期望 {mbti_type!r}"
        )
    mismatched = [t for t in tokens if t != mbti_type]
    if mismatched:
        return GuardrailResult.fail(
            f"report_html 里出现 {sorted(mismatched)} 与派生 mbti_type={mbti_type!r} 不一致；"
            f"请把 HTML 里所有 4 字母 MBTI 处都写成 {mbti_type!r}"
        )
    return GuardrailResult.ok()


# ---------------------------------------------------------------------------
# Markdown fence 剥离（LLM 有时顽固地包 ```html）
# ---------------------------------------------------------------------------


_FENCE_RE = re.compile(
    r"^\s*```(?:html)?\s*\n?(.*?)\n?```[\s]*$",
    re.DOTALL | re.IGNORECASE,
)


def strip_markdown_fence(text: str) -> str:
    """LLM 偶尔用 ```html ... ``` 包 HTML，剥掉。"""
    if not text:
        return text
    m = _FENCE_RE.match(text.strip())
    if m:
        return m.group(1).strip()
    return text


# ---------------------------------------------------------------------------
# STATUS 解析（对话轮末行 sentinel）
# ---------------------------------------------------------------------------


# 精确匹配 gstack 风格：独立一行、大写、无装饰
# 兼容前缀空白 + 末尾可选的冒号 / 空白
_STATUS_RE = re.compile(
    r"(?:^|\n)\s*STATUS\s*:\s*(CONTINUE|CONVERGE|NEED_USER)\s*\.?\s*$",
    re.MULTILINE,
)

# v3.1 · 每轮"画像清晰度"自评哨兵（独立成行，放在 STATUS 行之前）。
# 形如 `CLARITY: 0.62`；容错接受裸数字 / 百分数（>1 视为百分比除以 100）。
# 用途：前端顶栏单调进度条。缺失即容错——不报错、不阻断，进度条原地不动。
#
# 行匹配**故意宽松**（`CLARITY:` 后任意内容）：哪怕值是 `abc` / `-0.2` / `1e-1`
# 这种解析不出来的脏值，整行也必须被剥除——否则机器哨兵会泄漏给用户、并绕过
# 空回复护栏（codex 复审 P1）。值的合法性交给 `_clamp_clarity` 单独判断。
_CLARITY_RE = re.compile(
    r"(?:^|\n)[ \t]*CLARITY[ \t]*:[ \t]*(.*?)[ \t]*$",
    re.MULTILINE,
)


def _clamp_clarity(raw_value: Optional[str]) -> Optional[float]:
    """把 CLARITY 行抽到的字符串归一到 [0,1]。

    - "0.62" → 0.62
    - "62" / "62%"（>1）→ 0.62（按百分比除以 100）
    - "1e-1" → 0.1（标准浮点解析）
    - "-0.2" → 0.0（下界 clamp）
    - "abc" / 空 / None → None（容错：调用方据此不更新进度，但行已被剥除）
    """
    if raw_value is None:
        return None
    s = raw_value.strip().rstrip("%").strip()
    try:
        v = float(s)
    except (TypeError, ValueError):
        # 退一步：从串里抠第一个数字（兼容 "约 0.6"、"0.6 (中)" 之类）
        m = re.search(r"-?\d+(?:\.\d+)?", raw_value)
        if not m:
            return None
        try:
            v = float(m.group(0))
        except ValueError:
            return None
    if v > 1.0:
        v = v / 100.0
    if v < 0.0:
        return 0.0
    return min(1.0, v)


@dataclass
class ParsedTurn:
    visible_text: str  # 给用户看的（STATUS / CLARITY 行已剥除）
    status: str        # CONTINUE / CONVERGE / NEED_USER
    status_explicit: bool  # LLM 是否真的声明了，还是我们按默认 CONTINUE 兜底
    clarity: Optional[float] = None  # v3.1 · 本轮自评画像清晰度 [0,1]；缺失为 None


def parse_status_sentinel(raw: str) -> ParsedTurn:
    """从 LLM 纯文本输出的**末尾**扫 STATUS（必）+ CLARITY（可选）两行哨兵。

    - STATUS 抽到 → 从 visible_text 里剥除该行；没抽到 → status = CONTINUE（默认）
    - CLARITY 抽到 → 解析为 [0,1] 并从 visible_text 里一并剥除；没抽到 → clarity=None

    为什么只扫末尾：gstack 的 Completion Status 协议规定 STATUS 是收尾信号，
    LLM 偶尔会在中间段放"STATUS: ..."作叙述文字，那不算。我们只认**最后一行**。
    CLARITY 同理只认末尾那条，且无论 STATUS 是否存在都会被剥除（否则空回复护栏会
    把仅剩一行 CLARITY 的脏轮误判为非空）。
    """
    raw = raw or ""

    status = "CONTINUE"
    status_explicit = False
    matches = list(_STATUS_RE.finditer(raw))
    if matches:
        last = matches[-1]
        status = last.group(1)
        status_explicit = True
        # 剥除 STATUS 行 —— 用 span 把该行及其前导换行一并去掉
        raw = raw[: last.start()] + raw[last.end():]

    clarity: Optional[float] = None
    c_matches = list(_CLARITY_RE.finditer(raw))
    if c_matches:
        last_c = c_matches[-1]
        clarity = _clamp_clarity(last_c.group(1))
        # 无论解析成不成功都剥除该行——它是机器哨兵，不该给用户看到
        raw = raw[: last_c.start()] + raw[last_c.end():]

    return ParsedTurn(
        visible_text=raw.strip(),
        status=status,
        status_explicit=status_explicit,
        clarity=clarity,
    )
