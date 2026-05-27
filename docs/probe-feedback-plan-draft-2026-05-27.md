---
name: probe-feedback-plan-draft-2026-05-27
title: 基于 Probe 反馈的 v2.7 改进方案（草案 · 待 Codex challenge）
version: 0.1-draft
status: draft-pending-codex-review
date: 2026-05-27
inputs:
  - docs/probe-feedback-issues-2026-05-27.md
---

# v2.7 改进方案草案

> 本草案是 Claude 自己先想清楚的版本，**未经 Codex 评审**。
> 评审后会输出 final 版给 niuniu。
>
> 设计原则：
> 1. **不破坏产品立场**——oriself 是"信不是测验"，多选题、性格量表化不做。
> 2. **先做高影响低成本**——I-7 / I-11 / I-4 / I-5 周内能上。
> 3. **skill 层改动靠 prompt 而不是 hard guardrail**——v2.4 哲学延续。
> 4. **每条改动可观测**——加 metric / log，不裸改 prompt 后无法 A/B。

---

## 0. 不在本方案内做的事

| Issue | 原因 |
| --- | --- |
| I-10 大题目（"你期待什么"） | 并入 I-2 / I-3 的 prompt 微调，不单立项 |
| I-12 4 选项 D=其他 | 违背"信不是测验"产品立场。**取舍记录**：tester 心智模型在 MBTI 测试，但产品反命题就是"用讲故事代替选选项"——不让步 |

---

## 1. Sprint A · 即刻能上（1-3 天，web 为主，零风险）

### A-1 报告生成后自动滚动到结果块（I-5）

- **改点**：`web/components/letter/turn.tsx` 或 `web/app/letters/[id]/page.tsx`——监听 `result.ready` 事件后 `scrollIntoView({ behavior: 'smooth' })`
- **验证**：开 mock provider 跑一封信，看自动滚动是否到结果顶
- **风险**：iframe 高度未确定时滚动可能错位 → 等 `onLoad` 再滚

### A-2 "现在收信"按钮：tooltip + 点击 loading 态（I-4）

- **改点**：
  1. 按钮首次出现时附 1 句解释 tooltip / popover：「随时可以收信——收到的是一封 AI 根据这几轮对话写给你的信。再聊几轮也行。」
  2. 点击后立刻切换到全屏 / 半屏 loading：「正在生成你的信…通常 10–20 秒」
- **改点文件**：`web/components/letter/composer.tsx`（按钮）+ `web/app/issues/[slug]/page.tsx`（loading 态）
- **风险**：tooltip 文案需要和 ETHOS 风格一致，不要工业感太强

### A-3 首页布局：输入框上提，候选话题降权（I-7）

- **改点**：`web/app/page.tsx` 或 `web/app/letters/new/page.tsx`
  - 输入框放在视觉中线、置顶；三条预设候选下移并改成「也可以从这里开始」灰底小卡
  - 输入框 placeholder 强提示「写一句最近在想的事，就行了」
- **验证**：design-review 跑一遍前后对比
- **风险**：会触动主视觉布局，需要保留旧版做 A/B（feature flag `web_layout_v2`）

### A-4 landing 期望管理文案（I-11）

- **改点**：`web/app/page.tsx` 首屏 hero——明示三件事
  - **是什么**：「一封 AI 听你讲完后写给你的信」
  - **不是什么**：「不是占卜、不是选择题测验」
  - **耗时**：「6–15 轮对话，10–20 分钟」
- **风险**：和现有"oriself"留白美学冲突→ 可作 hover/折叠提示，不强行打破留白

---

## 2. Sprint B · 战略级（skill / server，3–7 天）

### B-1 流程感的轻量化（I-1）

**目标**：让 tester 感到「还能继续 / 已经可以结束 / 不会无穷无尽」而 **不触发"我在做测验"心智**。

- **方案 1（首选）**：第 4 轮起，composer 下方加一条几乎隐形的进度文案：
  - 第 4 轮："已经聊了一会儿，再聊几轮你的信就成形了。"
  - 第 6 轮："准备好了就可以收信。再聊也行，到 15 轮左右最稳。"
  - 第 12 轮："聊得很深了，继续会重复。建议这两三轮内收信。"
- **不做**：「3/30」式数字进度——立刻把信变成考试
- **改点**：`web/components/letter/turn.tsx` 加 `<SoftProgressHint round={n} />`
- **指标**：埋点 `funnel_round_X_reached`，每周对照漏斗看 round 6 / 12 转化

### B-2 死磕修正：topic-pivot 信号（I-2）

**根因诊断**：v2.6.1 的"反射倾听限制"是 prompt 里写「不要超过 3 轮单事件追问」，但 LLM 没有 **跨轮记忆"我已经在这个事件里待了几轮"**。

- **方案**：
  1. server 侧在每轮调用前，从 conversations 表算 `same_event_run = 连续 N 轮 chosen_phase_key 相同`
  2. 把 `same_event_run` 注入到 pass1 的 system context：`"你在同一个事件主题里已经聊了 N 轮，N>=3 时本轮 MUST 切换到一个新生活场景。"`
  3. skill-repo 加一个新 phase `pivot_to_new_domain.md`，专门处理切换提问
- **改点**：
  - `server/oriself_server/skill_runner.py` 的 `choose_phase_key` 前置注入 hint
  - `skill-repo/skills/oriself/phases/pivot_to_new_domain.md`（新文件，需在 skill-repo 仓改 + bump submodule）
- **风险**：硬切换可能让对话感觉跳脱→ 仅在 same_event_run >= 3 触发；切换前要 acknowledge 当前事件

### B-3 早期锚定缓解（I-3）

**根因诊断**：当前 confidence_json 在 v2.6.1 已入库但只用于矛盾检测；它**还没反过来调控提问策略**。

- **方案**：
  1. server 侧每 2 轮读一次 `confidence_json`：如 4 维度中有任意 1 维度 < 0.5 持续 3 轮，则把当前 chosen_phase_key **强制切到该维度的探测 phase**
  2. skill-repo 在 phases 下补齐 4 个 `probe_<dim>.md`（如 `probe_ei.md`, `probe_sn.md` …），分别专门测 E/I、S/N、T/F、J/P
  3. 报告 pass 在生成前增加一道 self-check：「如果任一维度信号 < 0.6，在报告里**显式承认不确定性**而不是硬给 4 字母」
- **改点**：
  - `server/oriself_server/skill_runner.py::advance_state` 加 confidence-driven phase override
  - `skill-repo/skills/oriself/phases/probe_*.md` 4 个新文件
  - `skill-repo/skills/oriself/CONVERGE.md` 加 uncertainty 表达节
- **风险**：confidence 是 LLM 自己给的，可能自我强化偏差→ 加 benchmark 跑校准

### B-4 共情节拍：acknowledge-before-question（I-8）

**根因诊断**：v2.5 / v2.6 的 SKILL.md 强调"不安慰、引导讲故事"；但 #16 用户的诉求是「**先承接情绪，再提问**」——这两者不冲突。

- **方案**：ETHOS.md 加一节「acknowledge-then-question 节拍」：
  - 每轮 oriself_text **必须以 1–2 句不重复用户原话的承接**开场（不是 paraphrase，是 emotional attunement）
  - 用「我感觉…」「听起来…」「这种…的感觉…」，不要「你刚才说…」
- **改点**：`skill-repo/skills/oriself/ETHOS.md`，加段「rhythm: hold-then-probe」
- **风险**：可能触发 v2.6.1 已经修过的"反射倾听过度"→ 配套指标：reflective 长度 ≤ 用户消息长度的 60%

---

## 3. Sprint C · 视觉与报告（design/frontend，1 周）

### C-1 聊天页视觉重设（I-6）

- 字体加重：`font-weight: 400` → `500`，正文字号 +1px
- 减线条：审计 `tailwind.config.ts` 中所有 `border` / `divider` 用法，能去则去
- 对话框边框对比度提升，让它"不像提示词"
- **触发**：design-review 前后对比 + 跑 frontend-design 重审

### C-2 报告页改造（I-9）

- **建议段**：CONVERGE.md 加可选 `optional_next_breath` 段——
  - 不是"行动建议"（违背画像产品定位）
  - 是「下一封信可以从哪里开始」式的接续提示
- **配色**：issue HTML 模板降低饱和度、加大字号、增加段间距；找 1 个 designer 跑
- **改点**：`skill-repo/skills/oriself/CONVERGE.md` + issue 模板（server 端硬编码？需要确认）

---

## 4. 实施次序 & metric

```
Week 1: A-1 / A-2 / A-3 / A-4（web 改完上线）→ 灰度全量
Week 2: B-1 / B-2（skill-repo 改 + bump submodule + benchmark 跑通）
Week 3: B-3 / B-4（更深 skill 改造 + confidence loop 接通）
Week 4: C-1 / C-2 设计交付
```

**关键指标（v2.7 ship gate）**：
1. MBTI 命中率 ≥ v2.6.1 基线（不能为了打散 anchoring 而牺牲准确率）
2. round 6 转化率 ↑（funnel 顶端漏水变小）
3. Probe 下一批反馈中 I-1 / I-2 / I-3 / I-4 出现频次 ↓

---

## 5. 开放问题（送 Codex 用）

1. B-2 / B-3 都依赖 skill-repo 改动；submodule bump 是 weekly auto PR，本次方案是否需要手动加急一次？
2. B-3 的 confidence-driven phase override 会不会和 v2.6 的 "pass1 是 tool planning contract, LLM 自决" 哲学冲突？（LLM 选 phase vs server 强切）
3. A-2 的"信"按钮 loading 全屏 vs 半屏，哪个不破坏沉浸感？
4. C-2 的"下一封信可以从哪里开始"——这是不是隐性地把 oriself 拉向 coaching 方向？是否冒险？
5. I-12（4 选项 D=其他）的取舍记录到底对不对？是不是应该做一个 "低能量模式" 备选 path 而不是完全拒绝？

