---
name: a4-issue-page-investigation
title: A-4 · issue 页"不自动下滑"根因调查报告
date: 2026-05-27
status: investigation-only (no code commit)
related: Probe 反馈 #15 "出结果时下拉页面才能看到结果，不能自动下滑"
plan_ref: docs/probe-feedback-plan-v0.3-final-2026-05-27.md §1.A-4
---

# A-4 · issue 页根因调查

> Plan v0.3 写明："**先**拿一个真实 issue slug 在桌面/移动 Safari/Chrome 浏览，
> 复现 #15 的'下拉才有结果'；如果是 iframe 内 HTML 首屏不达海报——进 Sprint B
> benchmark，不在 web 改"。本报告交付该验证，**未提交代码改动**。

## 1. 验证方法

- Playwright MCP 浏览器，访问 production: `https://next.oriself.com`
- 真实 issue slug: `isfp-57b20529540dfbea`（《一场关于"熊"的慢镜头》2026-05-23）
  + `intj-ed378b0b283f6167`（《协议的意志 · The Will of Protocol》2026-05-21）
- 测三组：桌面 1440×900 / 移动 414×896 / 带 `?arrived=1` 的 ArrivalCeremony

## 2. 现状观察

### 2.1 父页面（`web/app/issues/[slug]/page.tsx`）

```ts
iframe.getBoundingClientRect() → { x:0, y:0, w:1440, h:900 }
document.documentElement.scrollHeight = 900   // 等于视口
document.body.scrollHeight = 0                // 没有 body 内容
window.scrollY = 0
```

iframe `fixed inset-0 w-full h-full z-20` 完全占据视口，父页面没有任何可滚动
内容。**所以"下拉"的诉求不在父页面层。**

### 2.2 iframe 内（LLM 生成的 HTML）

`curl /api/issues/.../render` 拉到的 308 行 HTML：

```
<section class="hero">          ← 首屏海报（user 看到的）
  <div class="hero-bg-text">BEAR</div>
  <div class="mbti-tag">ISFP</div>
  <h1>...</h1>
  <div class="meta-strip">...</div>
</section>
<main class="content">          ← 报告主体（需要 scroll iframe 才能看到）
  <section class="insight-section">...</section>
  <section class="quote-block">...</section>
  <section class="insight-section">...</section>
  <section class="dimensions">...</section>
  <section class="insight-section">...</section>
  <footer>...</footer>
</main>
```

**用户感知的"下拉才有结果"指的是 iframe 内部滚动**——hero 占了首屏，3 段 insight
+ 维度区 + footer 全在下面，要在 iframe 里向下滚动才能看到。

### 2.3 桌面截图

[a4-desktop-first-view.png](./screenshots-a4/a4-desktop-first-view.png)

首屏完整海报：背景 `BEAR` 大字 + `ISFP` 标签 + 标题"三楼窗台，与那个'很美'的瞬间"
+ subtitle "在众人的喧嚣之外，你拥有一个极其精确、极具质感的私人观测台。" + 底部
IssueChrome (复制地址 / 反馈)。**这一屏本身已经"是一封信"，海报完整。**

### 2.4 移动截图

[a4-mobile-first-view.png](./screenshots-a4/a4-mobile-first-view.png)

414×896 首屏：MBTI / 标题 / subtitle 都完整放进视口，IssueChrome 露出。换行
合理，没有内容被裁。

### 2.5 ArrivalCeremony

[a4-arrival-immediate.png](./screenshots-a4/a4-arrival-immediate.png)

`?arrived=1` 触发的 6 秒封缄：「这封信已经写完」+ 地址 + "看信 →" / "复制地址"
+ "按 ENTER 或 ESC 直接看信"。**用户体验流畅，不抢焦点，可以键盘或按钮直接跳过**。

## 3. 根因判定

**这不是 bug，是 UX 学习成本问题**。CONVERGE.md §Composition-first 明确要求：

> **First viewport is a poster, not a document.**
> 用户打开的第一屏，应该像一张**海报**：有压迫感、有视觉主题、能让人停 2 秒。

测试的两个 issue 都做到了。但 **iframe 内首屏是海报，主体内容在下面**这件事
用户**无法预知**——尤其当：

1. iframe 没有可见 scroll cue（向下箭头 / "more below" 类锚点）
2. 父页面 `fixed inset-0` 没有滚动条提示
3. 桌面 trackpad 用户可能尝试外层滚动 → 没反应 → 误以为"页面卡住"

## 4. 修复建议（**不在 Sprint A 范围**）

按修复成本递增列出，niuniu 自己决定哪个进未来 sprint：

### 选项 1 · 父页面 overlay 一个微弱 scroll hint（**推荐**）

在 `app/issues/[slug]/page.tsx` 加一个固定底部微小 mono 字：

```tsx
<p className="fixed bottom-[68px] left-1/2 -translate-x-1/2 z-25 font-mono text-[10px] tracking-widest uppercase text-ink-muted/50 pointer-events-none animate-blink">
  ↓ 滚动看完整报告
</p>
```

- 不破 LLM iframe 设计自主权
- 不依赖 LLM 是否生成 scroll cue（rigid 修复）
- z-25 在 iframe (z-20) 之上、IssueChrome (z-30) 之下
- 7-10 秒后自动 fade（用 sessionStorage 标记 user 滚动过则永久隐藏）

### 选项 2 · CONVERGE.md prompt 加规则

```
## hero 末尾必须有 scroll cue

hero section 的最后一行 / 最后一个元素，必须有一个**视觉锚点**让用户知道
下面有内容：
- 一个向下箭头（↓ / arrow icon / chevron）
- 或一句小字 "more →"、"continue ↓"、"3 段洞见 ↓" 这类
- 或一条 decorative line + 小标签
```

- 治本，但依赖模型 follow prompt
- 不同 issue 的执行可能不一致——B-3 人工 review 时一并校验

### 选项 3 · 父页面 onScroll 拦截转发给 iframe（**不推荐**）

让父页面 listener 把 wheel/touch 事件转发给 iframe 内 window。
**违反 sandbox 设计哲学**（iframe 要保持隔离），且 cross-origin 难做。

## 5. 结论

- A-4 验证：**不修代码，仅记录**
- 根因不是 bug，是 iframe 内首屏=海报这件事用户感知不到
- 真要修，**选项 1**（父页面 overlay scroll hint）是 1-2 小时的小工作量改动，
  可以作为 Sprint B 之外的彩蛋项；不进 v2.7 Sprint A
- 选项 2 落到 CONVERGE.md 时和 Sprint C（如果做的话）一并落

## 6. 截图清单

存在 `docs/screenshots-a4/`：
- `a4-desktop-first-view.png` · 桌面 1440×900 首屏
- `a4-mobile-first-view.png` · 移动 414×896 首屏
- `a4-arrival-immediate.png` · ArrivalCeremony 显示状态
- `a4-arrival-t0.png` · 第一次测试时 ceremony 已结束（参考）
