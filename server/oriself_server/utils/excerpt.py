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

_WS_RE = re.compile(r"\s+")


class _ExcerptParser(HTMLParser):
    """收集第一个文本长度 ≥ _MIN_LEN 的 <p>/<blockquote> 的纯文本。

    用深度计数跟踪「当前是否在目标块内」，目标块内的所有 data（含嵌套标签包裹的
    文本）都被收进 buffer；目标块闭合时判定长度，达标就锁定结果、停止收集。
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.result: str | None = None
        self._depth = 0            # 距离目标块开标签的嵌套深度（>0 表示在块内）
        self._buf: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if self.result is not None:
            return
        if self._depth > 0:
            # 已在目标块内：嵌套子标签只加深度，文本照常收集。
            self._depth += 1
        elif tag in _TARGET_TAGS:
            # 进入一个新的候选块。
            self._depth = 1
            self._buf = []

    def handle_endtag(self, tag: str) -> None:
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
        if self.result is None and self._depth > 0:
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
