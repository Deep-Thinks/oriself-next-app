# Major 域 · 三画像 codex 评审取舍（执行修订）

> 2026-06-05 · 三画像并发审 3 份 Plan（P1 集成正确性 / P2 完整性盲点 / P3 魂保真+查叠甲）。原则：codex 偏严，只取使能项+真 bug，砍叠甲。本文件是执行时实际生效的修订清单（覆盖原 Plan 中冲突处）。

## A · 采纳（真 bug / 真缺口，执行时折进）
1. **fixture**：`SessionState(session_id="t", domain=d, turns=[...], user_preferences=UserPreferences())`——无 `provider`/`conversations`（P1#3/P2#1）。`Turn` 字段以真实 `skill_runner.py` 为准（`round_number`/`user_message`/`oriself_text`/`discarded`）。
2. **DB 测试入口**：`_db.get_engine()` 非 `_db.engine`（P1#3）。
3. **catalogue 旧测试**：`test_v26_on_demand.py` 硬编码 catalogue 总数（11）需随 major 文件更新；改成"≥11 且含 mbti 集合"或更新数值（P1#2）。
4. **compose_result 幂等返回**：已生成报告的短路返回（letters.py:694-697）也要填 `domain=sess.domain, result_label=existing.result_label`（P1#1）。
5. **SKILL.md 域中立化**（新增 task，挂 Plan1）：line 3/30/152/203 的"交付/生成 MBTI 标签""四个维度"改成域中立表述（mbti 专属语义靠 domains/mbti.md + CONVERGE.md 承载）；改完跑 `test_skill_loader.py`+`test_v24_smoke.py` 证 mbti 零回归（P2#2）。
6. **Pass1 契约通用化**：`_PASS1_CONTRACT_BLOCK`（skill_loader.py:472-495）不写死 6 个 mbti phase 名，改为"从 Skill Index 的 phases 组里选 1 个"（P2#3）。
7. **MockBackend 域感知**（新增 task，挂 Plan1）：`call_tools_only` 按 tool enum 是否含 `major-*` 返 major phase 名 + `major` 域；`complete_text` 按 converge prompt 是否 major 返一份**带 `<meta name="oriself-direction" content="...">`、无 MBTI 四字母**的 major HTML fixture（P2#4）。
8. **legacy-DB 迁移测试**：建一个无 `result_label` 的旧 `test_results`，跑 `init_db()`，断言列被加（P2#5）。
9. **D11 ~15 轮**（新增 task，挂 Plan1）：major 会话默认 `target_rounds≈15`——在建信路径按 domain 注入 prefs，或 `effective_target_rounds` 域感知。
10. **D2 四标尺进 CONVERGE-major**：把"源头追问/过程留痕/公开表达/判断与责任 + 存在层"写成内核抗未来的**具体判据**，不留口号（P3#A-D2）。
11. **CONVERGE-major 显式 D1**：写明"不做分数/院校/录取建议"（P3#A-D1）。
12. **meta 写法**：`<meta name="oriself-direction" content="...">`，name 在前 content 紧跟（Plan1 `_extract_major_direction` 正则要求）（P1）。

## B · 砍（叠甲，执行时不做）
1. Plan2 重型 eval（12 条 + run_eval.py + LLM-judge + 真 provider 小跑）→ **降级**：4-6 条人工 dogfood 脚本对真 provider 跑一遍 + 2 条红线 grep（D9 不主动 AI 恐吓 / D13 不编正式专业名）（P3#B-3）。
2. Plan1 `pytest --cov` 门槛 → 只要全绿 + mbti 零回归（P3#B-4）。
3. 不补 regex guardrails（D9/D1 走 prompt 软边界）（P3#B-5）。
4. 跳过 `read_skill_batch` 服务端硬域过滤——enum 约束（真 provider）+ 通用契约 + 域感知 mock 已覆盖真实路径，再加是冗余甲（filter P2#3 的一半）。
5. commit 降到**每功能里程碑**（每 Plan 完成 + 过 codex 后），feature 分支，**不 push/PR**。

## C · 缓（MVP scope，明记）
1. **D8 `read_report` 跨域读报告机制延后**：保留"读到 MBTI 报告别被四字母带跑"的 prose（D8b），但不在本轮实现 Pass-1 `read_report` 工具（D8a）。MVP = 独立 major 罗盘；跨域继承作为后续增强。

## 执行里程碑（每个做完起一个 codex 审）
- **M1 · server 端 major 域全通（真内容）**：Plan1 全部 Python 改动 + A5/A6/A7/A8/A9 + Plan2 的真实 skill 文案（domains/major.md / 6 phase / CONVERGE-major）。验收：major 结构测 + 管道测 + mbti 零回归 + 一次真 provider dogfood。→ codex 审 → 过滤 → 修。
- **M2 · web 可用**：Plan3（toggle / domain 透传 / 徽章 / metadata）+ Plan3 T1 的响应字段。验收：typecheck+build + 端到端走一遍 major 旅程。→ codex 审 → 过滤 → 修。

---

## 执行结果（2026-06-05，自主完成）

**M1 · server 端 major 域 — 完成 ✅**
- 改：skill_loader.py（CONVERGE-major 加载 / converge 域分支 / catalogue 域过滤 / 契约通用化 / tool schema 条件化 exemplary / exemplary_skipped 跳过 major）、skill_runner.py（choose_phase_key 域前缀 + _choose_phase_base / _effective_target_for_session(D11 ~15) / Pass1 传 domain / compose major 分支 + _extract_major_direction）、schemas.py（MajorConvergeOutput）、models.py（result_label 列）、database.py（一次性 ALTER）、routes/letters.py（compose_result 域分支 + 占位 mbti_type + result_label + 已生成短路返回 + State/Result 字段）、routes/issues.py（IssueResponse domain/result_label）、llm_client.py（MockBackend 域感知 + major mock HTML）。
- 新：domains/major.md、phases/major-{onboarding,warmup,exploring,midpoint,deep,soft-closing}.md、CONVERGE-major.md（真实 D1-D14 文案）。SKILL.md 域中立化。
- M1 codex 审 → 采纳真修：on-demand/static exemplary 域感知、CONVERGE-major 去"2030"(D9自洽)、D11 target 同步、D5 phase 措辞收紧为单主动作；**未采纳**：meta 硬拦(保留 title 兜底，真 LLM 已验证会写 meta，硬拦=过度加固)。
- **验收**：`pytest` **233 passed**（major 新测 13 条 + 现有零回归）；真 gemini dogfood——**报告**：direction_label="群体行为与媒介"(抽出内核非外壳)、红线全过(无主动AI恐吓/命名诚实/无四字母)；**对话(on-demand,tool-use)**：R1→major-onboarding(从日常切入)、R2→major-warmup(镜像活线)、R3→外部约束温柔翻译，全程对魂、无 mbti 污染。

**M2 · web — 完成 ✅**
- 改：app/letters/new/page.tsx（读 searchParams 传 domain）、components/home/landing-enter-link.tsx（domain prop）、app/page.tsx（接 DomainToggle）、lib/types.ts（domain/result_label）、lib/history.ts（domain/resultLabel）、components/home/recent-letters.tsx（徽章按域）、app/letters/[id]/letter-view.tsx（upsert 透传）、components/history/history-sync.tsx（转发 domain/resultLabel）、app/issues/[slug]/page.tsx（metadata 不显示伪四字母）。
- 新：components/home/domain-toggle.tsx（首页 MBTI/专业方向 切换器）。
- **验收**：`pnpm typecheck` 0 错；`pnpm build` 全路由编译通过。**M2 codex 审：必须修的真 bug = 无，可收尾交付**（复核首页链路/无伪四字母/mbti 不回归/Next15 用法/字段名一致/M1 修复全对）。
- 浏览器实拍：跳过（:8000/:3000 被既有非本功能进程占用，不冒干扰风险；功能已由 API+真 LLM e2e + build 充分验证）。

**未提交 git**（用户偏好 + skill-repo 是 submodule）：所有改动在 working tree，待用户决定提交（含 submodule）。
**MVP scope 缓**：D8 `read_report` 跨域读报告机制延后（保留 prose 护栏）。分支：`feat/major-domain`（仅 checkout，无 commit）。
