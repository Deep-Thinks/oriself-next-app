---
name: probe-feedback-codex-round1
title: Codex round 1 评审记录
session_id: 019e680e-eade-7902-b51a-58b93636328f
date: 2026-05-27
status: archived
---

# Codex round 1 评审摘要（高层质疑，未碰代码）

> 用户判断：双方都飘在概念层。需要 dive into 现有代码再做 round 2。
> 本文档把 round 1 的有效质疑沉淀，以便 round 2 拿真实代码逐条验证。

## 待验证质疑列表（按优先级）

### Q1 · B-2 同事件检测的实现假设
- Codex 原话：「`same_event_run = chosen_phase_key 相同` 这个定义有硬伤。phase 相同不等于事件相同；同一事件也可能跨 phase。」
- **要验证的代码**：`server/oriself_server/skill_runner.py::choose_phase_key`、conversations 表里 `chosen_phase_key` 实际取值
- **关键问题**：phase_key 到底是「话题域」还是「提问技术」？

### Q2 · B-3 confidence-driven override 和 v2.6 哲学冲突
- Codex 原话：「server 强切到 probe_ei/probe_sn 会把 oriself 拉回 MBTI 测验，而且 confidence 是 LLM 自评，拿自评再驱动提问，容易形成自我校准幻觉。」
- **要验证的代码**：`server/oriself_server/schemas.py` ConvergeOutput.confidence_json 结构、`routes/letters.py` 怎么用 confidence、当前 phase 选择是不是真的 LLM 自决
- **关键问题**：confidence_json 现在到底测的是「每轮即时信号」还是「累计信号」？

### Q3 · B-4 acknowledge-then-question 会重制造反射倾听过度
- Codex 原话：「'每轮必须 1-2 句承接'风险很高，会重新制造 v2.6.1 刚修掉的反射倾听过度」
- **要验证的代码**：v2.6.1 `1d0d834` 在 SKILL.md / ETHOS.md / phases/ 里到底改了什么、当前 ETHOS 有没有"承接节拍"
- **关键问题**：v2.6.1 是 prompt 怎么写的限制？是字数限制？还是行为限制？

### Q4 · I-1 流程感的文案可能造成新焦虑
- Codex 原话：「'6-15 轮、10-20 分钟' 可能反而吓退用户。更好的表达是'现在已经足够收信；继续聊会更细'」
- **要验证的代码**：`web/components/letter/composer.tsx` 中"现在收信"按钮逻辑、第 6 轮文案
- **关键问题**：当前按钮出现时是不是已经有解释文案？文案口吻是哪种？

## 升 / 降优先级建议
- **升 P0**：I-11 进入期望（landing 心智）、I-4 收信 loading
- **保持 P0**：I-3 / I-2
- **重新观察**：I-1（缺真实漏斗数据，主观感知未必准）

## 反方反驳 I-12（选项化）
Codex 给出值得严肃考虑的反方论据：
> 选项不是测验，是脚手架。oriself 的三条预设候选本质上已经是"选项"了，只是不承认。低能量用户、表达弱用户、第一次进入的用户会因为不知道说什么直接流失。
> 建议方案：3 个情境 chips + 自由输入，不计分、不编号、不叫选项 —— "低能量开头"而非"4 选项 D=其他"。

**这条值得在 plan v0.2 里专门加一个 D-section "低能量开头" 提案。**

## 被遗漏（Codex 提出我没想到的）
- 缺真实漏斗数据
- 缺对话质量 benchmark / 离线回放集
- 缺「用户已知 MBTI」处理（#6 ENFP→ISTJ 可能是用户带标准答案验产品）
- 缺退出/暂停设计
- 缺失败态处理（报告生成失败、超时、重复点击）
- 缺移动端审查
- 「开始收信」命名本身是否最优
- 「首轮问题策略」可能才是 anchoring 真正源头

## ONE-LINE 结论
> **不是 ship-ready；最该先补的是 B-2/B-3 的架构边界和离线回放验证，否则 skill 层会用硬规则修体验、反过来破坏 oriself 的核心对话感。**
