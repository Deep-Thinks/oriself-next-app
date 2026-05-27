---
name: probe-feedback-plan-v0.3-final
title: v2.7 改进方案 v0.3（final · code-grounded · Codex round 2 已合）
version: 0.3-for-niuniu-review
status: ready-for-niuniu
date: 2026-05-27
codex_session_id: 019e680e-eade-7902-b51a-58b93636328f
supersedes:
  - probe-feedback-plan-draft-2026-05-27.md
  - probe-feedback-plan-v0.2-2026-05-27.md
inputs:
  - docs/probe-feedback-issues-2026-05-27.md
  - docs/probe-feedback-codex-round1-2026-05-27.md
---

# v2.7 改进方案 v0.3 · 给 niuniu 审

> 三轮迭代：v0.1 概念 → 被打回 → v0.2 code-grounded → Codex round 2 校正 → **v0.3 终稿**。
> Codex round 2 命中 4 个 v0.2 没区分开的点，已合入。
> 决策项（A-5、A-3 X/Y、Sprint 顺序）在文末"待 niuniu 拍板"段。

---

## 0. Codex round 2 改了什么（vs v0.2）

| v0.2 表述 | Codex round 2 校正 |
| --- | --- |
| "CONVERGE.md 已有 uncertainty 表达" → 推 "I-3 prompt 已写完整" | ⚠️ 只保护**报告**生成，不保护**对话阶段**早期 anchoring。R1-R5 仍是 anchoring 风险面 |
| "phase-deep 已有'连 2 轮同主线换维度'" → 推 "I-2 是模型没 follow" | ⚠️ `phase-exploring.md` 没有同等强度约束（只是"每轮一件事"），所以 R4-R{mid} 阶段 prompt 覆盖**不均**——I-2 部分是 prompt 缺，不全是模型没 follow |
| "四维度自标已写" | ⚠️ 只在 `phase-deep` 强写，`phase-exploring` 是"心里累计"，**强度不同** |
| A-1 overlay 只覆盖手动收信 | ⚠️ 漏了 `letter-view.tsx:193` `handleSend` 内的**自动 CONVERGE** —— overlay 要覆盖两条路径 |
| A-2 文案 "15 轮最稳" | ❌ 制造"没聊够就不准"焦虑。改为「**现在已经可以收信；再聊几句会更细。**」|
| Sprint A 只做 web，funnel 留 Sprint B | ❌ 漏斗埋点是 I-1/I-4/I-5 谁更致命的唯一裁判 → **进 Sprint A**，做最薄版本 |
| B-1 replay 只喂 user_message | ⚠️ 每轮必须用 `advance_state` 把 replayed oriself / status / loaded_skills 写回内存 session（`skill_runner.py:986`），否则 history / already_loaded / R2 preferences 都不真实 |
| B-1 MockBackend 做主 benchmark | ❌ MockBackend 是固定脚本 happy path，不能暴露真实模型 follow 问题（`llm_client.py:433`）。要用真 provider 跑（gemini-3.5-flash 主力） |
| B-2 LLM-judge 用历史 oriself vs replayed 逐字对比 | ❌ 比较的应该是**行为约束、话题覆盖、用户可接续性**，不是文本相似度 |
| J 维度只列 J1-J6 | ⚠️ 缺 6 条：J7 具体性 / J8 早期 anchoring / J9 用户主权 / J10 长度·接续 / J11 phase contract / J12 报告证据污染 |
| 回放 49 轮做 baseline | ⚠️ 只够做 smoke baseline，**不够下稳定性结论**。要补 20-30 条覆盖：短回复、强情绪、roleplay、已知 MBTI、思考型 E、低能量用户 |

---

## 1. Sprint A · web 修补 + 漏斗埋点（1 周）

### A-1 · 收信 overlay（覆盖手动 + 自动两条路径）

- **当前代码**：
  - `web/app/letters/[id]/letter-view.tsx:133-158` `handleConverge` 只有 `isConverging` lock
  - `web/app/letters/[id]/letter-view.tsx:193` 自动 `if (done.status === "CONVERGE") await handleConverge()`
- **改动**：
  1. 新建 `web/components/letter/converging-overlay.tsx`：占屏（半屏 sheet 或全屏雾），复用 ArrivalCeremony 笔触美学
  2. 文案："正在替你封缄这封信…通常 10–20 秒"
  3. 失败时显示 "再试一次" + "回去再聊几轮"
  4. **必须**：监听 `isConverging` 状态在 manual+automatic 两条路径都为 true 时挂载
- **预防 bug**：iframe 跳转后 `isConverging` 不重置——目前 `router.push` 之后组件即将卸载，但失败 path 已 `setIsConverging(false)`，保留这条不变

### A-2 · "现在收信"按钮的首次提示（取代 v0.2 的"15 轮最稳"文案）

- **改动**：第一次 `canRequestResult === true` 时，在按钮上方淡入 mono 字：
  > **「现在已经可以收信。再聊几句会更细——你说够了就行。」**
- **存档**：`sessionStorage` `oriself:converge-hint-seen-<letterId>` 标记已看
- **文件**：`letter-view.tsx:378-388` 按钮区改造，可能新增 `<ConvergeHint />` 子组件

### A-3 · 空态：chips 纳入 composer 上方（Codex 选 Y）

- **当前**：`letter-view.tsx:314-358` 空态是 "01." 大字（72-132px）+ 段落 + 种子按钮列在 max-w-520 中央 + 大量留白 + composer fixed 底
- **方案 Y**（Codex 倾向）：
  - 保留 "01." 招牌字 + 段落作为 hero（产品调性不破）
  - 把种子按钮从 `<ul>` flex-col 改成 chips 横排 / 紧贴 composer 上方
  - 让 composer textarea 上一行就能看到 chips
- **改点文件**：
  - `letter-view.tsx:341-356` 种子按钮列删
  - `composer.tsx` 加 `chips?: string[]` prop，textarea 上方 render 一排 chip 按钮，复用现有 prefill 逻辑

### A-4 · issue 页"不自动下滑"先验证后改

- **现状**：
  - `web/app/issues/[slug]/page.tsx:42-47` iframe `fixed inset-0` 全屏，sandbox=allow-scripts
  - ArrivalCeremony 6 秒自动消散（`arrival-ceremony.tsx:95`，Codex 已 verify）
- **行动**：
  1. **先**：拿一个真实 issue slug 在桌面/移动 Safari/Chrome 浏览，复现 #15 的"下拉才有结果"
  2. 如果是 iframe 内 HTML 首屏不达"海报"（CONVERGE.md §Composition-first）——**进 Sprint B benchmark**，不在 web 改
  3. 如果是 ArrivalCeremony 在某分辨率挡到 iframe 主体——调动画结束位置 / 焦点
- **状态**：**未 commit 改动**，先出根因报告

### A-5 · landing 文案：副标后加 mono 小字（niuniu 选 B）

- **当前**：`web/app/page.tsx:34-36`
  ```tsx
  <p className="fraunces-body-soft italic">
    原自我 · 从你说的话里，长出你自己本来的样子
  </p>
  ```
- **改动**（2026-05-27 niuniu 选定 B）：在副标下方 24-36px 间距插入：
  ```tsx
  <p className="font-mono text-[10px] tracking-widest uppercase text-ink-muted mt-6">
    聊 10 分钟，留下一封写给自己的信
  </p>
  ```
- **取舍记录**：
  - 拒 X1（零改）：把误解用户踢出目标用户群，证据不支持
  - 拒 X3（hover 文案）：移动端无效
  - 拒 v0.2 的"约 10 分钟 · 一封信，不是测验"：niuniu 反馈"摸不清头脑 / 用否定句"
  - 选 B 而非 A："留下一封写给自己的信" 比 "一封写给你的信" 多一层闭环（聊完→留下→属于自己）
  - 拒 C "看懂你这一刻"：有"夸 AI"风险

### A-6 · 最薄漏斗埋点（Codex 强调进 Sprint A）

- **目标**：从 v2.7 开始能看 funnel，不是做增长平台
- **事件清单**（最薄 8 件）：
  - `landing_enter_clicked` · landing "进入 →" 点击
  - `letter_created` · `POST /letters` 成功
  - `round_N_reached` · round=1,3,6,10
  - `converge_clicked` · "现在收信" 点击（手动 / 自动 区分）
  - `converge_result_success` · `composeResult` 返回
  - `converge_result_failed` · `composeResult` 抛错
  - `issue_opened` · `/issues/:slug` SSR 完成
  - `arrival_dismissed` · ArrivalCeremony 关闭（手动 vs 自动 区分）
- **落处**：
  - 前端：`web/lib/analytics.ts` 新建，简单 `fetch('/api/analytics/event')` POST
  - 后端：`server/oriself_server/routes/analytics.py` 新建一个 lean 端点，写 `analytics_events` 表（schema：`id / event / props_json / session_id / created_at / ip_hash`）
- **不做**：A/B framework、热图、第三方 SDK
- **风险**：要避开 v2.6.1 已有 logger.info 重复——只埋"用户视角事件"，不埋"server 视角 round 处理完"

---

## 2. Sprint B · 离线回放 + 客观指标 + 人工抽样（2-3 天，砍掉 LLM-judge）

> **niuniu 反馈**（2026-05-27）：「LLM-judge 评分器别做，纯浪费，用 LLM 评测 LLM 是陷阱；合成 transcript 也别做。」
> v0.3 把这块从"自动判分"完全改为"客观可测 + 人工抽样"。
> Codex round 2 那 12 个 J 维度里，**只保留靠 regex / trace / DB 字段就能算的**，其余靠 niuniu 自己读样本。

### B-1 · 离线回放器（保留，scope 缩小）

- **新文件**：`server/scripts/replay_session.py`
- **核心循环**（关键：必须 `advance_state` 回写）：
  ```python
  state = SessionState(session_id=sid, domain="mbti")
  for real_turn in real_turns:  # 按 round_number 升序
      result = await run_turn_collect(turn_runner, state, real_turn.user_message)
      state = advance_state(
          state,
          user_message=real_turn.user_message,
          oriself_visible=result.visible,
          status=result.status,
          loaded_skills=result.loaded_skills,
      )
      records.append({...})
  ```
- **Backend**：真 gemini-3.5-flash（v2.6.1 主力），通过 `43.160.251.210:10011` 中转
- **输入**：oriself_v2.db 中 v2.6.1 后 9 个真实 session（49 轮），**不补合成 transcript**
- **输出**：`docs/replay-<date>/<session>.jsonl`，每行包含 `round / user_msg / real_oriself / replayed_oriself / chosen_phase / loaded_skills / violations`
- **用法**：niuniu 自己抽样读，对照真实 oriself_text 看修改前后差异

### B-2 · 客观可测指标（regex + trace 直读，零 LLM judge）

只保留**不需要 LLM 评分**就能算的指标：

| ID | 维度 | 算法 | 数据源 |
| --- | --- | --- | --- |
| O1 | 二选一违例 | regex 扫"A 还是 B"句式（参考之前 SQL 查询用过的关键词集） | `conversations.oriself_text` |
| O2 | ETHOS 红线断言 | regex 扫 ETHOS §2 列的红线句式（"你是 X 的人 / 你对 X 有极强的 Y" 等） | `conversations.oriself_text` |
| O3 | 反射倾听过度 | regex 扫"你刚说……"开场频率 ÷ 总轮数 | `conversations.oriself_text` |
| O4 | phase 协议违例 | 直读 `conversations.pass1_violations_json` 命中 `phase_missing` / `redundant_read` / `zero_tool_read` 的轮次 | DB 字段 |
| O5 | phase_match_rn 一致性 | 直读 `conversations.phase_match_rn` false 的占比 | DB 字段 |
| O6 | 长度异常 | `len(oriself_text)` 分布 + 是否以问号结尾 | `conversations.oriself_text` |
| O7 | MBTI 矛盾 retry 触发率 | 看 `test_results.confidence_json` 与 `mbti_type` 一致性（v2.6.1 `confidence_matches_mbti` 已 retry 拦截） | DB 字段 |

**输出**：`docs/v2.6.1-objective-baseline-<date>.md` 一张表，每条 O1-O7 在历史 9 session 上的命中率
- 自动跑，无 LLM 调用
- 不下"prompt 改得对不对"结论，只暴露**已知规则的违反率**

### B-3 · 人工抽样 review notes（取代 LLM judge）

砍掉的 J3/J4/J5/J7/J8/J9/J12 全部交给 niuniu 自己读：

- niuniu 每周抽 3 个 session 读全文，记 3-5 条 review notes 到 `docs/manual-review-notes-<date>.md`
- 维度参考表（不强制按这个打分，只是 checklist）：
  - 死磕：本轮是否换了生活场景？
  - 共情：用户带强情绪时 oriself 第一句是否承接？
  - 升华腔：是否抽象拔高？
  - 具体性：问题是否落在时间/地点/人/画面？
  - 早期 anchoring：R1-R5 是否出现类型暗示？
  - 用户主权：用户纠偏后是否承认并调整？
  - 报告证据污染：CONVERGE 引用的是 user 原话还是 Oriself 之前的判断？
- **不追求统计稳定，只追求快速发现明显问题**

### B-4 · 输出 → 驱动 Sprint C

- 客观指标里 O1/O2/O4 命中率 > 0 的 → 立即修 prompt 或 server 校验
- 人工 review notes 中重复出现的模式（如"R3 就出现类型暗示" ≥ 2 个 session）→ 进 Sprint C 改 phase-onboarding/warmup

---

## 3. Sprint C · skill prompt 补漏（依赖 B-4，2-3 天）

### C-1 · phase-exploring 加 "四维度状态自标 lite"

- **依据**：Codex round 2 指出 phase-deep 强写四维度自标，但 phase-exploring 只是"心里累计"，强度不均
- **改动**：复制 phase-deep:12-21 的"开口前给四维度各标状态"段，写一个**更轻量**的 phase-exploring 版本
  - 不要每轮都强标——R4 / R6 / R{mid-1} 这种关键节点强标
  - 配套"如果某维到 R5 还没有任何鲜明画面，下一轮换方向"

### C-2 · phase-onboarding/warmup 加 "pre-anchoring guard"（条件触发）

- **依赖 B-4 J8 数据**：如果早期 anchoring 违例率 > 30% 才做
- **改动**：在 phase-onboarding.md / phase-warmup.md 头部加：
  > "**R1-R3 不要在心里下任何 MBTI 字母**。这三轮只做'让 TA 多讲一点'的工作。任何字母先后判定从 R4 phase-exploring 开始。"

### C-3 · 跑 B-1/B-2 校准 C-1/C-2 改动前后差异

- 看 Follow rate 是否上升
- 看 MBTI 命中率（看历史 v2.6.1 baseline）是否没掉

---

## 4. 取舍记录（不做的）

| 项 | 理由 |
| --- | --- |
| ~~B-3 v0.1 server confidence-driven override~~ | 信号源不存在；冲突 v2.6 自决哲学 |
| ~~B-4 v0.1 acknowledge-then-question 节拍~~ | ETHOS §3 已写，Codex round 2 进一步指出"不是每轮 acknowledge" |
| ~~B-2 v0.1 same_event_run = phase 重叠~~ | phase 是轮号驱动不是话题驱动 |
| ~~I-9 报告加建议~~ | CONVERGE 立场反 coaching |
| ~~I-12 4 选项 D=其他~~ | 现状种子开头已是软选项；A-3 chips 化即可 |
| ~~landing X1 零改动~~ | Codex round 2："把误解用户都踢出目标用户群，证据不支持" |
| ~~landing X3 hover 文案~~ | 移动端无效 |

---

## 5. 实施时间线（v0.3 砍 LLM-judge 后）

```
Week 1   · Sprint A 全部（A-1/2/3/5/6）+ A-4 验证（不 commit）
Week 1-2 · B-1 离线回放 harness（真 gemini-3.5-flash，回放 9 真实 session）
Week 2   · B-2 客观指标自动算 + B-3 niuniu 抽样人工 review
Week 2   · B-4 输出 → 客观指标违例直接修；人工 notes 驱动 Sprint C
Week 3   · 根据 B-4 决定 C-1/C-2 是否做
Week 4   · A-4 根因落实 + 视觉 / 移动端审 / 命名审
```

---

## 6. 待 niuniu 拍板（决策项）

| # | 决策 | 推荐 | 备选 |
| --- | --- | --- | --- |
| ✅ D-1 | landing 期望管理 | **B · "聊 10 分钟，留下一封写给自己的信"**（niuniu 2026-05-27 选定）| — |
| D-2 | 空态布局 | **Y**（chips 纳入 composer 附近）| X（chips 中央保留）|
| D-3 | A-2 文案 | **"现在已经可以收信；再聊几句会更细"** | v0.2 的 "15 轮最稳" 已拒 |
| D-4 | Sprint 顺序 | A 完整 → B → C | 先 B 再 A |
| D-5 | A-6 漏斗埋点是否进 Sprint A | **是**（Codex round 2 强烈推荐）| 留到 Sprint B |
| ~~D-6~~ | ~~合成 transcript 谁补~~ | **不做合成 transcript**（niuniu 已拒）| — |

---

## 7. ship gate 指标（v2.7 上线判据）

- **G1 · MBTI 命中率** ≥ v2.6.1 baseline（不能为了打散 anchoring 牺牲准确率）—— 需 B-3 baseline 数据
- **G2 · 漏斗转化** round 1→6 转化率上线一周后 ≥ v2.6.1 一周窗口（A-6 埋点开始记后才能比）
- **G3 · Probe 下一批反馈中 I-1/I-4/I-5 出现频次 ↓**
- **G4 · 客观指标 O4 phase contract 违例率** ≤ 10%（这是 v2.6 自决哲学的 health check）
- **G5 · 客观指标 O1（二选一）+ O2（红线断言）命中率** = 0（铁则不能松）

