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


# ── codex P2 回归：void 标签破坏深度计数 + script/style raw-text 泄漏 ──


def test_br_inside_paragraph_still_extracts_first_paragraph():
    """5 · <p> 内含 <br>（void 标签）→ 首段仍能正常闭合并被抽出，而不是 None。

    Bug 1：void 标签触发 handle_starttag 却没有对应 handle_endtag，旧实现会让
    深度永远不归零，导致 </p> 永远关不上块、整封报告无摘录。
    """
    html = (
        "<!doctype html><html><body>"
        "<p>足够长的一段正文内容在这里写满二十个字<br>继续写更多内容</p>"
        "<p>第二段也足够长的正文用来当干扰项不该被选中</p>"
        "</body></html>"
    )
    out = extract_excerpt(html)
    assert out is not None
    # <br> 折叠成一个空格，首段文本被完整抽出（不是 None、不是第二段）
    assert out == "足够长的一段正文内容在这里写满二十个字 继续写更多内容"


def test_void_img_before_paragraph_still_extracts():
    """6 · 段落前出现 void <img> → 不破坏深度计数，后续合格段落照常被抽出。"""
    html = (
        "<!doctype html><html><body>"
        '<img src="x.png" alt="封面图">'
        "<p>这是一段足够长的正文内容用来通过二十字的门槛限制</p>"
        "</body></html>"
    )
    out = extract_excerpt(html)
    assert out is not None
    assert out == "这是一段足够长的正文内容用来通过二十字的门槛限制"


def test_self_closing_br_does_not_unbalance_depth():
    """6b · XHTML 风格自闭合 <br/> 同样不该破坏深度（走 handle_startendtag）。"""
    html = (
        "<!doctype html><html><body>"
        "<p>足够长的一段正文内容在这里写满二十个字<br/>后半段补足长度</p>"
        "</body></html>"
    )
    out = extract_excerpt(html)
    assert out is not None
    assert out == "足够长的一段正文内容在这里写满二十个字 后半段补足长度"


def test_style_only_paragraph_does_not_leak_css():
    """7 · <p><style>…长 css…</style></p>（无真实正文）→ 绝不返回 CSS，返回 None。

    Bug 2：style/script 的 body 文本被当成正文收集进 buffer。
    """
    html = (
        "<!doctype html><html><body>"
        "<p><style>body{color:red;font-size:14px;margin:0 auto;padding:20px}</style></p>"
        "</body></html>"
    )
    out = extract_excerpt(html)
    assert out is None


def test_style_then_prose_returns_prose_not_css():
    """7b · <p><style>…</style>真正的正文…</p> → 返回正文，不含 CSS 碎片。"""
    html = (
        "<!doctype html><html><body>"
        "<p><style>body{color:red;font-size:14px;margin:0}</style>"
        "真正的正文内容在这里足够长二十个字以上才行</p>"
        "</body></html>"
    )
    out = extract_excerpt(html)
    assert out is not None
    assert out == "真正的正文内容在这里足够长二十个字以上才行"
    assert "color" not in out and "{" not in out and "}" not in out


def test_script_then_prose_returns_prose_not_js():
    """8 · <p><script>…长 js…</script>真正的正文…</p> → 返回正文，不含 JS。"""
    html = (
        "<!doctype html><html><body>"
        "<p><script>var x=1;function f(){return x+document.title+'leak';}</script>"
        "真正的正文内容在这里足够长二十个字以上才行</p>"
        "</body></html>"
    )
    out = extract_excerpt(html)
    assert out is not None
    assert out == "真正的正文内容在这里足够长二十个字以上才行"
    assert "function" not in out and "document" not in out and "var" not in out
