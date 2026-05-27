---
name: probe-feedback-plan-v0.2
title: v2.7 改进方案 v0.2（code-grounded，待 Codex round 2）
version: 0.2-draft
status: draft-pending-codex-round2
date: 2026-05-27
supersedes: probe-feedback-plan-draft-2026-05-27.md
inputs:
  - docs/probe-feedback-issues-2026-05-27.md
  - docs/probe-feedback-codex-round1-2026-05-27.md
---

# v2.7 改进方案 v0.2 · code-grounded

> v0.1 飘在概念层，被 niuniu 打回："必须 dive into 现有代码"。
> v0.2 每条改动都有 `file:line` 锚定，并明示"v2.6.1 prompt 已写但模型没 follow" 的项。

---

## 0. dive-into-code 关键发现（推翻 v0.1 的核心假设）

### v2.6.1 已经实现的（v0.1 不知道）

| v0.1 提的"要做的事" | 实际已在 v2.6.1 完成的位置 | 现状 |
| --- | --- | --- |
| B-3 uncertainty 表达 | `skill-repo/skills/oriself/CONVERGE.md:64-78` 已写"对抗式审查 + uncertain 0.50-0.55 显式标'信号互相拉扯'" | ✅ prompt 已写完整 |
| B-3 confidence-driven phase override | `server/oriself_server/skill_runner.py:142-170` `choose_phase_key` 是**按轮号算的**（warmup/midpoint/deep）；confidence 只在 CONVERGE 才产生（`extract_oriself_conf_from_html`），对话过程根本没有 | ❌ 信号源不存在 |
| B-4 acknowledge-then-question | `skill-repo/skills/oriself/ETHOS.md:62-72` §3「情绪优先 + 共情为主 + 轻问一句」已写 | ✅ prompt 已写 |
| B-2 topic-pivot N=3 | `skill-repo/skills/oriself/phases/phase-deep.md` v2.6.1 `ea85359` 已加「连 2 轮同主线 → 第 3 轮换维度」 | ✅ prompt 已写（弱约束）|
| 反对二选一 | `SKILL.md:96-107` 铁则 1 「不主动二选一」+ 判定原则 + fallback 题池条件 | ✅ prompt 已写（强约束）|
| 报告无 anchoring 总结 | `ETHOS.md:36-58` v2.6.1 加固「对话轮禁止中间断言」红线句式 | ✅ prompt 已写 |
| roleplay = N 信号 | `server/oriself_server/skill_runner.py:738-810` + `CONVERGE.md:81-92` v2.6.1 入了 prompt（不入库 flag） | ✅ prompt 已写 |
| 四维度自标 | `phases/phase-deep.md` v2.6.1 `ea85359` 「开口前在心里给 E/I S/N T/F J/P 各标状态」 | ✅ prompt 已写（心里标，不落库） |
| 升华腔自查 | `SKILL.md:54-59` v2.6.1 加 | ✅ prompt 已写 |

### v0.1 想当然但代码其实已经在做的事

1. **letter-view.tsx:71-74** 已经有 `scrollIntoView({ behavior: "smooth" })`——所以 I-5「不自动下滑」**不是 letter 页**，要在 `app/issues/[slug]/page.tsx` 找（iframe 全屏 + ArrivalCeremony 焦点抢占）
2. **letter-view.tsx:341-356** 空态已经有 3 个种子开头（"最近在忙的事 / 昨晚睡不着时在想的 / 这周印象最深的一个画面"）。Codex round 1 提的"低能量开头 chips"**现状就是**——只是布局把它们放在视觉中心，挤压 composer
3. **letter-view.tsx:378-388** 第 6 轮起的「现在收信」按钮已经在了
4. **letter-view.tsx:394-427** NEED_USER 横幅已有完整退出/暂停设计（Codex round 1 提的"缺退出/暂停"其实有，只是只在 NEED_USER 触发）
5. **letter-view.tsx:55-56,133-158** `handleConverge` 有 `isConverging` lock 但 **没有可见 loading 态**——这才是 #16 用户"以为系统坏了"的真正源头

### 真正的根因再分类（取代 v0.1 表格）

| Issue | 真正根因 | 应该改哪一层 |
| --- | --- | --- |
| I-1 流程感 | web 缺"我已经在路上 / 还能继续聊"的微反馈 | web |
| I-2 死磕 | skill prompt 已写约束，但**弱模型 gemini-3.5-flash 没 follow**（v2.6.1 当前主力） | benchmark 验证 + 可能调 prompt 措辞 |
| I-3 识别错位 | CONVERGE.md 防御已经很厚，**但 R1-R3 早期 anchoring 没专门处理**——`phase-onboarding.md` / `phase-warmup.md` 没读全 | skill | 
| I-4 收信 loading | `letter-view.tsx::handleConverge` 缺可见态 | web | 
| I-5 报告不下滑 | issue 页 iframe + ArrivalCeremony 焦点抢占（待验证） | web |
| I-6 字体细线条多 | `tailwind.config.ts` + `app/globals.css` 视觉 token | web design |
| I-7 对话框被压 | `letter-view.tsx:314-358` 空态布局，01. 招牌字 + 段落 + 种子按钮 列在中间 | web |
| I-8 共情缺失 | ETHOS §3 已写，模型没 follow | benchmark 验证 |
| I-9 报告无建议 | CONVERGE 立场"不给建议"是**有意为之**（§5 "我看到的 TA，不是 TA 应该怎样"）；**保持** | 不改 |
| I-9 报告配色 | LLM 当轮决定 CSS（CONVERGE §3 deliberate risks），不是固定模板 | 不改（信任 LLM）|
| I-10 大题目 | phase prompt 已禁止"你期待什么"式抽象问，模型没 follow | benchmark 验证 |
| I-11 进入期望 | `app/page.tsx:9` 注释明示"不卖、当作品"——**和产品哲学冲突的取舍** | 需要决策 |
| I-12 选项化 | 现状种子开头已是软选项，**布局优化即可**，不做 4 选项 D=其他 | web 布局 |

**所以 v2.7 真正要做的是 4 件事，不是 12 件**：

1. **Web 端补可见反馈与布局微调**（I-4 / I-5 / I-7 / I-1 web 侧）
2. **建离线回放 benchmark**（验证 I-2 / I-3 / I-8 / I-10 到底是 prompt 缺还是模型没 follow）
3. **R1-R3 早期 anchoring 检查**（I-3 唯一可能的剩余 prompt 空间）
4. **landing 期望管理的取舍决策**（I-11——需 niuniu 拍板）

---

## 1. Sprint A · web 修补（1-3 天）

### A-1 · "现在收信"点击后立刻给可见 loading（I-4）

- **当前代码**：`web/app/letters/[id]/letter-view.tsx:133-158`
  ```tsx
  const handleConverge = useCallback(async () => {
    if (isConverging) return;
    setIsConverging(true);
    try {
      const result = await composeResult(letterId);
      // ... 期间 UI 没有视觉反馈，按钮 disabled 但不明显
      router.push(`/issues/${result.issue_slug}?arrived=1`);
    } catch (err) {
      setError(...);
    }
  }, [...]);
  ```
- **改动**：`handleConverge` 触发时 render 一个全屏 / 半屏 overlay
  - 文案："正在替你封缄这封信…通常 10–20 秒"
  - 视觉：复用 ArrivalCeremony 的封缄美学（笔触渐显 + monospace tick）
  - 错位失败时 overlay 给"再试一次"按钮（当前 error 行在 main 内部，loading 走开后才看到）
- **风险**：报告生成失败时 overlay 要能体面退出（不能锁死）
- **影响文件**：`web/app/letters/[id]/letter-view.tsx` 新增 `<ConvergingOverlay />` 子组件；可能新建 `web/components/letter/converging-overlay.tsx`

### A-2 · "现在收信"按钮首次出现时的轻提示（I-4 配套）

- **当前代码**：`web/app/letters/[id]/letter-view.tsx:378-388`，按钮就贴在最后一个 oriself turn 下方
- **改动**：第一次该按钮可见时（用 sessionStorage `oriself:converge-hint-seen-<letterId>` 标记），按钮上方淡入一行 monospace 提示：
  > 「准备好了就可以收信。再多聊几轮也行——15 轮左右最稳。」
- **文案约束**（Codex round 1 改建议）：不要写"6-15 轮、10-20 分钟"会造成完成焦虑；要把控制权交给用户

### A-3 · 空态布局：种子开头下移、composer 视觉权重提升（I-7）

- **当前代码**：`web/app/letters/[id]/letter-view.tsx:314-358`
  - "01." 招牌字（72-132px）→ 段落 → 种子按钮列 → 大量留白 → composer fixed 底
  - 种子按钮 `<ul>` 在视觉中心（`max-w-[520px]` + `mt-12` flex-col gap-3）
- **改动方案**（两选一，需 niuniu 拍板）：
  - **方案 X**：把"01."+ 段落上移变成 masthead 下方一段小注释；种子按钮列下移到接近 composer 上方 50px 处，做成 chips 紧贴输入框
  - **方案 Y**：保留空态视觉中心，但把 composer 改成"输入框 + 第一行 chip 按钮"复合组件——chips 放在 textarea 上方一行，整体高度增加
- **影响文件**：`letter-view.tsx` 空态分支重写 + 可能 `composer.tsx` 加 chips 插槽
- **保留约束**：v0.1 提到的"作品集风"留白美学不要破

### A-4 · issue 页报告生成完毕的视觉接收（I-5）

- **疑似根因**：`web/app/issues/[slug]/page.tsx:39-72` iframe fixed inset-0 + ArrivalCeremony 抢焦点，用户 #15 看到的 "下拉才有结果" 可能是：
  - LLM 写的 HTML 第一屏不是 "海报"（虽然 CONVERGE §Composition-first 要求海报，但模型没 follow）
  - 或者 ArrivalCeremony 持续时间过长把视觉锁在动画
- **改动**：
  1. 读 `web/components/issue/arrival-ceremony.tsx`（本次没读），确认动画时长 + 结束时是否触发"展开报告"
  2. 如确认 iframe 内 HTML 不达海报标准 → 这是 LLM/skill 问题，**进 benchmark**
  3. 浏览器测：拿一个真实 issue slug 在不同设备分辨率打开，看是否真要"下拉"
- **保留**：先验证再改，不盲拍

### A-5 · landing 文案"期望管理"取舍决策（I-11）

- **当前代码**：`web/app/page.tsx:33-45`
  ```tsx
  <p className="fraunces-body-soft italic ...">
    原自我 · 从你说的话里，长出你自己本来的样子
  </p>
  <Link href="/letters/new">进入 →</Link>
  ```
  注释（line 9）：「不卖。当成一个作品。一个名字、一行版权页式注释、一个入口。没有 hero 广告语、没有"发生什么"分段、没有 CTA 文案动员。」
- **冲突**：用户 #6 / #14 / #19 / #21 都误以为是 MBTI 测试 / 占卜，但 landing 设计明确反 CTA
- **三个备选**（求 niuniu 决策）：
  - X1 · **零改动**：信任产品立场，"以为是占卜"的用户本来就不是目标用户
  - X2 · **微改一行**：副标后加 mono 小字"约 10 分钟 · 边聊边写一封信"。不破留白
  - X3 · **入口按钮加 hover 文案**：「进入 →」hover 时浮一行说明
- **建议默认 X2**——最小破坏

---

## 2. Sprint B · 离线回放 benchmark 基建（5-7 天，决定后续）

> **这是 v2.7 最关键的一块**——没有 benchmark 之前所有 skill 改动都是猜。
> Codex round 1 的核心质疑："skill 层用硬规则修体验，反过来破坏 oriself 的核心对话感"——
> 没有 benchmark 就回不出这种质疑。

### B-1 · 离线回放器（offline replay harness）

- **目标**：拿 `conversations` 表里任一 session 的 `user_message` 序列，喂给同一份 skill prompt 跑 oriself 的回应，对比真实历史
- **复用现成代码**：
  - `server/oriself_server/skill_runner.py::TurnRunner` 已是无状态的 `(session, user_message) → stream` 接口
  - `server/oriself_server/llm_client.py::MockBackend` 可改成"按既定脚本回放"
- **新文件**：`server/scripts/replay_session.py`
  - 输入：`session_id` 或 `transcript.json`
  - 调用 TurnRunner，把每轮 user_message 喂进去，记录生成的 oriself_text + chosen_phase_key + loaded_skills
  - 输出：`replay_<sid>.jsonl`，每行 `{round, user_msg, real_oriself, replayed_oriself, phase, loaded_skills}`
- **scaffolding 已存在**：`server/scripts/g3f_self_test.py`（v2.6.1 ea85359 加的 e2e 测试 CLI）可作为模板

### B-2 · 自动 LLM-judge 评分器

- **目标**：把"模型有没有 follow skill 的硬约束"自动检测出来——人工标注成本太高
- **判别项（先做这 6 条）**：
  - J1 · 二选一违例：`oriself_text` 里是否出现"A 还是 B / A 还是 B 的"式句式（regex + LLM judge 双重）
  - J2 · 中间断言违例：是否出现 ETHOS 红线句式（"你是 X 的人 / 你对 X 有极强的 Y"——有 regex 列表）
  - J3 · 死磕：连续 N 轮 chosen_phase_key 之外，是否在**话题层**也固守同一事件（LLM-judge 给"是否换了生活场景"打分）
  - J4 · 共情节拍：用户当轮带强情绪词时，oriself_text 第一句是否承接（LLM-judge）
  - J5 · 升华腔：是否出现"三段式开场 / 抽象拔高"（LLM-judge）
  - J6 · 反射倾听过度：是否每轮都用"你刚说……"开场（regex）
- **判分输出**：每个 session 一个 `judge_report.json`，全 P/F 分布
- **预算**：用 mock + 1 个便宜 provider 跑（不烧 gemini-3.5-flash 主力 quota）

### B-3 · 跑当前 v2.6.1 在历史 10 个 session 上回放

- 拿 oriself_v2.db 里 9 个 v2.6.1 session（49 轮）+ 之前 v1 session（约 20 个）做 baseline
- 看 J1-J6 哪些违例频率 ≥ 50%
- **这就是后续 skill 修改的优先级排序依据**——所谓"prompt 已写但模型没 follow"具体在哪儿

### B-4 · 输出 benchmark report

- `docs/v2.6.1-followthrough-benchmark-<date>.md`
- 表格：每条 ETHOS / SKILL / phase 硬约束的 follow rate
- 这一份输出**是 Sprint C 启动的前提**

---

## 3. Sprint C · 早期 anchoring 检查（依赖 Sprint B 结果，2-3 天）

> 唯一可能的剩余 skill 空间。先验证再改。

### C-1 · 读全 phase-onboarding.md + phase-warmup.md

- 本次 dive 没读，需读全文确认 R1-R3 是否真的有"过早 anchoring"风险
- 如果 phase-onboarding 已经写得很克制（已经禁止"我感觉你是 X 的人"）→ C-2 / C-3 取消

### C-2 · 如果 R1-R3 缺约束，加一条「pre-anchoring guard」

- 在 phase-onboarding.md / phase-warmup.md 加段："**R1-R3 不要在心里下任何 MBTI 字母**。这三轮只做'让 TA 多讲一点'的工作，任何字母先后判定都从 R4 phase-exploring 开始。"
- **不是 server 强制，是 prompt 约束**——保 v2.6 自决哲学

### C-3 · benchmark 校准

- 跑 B-1 / B-2 看 C-2 改动前后的差异

---

## 4. Sprint D · 不做的事 + 取舍记录

| 不做 | 理由 |
| --- | --- |
| ~~B-3 confidence-driven server override~~ | 信号源不存在；冲突 v2.6 自决哲学 |
| ~~B-4 acknowledge-before-question 节拍~~ | ETHOS §3 已写，问题在执行不在 prompt |
| ~~B-2 same_event_run = phase 重叠~~ | phase 是轮号驱动不是话题驱动；Codex round 1 命中 |
| ~~I-9 报告加建议~~ | CONVERGE 立场反 coaching；保 |
| ~~I-12 4 选项 D=其他~~ | 现状种子开头已是软选项；Codex round 1 的"低能量开头 chips"已实现，做 A-3 即可 |
| ~~把 oriself 拉成"测验"~~ | SKILL.md 灵魂 5「不追求测得准，追求让 TA 多看见一点」 |

---

## 5. 实施次序总图

```
Week 1     · A-1 / A-2 / A-3 / A-4 / A-5（web 改完上线，A-5 需 niuniu 拍板）
Week 1-2   · B-1 离线回放 harness（核心基建）
Week 2     · B-2 LLM-judge + B-3 跑 baseline
Week 2-3   · B-4 输出 benchmark report
Week 3     · C-1 phase-onboarding/warmup 全读 + C-2/C-3 if 需要
Week 4     · 视觉 / 移动端审 / 命名审（Codex round 1 提的盲点；优先级最低）
```

---

## 6. 待 Codex round 2 评审的开放问题

1. A-4 issue 页 "不自动下滑" 的真正根因还没验证——是 iframe 内 HTML 不达海报标准、还是 ArrivalCeremony 抢焦点？需要更多证据
2. A-5 landing 文案三选项里推 X2，但和产品哲学的张力大——Codex 怎么看？
3. C-1 全读 phase-onboarding/warmup 是否值得专门开 sprint？还是合并进 B-3 benchmark 同时做？
4. B-2 J3 死磕的 LLM-judge：用什么 prompt 让 judge 准确判"换了生活场景"？
5. 整个 plan v0.2 删掉了 v0.1 大半内容，是不是太保守了？Codex round 1 提的"缺真实漏斗数据"完全没做——要不要把 funnel 埋点也加进 Sprint A？

