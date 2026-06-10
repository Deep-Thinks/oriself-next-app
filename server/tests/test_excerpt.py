"""§4.3 · extract_excerpt TDD：从报告 HTML 抽一段纯文本摘录（喂三面：meta/画廊/分享图）。

规则：
- 取第一个 stripped 文本长度 ≥ 20 的 <p> 或 <blockquote>；
- 剥所有标签、折叠空白；
- 截断到 80 字符，原文更长则补中文双省略号「……」；
- 无合格元素 → None。
"""
from __future__ import annotations

from oriself_server.utils.excerpt import extract_excerpt


def test_normal_long_first_paragraph_truncates_with_ellipsis():
    """1 · 正常：长首段 → 取其文本，>80 截断并补「……」。"""
    long_text = "你" * 120  # 120 字，远超 80
    html = f"<!doctype html><html><body><p>{long_text}</p></body></html>"
    out = extract_excerpt(html)
    assert out is not None
    # 截断到 80 字 + 末尾「……」
    assert out == "你" * 80 + "……"
    # 主体（去掉 ……）不超过 80
    assert len(out.replace("……", "")) == 80


def test_no_paragraph_or_blockquote_returns_none():
    """2 · 没有任何 <p>/<blockquote> → None。"""
    html = "<!doctype html><html><body><div>只有 div，没有合格容器元素在这里</div></body></html>"
    assert extract_excerpt(html) is None


def test_skips_short_paragraph_takes_later_blockquote():
    """3 · 首 <p> 短（<20）被跳过，后面的 <blockquote> 合格 → 取 blockquote。"""
    short = "<p>太短了</p>"  # 4 字 < 20，跳过
    long_quote = "这是一段足够长的引文用来通过二十字的门槛限制"  # ≥ 20 字
    html = (
        "<!doctype html><html><body>"
        f"{short}<blockquote>{long_quote}</blockquote>"
        "</body></html>"
    )
    out = extract_excerpt(html)
    assert out is not None
    assert out == long_quote  # 未超 80，不补省略号
    assert "……" not in out


def test_all_paragraphs_too_short_returns_none():
    """3b · 所有段落都 < 20 字 → None。"""
    html = (
        "<!doctype html><html><body>"
        "<p>短一</p><p>短二</p><blockquote>短三</blockquote>"
        "</body></html>"
    )
    assert extract_excerpt(html) is None


def test_nested_tags_inside_qualifying_element_strips_fragments():
    """4 · 合格元素内嵌套标签 → 文本干净抽出，无标签碎片。"""
    html = (
        "<!doctype html><html><body>"
        "<p>开头一段 <em>强调内容</em> 还有 <strong>加粗</strong> 收尾文本补足长度</p>"
        "</body></html>"
    )
    out = extract_excerpt(html)
    assert out is not None
    assert "<" not in out and ">" not in out
    assert "em" not in out  # 标签名不该出现
    assert out == "开头一段 强调内容 还有 加粗 收尾文本补足长度"
