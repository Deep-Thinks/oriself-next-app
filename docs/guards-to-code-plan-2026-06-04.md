# 守卫分层治理实施方案 · STATUS / HTML / ba29e5fc 从 prompt 挪进代码

> 2026-06-04 · 双路并行研究（Claude 12-agent workflow + codex，结论一致）综合。
> 立场一句话：**结构与安全 = 代码校验（天经地义）；行为与品味 = prompt 正例 + 离线 eval（绝不进运行时过滤器）。**
> bitter lesson：绝不硬编码"模型不能说哪些词"。prompt 里写"别说 X" → negation-prime 出 X；换成 post-gen regex 拦截/重生成 = 同一个错误换了层（延迟、僵硬、静默吞回复）。

## 1. Litmus test（守卫该放哪一层）

拒绝一条回复时问：拒的是**缺了必需的结构槽位 / 含可执行危险载荷**，还是**出现/缺少了某些词、语气、风格**？
- 前者（拒因可枚举、与用词无关）→ 确定性结构/安全校验，**合法进代码**。
- 后者（判据本质是一张词表/语气表，无论用 regex、embedding 还是"再问一次 LLM 够不够 X 腔"实现）→ **伪装的禁词黑名单，错层**。

操作判据：**把判定逻辑打印出来，如果能数出"被点名的词/短语/语气标签"，就掉进黑名单坑了。**

## 2. 分层映射

| 守卫 | 层 | 机制 | 落地文件:函数 | 内容过滤器？ |
|---|---|---|---|---|
| #1 STATUS + 空正文拒收 | code 结构校验 | detect-and-inform：剥末行 sentinel 后 `visible.strip()` 判空 → SSE error、不 persist、round 不进 | 后端**已落地** `routes/letters.py:419-426` + `guardrails.parse_status_sentinel`；建议抽 `verify_turn_shape` 单一源。**真缺口在前端**（§3.1） | No |
| #2 HTML 契约（doctype/无XSS/4字母唯一/一致） | code 结构+安全校验 | verify → retry_hint → 模型自纠，**仅报告轮** 3-retry | **已完整落地** `guardrails.py` + `ReportRunner.compose`。只剩 CONVERGE.md 散文可剪（§3.2） | No |
| #3 ba29e5fc 标签固化 | **code 架构（context-engineering，非 guardrail）** | converge 输入端给 transcript 行打来源标注 + 正向 framing；只调"这段来自谁"，不读/不判/不改已生成文本 | `skill_runner.py:844-850` `_build_converge_messages`（§3.3） | No |
| 行为/品味（语气、写信隐喻、MBTI 是否锚原话） | **prompt 正例 + 离线 eval** | skill 正向启发式 + 典范正例；离线 LLM-judge rubric + canary（复用漏斗埋点） | skill-repo 正例 + `server/tests/` 离线 eval | 必须 No |

红线：任何"语气/品味"永不进运行时层。OpenAI Guardrails 库目录里根本没有 tone/word-choice/brand-voice 检查项——这是设计留白。

## 3. 各守卫实现

### 3.1 STATUS（后端已就位，主修前端 bug）
- 后端 `letters.py:419-426` 命中空 visible → 发 `ORISELF_EMPTY_REPLY` SSE error + 不 persist + round 不进。范式正确（拒收可见、有错误码、状态机不前进）。
- 小加固：抽 `guardrails.verify_turn_shape(raw)->(visible,status,ok)` 单一源，`letters.py` 改调用 + smoke 3 case（STATUS-only / 正常 / 纯空白）。
- **前端真 bug（必修）**：`letter-view.tsx` 先 push 空 oriself 气泡；后端发 error → `streamToDone` throw → catch 只 setError、从不 pop 空气泡 → 用户看到"空气泡+报错"="TA 没说话"。修：catch 里先 `dropTrailingEmptyOriselfTurn()` 再 setError（`handleSend` + `handleRewrite` 同补）。
- `api.ts::friendlyError` 加 `ORISELF_EMPTY_REPLY` 隐喻文案（对错误码映射，非内容过滤）。
- 可选自动重试：**严格判等** `ORISELF_EMPTY_REPLY` + `retriedRef` cap=1，否则砍掉只留"移除空气泡+提示+重写按钮"。做不到严格 gate 就别做（否则漂向 post-gen 抖动反模式）。

### 3.2 HTML（已落地，只剪 CONVERGE.md 散文）
不改代码。只剪 `CONVERGE.md` 里**纯复述代码契约 + 否定式枚举**的散文（29-39 安全铁则否定枚举、146-148 MBTI 唯一否定、285 占位符、27/381 markdown fence、370 自检第5条），各留一句正向收口。**严格限定"纯复述+否定枚举"，43-151/154-218 的正向启发式全保留。**
- 回归门禁用"报告轮 retry 率"（剪后升=误删正向引导→回补**正例**）。注意：原方案引用的 `banned-outputs` 测试断言**不存在**，改用 `test_converge_prompt_composition` 的 present/absent 断言。
- 可选未来强化（codex 提）：MBTI 类型由**服务端 canonical 分数派生**注入，模型只写解释段，不自由决定类型。比现状（抽取+查唯一）更强，但是更大重构，单列后续。

### 3.3 ba29e5fc（核心新增 · converge 输入端架构治理）
根因确切位置 `skill_runner.py:844-850`：converge 把 `user_message` 和 `oriself_text` **同权**拼进 transcript，oriself 行只中性标 `[R · oriself]` → 模型把自己之前的提问/解读当"关于 TA 的事实"读 → 固化。这是 context-isolation 违例（把模型自我输出当 ground truth 回灌）。

改法（只动 824-850 + 新增常量；只被报告轮 `ReportRunner.compose` 调，对话轮不经过）：
- 新增模块级常量 `_EVIDENCE_PROVENANCE_BLOCK`（紧邻 `_ROLEPLAY_HINT_BLOCK`）："打分只用用户原话/用户描述过的行动；标 oriself 的行是你当时的提问/镜面，是上下文不是结论；每个维度回到 TA 原话重新判断。"
- transcript 行重标注：user 行 → `[R · 用户原话]`（一手证据）；oriself 行 → `[R · oriself 当时说的话（你的提问/镜面，不是关于 TA 的事实）]`。
- framing 拼进现有 user message（`meta_block` 之前），**不要碰 867 行 system 段的 `cache_breakpoint`**（cache 命中靠它）。
- 复用现成范式：`_detect_roleplay_in_session` + `_ROLEPLAY_HINT_BLOCK` 就是 detect-and-inform，本守卫同构、无条件加载。
- 离线 eval fixture（与剪枝同 PR）：`server/tests/fixtures/converge_provenance/ba29e5fc.*`（前几轮 oriself 写盖章断言 + 用户原话指向相反字母）+ `test_converge_provenance.py`（MockBackend 硬断言 oriself 行带 provenance 标签、framing 出现）；质量回归走离线 LLM-judge rubric（最终 MBTI 每字母是否由用户原话支撑）。

## 4. 虚循环：架构修好 → prompt 可再剪
ETHOS.md §2「对话轮禁止中间断言」的唯一硬正当性写在 L44——"oriself_text 回灌为 assistant history → converge 读到自己的判断 → 二手证据被当一手"。**§3.3 在 converge 输入端用 provenance 切断这条链后，该 prohibition 失去正当性，可从每轮 prompt 移除/转正例**：删 37-43 红线句式清单、删 44 机制解释、保留 46-52 的"问句/镜面/可撤回试探"正例。回归由 §3.3 eval fixture 兜，不靠每轮"别说 X"兜。同理守卫 #1 落地后 `SKILL.md 铁则2` 可改正向。→ 每轮 negation 再降一截。

## 5. 反模式（绑定 bitter lesson · 任一命中=拒绝合并）
1. **禁词正则黑名单**（behavioral 守卫伪装结构校验）：判定函数接受模型可见正文 + 对照词/语气表。
2. **post-gen 重生成抖动**（对话轮做服务端 regenerate）：串行加 LLM 往返延迟 + 不可复现 + 放大 truncation + 违反 v2.4「对话轮不 retry」。
3. **静默吞回复**（命中即 return 不告知）：前端挂起/空气泡，churn 查不出原因。正面教材 `letters.py:419-426`。
4. **把模型自我输出当事实回灌**（converge transcript 不分 speaker 权重）：ba29e5fc 根因。
5. **把软品味升格成硬契约**（min_length/min_question_count/风格相似度阈值）：误杀合法简短共情/留白。

## 6. 落地顺序
1. 守卫#1 后端 `verify_turn_shape` + smoke（低风险先行）
2. 守卫#1 前端清空气泡 bug（**必修**，当前真 bug）
3. 守卫#3 converge provenance 架构修复（解锁 §4 剪枝前提）
4. 守卫#3 离线 eval fixture + LLM-judge（**与剪枝同 PR**，回归门禁）
5. skill 剪枝（**必须在 3+4 之后**）：ETHOS §2 否定转正例、CONVERGE 散文剪、SKILL 铁则2 转正向
6. canary 放量：复用已插桩 8 漏斗事件（commit `0093c28`）shadow→小流量→放量，盯语气/完成率不降

流程红线：步 4、5 必须同 PR；LLM-judge 绝不进对话轮热路径。

## 7. 关键引用
- Anthropic《Effective context engineering》——message history 污染会误导后续推理；"hardcoding brittle logic in prompts creates fragility"
- Anthropic《Agent Skills》/《Skill authoring best practices》——progressive disclosure、Examples pattern、Build evaluations first
- Anthropic《Claude prompting best practices》——"Tell Claude what to do instead of what not to do"
- Anthropic《Building agents with Claude Agent SDK》——验证是"事后给反馈让模型自改"非静默拦截；LLM-judge"不够稳健+重延迟"
- OpenAI Agents SDK《Guardrails》——tripwire 即 halt，只服务 safety/policy；Guardrails 库目录无 tone/word-choice 项
- OpenAI《GPT-5 prompting guide》——矛盾/模糊指令更伤指令遵循；《Evals/eval flywheel》——质量问题用离线 eval 衡量
- OpenAI《Model Spec》Chain of Command——hard RULE 只留 catastrophic/illegal，其余下放可覆盖 guideline
- negation 实证：《When Prohibitions Become Permissions》(2026, +317% 违禁)、《Negated Prompts》(Jang 2022, 否定理解随规模反降)、《Don't Think of the White Bear》(2025, 多轮反弹最强)
- 《No Free Lunch With Guardrails》(Enkrypt 2025)——运行时 guardrail 延迟+误杀；ZenML《1200 deployments》——"evals are the new unit tests"、detect-and-inform>静默 block、shadow→canary
