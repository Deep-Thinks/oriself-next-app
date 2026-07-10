# OriSelf Next · App

[English](./README_EN.md)

> **OriSelf（原自我）是一个免费、无需注册的对话式 MBTI / 16 型人格测试**：不做选择题，
> 和 AI 像写信一样聊十分钟（6–30 轮），收到一封写给你的信——一份人格画像。
> 也可以聊聊你适合学什么专业。开源（Apache 2.0），中文。

**可自部署的 OriSelf 完整实例。** 由 Next.js 前端 + FastAPI 后端组成，加载 [`Deep-Thinks/oriself-next`](https://github.com/Deep-Thinks/oriself-next) skill 作为产品本体。

官方部署：[next.oriself.com](https://next.oriself.com)

---

## 这个仓库是什么

OriSelf 的架构是分层的：

| 层 | 做什么 | 在哪 |
|---|---|---|
| **Skill** | 访谈方法论 · 一组 markdown | [`Deep-Thinks/oriself-next`](https://github.com/Deep-Thinks/oriself-next) |
| **Server** | FastAPI · 对话循环 + guardrails + LLM 适配 | 本仓库 `server/` |
| **Web** | Next.js · 落地页 / 对话页 / 报告页 | 本仓库 `web/` |

**产品本体是 skill。** 本仓库是把 skill 包装成完整服务的参考实现。Skill 作为 git submodule 引入，升级通过 bump submodule 完成——我们不在这里改 skill 的 markdown。

---

## 自部署（5 分钟）

```bash
git clone --recurse-submodules https://github.com/Deep-Thinks/oriself-next-app.git
cd oriself-next-app
cp .env.example .env
# 编辑 .env，填入任一 LLM API key（DeepSeek / Qwen / Kimi / OpenAI）
docker compose up --build
```

打开 http://localhost:3000 就能用了。

不想装 Docker？也可以分别跑前后端（见下面「开发模式」）。

---

## 架构

```
 ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
 │   Next.js       │ HTTP │   FastAPI       │      │   LLM Provider  │
 │   (Vercel)      ├─────→│   (Fly.io)      ├─────→│   DeepSeek/...  │
 │                 │      │                 │      │                 │
 │   Landing       │      │   SkillRunner   │      └─────────────────┘
 │   Letter page   │      │     ↓           │
 │   Issue page    │←─────│   Guardrails    │
 │   (iframe)      │      │     ↓           │
 └─────────────────┘      │   SQLite /      │
                          │   Postgres      │
                          └────────┬────────┘
                                   │
                          ┌────────────────────┐
                          │  skill-repo/       │  ← git submodule →
                          │    skills/oriself/ │    Deep-Thinks/oriself-next
                          │    SKILL.md ...    │
                          └────────────────────┘
```

关键设计：

- **报告页是 iframe sandbox**。LLM 生成的 HTML 完全沙箱化，不能访问父页面。
- **每个 MBTI 类型独立视觉**。Skill 在收敛时指示 LLM 生成完全不同的设计——我们这边只提供信封和装订线。
- **Skill 是产品本体**。改访谈方法论 = 去 skill 仓库改 markdown → bump submodule。改前后端 = 改本仓库代码。两者干净分离。

---

## 开发模式

### 前端

```bash
cd web
pnpm install
pnpm dev                    # :3000
```

环境变量（`web/.env.local`）：
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 后端

```bash
cd server
pip install -e ".[dev]"

# 确保 skills/ submodule 已初始化
cd .. && git submodule update --init --recursive

# 跑起来（mock provider，不需要 API key）
ORISELF_PROVIDER=mock uvicorn oriself_server.main:app --reload  # :8000

# 跑测试
cd server && pytest
```

Swagger UI: http://localhost:8000/docs

### 实时语音输入（可选）

V0 提供“像聊天窗口一样”的语音输入：桌面端点击麦克风开始/停止，移动端按住说话，识别文本只写入输入框，用户可以继续修改，同一轮对话也可以多次录入后再手动发送。后端代理 DashScope `fun-asr-realtime`，浏览器不会接触 API Key；同时会按会话目录保存每次语音输入的 PCM 与元信息，便于回测修 bug。

开启：

```bash
ORISELF_ASR_ENABLED=1
ORISELF_ASR_API_KEY=sk-xxx          # 或 DASHSCOPE_API_KEY
ORISELF_ASR_ARCHIVE_DIR=/data/asr-archive
NEXT_PUBLIC_ASR_ENABLED=1
NEXT_PUBLIC_ASR_WS_URL=wss://api.oriself.com/asr/ws
```

生产部署需确认两点：页面响应头允许同源麦克风（`Permissions-Policy: microphone=(self)`），并且外层 nginx/Caddy/Vercel/Fly 链路能把 WebSocket Upgrade 转发到 FastAPI 的 `/asr/ws`。

### Skill 升级

每周 GitHub Action 自动开 PR 同步 skill 最新版。手动升级：

```bash
cd skill-repo
git pull origin main
cd ..
git add skill-repo
git commit -m "bump skill to v2.x.x"
```

---

## 目录结构

```
oriself-next-app/
├── skill-repo/                    # git submodule → Deep-Thinks/oriself-next
│   └── skills/oriself/            # ↑ 真正的 skill 在这
│
├── web/                           # Next.js 15 · next.oriself.com
│   ├── app/
│   │   ├── page.tsx               #   / · 落地页
│   │   ├── letters/[id]/page.tsx  #   /letters/:id · 对话页
│   │   └── issues/[id]/page.tsx   #   /issues/:slug · 报告页（iframe）
│   ├── components/
│   ├── lib/
│   └── styles/
│
├── server/                        # FastAPI · api.oriself.com
│   ├── oriself_server/
│   │   ├── main.py
│   │   ├── routes/
│   │   │   ├── letters.py         #   /letters/*
│   │   │   └── issues.py          #   /issues/* · 公开报告
│   │   ├── skill_runner.py
│   │   ├── guardrails.py
│   │   └── llm_client.py
│   └── tests/
│
├── deploy/
│   ├── vercel.json
│   └── fly.toml
│
├── docker-compose.yml
├── .env.example
└── .github/workflows/
    ├── ci.yml
    └── bump-skill.yml            # 每周自动 PR skill 升级
```

---

## 开源

**Apache 2.0**。随你 fork、改造、自托管。

Skill 本体在 [`Deep-Thinks/oriself-next`](https://github.com/Deep-Thinks/oriself-next) 有单独的许可证（也是 Apache 2.0）。
