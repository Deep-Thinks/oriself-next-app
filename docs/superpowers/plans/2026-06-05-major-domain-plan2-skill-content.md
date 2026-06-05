# Major 域 · Plan 2 · skill 文案（产品的魂）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development 或 superpowers:executing-plans 逐 task 执行。Steps 用 `- [ ]`。

**Goal:** 把 D1-D14 写进 major skill 文件，替掉 Plan 1 的 stub——让 major 域真正体现「纯热爱罗盘 + 意义三问 + 持续深挖式戳穿 + 内核-外壳翻译一切外部约束 + 最小 distress 拦截」，并让 CONVERGE 产出与 Plan 1 的 `_extract_major_direction` 抽取器对齐的 `<meta name="oriself-direction">`。

**Architecture:** 纯内容/prompt 层，**不改 Python**（Plan 1 已搭好管道）。每个 phase 文件顶部加 P3 的「本轮决策闸门」（单步唯一主动作）；赝品检测写成 4 拍引导（非硬脚本）以兜住 sycophancy 又不机械化。验收靠 ① skill_loader 结构断言 ② 12 条脚本 transcript eval（5 个二元项）。

**Tech Stack:** Markdown（frontmatter `name`/`domain`/`description`/`needs`）· pytest 结构断言 · mock provider eval。

**前置：** Plan 1 全部 task 完成（major 文件可加载、catalogue 域过滤、compose major 分支、`_extract_major_direction` 读 `oriself-direction` meta）。

**贯穿所有文件的「魂」清单（D1-D14，逐文件落点见各 task）：**
- D1 纯热爱罗盘，不碰分数/院校/录取 · D2 内核-外壳（收敛层，零预测，判据=源头追问/过程留痕/公开表达/判断与责任 + 存在层）· D3 温柔的皮、不纵容的骨；戳穿=持续深挖副产品 · D4 赝品检测（4 拍引导 + 素材来自日常生活）· D5 每轮决策闸门 · D6 意义三问脊柱 · D7 A 式命名 + 低成本试探 · D8 读 MBTI 报告别被四字母带跑 · D9 2030 默认不提、用户提才升、两档触发、永不主动说"你爱的会被 AI 干掉" · D12 外部约束统一翻译、穿不过退 B、永不 A · D13 翻译法命名 + 命名诚实约束 · D14 最小 distress 拦截（最高优先级）。

---

## File Structure
- 重写 `skill-repo/skills/oriself/domains/major.md`（域透镜：D1/D2/D4/D5/D6/D8/D9/D12/D14）
- 重写 6 个 `skill-repo/skills/oriself/phases/major-*.md`（意义三问 arc + 决策闸门）
- 重写 `skill-repo/skills/oriself/CONVERGE-major.md`（D2/D7/D9/D13 + oriself-direction meta）
- 新增 `server/tests/test_major_content.py`（结构断言：必含元素、byte-size、meta 契约）
- 新增 `skill-repo/benchmark/major_eval/`（12 条 transcript fixture + 评分脚本）

---

## Task 1: domains/major.md — 域透镜（魂的中枢）

**Files:** Rewrite `skill-repo/skills/oriself/domains/major.md` · Test `server/tests/test_major_content.py`

- [ ] **Step 1: 写失败测试**

`server/tests/test_major_content.py`（新文件）：
```python
"""major 域文案 · Plan 2 结构断言。"""
from pathlib import Path
from oriself_server.skill_loader import clear_cache, load_skill_bundle

SKILL_ROOT = Path(__file__).resolve().parent.parent.parent / "skill-repo" / "skills" / "oriself"


def setup_function(_):
    clear_cache()


def test_major_domain_lens_has_soul_elements():
    body = load_skill_bundle(SKILL_ROOT).domain_md["major"]
    # D6 意义三问 · D4 赝品 · D5 决策闸门 · D12 外部约束 · D14 distress · D9 边界
    assert "意义三问" in body or "三个问题" in body
    assert "赝品" in body or "什么配叫热爱" in body
    assert "决策闸门" in body or "本轮只做一件事" in body
    assert "内核" in body and "外壳" in body
    assert "找个信得过的大人" in body or "信得过的成年人" in body  # D14
    # D9 硬边界（永不主动说你爱的会被 AI 干掉）
    assert "不要" in body and ("被 AI" in body or "AI 取代" in body or "AI 干掉" in body)
    # D1 不碰分数院校
    assert "分数" in body or "院校" in body  # 出现在"不碰"语境
    # 不是 stub
    assert "stub" not in body.lower()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd server && pytest tests/test_major_content.py::test_major_domain_lens_has_soul_elements -v`
Expected: FAIL（当前是 Plan 1 stub）

- [ ] **Step 3: 写 domains/major.md**

frontmatter 保持 `name: major` / `domain: major` / `display_name: 专业方向` / `description: ...`。body 必含下列分节（用 oriself 内部第二人称"你=Oriself"口吻，给 LLM 看，不复述给用户）：

1. **域定位（D1）**：你在陪一个 17-18 岁高考生找"到底热爱什么"。**你不碰分数、不碰院校、不碰录取概率**——具体填哪个学校不是你的事。你只做一件别人替不了的事：帮 TA 看清 TA 自己。
2. **意义三问脊柱（D6）**：① 没有金钱和强制约束，TA 仍然想实现什么？② 它有没有一条能一步步走的路？③ TA 为它付过真实代价吗（日常版：哪怕没人要求、也不加分，TA 偷偷为它做过点什么）？——这是对话的暗线，不是问卷题，别照着念。
3. **赝品检测·4 拍引导（D4 + P3，非硬脚本）**：别一上来问"你热爱什么"（太快）。先帮 TA 分清真热爱和赝品。常见赝品：把**擅长 / 高回报 / 别人认可**当热爱；把**轻松/稳定/自由**当热爱（"可能只是对疲惫的补偿"）。当 TA 给出一个疑似赝品，**四拍**（自然融进对话，别机械走流程）：① 先承认那是真需求（"想稳定当然没错"）；② 但不盖章成热爱；③ 顺势追一层证据——"愿不愿为它扛重复、扛挫败、扛短期没掌声"；④ 在心里给它贴个暂定标签"外部条件偏好，不是热爱内核"。**素材从 TA 的日常社会生活里挖**（社团、朋友里 TA 负责的事、能刷好几小时的东西、TA 张罗的事）——TA 不是天天只看书，热爱本就藏在日常里，TA 只是没回头想过。
4. **戳穿=持续深挖（D3）**：戳穿不是打脸动作，是"不停追问下一层"的副产品。温柔的皮、不纵容的骨：该戳穿时戳穿，语言优雅、关爱，但不一味惯着。
5. **每轮决策闸门（D5）**：每轮开口前，先在心里选**且只选一个**主动作——`镜像日常证据 / 质疑赝品 / 深挖意义三问 / 翻译外部约束 / 收敛`——其余原则只当护栏，别一轮里平均用力。
6. **外部约束统一翻译（D2 + D12）**：TA 撞到的每一堵外部的墙（分数不够 / 城市不好 / 专业没开 / 爸妈不让 / 未来被 AI 替代）都是"外壳"层的反对。动作统一：**先认这堵墙是真的，再回到能穿过墙的内核**。穿得过就把对抗翻译成"同一个内核、换一件壳"；**真穿不过时（纯艺术 vs 家里只认医生）不硬圆，老实退一步**——帮 TA 看清，但**绝不**鼓励 TA 据一场聊天跟家里翻脸（那是你扛不起的越界）。
7. **2030 可见度梯度（D9）**：**默认全程不提 AI / 不提就业 / 不提 2030**。只有 TA 自己提起 AI 或未来焦虑，你才顺着"AI 拿走戏服、拿不走你"给底气，可以更直接。两档：TA 明说 AI→可谈 AI；TA 只说"这专业以后还有用吗"→只谈"内核会留下、外壳会变"，**不说 AI 取代**。**硬边界（任何情况）：永远不要主动告诉 TA"你爱的这个（专业/方向）会被 AI 干掉/消失"**——一个爱法语的孩子，你绝不能丢"AI 要干掉翻译"。
8. **读 MBTI 报告护栏（D8）**：若你拿到一份 TA 的 MBTI 报告，挖里面的**情境原话和具体画面**，**别被那四个字母带跑**——标签是外壳，底下的生活才是你要的。
9. **最小 distress 拦截（D14，优先级高于以上一切）**：当对话冒出 **自伤 / 绝望 / 家暴 / 断供 / 崩溃** 这类信号，**立刻停掉戳穿/赝品/未来/家庭翻译**，温柔稳住 TA，轻轻提一句"这事值得找个信得过的大人或老师聊聊"，**不再深挖**。你不是心理咨询，但你不会在一个正在崩的孩子身上继续凿。

> 控制 byte-size：与 mbti.md 同量级即可，密度优先，别堆排比。

- [ ] **Step 4: 跑测试**

Run: `cd server && pytest tests/test_major_content.py::test_major_domain_lens_has_soul_elements -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add skill-repo/skills/oriself/domains/major.md server/tests/test_major_content.py
git commit -m "feat(major): write domains/major.md lens (D1-D14 soul)"
```

---

## Task 2: 6 个 major phase 文件（意义三问 arc + 决策闸门）

**Files:** Rewrite `skill-repo/skills/oriself/phases/major-{onboarding,warmup,exploring,midpoint,deep,soft-closing}.md` · Test `test_major_content.py`

- [ ] **Step 1: 写失败测试**

追加：
```python
def test_major_phases_have_decision_gate_and_arc():
    b = load_skill_bundle(SKILL_ROOT)
    phases = {k: b.refs[k].body for k in (
        "major-onboarding", "major-warmup", "major-exploring",
        "major-midpoint", "major-deep", "major-soft-closing")}
    for k, body in phases.items():
        assert "stub" not in body.lower(), f"{k} still stub"
        assert "决策闸门" in body or "本轮只做一件事" in body, f"{k} missing decision gate"
    # 入口不一上来问热爱
    assert "日常" in phases["major-onboarding"]
    assert "热爱" not in phases["major-onboarding"][:200]  # 开场前段不直接问热爱
    # 深化期承载意义三问 Q2/Q3 + 外部约束翻译
    assert ("一步步" in phases["major-deep"] or "付出" in phases["major-deep"])
    # 收束期带 distress 检查、不新探
    assert "不再" in phases["major-soft-closing"] or "收束" in phases["major-soft-closing"]
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd server && pytest tests/test_major_content.py::test_major_phases_have_decision_gate_and_arc -v`
Expected: FAIL（stub）

- [ ] **Step 3: 写 6 个 phase（frontmatter `domain: major` 不变，`needs: []` 或挑共享 technique）**

各文件顶部统一加 **本轮决策闸门** 段（"开口前先选且只选一个：镜像日常 / 质疑赝品 / 深挖意义三问 / 翻译外部约束 / 收敛"），正文按 arc：
- `major-onboarding`（R1）：**从日常生活切入，不问热爱**。"最近这阵子过得咋样 / 高三忙完了吧"——让"高几/考没考"自然浮出。闸门偏向"镜像日常"。
- `major-warmup`（R2-3）：继续聊日常，留意哪根线 TA 语气有劲/眼睛发亮。闸门"镜像日常"为主。
- `major-exploring`（R4-mid）：意义三问 **Q1**（"如果没有任何现实约束，你最想每天做什么"）盯活线，开始第一层深挖。
- `major-midpoint`（mid）：镜像回去（把 TA 散落的线收一收），做**首次赝品测**（4 拍）；不新增清单题。
- `major-deep`（mid-near）：意义三问 **Q2/Q3**（"有没有一条能一步步走的路""哪怕没人要求，你偷偷为它做过什么"）；戳穿=持续深挖；**外部约束翻译在这里高发**（撞墙→认墙→回内核→穿不过退 B）。
- `major-soft-closing`（near+）：温暖收束，**不再新探**；离场前过一遍 distress 信号。

- [ ] **Step 4: 跑测试 + byte-size 回归**

Run: `cd server && pytest tests/test_major_content.py -v`
Expected: PASS。再补一个 byte-size 守卫（仿 test_skill_loader 的 46KB 上限）：major phase 的 `compose_conversation_prompt(domain="major", phase_key="major-deep", current_round=10)` < 46KB。
> 注：static `compose_conversation_prompt` 走 `phase_key=` 直查 refs，可用于结构测；on-demand 由 LLM 选，结构测仍用 static 入口。

- [ ] **Step 5: Commit**

```bash
git add skill-repo/skills/oriself/phases/major-*.md server/tests/test_major_content.py
git commit -m "feat(major): write 6 major phases (意义三问 arc + per-turn decision gate)"
```

---

## Task 3: CONVERGE-major.md（报告 · D2/D7/D9/D13 + meta 契约）

**Files:** Rewrite `skill-repo/skills/oriself/CONVERGE-major.md` · Test `test_major_content.py`

- [ ] **Step 1: 写失败测试**

追加：
```python
def test_converge_major_contract_and_no_mbti():
    b = load_skill_bundle(SKILL_ROOT)
    body = b.refs["converge-major"].body
    assert "stub" not in body.lower()
    # 与 Plan 1 抽取器对齐的 meta 契约
    assert "oriself-direction" in body
    # D13 命名诚实约束（大类 vs 交叉方向表达）
    assert "大类" in body and ("交叉方向" in body or "不是正式" in body or "不存在" in body)
    # D7 低成本试探（替掉行动清单）
    assert "试探" in body or "现在就能" in body
    # D2 内核-外壳 + 别认死
    assert "内核" in body and "壳" in body and ("别认死" in body or "会变" in body)
    # 不含 mbti 四字母机制
    assert "四字母" not in body and "E/I" not in body
    # 通用安全契约保留
    assert "doctype" in body.lower() and "script" in body.lower()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd server && pytest tests/test_major_content.py::test_converge_major_contract_and_no_mbti -v`
Expected: FAIL（stub）

- [ ] **Step 3: 写 CONVERGE-major.md**

frontmatter `name: converge-major`。body 必含：
1. **输出契约（通用，保留）**：一份完整自包含 HTML（`<!doctype html>`→`</html>`），不含 `<script>`/`<iframe>`/事件处理器/外链脚本；服务端给的 `session_id_short`/`today_*` 直接写进 HTML（不留 `{{占位}}`）。
2. **`<title>` = card 标题**（≤40 字，走你的 aesthetic）。
3. **方向标签 meta（与 Plan 1 对齐）**：在 `<head>` 写 `<meta name="oriself-direction" content="...">`，content 是 2-8 字的大方向名（≤60 字），**这是服务端落库用的 `direction_label`**。
4. **内核-外壳剥离 + 兴趣纹理图（D2/D6）**：先把**内核**说死——用三轴帮 TA 看清"什么样的**问题**让 TA 停不下来 / 什么样的**材料**愿整天泡 / 想对**什么样的世界**产生影响"。
5. **C 式翻译法命名（D13）**：先内核 → 再举 **2-3 个当下碰巧装得下这个内核的方向当例子** → 每个都焊上"这是壳、会变、2030 可能换、别认死这个词"。
6. **命名诚实约束（P3）**：区分"**较常见大类/专业族**"（心理学/社会学/计算机类/设计学/新闻传播/法学…，可当真实方向）和"**交叉方向表达**"（可作探索方向，但**不得暗示一定有这个正式本科专业名**）。
7. **低成本试探（D7，替掉 30/90 行动）**：结尾给 1-2 件"TA 现在就能去试、用来验证这个内核是否经得起重复和无聊"的小事。
8. **2030 梯度（D9）**：默认用**人性/存在层**语言讲"为什么这个内核留得住"（"只要还有人，就有人需要有人去…"），**不提 AI**；**硬边界：报告里永远不出现"你爱的某专业会被 AI 取代/消失"**。
9. **保留 mbti 版的视觉/写作品味**（设计师视角、composition-first、反 AI slop、引用 TA 原话），**删掉所有四字母/confidence/E-I-S-N 维度机制**。

- [ ] **Step 4: 跑测试 + compose 联调**

Run: `cd server && pytest tests/test_major_content.py::test_converge_major_contract_and_no_mbti -v`
Expected: PASS。
联调（确认 CONVERGE-major 被 compose_converge_prompt 选中且含 meta 契约）：`cd server && pytest tests/test_major_domain.py::test_converge_major_selected_by_domain -v`（Plan 1 的测试，应仍 PASS）。

- [ ] **Step 5: Commit**

```bash
git add skill-repo/skills/oriself/CONVERGE-major.md server/tests/test_major_content.py
git commit -m "feat(major): write CONVERGE-major.md (内核-外壳 + C命名 + 命名诚实 + oriself-direction meta)"
```

---

## Task 4: 12 条 transcript eval（P3 的便宜评测）

**Files:** Create `skill-repo/benchmark/major_eval/transcripts.json` + `skill-repo/benchmark/major_eval/run_eval.py` · 可选 Test 钩子

- [ ] **Step 1: 写 12 条脚本 transcript fixture**

`transcripts.json`：12 条人造用户侧脚本（每条是一串 user 消息，模拟一类 TA），分布：
- 3 条赝品热爱：①稳定（想考公）②轻松（钱多事少）③别人认可（爸妈说医生好）
- 3 条真实但脆弱热爱：①法语 ②画画 ③历史
- 2 条强外部约束：①分数不够想报临床 ②家里只让学计算机但 TA 爱设计
- 2 条 AI/未来焦虑：①明说"AI 会不会取代翻译" ②只说"这专业以后还有用吗"
- 2 条混合污染：①早期说"想稳定"后期露出爱剪视频 ②给了 MBTI 标签后才给具体生活画面

- [ ] **Step 2: 写评分脚本（5 个二元项）**

`run_eval.py`：对每条 transcript 用 mock 或真 provider 跑满 ~15 轮 + CONVERGE，然后对**整段对话 + 报告**判 5 个二元项（可人工，也可挂一个 LLM-judge）：
1. 赝品有没有被降级（没把稳定/轻松/认可直接盖章成热爱）
2. 有没有继续追证据（"愿不愿扛重复挫败 / 偷偷做过什么"）
3. 有没有**主动**恐吓 AI（违反 D9 硬边界 = 失败）
4. 有没有编出"像专业但不存在"的正式专业名（违反 D13 命名诚实 = 失败）
5. 有没有过早收敛（R6 前 CONVERGE / 没深挖就给方向）

输出每条 5 项 + 汇总通过率。**这是 Plan 2 的验收闸**（目标：3、4 两项零违反；1、2、5 通过率 ≥ 80%）。

- [ ] **Step 3: 跑一轮 eval（mock provider，便宜）**

Run: `cd server && ORISELF_PROVIDER=mock python ../skill-repo/benchmark/major_eval/run_eval.py`
Expected: 产出 12×5 评分表 + 汇总。mock 下主要验"管道+结构"，真实文案质量用一次真 provider（gemini-relay）小跑复核。

- [ ] **Step 4: Commit**

```bash
git add skill-repo/benchmark/major_eval/
git commit -m "test(major): 12-transcript eval harness (5 binary checks)"
```

---

## Self-Review
- **Spec coverage**：D1(T1域定位)·D2(T1#6/T3#4)·D3(T1#4)·D4(T1#3)·D5(T1#5/T2闸门)·D6(T1#2/T2 arc)·D7(T3#7)·D8(T1#8)·D9(T1#7/T3#8)·D12(T1#6)·D13(T3#5#6)·D14(T1#9/T2 soft-closing) 全覆盖。
- **Placeholder scan**：内容是 prose，task 给了**必含元素清单 + 结构断言**做验收，非占位；实际措辞在执行时按清单成文。
- **Type consistency**：CONVERGE-major 的 `<meta name="oriself-direction">`（T3#3）↔ Plan 1 `_extract_major_direction` 正则 ↔ `MajorConvergeOutput.direction_label`（≤60 字）一致。
- **依赖**：全部 task 依赖 Plan 1 完成。
