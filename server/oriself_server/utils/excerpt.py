"""
§4.3 · 报告纯文本摘录抽取（一份数据喂三面）。

`extract_excerpt(html)` 从一份报告 HTML 里抽出第一段「足够长」的正文，做成一行
纯文本摘录，用于：
- issue 页公开报告的 `<meta name="description">`；
- 画廊（/issues）列表的摘要行；
- 未来的竖版分享卡。

规则：
- 取第一个 stripped 文本长度 ≥ 20 的 `<p>` 或 `<blockquote>`；
- 剥掉元素内所有标签、折叠空白（对嵌套标签如 `<p>foo <em>bar</em></p>` 也能拿到
  纯文本 "foo bar"）；
- 截断到 80 字符，若原文更长则补中文双省略号「……」；
- 无合格元素 → None。

实现走 stdlib 的 `html.parser.HTMLParser`（不引 bs4），对嵌套标签天然健壮：我们只
收集目标块内的文本节点，标签本身不进文本。
"""
from __future__ import annotations

import re
from html.parser import HTMLParser

# 候选块级容器：第一个文本够长的胜出。
_TARGET_TAGS = {"p", "blockquote"}
_MIN_LEN = 20          # stripped 文本至少这么长才算「正文段」
_MAX_LEN = 80          # 摘录主体上限
_ELLIPSIS = "……"      # 中文双省略号（截断时追加）

# void（空）元素：只有开标签、永远没有对应 endtag。绝不能让它们改动深度计数，
# 否则像 <br> 这种在正文里极常见的标签会让目标块永远关不上 → 整封报告无摘录。
_VOID_TAGS = {
    "br", "img", "hr", "input", "wbr", "area", "base", "col",
    "embed", "link", "meta", "param", "source", "track",
}

# raw-text 元素：其 body 是脚本/样式而非正文，绝不能当 prose 收集。
_RAW_TEXT_TAGS = {"script", "style"}

_WS_RE = re.compile(r"\s+")


class _ExcerptParser(HTMLParser):
    """收集第一个文本长度 ≥ _MIN_LEN 的 <p>/<blockquote> 的纯文本。

    用深度计数跟踪「当前是否在目标块内」，目标块内的所有 data（含嵌套标签包裹的
    文本）都被收进 buffer；目标块闭合时判定长度，达标就锁定结果、停止收集。

    两条健壮性约束：
    - void 标签（<br>/<img>/<hr>/…）不加深度（它们没有 endtag），否则深度永远不归零；
    - script/style 的 body 文本永不收集（不是正文，避免 CSS/JS 泄漏进摘录）。
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.result: str | None = None
        self._depth = 0            # 距离目标块开标签的嵌套深度（>0 表示在块内）
        self._buf: list[str] = []
        self._raw_depth = 0        # 当前嵌套了几层 script/style（>0 → 不收 data）

    def _open_block(self, tag: str) -> None:
        """进入一个新的候选块。"""
        self._depth = 1
        self._buf = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in _RAW_TEXT_TAGS:
            # script/style 无论是否在目标块内，body 都不当正文收集。
            self._raw_depth += 1
            return
        if tag in _VOID_TAGS:
            # void 标签没有 endtag，绝不能改深度。
            # <br> 是换行 = 词边界：在块内时注入一个空格（后续 _WS_RE 会折叠）。
            if tag == "br" and self.result is None and self._depth > 0 and self._raw_depth == 0:
                self._buf.append(" ")
            return
        if self.result is not None:
            return
        if self._depth > 0:
            # 已在目标块内：嵌套子标签只加深度，文本照常收集。
            self._depth += 1
        elif tag in _TARGET_TAGS:
            self._open_block(tag)

    def handle_startendtag(self, tag: str, attrs) -> None:
        # 自闭合写法 <br/> / <img/> / <hr/>：不应改动块深度。
        # 自闭合的 script/style 没有 body，无需进入 raw-text 跳过模式。
        if tag in _RAW_TEXT_TAGS or tag in _VOID_TAGS:
            # 自闭合 <br/> 同样按换行注入一个空格（与 handle_starttag 的 <br> 一致）。
            if tag == "br" and self.result is None and self._depth > 0 and self._raw_depth == 0:
                self._buf.append(" ")
            return
        # 其它罕见的自闭合（如 <p/>）：当作空块，不改深度也不丢已开块。
        # 故意不调用 handle_starttag —— 自闭合块没有内容，开了立刻关没有意义。

    def handle_endtag(self, tag: str) -> None:
        if tag in _RAW_TEXT_TAGS:
            if self._raw_depth > 0:
                self._raw_depth -= 1
            return
        if tag in _VOID_TAGS:
            # void 标签即使被显式闭合也不该减深度（开标签从没加过）。
            return
        if self.result is not None or self._depth == 0:
            return
        self._depth -= 1
        if self._depth == 0:
            # 候选块闭合 → 判长。
            text = _WS_RE.sub(" ", "".join(self._buf)).strip()
            if len(text) >= _MIN_LEN:
                self.result = text  # 锁定，后续不再收集
            self._buf = []

    def handle_data(self, data: str) -> None:
        # raw-text（script/style）body 永不收集；只有在目标块内且未锁定才收 prose。
        if self.result is None and self._depth > 0 and self._raw_depth == 0:
            self._buf.append(data)


def extract_excerpt(html: str) -> str | None:
    """从报告 HTML 抽一行纯文本摘录；无合格段落返回 None。"""
    if not html:
        return None
    parser = _ExcerptParser()
    try:
        parser.feed(html)
        parser.close()
    except Exception:
        # HTMLParser 对脏 HTML 已很宽容；万一抛错也不阻断报告生成。
        return None

    text = parser.result
    if not text:
        return None
    if len(text) > _MAX_LEN:
        text = text[:_MAX_LEN] + _ELLIPSIS
    return text
