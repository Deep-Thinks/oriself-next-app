<!-- BEGIN ZCF:AUTO-GENERATED (root) -->
# OriSelf Next · 仓库架构总览

> 本文件由 `/zcf:init-project` 于 **2026-04-18 22:30:17** 生成（自动区间位于 `BEGIN/END ZCF:AUTO-GENERATED` 注释之间；此区间外的手写内容会在下次运行时保留）。

## 一、项目摘要（推断）

OriSelf Next 是一个以「写信」隐喻驱动的对话式 MBTI 人格画像 Web 应用。用户在 Next.js 前端（`web/`）里打开一封"信"，和后端（`server/`，FastAPI）暴露的 SSE 流式对话接口 `POST /letters/{id}/turn` 逐轮交流；对话满足最低轮数（`MIN_CONVERGE_ROUND = 6`，硬上限 `MAX_ROUNDS = 30`）后，后端独立调用 LLM 跑一次 `CONVERGE.md`，生成自包含 HTML 报告（"Issue"），通过 `GET /api/issues/{slug}/render` 以沙箱 `<iframe>` 形式嵌入前端。LLM 的风格 / 流程 / 品味约束全部写在 `skill-repo/skills/oriself/`（作为 Git submodule 或 untracked 子目录接入）下的 Markdown 文件里（SKILL.md / ETHOS.md / CONVERGE.md / `phases/*` / `techniques/*` / `domains/*` / `examples/*`），因此项目自称"产品即 skill"。支持的 LLM provider 通过 `ORISELF_PROVIDER` 环境变量切换，包含 Qwen / DeepSeek / Kimi / OpenAI / 302.ai Gemini 兼容端（统一走 OpenAI compatible 接口）以及用于离线 / 测试的 `mock`。前端附带首页最近信件本地存档（纯 localStorage）、反馈抽屉、重写（rewrite）上一轮等能力；后端另有 `/feedback`、`/issues/{slug}/publish` 等运维接口。

关键形态关键词：Next.js 15 App Router + React 19 + Tailwind · FastAPI + SQLAlchemy 2.x + SQLite · SSE 流式 token · LLM provider 可切 · skill-as-markdown 作为 submodule。

> [需确认] 项目的对外品牌域 `next.oriself.com` 和两条 GitHub 仓库链接（`oriself-next` skill 仓库、`oriself-next-app` app 仓库）见 `web/app/page.tsx` 页脚；如果你希望 README 里对外表述与此不一致，可在 `项目摘要` 下手写补充，该段会保留。

## 二、架构总览

```
┌──────────────────────── Browser ────────────────────────┐
│  Next.js App Router (web/)                              │
│   · /             Landing (最近信件本地缓存)            │
│   · /letters/new  Server Component → POST /letters      │
│   · /letters/:id  SSE 对话视图 (Composer / Turn)        │
│   · /issues/:slug 报告壳 + <iframe sandbox>             │
└──────────────┬──────────────────────────────────────────┘
               │  同域 /api/* → next.config.mjs rewrites
               ▼
┌──────────────────────── FastAPI (server/) ──────────────┐
│  routes/letters.py    POST/GET 对话 · SSE               │
│  routes/issues.py     报告元数据 / 渲染 / 公开开关       │
│  routes/feedback.py   匿名反馈 + per-IP 速率            │
│  skill_runner.py      TurnRunner / ReportRunner         │
│  skill_loader.py      读取 skill-repo 下的 Markdown     │
│  guardrails.py        STATUS 解析 + HTML 安全 + MBTI 一致│
│  llm_client.py        openai-compatible / mock          │
│  models.py            SQLAlchemy ORM（sessions / convs） │
└──────────────┬──────────────────────────────────────────┘
               │ httpx → provider（Qwen / DeepSeek / Kimi / OpenAI / 302.ai）
               ▼                                 │
     ┌──────────────────┐                        │
     │ LLM provider     │                        │
     └──────────────────┘                        │
                                                 │
     ┌──────────────────┐   load on startup      │
     │ skill-repo/*.md  │◄───────────────────────┘
     └──────────────────┘
```

### 2.1 模块结构图（Mermaid）

```mermaid
graph TD
    R["(根) oriself-next-app"] --> W["web · Next.js 前端"]
    R --> S["server · FastAPI 后端"]
    R --> K["skill-repo · LLM skill（submodule/untracked）"]
    R --> CI[".github/workflows · CI & bump-skill"]

    W -->|SSE / JSON over /api/*| S
    S -->|load *.md| K
    CI -->|weekly bump PR| K
    CI -->|typecheck+build| W
    CI -->|pytest+cov| S

    click W "./web/CLAUDE.md" "查看 web 模块文档"
    click S "./server/CLAUDE.md" "查看 server 模块文档"
```

## 三、模块索引

| 路径 | 职责 | 语言 / 栈 | 入口 | 模块文档 |
|---|---|---|---|---|
| `web/` | 用户侧 Web 端：登录自己、写信、看报告；SSE 消费、iframe 渲染 | TypeScript · Next.js 15 · React 19 · Tailwind | `web/app/layout.tsx` · `web/app/page.tsx` | [web/CLAUDE.md](./web/CLAUDE.md) |
| `server/` | 对话循环、skill prompt 组装、多 provider LLM 适配、SQLite 持久化、报告渲染 | Python 3.10+ · FastAPI · SQLAlchemy 2 · httpx | `server/oriself_server/main.py` (`uvicorn oriself_server.main:app`) | [server/CLAUDE.md](./server/CLAUDE.md) |
| `skill-repo/` | LLM 的"剧本"：SKILL.md / ETHOS.md / CONVERGE.md / phases / techniques / domains / examples | Markdown | `skill-repo/skills/oriself/SKILL.md` | *(外部仓库；本仓不生成模块 CLAUDE.md，避免覆盖上游)* |
| `.github/workflows/` | CI（web typecheck+build / server pytest+cov）与 `bump-skill.yml`（每周一 UTC 09:00 拉最新 skill submodule 开 PR） | YAML | `ci.yml` · `bump-skill.yml` | *(单文件，无独立 CLAUDE.md)* |

## 四、运行与开发

### 4.1 前端（`web/`）

```bash
cd web
pnpm install                                   # packageManager pnpm@9.15.0
cp .env.local.example .env.local               # NEXT_PUBLIC_API_URL / API_INTERNAL_URL
pnpm dev                                       # :3000，next.config.mjs 把 /api/* rewrite 到后端
pnpm typecheck                                 # tsc --noEmit
pnpm build && pnpm start                       # 本地生产模式
```

Docker：`BUILD_STANDALONE=1 pnpm build` 产出 `.next/standalone`，`web/Dockerfile` 多阶段构建，最终 `node server.js` 监听 3000。

### 4.2 后端（`server/`）

```bash
cd server
pip install -e ".[dev]"                        # 可选 [postgres] 切 psycopg
ORISELF_PROVIDER=mock \
  uvicorn oriself_server.main:app --reload     # :8000，零 API key
# Swagger: http://localhost:8000/docs
python -m oriself_server.cli --provider mock   # 终端里直接跑一封信
```

环境变量（详见 `server/oriself_server/main.py` 顶部 docstring）：

- `ORISELF_PROVIDER` — `qwen` / `deepseek` / `kimi` / `openai` / `mock`（默认由请求体决定，否则读此变量再兜 `"mock"`）
- `ORISELF_DB_PATH` — SQLite 路径，默认 `oriself_v2.db`
- `ORISELF_{PROVIDER}_API_KEY` — 各 provider 密钥；支持 `GEMINI_*` 别名（见最近提交 `3fa0ac9`）
- `ORISELF_CORS_ORIGINS` — 逗号分隔的允许 origin，留空时默认 `*`
- `ORISELF_SKILL_ROOT` — 指向 `skill-repo/skills/oriself` 的绝对路径；未设时按相对结构推断

后端会自动 `load_dotenv` 项目根或 `server/` 下的 `.env`（`main.py` 做了 two-candidate 查找）。

### 4.3 LLM skill（`skill-repo/`）

- 本仓以 Git submodule 形式引用；当前 working tree 里作为 untracked 目录存在（见 `git status`）。
- CI 的 `bump-skill.yml` 每周一自动 `git fetch origin main` + 开 PR，标题包含从 `SKILL.md` 抓出的版本号。
- 本地如要改 prompt：`cd skill-repo && git checkout main && 改完 push`，回到主仓 `git add skill-repo && git commit`。

## 五、测试策略

| 层 | 工具 | 命令 | 说明 |
|---|---|---|---|
| 后端单测 / smoke | pytest + pytest-asyncio + pytest-cov | `cd server && pytest --cov=oriself_server` | `server/tests/test_v24_smoke.py` 覆盖 STATUS parse / guardrails / Mock backend；`test_skill_loader.py` 验证 skill bundle 加载 |
| 前端类型 | `tsc --noEmit` | `cd web && pnpm typecheck` | 无单测框架；CI 只跑 typecheck + `pnpm build` |
| CI | GitHub Actions | `.github/workflows/ci.yml` | Python 3.12 + Node 20 双 job |

主要缺口：web 端目前没有 e2e / 组件测试；server 无集成层（真 provider）测试。详见下方「推荐的下一步深挖路径」。

## 六、编码规范

- **TypeScript（web）**：`strict: true`，路径别名 `@/*` → `./*`；ESLint 走 `eslint-config-next`；禁默认调色盘（Tailwind `theme.colors` 完全自定义，见 `tailwind.config.ts`）。
- **Python（server）**：`from __future__ import annotations` 全面启用；v2.4 哲学是"软约束写 skill，硬约束写 guardrails"——只有 4 条硬拦截（轮数上限 / mbti 正则 / report_html XSS / 4 字母一致性），其余品味问题交给 skill prompt 与用户手动「重写这轮」。
- **数据库迁移**：无 Alembic。`init_db()` 内置一次性 `DROP INDEX IF EXISTS uq_session_round_discarded`（v2.4.x 修复重写冲突）。新增字段请在本文件下方「变更记录」里登记，并考虑是否同样需要 in-place 小迁移。
- **安全**：LLM 生成的 HTML 只能通过 `/issues/{slug}/render` 的 CSP sandbox 头 + 前端 `iframe sandbox="allow-scripts"`（禁 `allow-same-origin`）双层隔离；任何新增用户可见文本走 `utils/html_sanitize.escape_user_quote`。

## 七、AI 使用指引（提示 Claude Code 时）

- 动 `server/oriself_server/routes/letters.py` 的 SSE 事件格式时，**同时**改 `web/lib/api.ts::streamToDone` 的 frame 解析；协议字段定义在 `web/lib/types.ts::TurnDonePayload`。
- 动 `schemas.ConvergeOutput` 字段时，检查 `guardrails.verify_report_html_consistency`、`routes/letters.compose_result` 的序列化分支、以及 `web/lib/types.ts::LetterResult`。
- 新增 provider 时只改 `server/oriself_server/llm_client.py` 的 `make_backend`；所有 provider 都走 `openai_compatible` 类，只差 base_url + key 前缀。
- 涉及 skill 文本的改动属于 `skill-repo` 仓，不要直接改 `server/` 的 Python 文件绕过 skill。
- 不要在对话轮里引入 JSON schema retry：v2.4 的 design note 明确说"对话轮不 retry，用户点「重写」"。
- 生成新的模块 CLAUDE.md 时，面包屑路径请按目录层级正确设置（根 → web 只需两跳）。

## 八、覆盖率快照（本次运行）

| 维度 | 数值 |
|---|---|
| 手动扫描文件数 | 23（排除 `node_modules` / `skill-repo/` 子目录内文件） |
| 识别出的根级模块 | 2 个写入 CLAUDE.md（`web/`、`server/`） + 1 个仅索引（`skill-repo/` 外部仓） |
| 主要被忽略目录 | `web/node_modules/**`（pnpm store，千量级文件）、`.git/**`、`server/tests/__pycache__/**`、`.next/**`、`dist/**` |
| 未读内容（按缺口登记） | `skill-repo/skills/oriself/*.md` 全文内容、`web/components/**` 交互细节、`server/oriself_server/utils/*.py` 清洗实现、`server/oriself_server/skill_runner.py` 下半部（phase 选择逻辑）、`server/oriself_server/llm_client.py` 下半部（openai-compatible 实现） |

## 九、推荐的下一步深挖路径

1. `web/components/letter/composer.tsx` + `turn.tsx` — 对话主界面交互；会揭示 z-index / 光标、以及 `lift composer z-index above main` 修复（commit `5ec07b8`）的具体结构。
2. `server/oriself_server/skill_runner.py`（第 80 行以后）— `choose_phase_key`、`advance_state`、`ReportRunner.compose` 的 3-retry 策略。
3. `server/oriself_server/llm_client.py`（第 60 行以后）— `openai_compatible` 实现、SSE 解析、mock 的 status / converge 回放。
4. `server/oriself_server/utils/html_sanitize.py` + `prompt_sanitize.py` — 把 XSS / prompt injection 边界补到文档里。
5. `skill-repo/skills/oriself/SKILL.md` / `CONVERGE.md` — 不在本仓扫描，但理解"产品即 skill"必读。
6. `web/components/issue/issue-chrome.tsx` + `feedback/feedback-sheet.tsx` — issue 页壳与反馈抽屉。
7. 补一份 `server/tests` 对 `routes/letters.py` 的 endpoint-level 集成测（当前只有 unit smoke）。

## 十、变更记录 (Changelog)

| 时间 | 内容 | 来源 |
|---|---|---|
| 2026-04-18 22:30:17 | 初始化根级 CLAUDE.md；创建 `web/CLAUDE.md`、`server/CLAUDE.md`；写入 `.claude/index.json` | `/zcf:init-project` 自适应扫描 |
| *(保留给手写记录；本行以下内容在重新运行时不会被覆盖)* | | |
| 2026-05-17 | issue 访问模型改为 capability-URL（slug 即凭证）：删除 `is_public`→403 访问门，slug 增熵至 64bit，移除前端「公开/私有」toggle，issue 页加 `robots noindex`。`issue_is_public` 保留作未来公开展示墙的收录标记 | 手动 · 修私有报告本人打不开的 bug |
| 2026-06-10 | **D-A（契约级）**：`GET /issues/{slug}` 不再返回 `letter_id`——`letter_id`(=session_id) 成为 owner-only capability（仅 owner 浏览器 localStorage 持有），一刀堵掉 P0 owner_token 回取链 + transcript 泄漏 + HistorySync 身份污染。前端 owner 态全部改为按 slug 反查 localStorage（`findByIssueSlug`/`isOwnerOf`/`getOwnerToken`），跨浏览器经 `#claim=` 认领链接移交 publish 权 | 增长方案 v3.2.1（virality-retention-uplift）·Batch 0 |
| 2026-06-10 | **增长方案 v3.2.1 落地**：自转发受众分流（接收者 accent 换「写一封自己的」）+ 分享文案/归因页脚/落款域名 + OG 身份 token/竖版分享图/excerpt 三面共用 + ISR 实效化 + 画廊接进动线/公开回报闭环 + 域交叉「换个命题」/信匣导出。新增列 `test_results.issue_excerpt`（in-place 迁移）。D-1 存量转私有+种子集见 `docs/ops/2026-06-seed-gallery-runbook.md`（待 sign-off，未执行） | 增长方案 v3.2.1 · Batch 0-7 |
| 2026-06-23 | **首屏改版「会写字的刊头」上线生产**（commit `7dce48c`，针对「点进来不知道是干啥」/未激活 61%）：新增 `components/home/landing-hero.tsx`——刊头逐字自显→OriSelf 大标整体上移→浮出三幕体验预告 + 域切换预期说明 + 每域 4 张自动轮播范例（信笺/引言/目录三卡式）；单栏、大标不缩、清 h1 默认外边距、reduced-motion 兜底。**术语**：用户可见「命题」全部回到 信/人格画像/公开画廊。`AuthorBadge` 去 modal、直跳 niuniu869.com。`history.importLetters` + recent-letters 导入 UI（按 letterId 合并、绝不丢 ownerToken、空态可导入）。删 `domain-toggle.tsx`，`globals.css` 加 `.lh-*`。**D-1 执行**：存量公开 47→0（`UPDATE test_results SET issue_is_public=0`，事务内验证后提交，备份 `oriself_v2.db.bak.20260623-134635`）；后端 `/api/issues/public` 已空，画廊页 ISR 1h 内清空。种子集（runbook §4）未做。 | 首屏改版 + D-1 转私有 |
| 2026-06-24 | **v3.2.3 · skill 剪枝去二选一 priming（双端发版）**：根因——v3.2.0 关对话轮扩展思考（`thinking_level=low`）后，模型失去处理「❌反例/否定」的预算，转而照抄 context 里的二选一句式模板，生产二选一率 **31%→74.6%**（同 skill 版/同模型，仅按 6/9 切；全 phase 暴涨、用户回复反而变长，排除短回复 fallback）。这是 v2.5.4 / 2.6.x / 3.1.1 反复修过的同一坑（绕回原点：74.6% 已高过当初写 `eval_probe_style.py` 的 v2.5.2 baseline）。**剪枝**（6 文件 10 处）：删 `SKILL.md` 铁则2 / `situational-questions` / `phase-deep` / `phase-exploring` 里所有 ❌「X 还是 Y?」模板（低思考下被当模板照抄）；`mbti.md` fallback 两题 + 「被带进去 vs」改抽象描述；`major.md` 选科枚举 + 壳/内核去问句形式。维度定义沿用「TA X；TA Y」分号式。eval lint「合法」二选一模板 47→32（清 15 个），CONVERGE/报告文件不动（报告轮思考仍开）。**`SKILL.md` version 3.1.1→3.2.3 同步升**，剪枝后新 session 在 DB 带新 `skill_version`，生产数据即天然 A/B（用户决策：否掉每次部署跑 eval—公益服务成本；亦否运行态代码护栏）。 | v3.2.3 剪枝去 priming |
| 2026-06-24 | **生产 `thinking_level` low→medium（配置改动，非代码/非发版）**：剪枝上线后冒烟发现仅剪枝不够（思考仍关，二选一约一半）——因为二选一在低思考下是模型默认惰性 + MBTI=4 二分维度的任务拉力，prompt 剪不掉这两股水流。模拟用户 2×2 测试（4 个 subagent，2 域 × {low,medium}，各 8 轮）：二选一率 **low 14/16(88%) → medium 4/16(25%)**（mbti 8/8→1/8，major 6/8→3/8）；**TTFT 2.4s→4.1s（+1.7s，仍远低于原始 high ~8s 死区）**。结论：**prune + thinking=medium 两手叠加**才接近当初 6.2%。改 `/oriself-next-app/.env` `ORISELF_GEMINI_TURN_THINKING=medium` + 重启即生效（`load_dotenv override=False`，pm2 env 无此变量，持久）。代码默认仍 `low`（fallback），`.env` 是设计内的可调旋钮。残余：major 域「开放主问 + A还是B 尾巴」习惯（3/8），可后续小剪枝再压。 | thinking→medium |
| 2026-08-12 | **v3.4.0 · 主力模型 gemini-3-flash-preview → deepseek-v4-flash（server 发版 + 生产配置）**：换端点——从自建 relay（`43.160.251.210:10011`）改 **DeepSeek 官方直连** `api.deepseek.com/v1`，key 取自 `accountingllm_dev/.env`（余额 ¥1021）。**动机不是省钱是提速**：同一条真实 pass2 prompt（9.5k token）实测 TTFT，生产现役 gemini@relay(medium) 中位 **12.4s**/均值 22.3s/最差 70.6s 且夹带 429（8 次命中 1 次），deepseek-v4-flash@官方(xhigh) 中位 **8.2s**/均值 10.9s/最差 20.5s——记忆里 4.1s 的基线（2026-06-24）已不成立，relay 上的 gemini 退化了。**三处思考档位必须分开设**（`llm_client.py`）：①**pass1 必须关思考**——v4 系列在思考模式下直接 400 拒绝 `tool_choice="required"`（`Thinking mode does not support this tool_choice`），而强制选工具是 v2.6 ADR-2 的契约；关掉后 0.8s 返回合法 `read_skill`。②对话轮 `reasoning_effort=xhigh`（env `ORISELF_DEEPSEEK_TURN_THINKING`）③报告轮 xhigh（env `ORISELF_DEEPSEEK_REPORT_THINKING`）。合法枚举 `none/minimal/low/medium/high/xhigh/max`，非法值**启动即报错**不静默降级（无效值官方也 400，`banana` 对照实验确认枚举是真校验、xhigh 是真档位）。顺带修哑雷：deepseek preset 的 `default_model` 还是 `deepseek-chat`，而官方端点现在只剩 v4-flash/v4-pro，漏配 env 会打到不存在的模型。**报告轮 276s** 逼近 nginx 360s 上限 → 生产 nginx `/api/` 的 `proxy_read_timeout`/`proxy_send_timeout` 360s→600s（备份 `next.oriself.com.bak-20260812`）。**GEMINI_\* 配置全部保留**：老信的 `sess.provider` 记的是 gemini，`make_backend(sess.provider)` 会照旧走 relay，删了老用户续聊直接挂。回滚 = 改回 `.env` 的 `ORISELF_PROVIDER` + restart。验证：本地 LLM 模拟真人跑完 10 轮 mbti + 报告轮（13111 字符、HTML 闭合、guardrails 0 retry），生产真跑一轮 happy path。**待观察**：skill 是按 gemini 调的，deepseek 的二选一提问率需看生产数据（本地 10 轮命中 4 轮，但用户模拟器质量差不足为凭）；DB 的 provider/model 字段天然形成 A/B | v3.4.0 换模型 |
| 2026-07-11 | **v3.3.1 · 修抽屉交互被动画钉死 + /about 刊首语**：v3.3.0 线上事故——`.ad-card` 的入场动画 `fill-mode: both` 长期霸占 transform，普通动效用户的抽卡/悬停/预抽全部失效（此前验证全程模拟 reduced-motion 恰好绕过该路径，教训：动效类改动必须双路径走查）。修法：动画挪到卡面内层 `.ad-in` + `backwards` 填充，交互 transform 留给外壳。`/about` 新增「刊首语」——依项目全部历史 prompt 整理的作者愿景（公益/隐私默认/反模板/给人回信）。 | v3.3.1 |
| 2026-07-10 | **v3.3.0 · SEO/GEO 改版（web-only 发版 + 运维）**：①域名归一——oriself.com/www 全路径 301→next（生产 nginx，原配置备份 `/root/oriself.com.nginx.bak.20260710-180052`，老站进程未动、acme 路径保留；老站 /mcp 与 ASR 端点随之对外 301）；②首页第二屏「目录页」＝十六型索引卡抽屉（拖拽拨动/单张抽出/一次一张，`components/home/archive-drawer.tsx`，已刊由 TYPE_PROFILES 自动判定，文案与链接常驻 SSR DOM）+ 方法论/画廊两张明信片（`postcards.tsx`）；③ `/types` ×16 档案页（首四篇手写、其余十二篇由 4 个 fable subagent 依两库真实报告取材起草+人工逐篇通读，内容单一源 `web/lib/type-profiles.ts`）+ `/about` 方法论 FAQ 页 + `llms.txt` + 根 og:image + 全站 JSON-LD（WebSite/WebApplication/Article/FAQPage/CollectionPage）+ sitemap 收新页并去假 lastmod + IndexNow key 路由（`2f2d…a9.txt`）；④ title/描述关键词化「OriSelf · 用对话代替选择题的 MBTI 人格测试」。页脚版权页移文档末，折叠首屏底部加「目录 ↓」暗号（实测 hero 底边 932px 与旧版逐像素一致）。运维已执行：生产 excerpt 回填 45/50（备份 `.bak.20260710-180146`）。**种子画廊仍待作者认领本人 session 后执行**（runbook §4）。方案全文 `docs/marketing/seo-geo-plan-2026-07-10.md` | SEO/GEO 方案 P0–P2 · v3.3.0 |
| 2026-07-11 | **v3.3.5 · 档案抽屉改书签墙（十六条书脊一字排开，悬停即弹）**：旧布局卡间距固定 182px、总宽近 3000px，一屏只装得下 5 张，其余靠横向拨动（用户："只能看到五个"）。改版：①宽屏(≥900px)抽屉挣脱 880px 正文栏宽到 1160px，十六张卡改绝对定位 `left: calc(var(--i) * (100% - 236px) / 15)` 均分净宽——每张露出的宽度恰好等于**书脊**宽（`--spine` = 卡间距 ≈ 61px，竖排类型代码 + 档案号），卡面完全藏进右邻身后；②悬停/键盘聚焦 → 卡面抽起 190px 升到书脊墙上方 + 外壳抬 z-index = 弹出；③整条书脊即 `<Link>`（点哪张进哪张档案页），删掉 pulled/toggle 状态与预抽 INFP。**三个非显然的坑**（都靠 Playwright 真机走查逮到）：**(a)** 抬起动作原本作用在带触发区的外壳上 → 卡片一抬走鼠标就脱靶 → hover 丢失 → 回落 → 又命中，来回抖；改为**外壳钉死不动只吃入场位移、内层卡面吃交互位移**（顺带把入场/交互两个 transform 彻底分到两层，不会再互相钉死）。**(b)** 236px 宽的透明外壳会吃指针事件，一旦 hover 抬到 z-index 40 就把右邻三条书脊整个罩住，横扫时永远跳不过去 → `.arc-card { pointer-events: none }`，只有卡面与书脊接鼠标。**(c)** 抽得不够高时弹出的卡面正好盖住右邻三条书脊 → 抬 190px，让书脊下半截空出一条 86px「扫描带」，鼠标沿书脊下缘横扫可一张接一张地弹（走查断言：16/16 依次命中且不抖）。另加槽底板 `.arc-card::before`（抽走一张后露出空槽，否则会露出左邻卡面的半截文字）。窄屏(<900px)保留横向拨动 + 点卡直达。回归：桌面/adblock 模拟/动效冻结/无 JS/reduced-motion/移动端 六路径卡片均 16/16 可见，点击直达 `/types/*` | v3.3.5 书签墙 |
| 2026-07-11 | **v3.3.4 · 档案抽屉空盒真因：类名撞广告拦截器 + 可见性不再下注（web-only 发版）**：v3.3.3 的四层兜底在用户机器上**依然空盒**——推翻「动画不推进」的判断。codex 二次意见指出真因：**整组类名以 `ad-` 开头（`.ad-drawer`/`.ad-card`/`.ad-row`/`.ad-in`），撞上广告拦截器/隐私扩展的通用 cosmetic 过滤规则**，被 `!important` 隐藏；站点侧任何兜底（含 `.ad-done`，无 `!important`）都压不过用户来源的 `!important`。证据链吻合：只此一位用户稳定复现、无扩展的 Playwright 永远正常、DOM 中 16 张卡俱在、木框 `.ad-front` 可见而卡面 `.ad-in` 不可见、硬刷新与两次发版均无效、同页 hero `.lh-*` 动画正常（不像广告类名）。**修法两条**：①**类名整体改名 `ad-*` → `arc-*`**（卡面 `.ad-in` → `.arc-face`），脱掉广告马甲；②**卡片永远可见**——入场只改 30px 位移，绝不碰 opacity/display/visibility，删掉 `.arc-done` 护栏与 `ENTER_MS` 定时器（「先藏起来等某个东西放出来」本身就是拿可见性下注，动效不跑/JS 没到/外部样式压过兜底，卡片就再也回不来）；动效坏掉时最差只是「卡片低 30px」。验证：注入广告拦截器式 `[class*="ad-"] {display:none!important}` 后新标记 16/16 可见且 DOM 中 `ad-` 类名残留为 0；动效冻结（CDP playbackRate=0）16/16；无 JS 16/16；交互（抽卡 −114/悬停 −16）正常。**教训：面向用户的类名不要用 `ad-` 前缀**（`.ad-card`/`.ad-row` 是 EasyList 高频命中项） | v3.3.4 抽屉真因 |
| 2026-07-11 | **v3.3.3 · 修首页档案抽屉空盒（web-only 发版）**：用户线上稳定复现「16 型索引卡一张都看不到，只剩空木盒」。诊断输出锁死真因——`.ad-settled` 已打上、16 张卡都在 DOM、`IntersectionObserver` 正常、非 reduced-motion，但卡面 `opacity:0`：卡片钉死在入场动画 `ad-settle` 的 `from` 帧上，**那个动画在用户的 Chrome（UA 报 150）里没有推进**（原因未查明，同页 hero 逐字动画正常）。病根与 v3.3.1 fill-mode 钉死交互同族：**拿 CSS 动效承担本该是静态状态的东西**（一次是交互态，一次是可见性）。修法四层，每层不依赖上一层：①入场 `animation`→**`transition`**（终态=元素基础值，引擎不跑就直接落终态 = fail-open；animation 的终态靠帧撑，不跑就停在 from = fail-closed）；②隐藏只在 JS 主动打的 `.ad-armed` 下生效，且仅当抽屉尚在视野外才打 → JS 未执行/hydration 失败/到得比滚动还晚，卡片都直出可见（附带修掉「16 张卡 SSR 文案被 opacity:0 藏着」的 SEO 反效果）；③`.ad-armed` 由 IO + scroll **双路**解除（IO 阈值 0.18→0.05）；④落位时长 `ENTER_MS=1200` 一到，JS 强制 `.ad-done` 拆过渡、钉死 `opacity:1`。验证用 CDP `Animation.setPlaybackRate=0` 冻结动效时间线**在本地完整复现了空盒**并看着护栏救回；四路径（正常动效/动效冻结/无 JS/reduced-motion）+ 移动端 + 交互断言（抽卡 −114、悬停 −16、推回）全绿。仅改 `web/components/home/archive-drawer.tsx` + `web/app/globals.css` | v3.3.3 抽屉空盒 |
| 2026-07-11 | **v3.3.2 · /about 刊首语重写（web-only 发版，文案 only）**：配合新上线的高考专业推荐功能，把 /about「刊首语」从 v3.3.1 的方法论自述改写为面向考生的愿景表达——新增两段职业发展主线：教育面向未来（2030 毕业、时代不可预测，「哪个方向好就业就报哪个」的旧思路失灵）+「志存高远，脚踏实地」（先探寻热爱、再回到分数/城市/家庭的真实约束里找可行路，每一分不浪费）。素材取自作者当日社群发布文案 + 历史 prompt。按作者三轮反馈定稿：去会计/去作者 MBTI 自述、禁「不是…而是…」否定对举、去开发日志腔改口语、只讲愿景。落款「原自我·作者」→ 可点击 `niuniu869`（跳 niuniu869.com）。经 nature-polishing 三轮去 AI 味。仅改 `web/app/about/page.tsx` + `web/package.json` 版本号 | v3.3.2 /about 刊首语 |

<!-- END ZCF:AUTO-GENERATED (root) -->
