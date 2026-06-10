# OriSelf 增长提升方案 — 自转发 × 留存（接 2026-06-10 SEO/分享方案）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把每个被分享的报告页变成「接收者的落地页」（接收者→新写信人是最大病毒系数杠杆）；让微信截图/链接私发这条主分发渠道自带归因回路；修掉 SEO 方案审计发现的 P0 鉴权绕过与 ISR 失效；用最小代价给一次性品类装上可测量的回访钩子。

**前置事实（2026-06-10 审计结论，11-agent 工作流 + 实跑验证）：**
- SEO/分享方案（`2026-06-10-seo-sharing-overhaul.md`）代码层已全量落地（pytest 265 passed / typecheck / build 全绿），但**未 commit、未部署、D-1 未执行、眼球 gate 未走**。
- 🔴 P0：owner_token 可被任意持 slug 者绕过取回（本方案 Batch 0 修）。
- 🟡 ISR 三处实效问题（本方案 Batch 1 修）。
- 漏斗（3.1.x）：104 建信 → 43 开口（41%）→ 21 报告；后段不漏，痛点在早段。拿到报告的人≈全程留存，报告是唯一可分享资产。
- 主战场是微信对话/朋友圈/小红书（截图文化 + 链接私发），SEO 是慢变量不是主引擎。

**设计红线（全方案适用）：**
- 信件美学：暖纸/油墨/oxblood，所有新增优先做减法或约束；拒绝 streak/积分/徽章/弹窗引导类 AI-slop。
- **accent 预算每页只有一个 primary**——本方案只「换持有人」，不增加数量。
- 对话轮不引入 JSON schema retry（v2.4 设计哲学不动）。
- skill 文本改动属 `skill-repo` 仓（submodule），单独 commit。

**Tech Stack:** Next.js 15.5 App Router + React 19 · FastAPI + SQLAlchemy 2 + SQLite · pytest + fastapi.testclient · next/og ImageResponse。

---

## 需要用户 sign-off 的决策点（动手前确认）

- **D-A（Batch 0 推荐修法，改 API 契约）：** `GET /issues/{slug}` 不再返回 `letter_id`。这一刀同时修掉三个问题：① P0 token 回取链（slug→letter_id→result→token）；② D-2 transcript 泄漏（接收者再也拿不到 letter_id，`/letters/{id}/*` 回归 capability-URL 语义——letter_id 本身就是只有 owner 浏览器知道的 UUID）；③ HistorySync 把别人的报告写进接收者「最近信件」的身份污染。前端 owner 侧功能（回看/PublishToggle/HistorySync）全部改为从 localStorage 按 slug 反查 letterId——owner 本来就有本地条目。代价：owner 换设备后打开自己的链接没有「回看」（与「无账号」哲学一致）。**替代方案**（若不接受改契约）：仅在 existing 分支停发 token——但 D-2 与身份污染不解，且 owner 重试丢响应后永久失去 publish 权，不推荐。
  **D-A 不改变的两条访问语义（验收口径，写进测试）：**
  1. **看 = slug 即凭证，公开与否无关**：`GET /issues/{slug}`（元数据，只是没了 letter_id）与 `GET /issues/{slug}/render` 对任何持 slug 者照常 200。`is_public` 只控制画廊/sitemap/robots 收录，**不是访问门**（2026-05-17 既有决策不动）。
  2. **改公开状态 = 服务端 token 鉴权，不是 UI 隐藏**：`PATCH /publish` 的 `compare_digest` 是唯一的门；前端「看不到开关」只是体验层。
  **跨浏览器难题（owner 在微信内置浏览器打开自己的链接）**：微信 webview（手机/桌面端都一样）的 localStorage 与原浏览器隔离，owner 在那里没有 token → 被当成接收者，公开开关不可用。解法 = Task 0.3「认领链接」：owner 主动复制 `#claim=<token>` 的 fragment 链接发给**自己**（文件传输助手），微信里打开即把 owner 权带进该 webview。fragment 不上服务器/日志/缓存；认领链接与分享链接严格分离（分享主按钮永远复制干净 URL）。不引入账号/Cookie（违背哲学且微信 webview 同样隔离）、不做微信 JS-SDK OAuth（需公众号，L 级另案）。
- **D-1（沿用上一方案 Task 4.5，仍 gated）：** 生产库存量 `issue_is_public=1` 行转私有 + 作者自策展种子集（见 Batch 5.3 runbook）。
- **D-B（设计敏感）：** Batch 4.2 竖版分享图与 4.4 微信首图兜底涉及新视觉面/真机玄学，落地后必须过眼球 gate，不可 auto-merge。

---

## 文件结构

**Create:**
- `web/lib/share.ts` — `buildShareText`（两处复制路径收口）
- `web/app/letters/new/loading.tsx` — 转化关键一跳的等待帧
- `web/app/issues/[slug]/share-card/route.tsx` — 3:4 竖版分享图（Batch 4.2，optional）
- `server/tests/test_owner_capability.py` — Batch 0 的 TDD 测试
- `docs/ops/2026-06-seed-gallery-runbook.md` — D-1 + 种子集一次性运维步骤（Batch 5.3）

**Modify（按批次详见各 Task）：**
- `server/oriself_server/routes/issues.py` · `routes/letters.py` · `routes/analytics.py` · `models.py` · `database.py`
- `web/components/issue/issue-chrome.tsx` · `publish-toggle.tsx` · `issue-opened-tracker.tsx` · `arrival-ceremony.tsx`
- `web/components/history/history-sync.tsx`（删用法） · `web/components/home/recent-letters.tsx`
- `web/app/issues/[slug]/page.tsx` · `opengraph-image.tsx` · `web/app/issues/page.tsx` · `web/app/sitemap.ts`
- `web/app/letters/new/page.tsx` · `web/app/letters/[id]/letter-view.tsx` · `web/app/page.tsx`
- `web/lib/history.ts` · `api.ts` · `types.ts` · `analytics.ts`
- `skill-repo/skills/oriself/CONVERGE.md` · `CONVERGE-major.md`（submodule，单独 commit）
- `web/CLAUDE.md`（文档残留清理）

## 批次依赖与 issue-chrome.tsx 协调

```
Batch 0 (P0 安全)  ──┐
Batch 1 (ISR)        ├─ 可并行，先行落地
                     ┘
Batch 2 (自转发四件套) ── 依赖 Batch 0 的 isOwner helper
Batch 3 (转化链路)     ── 依赖 Batch 2 的 ?from= 约定
Batch 4 (分享物)       ── 独立；4.3 excerpt 先于 4.2 分享图（摘录数据源）
Batch 5 (画廊/激励)    ── 5.3 runbook 需 D-1 sign-off；5.1/5.2 可先行
Batch 6 (留存)         ── 依赖 Batch 2 的 chrome 分流结构
Batch 7 (清理)         ── 任何时候
```

`issue-chrome.tsx` 被 Batch 2.2（受众分流）、5.1（画廊链接）、6.1（换域链接）三处编辑：**必须按 2.2 → 5.1 → 6.1 顺序落**，2.2 重排后另两个只是往左组加/改一条弱文本链接。accent 预算检查点：任何时刻全组件只允许一个 `border-accent` primary。

---

## Batch 0 — P0 修复：owner_token 回取绕过（含 D-2 一并了结）

> 现状链路：`GET /issues/{slug}` 公开返回 `letter_id`（`issues.py:125 letter_id=result.session_id`）→ 任何人 `POST /letters/{letter_id}/result` 命中 existing 分支（`letters.py:780-789`）**无鉴权拿到 `owner_token`** → 任意翻转他人 publish。修法（D-A）：把 letter_id 从公开元数据里拿掉，letter_id 自身成为 owner capability。

### Task 0.1: 后端 — IssueResponse 移除 letter_id（TDD）

**Files:** `server/oriself_server/routes/issues.py`（`IssueResponse` `:47-55`，`get_issue` `:119-128`，`publish_issue` 返回 `:190-199`）；Create `server/tests/test_owner_capability.py`

- [ ] **Step 1: 写失败测试**

```python
# server/tests/test_owner_capability.py
from fastapi.testclient import TestClient
from oriself_server.database import reset_for_tests
from oriself_server.main import app

# 复用 test_issues_public.py 的 _seed_completed_issue（import 或拷贝最小版）
from tests.test_issues_public import _seed_completed_issue


def test_issue_meta_does_not_leak_letter_id():
    """P0 · slug 持有者不得经元数据拿到 letter_id（owner capability 链）。"""
    reset_for_tests()
    client = TestClient(app)
    _seed_completed_issue(slug="intj-capa0001", public=False, token="tok-a")
    meta = client.get("/issues/intj-capa0001").json()
    assert "letter_id" not in meta


def test_result_token_unreachable_from_slug_alone():
    """端到端口径：仅凭 slug，无法走 slug→letter_id→result→owner_token 链。"""
    reset_for_tests()
    client = TestClient(app)
    sid = _seed_completed_issue(slug="enfp-capa0002", public=False, token="tok-b")
    meta = client.get("/issues/enfp-capa0002").json()
    # 元数据里没有任何字段等于 session_id
    assert sid not in meta.values()
```

- [ ] **Step 2: 跑，期望 FAIL**（当前 `letter_id` 在响应里）

Run: `cd server && .venv/bin/python -m pytest tests/test_owner_capability.py -v`

- [ ] **Step 3: 实现** — `IssueResponse` 删除 `letter_id` 字段及两处构造（`get_issue` / `publish_issue`）；同步删 `:53` 的「owner 操作入口」注释，换成：`# letter_id 不出现在公开元数据：它是 owner capability（仅 owner 浏览器持有），见 Batch 0 / D-A。`

- [ ] **Step 4: 修受影响的既有测试与文档** — `tests/test_issues_public.py` 若有断言 `letter_id` 的行随之更新；`issues.py:13` 与 `:171-172` 的「MVP 不鉴权；生产阶段应换成 owner token / JWT」陈旧 docstring 一并改为现状描述（compare_digest 鉴权 + letter_id capability）。

- [ ] **Step 5: 全量回归**

Run: `cd server && .venv/bin/python -m pytest -q`
Expected: 全绿（含既有 265 项）。

> **保留项说明：** `POST /letters/{id}/result` 的 existing 分支**继续**返回 owner_token（`letters.py:788`）——Step 3 之后该分支只有知道 letter_id 的人（owner）能命中，且 owner 重试丢响应后仍可凭 letter_id 找回 publish 权。这是 D-A 优于「existing 分支停发 token」的核心理由。

### Task 0.2: 前端 — owner 态从 localStorage 按 slug 反查

**Files:** `web/lib/history.ts`、`web/lib/types.ts`（`IssueMeta` `:74-83`）、`web/app/issues/[slug]/page.tsx`、`web/components/issue/issue-chrome.tsx`、`publish-toggle.tsx`、`issue-opened-tracker.tsx`；**删用法** `web/components/history/history-sync.tsx`

- [ ] **Step 0: 凭证不再可丢——容量与淘汰保护（🔴 blocker 前置，复核发现）** — D-A 之后 localStorage 是 ownerToken+letterId 的**唯一事实源**（旧的 slug→letter_id→result 找回链正是被堵的洞），而 `history.ts:9 MAX_ENTRIES=10` 会在第 11 封信时静默挤掉最老条目 = 永久销毁该报告的 publish 权与回看（连认领链接都无法再生成）。两处改动：① `MAX_ENTRIES` 10 → 50；② `safeWrite` 裁剪改为「先按 `updatedAt` 降序，再裁剪，且**带 `ownerToken` 的条目不参与淘汰**（只淘汰无 token 条目；全带 token 时才按最旧淘汰并在控制台 warn）」。本步从原 Batch 6.2 提前（那边只剩 exportLetters）。

- [ ] **Step 1: history.ts 加反查 helper**（`getAllLetters` `:59-61` 旁）

```ts
// web/lib/history.ts — 追加
/** 按 issueSlug 反查本地条目 · owner 判定的唯一事实源（D-A：letter_id 不再走公开 API）。 */
export function findByIssueSlug(slug: string): LocalLetterEntry | null {
  return getAllLetters().find((e) => e.issueSlug === slug) ?? null;
}
```

- [ ] **Step 2: types.ts** — `IssueMeta` 删 `letter_id?` 字段（`:80`），与后端契约对齐。

- [ ] **Step 3: issue 页接线**（`web/app/issues/[slug]/page.tsx`）：
  - `IssueChrome` 不再传 `letterId`（`:49-52` 改为 `<IssueChrome slug={meta.slug} domain={meta.domain} title={meta.title} />`——`domain`/`title` 是 Batch 2 要用的，这里一次传齐）。
  - `IssueOpenedTracker` 去掉 `letterId` prop（`:55`）。
  - **整块删除 HistorySync 用法**（`:57-68`）及其 import：owner 的历史条目在 converge upsert（`letter-view.tsx:196-206`）已写入；接收者不应被写成「写过的信」。`history-sync.tsx` 组件文件暂留（letter 页未用它，确认 `rg "HistorySync" web` 仅剩组件自身后可顺手删文件）。

- [ ] **Step 4: issue-chrome.tsx 改 owner 态来源** — Props 删 `letterId`，加 `domain?: string; title: string`；组件内：

```tsx
const entry = findByIssueSlug(slug);              // null = 本浏览器没有这封信
const letterId = entry?.letterId;                 // 回看/埋点用
// owner 判定与 publish 凭证分离（复核修正）：本地有条目即 owner——
// legacy 条目（§5 上线前写入，无 ownerToken）的主人也必须按 owner 视角渲染，
// 否则存量用户会在自己的报告上看到「写一封自己的」接收者 CTA。
const isOwner = !!entry || getClaim(slug) !== null;   // Batch 2.2 分流依据
// publish 开关单独由 getOwnerToken(slug) 决定（legacy 无 token → 没有开关，本来也没凭证）
```
「← 回看」（`:71-79`）改为仅 `letterId` 存在时渲染（语义不变，来源换了）。注意：`findByIssueSlug` 读 localStorage，组件已是 client（`"use client"`），但要放在 `useEffect`/`useState` 里取值避免 SSR/hydration 不一致（参考 `publish-toggle.tsx:27-37` 的模式）。

- [ ] **Step 5: publish-toggle.tsx 同源改造** — Props 改 `{ slug }`，`:27-37` 的 `getAllLetters().find(e => e.letterId === letterId)` 改为 `findByIssueSlug(slug)`，其余逻辑不动。

- [ ] **Step 6: issue-opened-tracker.tsx** — Props 改 `{ slug }`；`useEffect` 内自行 `findByIssueSlug(slug)` 取 `letterId`（埋点继续带，owner 才有），`is_owner` 用与 issue-chrome **同一判定**（`!!findByIssueSlug(slug) || getClaim(slug) !== null`，否则微信认领后的 owner 会被计成接收者，污染转化率分母）；顺手修组件注释 `:14-17`——「HistorySync 在 letter 页也用」是陈旧错误陈述（letter 页从未用过），且 HistorySync 本批已删。

- [ ] **Step 7: typecheck + 手动 happy path**

Run: `cd web && pnpm typecheck && pnpm build`
手动（mock provider 起后端 + web）：走完一封信 → issue 页本人视角有「回看 / 公开到画廊」；隐身窗口打开同一 slug → 两者都不出现、首页「最近信件」不被写入。**眼球 gate，不可省。**

### Task 0.3: 认领链接 — owner 权跨浏览器移交（微信场景解法）

**Files:** `web/lib/history.ts`（claims 存储 + fragment 消费）、`web/lib/api.ts`（ApiError）、`web/components/issue/publish-toggle.tsx`（token 来源 + 复制认领链接入口 + 403 自清）、`web/components/issue/issue-chrome.tsx`（isOwner 消费）

> 场景：owner 在 Chrome 完成测试，之后在手机/电脑微信内置浏览器打开自己的链接——那个 webview 没有 ownerToken，会被当成接收者。认领链接把 token 装在 URL fragment 里由 owner **主动发给自己**（如文件传输助手）；fragment 不会发往服务器（不进日志/不进 ISR 缓存）。**安全模型与 slug 同源**：又一条 capability——持有认领链接者可改公开状态（仅此而已：看本来就开放，对话原文因 letterId 不进链接而不可达）。

- [ ] **Step 1: claims 存储（history.ts 追加，与信件历史分离——不伪造「写过的信」条目）**

```ts
// web/lib/history.ts — 追加
const CLAIMS_KEY = "oriself:claims:v1";   // { [slug]: ownerToken } · 认领的 publish 凭证

export function getClaim(slug: string): string | null {
  if (!isBrowser()) return null;
  try {
    const map = JSON.parse(window.localStorage.getItem(CLAIMS_KEY) ?? "{}");
    return typeof map[slug] === "string" ? map[slug] : null;
  } catch { return null; }
}

export function setClaim(slug: string, token: string): void {
  if (!isBrowser()) return;
  try {
    const map = JSON.parse(window.localStorage.getItem(CLAIMS_KEY) ?? "{}");
    map[slug] = token;
    window.localStorage.setItem(CLAIMS_KEY, JSON.stringify(map));
  } catch { /* quota / private mode — silent */ }
}

export function clearClaim(slug: string): void {
  if (!isBrowser()) return;
  try {
    const map = JSON.parse(window.localStorage.getItem(CLAIMS_KEY) ?? "{}");
    delete map[slug];
    window.localStorage.setItem(CLAIMS_KEY, JSON.stringify(map));
  } catch { /* silent */ }
}

/**
 * 幂等消费 URL fragment 里的认领凭证（#claim=<32hex>）：解析→落 store→抹 fragment。
 * 正则不锚定结尾：微信页内转发可能往 URL 尾部拼 from=singlemessage 等参数（复核发现）。
 * 放在读取路径上自助调用 → 不依赖任何组件挂载顺序（复核修正：原 ClaimHandler 的
 * 「必须是第一个兄弟组件」是靠不住的隐式 effect 时序耦合）。
 */
export function consumeClaimFromHash(slug: string): void {
  if (!isBrowser()) return;
  const m = window.location.hash.match(/#claim=([0-9a-f]{32})/);
  if (!m) return;
  setClaim(slug, m[1]);
  window.history.replaceState(
    null, "", window.location.pathname + window.location.search,
  );
}

/** owner 凭证统一入口：先幂等消费 fragment，再查「本浏览器写出（ownerToken）或认领（claim）」。 */
export function getOwnerToken(slug: string): string | null {
  consumeClaimFromHash(slug);
  return findByIssueSlug(slug)?.ownerToken ?? getClaim(slug);
}
```

- [ ] **Step 2: 不需要专用组件** — claim 的消费内联在 `getOwnerToken` 读取路径上（见 Step 1），`publish-toggle` 与 `issue-chrome` 各自在自己的 effect 里调用即自给自足，无挂载顺序约束。**不创建** `claim-handler.tsx`。

- [ ] **Step 3: 消费端统一** — `publish-toggle.tsx`（Task 0.2 Step 5 的 `findByIssueSlug(...)?.ownerToken` 改为 `getOwnerToken(slug)`）；`issue-chrome.tsx` 的 `isOwner` 维持 Task 0.2 Step 4 的定义（`!!findByIssueSlug(slug) || getClaim(slug) !== null`，其 effect 内先调 `consumeClaimFromHash(slug)`）。认领后的微信 webview 按 owner 视角渲染；「回看」仍只看 `findByIssueSlug(slug)?.letterId`——claim 不带 letterId，自然不渲染。

- [ ] **Step 4: 复制认领链接入口（owner-only，藏在公开开关旁）** — `publish-toggle.tsx` 渲染分支内、开关之后加一个弱文本按钮「在微信/其他设备管理 ⎘」：点击复制 `${location.origin}/issues/${slug}#claim=${token}`，`title` 写明「**仅发给自己**（如文件传输助手）。持有此链接的人可以更改这封信的公开状态」；复用 1.6s「已抄下 ✓」反馈。**不**走 `buildShareText`（与分享文案严格区隔，降低误发概率）。

- [ ] **Step 5: ApiError + 无效 claim 自清（复核修正：现 jsonFetch 的 Error.message 是脱敏友好文案，403/401 同句，无法判别）** — 两小步：
  ① `web/lib/api.ts` 新增并在 `jsonFetch` 的 `!res.ok` 分支使用：

```ts
export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
// jsonFetch 内：throw new ApiError(friendlyError(`${res.status} ${text}`), res.status);
```
  （message 脱敏逻辑不变，对既有调用方透明；Task 1.1 的 404 区分也依赖它。）
  ② `publish-toggle.tsx` 的 `toggle()` catch（现为空体 `:47-48`）改：`if (err instanceof ApiError && err.status === 403) { clearClaim(slug); setToken(null); }`——覆盖「token 被换/库重置后认领链接失效」的腐烂路径。

- [ ] **Step 6: 验证（眼球 gate，REQUIRED）** — ① Chrome 走完一封信 → 复制认领链接 → 隐身窗口直接贴开：公开开关出现、可翻转（模拟微信 webview 的隔离 localStorage）；② 同一隐身窗口刷新后 fragment 已不在地址栏、开关仍在；③ 把**分享链接**（干净 URL）开第三个隐身窗口：仍是接收者视角；④ 认领链接尾部手动拼 `?from=singlemessage` 类参数仍能认领（正则不锚定）；⑤ 真机微信：文件传输助手发认领链接 → 打开 → 开关可用（部署后补）。

> **显式接受的两条残余风险（写给决策者）：** ① 认领链接经微信聊天 = token 明文过腾讯服务器的聊天记录存储——与「信匣导出 JSON 含 token」同级，接受；② `owner_token` 无轮换端点，认领链接误发后**不可撤销**（对方最多能改公开状态）——接受，若未来要 rotate 另立 L 级提案。
## Batch 1 — ISR 实效修复（审计实跑发现，3 个小编辑）

> build 路由表实测：`/issues/[slug]` 与 `/issues` 都是 ƒ Dynamic，prerender-manifest 的 dynamicRoutes 为空——`revalidate=3600` 没有产生路由级 ISR。

### Task 1.1: issue 页补 generateStaticParams

**Files:** `web/app/issues/[slug]/page.tsx`

- [ ] **Step 1:** 在 `export const revalidate = 3600;`（`:25`）后加：

```ts
// 无预生成清单（slug 是凭证不可枚举），返回空数组即可让动态段进入 ISR 缓存池。
export function generateStaticParams() {
  return [];
}
```

- [ ] **Step 2: 404 不许缓存真实 slug（复核发现）** — 进入 ISR 后，`page.tsx:34-39` 的 catch-all `notFound()` 会把「后端瞬断/超时」也以 404 形态缓存最长 1h——刚分享出去的链接打不开是体验事故。依赖 Task 0.3 Step 5 的 `ApiError`：page 与 `generateMetadata` 的 catch 改为**仅 `err instanceof ApiError && err.status === 404` 时 `notFound()`，其余 rethrow**（渲染抛错不进 ISR 缓存，下个请求重试）。

### Task 1.2: 画廊页让 revalidate 生效

**Files:** `web/lib/api.ts`（`listPublicIssues` `:277-290`）

- [ ] **Step 1:** `listPublicIssues` 的 fetch 选项 `cache: "no-store"` 改为 `next: { revalidate: 3600 }`——当前 no-store 把 `/issues` 整页强制动态化，`page.tsx:11` 的 `revalidate=3600` 被覆盖失效。函数 docstring 同步改一句（仍服务端专用、后端不可达返 []）。

### Task 1.3: sitemap 防构建期固化

**Files:** `web/app/sitemap.ts`

- [ ] **Step 1:** 文件顶部加 `export const revalidate = 3600;`（新公开的 issue 最迟 1h 进 sitemap，不必等下次部署）。

- [ ] **Step 2: 三项统一验证**

Run: `cd web && pnpm build`
Expected: 路由表中 `/issues/[slug]`、`/issues`、`/sitemap.xml` 带 revalidate/ISR 标记（Next 15 对动态段显示为 `ƒ` + prerender-manifest `dynamicRoutes` 非空）；`/letters/[id]` 仍纯 dynamic。部署后补 `curl -sI` 缓存头核对（沿用上一方案 Task 3.4 Step 3 的 gate）。

> 已知接受的权衡：publish 翻转后 robots meta/画廊/sitemap 最长滞后 1h（上一方案已认）。不要为此把 revalidate 调小。

---

## Batch 2 — 自转发四件套（本方案核心）

### Task 2.1: buildShareText — 两处复制路径收口

**Files:** Create `web/lib/share.ts`；Modify `web/components/issue/issue-chrome.tsx`（`handleCopyLink` `:33-47`）、`web/components/issue/arrival-ceremony.tsx`（`handleCopy` `:122-130`，并加 `title` prop）、`web/app/issues/[slug]/page.tsx`（给两组件传 `title`）

> 微信对话内贴链接**不读 OG**——粘贴出的纯文本就是分享卡本身。当前两处复制的都是裸 URL（64bit 乱码尾巴），钩子强度为零。

- [ ] **Step 1: Create helper**

```ts
// web/lib/share.ts
/**
 * 分享文本 · 微信对话粘贴出来的样子就是「分享卡」。
 * 克制：两行，信件口吻，无 emoji、无动员文案。
 */
export function buildShareText(title: string, url: string): string {
  return `『${title}』\n一封写给我的信 · OriSelf\n${url}`;
}
```

- [ ] **Step 2: issue-chrome 接入** — `handleCopyLink` 内 `writeText(url)` 改为 `writeText(buildShareText(title, url))`（`title` 走 Task 0.2 Step 3 新增的 prop）。按钮文案/「已抄下」反馈/`link_copied` 埋点都不动。

- [ ] **Step 3: arrival-ceremony 接入** — 组件 Props 加 `title: string`（page.tsx `:71-73` 传 `meta.title`）；`handleCopy` 同样改 `buildShareText(title, fullUrl)`。打字机展示的 `displayAddr` **保持纯地址**（仪式感的对象是地址本身），只有复制行为带上钩子文案。

- [ ] **Step 4: typecheck + 手动验证** — 复制后粘贴到记事本确认两行文案 + URL；微信对话粘贴目检一次（真机 gate）。

### Task 2.2: IssueChrome 受众分流 — 接收者把唯一 accent 让给「写一封自己的 →」

**Files:** `web/components/issue/issue-chrome.tsx`（在 Task 0.2 Step 4 的 `isOwner` 基础上）

> 三个增长视角独立撞到同一条：B8 的层级隐含「访客=作者」假设。owner 的高价值动作是分享（复制地址=accent，现状正确）；**接收者**本来就持有链接，「复制地址」对 TA 无意义，TA 的唯一转化动作是「也写一封」。accent 预算仍是一个，按受众换持有人。

- [ ] **Step 1: owner 视角（isOwner=true）= 现状不动** — 复制地址 accent primary、反馈/导航弱链接、PublishToggle、回看。

- [ ] **Step 2: 接收者视角（isOwner=false）重排：**
  - 右组 accent primary 换成 `<Link>`「写一封自己的 →」，样式复刻现复制按钮的 accent 边框 pill（`border border-accent/70 rounded-[2px] px-[10px] py-[5px] hover:border-accent hover:bg-accent/5`，内文 `fraunces-body italic text-[11px] text-accent`），`href={`/letters/new?domain=${domain ?? "mbti"}&from=${slug}`}`。
  - 「复制地址」降为弱文本按钮（样式对齐反馈按钮 `:125-140`：`text-ink-muted hover:text-accent`，保留 ⎘ 与「已抄下」反馈、`link_copied` 埋点——接收者帮忙二次转发同样有价值）。
  - 左组「再写一封 →」**移除**（接收者文案不成立；owner 视角的这条由 Batch 6.1 接管改造）。
  - 「← 回看」「公开到画廊」天然不出现（Task 0.2 已按本地条目判定）。
  - 点击「写一封自己的」时 `trackEvent("new_letter_from_issue", { slug, domain })`（事件白名单见 Task 2.5）。

- [ ] **Step 3: 防 hydration 闪变（复核修正：不能默认 owner 版）** — `isOwner` 初值 `null`（未判定）。判定完成前右组渲染**中性占位**：复制地址按弱文本样式渲染、不上 accent、预留 pill 宽度——两个受众都只经历「弱→强」，而不是把「错的 primary→对的 primary」闪变转嫁给人数更多、设备更慢（微信 webview）的接收者侧。判定是同步 localStorage 读取，慢设备上也只有 hydration 前的一段。

- [ ] **Step 4: 组件 doc comment（`:15-26`）更新**：写明「受众分流：owner=复制地址 primary / 接收者=写一封自己的 primary；accent 预算恒为 1」。

- [ ] **Step 5: 眼球 gate（REQUIRED）** — 本人视角与隐身窗口各开同一 slug：两个视角各自只有一个 accent 元素；接收者点 CTA 落到对应 domain 的新信。

### Task 2.3: CONVERGE 落款加站点地址（skill-repo，单独 commit）

**Files:** `skill-repo/skills/oriself/CONVERGE.md`（「页面必含的内容」第 6 条·落款），`skill-repo/skills/oriself/CONVERGE-major.md`（**新增**落款条目——复核实测该文件目前没有任何落款/署名规范，插入点建议放『输出契约』列表或写作节末尾，句式对齐 CONVERGE.md 第 6 条）

> 截图是主分发载体，截图里唯一品牌露出是 LLM 落款，当前规范只有品牌名没有地址（佐证：作者手写推广信 `oriself-major-letter.html` 两处手动补 URL）。iframe sandbox 拦可点击链接，纯文本域名恰好是「信封背面的回邮地址」。

- [ ] **Step 1:** 落款规范句改为：署名统一写 `Oriself · 原自我 · next.oriself.com · <today>`（顺序、样式可变，但**两个名字与域名都要出现**；域名保持纯文本，不写 `<a>`）。CONVERGE-major.md 同步。
- [ ] **Step 2:** 用真 provider 生成 1-2 封信目检落款带域名且不突兀（软约束 gate）。
- [ ] **Step 3:** skill-repo 内单独 commit（注意：当前 submodule 工作树还有色温护栏 + session_id_short 移除的未提交改动，先把那批一起提交干净再做本条，避免混包）。

### Task 2.4: 服务端兜底归因页脚（结构性保证，幂等注入）

**Files:** `server/oriself_server/routes/issues.py`（`render_issue` `:131-161`）；测试 `server/tests/test_owner_capability.py` 追加（或新建 `test_render_footer.py`）

> 守卫分层哲学：归因是结构保证（进代码），品味交给 skill（2.3）。render 时注入而非落库——不污染原始产物、历史报告自动受益。

- [ ] **Step 1: 写失败测试** — seed 一条 `issue_html` 不含 `next.oriself.com` 的 issue，`GET /issues/{slug}/render` 响应须包含域名页脚且只出现一次；再 seed 一条正文已含 `next.oriself.com` 的，断言**不重复注入**。

- [ ] **Step 2: 实现** — `render_issue` 返回前。**注意（复核裁定）：页脚只放裸域名，不放 `/issues/{slug}` 完整 URL**——完整 URL 会把 capability 凭证印进可二次传播的截图像素里（截图=送出访问权），且与 2.3 的落款规范（裸域名）新旧不一致。裸域名已达成截图归因目标。

```python
ATTRIBUTION = (
    '<footer style="margin:48px 0 24px;text-align:center;'
    'font-family:ui-monospace,monospace;font-size:10px;letter-spacing:0.18em;'
    'opacity:0.45;">next.oriself.com</footer>'
)
html = result.issue_html
if "next.oriself.com" not in html:
    # 注入点 fallback 链：</body> → </html> → 裸 append
    # （guardrails 只强制 <html>...</html>，不强制 <body>——复核发现）
    for anchor in ("</body>", "</html>"):
        if anchor in html:
            html = html.replace(anchor, ATTRIBUTION + anchor, 1)
            break
    else:
        html = html + ATTRIBUTION
return HTMLResponse(content=html, headers=headers)
```
（颜色不写死——继承报告自身前景色，半透明即可贴任何 aesthetic。2.3 落地后新报告自带域名 → 跳过注入是**设计意图**：注入只服务存量报告。正文恰好出现域名导致跳过属已接受边缘，加行注释。）

- [ ] **Step 3:** Step 1 的测试补一条**无 `</body>` 的 seed**（现 `_seed_completed_issue` 的 HTML 恒带 `</body>`，覆盖不到 fallback 分支）；`cd server && .venv/bin/python -m pytest -q` 全绿；开 2-3 张历史报告目检页脚不破版（眼球 gate）。

### Task 2.5: 归因埋点 — 让病毒系数先可测

**Files:** `web/lib/analytics.ts`（union `:13-22`）、`server/oriself_server/routes/analytics.py`（`ALLOWED_EVENTS` `:49-59` + docstring 事件清单 `:12-21`）、`web/components/issue/issue-opened-tracker.tsx`、`web/app/letters/[id]/letter-view.tsx`（`letter_created` `:112-123`）、`web/components/home/landing-enter-link.tsx`（`landing_enter_clicked` 实际发出点在 `:23`，复核确认；domain prop 同作用域可直接用）

- [ ] **Step 1: 白名单加 2 个事件**（前端 union + 后端 set + docstring 账本，三处同步）：
  - `new_letter_from_issue` — props `{slug, domain}` · 接收者转化点击（2.2 发出）
  - `issue_published` — props `{slug, is_public}` · 公开率（Batch 5.2 发出）
  顺手修三处写死事件数的陈旧注释（复核盘点）：`analytics.py:6`「9 个白名单事件」、`analytics.py:108`「8 个事件」、`web/lib/analytics.ts:6`——都改成不带数字的表述。

- [ ] **Step 2: 既有事件补维度（props 自由 schema，后端零改动）：**
  - `issue_opened`：加 `is_owner: boolean`（与 issue-chrome **同一判定**，见 Task 0.2 Step 6）、`referrer: document.referrer.slice(0,200) || null`。
  - `letter_created`：加 `domain`（letter-view 已持有 `initialState.domain`，确认字段名后接入）与 `ref_slug`（来源 = Task 3.2 的 `?from=` URL 参数，取不到为 null）。
  - `landing_enter_clicked`：`landing-enter-link.tsx:23` 的 trackEvent 加 `{ domain }`。

- [ ] **Step 3:** `cd server && .venv/bin/python -m pytest -q`（白名单校验不破）+ 手动各触发一次确认 201 非 400。

> 验收口径（部署一周后看）：接收者转化率 = `new_letter_from_issue` ÷ `issue_opened(is_owner=false)`；分享率 = `link_copied` ÷ `issue_opened(is_owner=true)`；公开率 = `issue_published(is_public=true)` ÷ 报告数。这三个数决定 Batch 4/6 的后续投入。
> **噪声提示（复核发现）：** 失忆 owner（清了 localStorage 的本人）会被计成接收者并可能自引用点击——解读接收者转化率时，用 `letter_created{ref_slug}` 与该浏览器既有 slug 不同的口径复核分子。

---
## Batch 3 — 接收者转化链路（从点击到开口）

### Task 3.1: /letters/new 补 loading.tsx

**Files:** Create `web/app/letters/new/loading.tsx`

> 接收者被说服点下「写一封自己的」后，`createLetter` 的 RTT（0.5-2s+）期间页面零反馈——整条转化链最脆的一毫米。App Router 标准解法。

- [ ] **Step 1: Create**

```tsx
// web/app/letters/new/loading.tsx
/** createLetter RTT 期间的等待帧 · 与封缄仪式同一套节奏语言，不引入新设计元素。 */
export default function NewLetterLoading() {
  return (
    <main className="fixed inset-0 bg-paper flex items-center justify-center">
      <p className="fraunces-body italic text-[17px] text-ink-soft">
        正在备纸<span className="writing-cursor" aria-hidden />
      </p>
    </main>
  );
}
```
（`.writing-cursor` 是 globals.css 既有的打字 caret 动画，复用即可。）

- [ ] **Step 2:** `pnpm typecheck`；本地点「写一封自己的」目检：点击立刻见暖纸等待帧，无白屏死点。

- [ ] **Step 3: 孤儿信件防线（复核发现的高危副作用）** — `/letters/new` 是**带副作用的 GET**（每次渲染 `createLetter` 落一行 `test_sessions`）；它此前不被 Link prefetch 是因为「动态段且无 loading.js」，**本任务加 loading.tsx 恰好改变了 prefetch 条件**。给所有指向 `/letters/new` 的 `<Link>` 显式 `prefetch={false}`：2.2 接收者 CTA、6.1 换个命题（两处）、`letter-view.tsx` CompletedFooter `:660-665`、`web/components/home/landing-enter-link.tsx`。验证：`pnpm build && pnpm start` 后打开一个 issue 页停留 10s 不点击——后端无 `POST /letters` 日志、`test_sessions` 行数不变（写进收口验证清单）。

### Task 3.2: ?from= 来源透传（埋点用，本批不做 UI）

**Files:** `web/app/letters/new/page.tsx`（searchParams `:13-16`）、`web/app/letters/[id]/letter-view.tsx`（`letter_created` 埋点处）

- [ ] **Step 1: new/page.tsx 读并透传来源** — searchParams 类型加 `from?: string`；条件拼接（复核修正：原写法会产生空 `?from=`）：

```ts
const qs = from && /^[a-z0-9-]{1,64}$/i.test(from)
  ? `?from=${encodeURIComponent(from)}`   // slug 白名单，防注入/超长
  : "";
redirect(`/letters/${letter.letter_id}${qs}`);
```

- [ ] **Step 2: letter-view 消费** — `letter_created` 埋点 effect 里 `new URLSearchParams(window.location.search).get("from")` 读出，写入 props `ref_slug`，随后用 **`window.history.replaceState`** 抹掉 `?from=`（复核修正：不要用 `router.replace`——letter 页是 force-dynamic，router.replace 会触发整页 RSC 重取 state+transcript 两个后端请求，正发生在接收者落地最脆的首帧；issue 页的 ArrivalCeremony 用 router.replace 便宜是因为走 ISR 缓存，两页成本不同）。与既有 `?arrived=1` 无冲突（两个参数在不同页面生命周期）。

- [ ] **Step 3:** typecheck + 手动：从接收者 CTA 进入 → `letter_created` 落库带 `ref_slug`（dev 库查 `analytics_events`）。

> **明确不做（YAGNI）：**「由一封 INFJ 的信而来」首屏接力语。它依赖本批管道，但属于新增视觉面——等 2.5 的数据证明接收者进来后早段流失显著高于自然流量，再用 `ref_slug` 反查来源信做这条（届时单独小批次 + 设计评审）。

---

## Batch 4 — 分享物形态（截图文化主战场）

### Task 4.1: OG 卡补身份 token + 标题防溢出

**Files:** `web/app/issues/[slug]/opengraph-image.tsx`

- [ ] **Step 1: 身份 token 行** — kicker（`:38-47`）右侧或标题上方加 mono 风格类型标识：`meta.domain === "major" || meta.mbti_type === "MAJOR"` 时用 `meta.result_label ?? "专业方向"`（**绝不显示占位 "MAJOR"**，判定逻辑对齐 `issues/[slug]/page.tsx:90`），否则 `meta.mbti_type` 四字母 + `letterSpacing` 拉开。
- [ ] **Step 2: 标题 clamp** — `issue_title` 上限 200 字（`schemas.py` card_title max_length=200），当前固定 84px 必溢出 630 画布：超 40 字截断加 `…`；fontSize 按长度阶梯 `≤14字:84 / ≤24字:64 / 其余:52`。
- [ ] **Step 3: 字体子集同步** — `:19-21` 的子集字符串并入新增字符（result_label / 截断省略号）。
- [ ] **Step 4: 眼球 gate** — 起 mock 后端 + web，对一长一短两个真 slug `curl -o /tmp/og.png` 并打开目检：四字母/方向标签在卡上、长标题不溢出、中文非豆腐。

### Task 4.2: [D-B gated] 3:4 竖版分享图 + 「存一张图」弱入口

**Files:** Create `web/app/issues/[slug]/share-card/route.tsx`；Modify `web/components/issue/issue-chrome.tsx`（owner 视角右组加弱链接）、`web/lib/analytics.ts` + `server/.../analytics.py`（加 `share_card_opened` 事件）

> 朋友圈/小红书是截图文化且小红书禁外链——受控竖图（标题+类型+域名）比用户随机半屏截图强。管线（ImageResponse + og-font 子集）已就位。**设计敏感，落地后必须人审视觉。**

- [ ] **Step 1: route.tsx** — `ImageResponse` 1080×1440；**暖纸底**（`#F5F0E6` 底 + 油墨字 + oxblood 点缀——反转 OG 暗卡：朋友圈白底环境暖纸更出挑）；版面：顶部小字 `ORISELF · 一封写给你的信`、中部标题（沿用 4.1 的 clamp 阶梯）、类型 token、底部 `next.oriself.com`。excerpt 一句摘录留到 4.3 落地后再加（先出无摘录版）。
- [ ] **Step 2: 入口** — issue-chrome **owner 视角**右组、复制地址旁加弱文本链接「存一张图 ↓」（样式与反馈同级，不碰 accent），`onClick: window.open(\`/issues/${slug}/share-card\`)` + `trackEvent("share_card_opened", { slug })`（微信 webview 不支持 download attribute，开新页长按保存）。接收者视角不渲染（TA 的动作是写自己的）。
- [ ] **Step 3: 事件白名单** — `share_card_opened` 三处同步（union/set/docstring）。
- [ ] **Step 4: 眼球 gate（REQUIRED）** — 真机微信里打开→长按→保存→发朋友圈走一遍；图不糊、域名清晰。不过审就回退入口（route 留着无害）。

### Task 4.3: excerpt — 一份数据喂三个分享面

**Files:** `server/oriself_server/models.py`（`TestResult`）、`database.py`（in-place ALTER 范式 `:136-155` 旁复制一块）、`routes/letters.py`（converge 落库处 `:882-897`）、`routes/issues.py`（`IssueResponse`/`PublicIssueItem` 加字段 + 两处构造）、`web/lib/types.ts`（`IssueMeta`/`PublicIssueSummary`）、`web/app/issues/[slug]/page.tsx`（desc `:91-93`）、`web/app/issues/page.tsx`（条目摘要行）；测试 `server/tests/test_issues_public.py` 追加

- [ ] **Step 1: 列 + 迁移** — `issue_excerpt = Column(String(200), nullable=True)`；database.py 按 `issue_owner_token` 同款范式加 ALTER 块。
- [ ] **Step 2: 抽取（TDD）** — 新增 `server/oriself_server/utils/excerpt.py::extract_excerpt(html) -> str | None`：取首个文本长度 ≥20 字的 `<p>`（或 `<blockquote>`），strip 标签与空白，截 80 字加 `……`。先写测试（正常/无 p/全短 p/嵌套标签 四例），再实现。converge 落库时调用存列（`sanitize_report_html` 之后）。
- [ ] **Step 3: API 透出** — `IssueResponse.excerpt` / `PublicIssueItem.excerpt`（Optional）；**三处构造都要带**（复核纠正计数）：`get_issue` `:119-128`、`publish_issue` `:190-199`、`list_public_issues` `:96-106`——漏掉 publish_issue 会让公开操作后的响应 excerpt 恒为 null。
- [ ] **Step 4: 前端消费** — ① issue 页 `generateMetadata`：`is_public` 时 `description: meta.excerpt ?? desc`（私有页保持模板句，少暴露内容）；② 画廊条目标题下加一行 `text-ink-soft text-[13px] fraunces-body-soft italic` 摘要（truncate 单行）。
- [ ] **Step 5: 存量回填** — 一次性脚本（不入库，写进 5.3 runbook）：对已有 `issue_html` 的行批量 `extract_excerpt` 回填，事务内跑、先 count 确认。
- [ ] **Step 6:** 全量 pytest + typecheck/build；画廊目检摘要行不破目录册质感（眼球 gate）。

### Task 4.4: [D-B gated · 实验性] 微信转发首图兜底

**Files:** `web/app/issues/[slug]/page.tsx`

- [ ] **Step 1:** sr-only h1（`:76`）旁加 `<img src={\`/issues/${slug}/opengraph-image\`} alt="" width={1} height={1} aria-hidden style={{position:"absolute",opacity:0.01,pointerEvents:"none"}} />`（不要 `display:none`，微信首图启发式可能跳过）。
- [ ] **Step 2: 真机 gate（决定去留）** — 微信对话贴链接→打开→右上角转发：出图则留，不出图**就撤**（保持页面干净；届时 JS-SDK 方案另立 L 级提案）。

---
## Batch 5 — 画廊冷启动 + 公开激励

### Task 5.1: 画廊接进站点动线（两条弱内链）

**Files:** `web/app/page.tsx`（footer 链接组 `:61-87`）、`web/components/issue/issue-chrome.tsx`（左组）

- [ ] **Step 1: 首页 footer** — 在 `Skill ↗` 前加同级内链（注意它是站内 `Link` 不是 `<a>`，无 `↗`）：`公开命题`，指向 `/issues`，样式与相邻链接一致（`hover:text-accent`）+ 间隔点。
- [ ] **Step 2: issue-chrome 左组** — 「← 首页」之后加 `<Link href="/issues">画廊</Link>` 弱文本链接（继承 nav muted 样式，零视觉增量）。**owner/接收者两个视角都渲染**（纯导航不占 accent 预算；复核指出 2.2 分流后必须显式说明归属）。**按协调矩阵在 2.2 之后落。**
- [ ] **Step 3:** typecheck + 目检两处不破排版。

### Task 5.2: 公开回报闭环

**Files:** `web/components/issue/publish-toggle.tsx`

- [ ] **Step 1: 文案从警告改为收益（知情同意不打折）** — `:60-64` title：未公开态改 `「收进公开画廊，与其他公开的命题并列；会被搜索引擎收录」`；已公开态保持现状语义。
- [ ] **Step 2: 公开成功的去处** — 以 **`isPublic === true` 状态**驱动渲染弱链接 `已收录 · 看画廊 →`（`text-ink-muted hover:text-accent`，指向 `/issues`）——含 mount 时 `getIssue` 拉回的已公开态（复核修正：若只在 toggle 成功后渲染，owner 下次回访就看不到了，与「常驻」矛盾）；转私有即消失。
- [ ] **Step 3: 埋点** — 成功分支 `trackEvent("issue_published", { slug, is_public: m.is_public })`（事件已在 2.5 入白名单）。
- [ ] **Step 4:** typecheck + 手动：公开→看画廊链接出现且画廊内能看到自己（依赖本地造一条公开数据）。

### Task 5.3: [D-1 gated] 存量转私有 + 作者自策展种子集 runbook

**Files:** Create `docs/ops/2026-06-seed-gallery-runbook.md`（纯文档，不入应用代码）

- [ ] **Step 1: 写 runbook**，内容必须含：
  1. **前置**：生产已部署本套代码并重启过（`init_db` 迁移跑过，`issue_owner_token` 列存在）。
  2. **D-1 影响面确认（只读）**：`SELECT count(*) FROM test_results WHERE issue_is_public = 1;` —— 记录数字，向用户复述后再继续。
  3. **D-1 转私有（事务）**：`BEGIN; UPDATE test_results SET issue_is_public = 0; SELECT count(*) FROM test_results WHERE issue_is_public = 1;`（应为 0）`COMMIT;`
  4. **种子集**：挑作者本人 session 的 6-12 条优质报告（覆盖不同 MBTI 类型 + 至少 1 条 major），对每条：`UPDATE test_results SET issue_owner_token = '<secrets.token_hex(16) 生成>' WHERE issue_slug = '<slug>' AND session_id IN (<作者本人 session 清单>);` → 用该 token `PATCH /issues/{slug}/publish {"is_public": true, "owner_token": "..."}` 公开。**红线写进文档：只动作者本人 session 的行；他人报告必须逐个取得明确同意。**
  5. **excerpt 回填**（若 4.3 已落地）：脚本调用 `extract_excerpt` 批量回填，先 count、事务内、抽 3 条人工核对。
  6. **收尾**：`curl https://next.oriself.com/issues` 与 `/sitemap.xml` 确认种子可见；GSC / Bing / 百度资源平台提交 sitemap，并对 `/issues` + 种子 slug 手动 request indexing。
  7. 执行后在根 `CLAUDE.md` 变更记录登记一行。
- [ ] **Step 2:** runbook 交用户审阅 sign-off；**本批次不执行**。

---

## Batch 6 — 留存（轻量，符合一次性品类的诚实预期）

### Task 6.1: 「再写一封」→ 域交叉「换个命题」

**Files:** `web/components/issue/issue-chrome.tsx`（owner 视角左组）、`web/app/letters/[id]/letter-view.tsx`（`CompletedFooter` `:638-670`）

> 一次性品类里唯一立刻可兑现的「第二次」：刚收完 MBTI 信的人对「专业方向」是全新内容，反之亦然。major 全链路已通（`letters.py:841-848` / `CONVERGE-major.md` / `letters/new` 白名单），只缺完成时刻的入口。

- [ ] **Step 1: issue-chrome（owner 视角）** — 2.2 移除的「再写一封」位置上，按 `domain` 反转渲染：mbti 报告 → `换个命题 · 专业方向 →` 指 `/letters/new?domain=major`；major 报告 → `换个命题 · 性格画像 →` 指 `/letters/new?domain=mbti`。保持 `text-ink-soft` 次可见层级（沿用原「再写一封」的样式位）。接收者视角不渲染此条（TA 的 CTA 是 2.2 的 accent 按钮）。
- [ ] **Step 2: CompletedFooter** — 有 `issueSlug` 时在「看你的报告 →」左侧加同款弱 mono 链接（需把 `domain` 传进 `CompletedFooter`，letter-view 内已持有）。无 issueSlug 分支不动。
- [ ] **Step 3: 埋点** — 两处点击都发 `new_letter_from_issue`（props 加 `cross_domain: true`），不新增事件名。
- [ ] **Step 4:** typecheck + 双域各走一遍目检文案与跳转。

### Task 6.2: 信匣最小版 — 防失忆

**Files:** `web/lib/history.ts`、`web/components/home/recent-letters.tsx`

> 容量扩到 50 + 淘汰保护已**提前至 Task 0.2 Step 0**（blocker 级依赖）。本任务只剩导出；鉴于 localStorage 丢失 = publish 权永久丢失（无账号哲学下唯一预防就是导出），**建议与 Batch 2 同批上线**，不要排到最后。

- [ ] **Step 1: exportLetters helper**：

```ts
/** 信匣导出 · 人可读清单 + 末尾 JSON（含 ownerToken，用于换设备后手动找回 publish 权）。 */
export function exportLetters(): string {
  const entries = getAllLetters();
  const lines = entries.map((e) => {
    const d = new Date(e.createdAt).toISOString().slice(0, 10);
    const url = e.issueSlug ? `https://next.oriself.com/issues/${e.issueSlug}` : `(未完成 · ${e.letterId.slice(0, 8)})`;
    return `${d} · ${e.cardTitle ?? e.mbtiType ?? "一封信"} · ${url}`;
  });
  return `OriSelf 信匣 · ${entries.length} 封\n\n${lines.join("\n")}\n\n--- 凭证（换设备恢复用，请妥善保存） ---\n${JSON.stringify(entries, null, 2)}`;
}
```
- [ ] **Step 2: 入口** — recent-letters 列表底部加 mono 弱链接「导出信匣 ⎘」，点击 `navigator.clipboard.writeText(exportLetters())` + 1.6s「已抄下 ✓」反馈（复用 issue-chrome 的 copied 模式）。**不做导入/云端/二维码（YAGNI）**——换设备恢复 publish 权走认领链接（Task 0.3），导出 JSON 是兜底存档。
- [ ] **Step 3:** typecheck + 手动导出粘贴目检格式。

### Task 6.3: [optional · low] 重读时刻一行字

**Files:** `web/components/issue/issue-chrome.tsx`

- [ ] **Step 1:** owner 视角且 `Date.now() - new Date(meta.created_at).getTime() > 30 天` 时，nav 左组最前渲染一行非交互小字 `这封信写于 N 天前`（`created_at` 需经 page.tsx 传入 chrome）。等 2.5 的回访数据证明有人回来读旧信再做 P.S. 续写（路径已踩点：新 session + `prefs_json.ps_of`，本方案明确**不做**）。

---

## Batch 7 — 文档与杂项清理（任何时候可做）

- [ ] **7.1** `web/CLAUDE.md`：删 4 处 CustomCursor/custom-cursor.tsx 残留（`:20,94,105,156` 附近，按字面搜索）；`publishIssue` 签名更新为三参带 `owner_token`；「前端暂未接入」备注删除。
- [ ] **7.2** `server/oriself_server/routes/issues.py`：`list_public_issues` 加 `.limit(500)`（sitemap/画廊防全表；500 远超当前量级，到了再分页）。
- [ ] **7.3** `oriself-major-letter.html`：移入 `docs/marketing/`（或经用户确认后删除）——别让 `git add -A` 把它带进根目录。
- [ ] **7.4** 根 `CLAUDE.md` 变更记录补一行：D-A（letter_id 退出公开元数据）+ 本方案落地摘要。

---

## 验证清单（全方案收口）

- [ ] `cd server && .venv/bin/python -m pytest -q` 全绿（含新增 capability/footer/excerpt 测试）
- [ ] `cd web && pnpm typecheck && pnpm build` 全绿；路由表：`/issues/[slug]` `/issues` `sitemap` 带 ISR、`/letters/[id]` 仍 dynamic、`share-card` 成路由（若做 4.2）
- [ ] **P0 口径**：隐身窗口仅凭 slug —— 拿不到 letter_id、看不到回看/公开开关、`POST /letters/{猜不到的id}/result` 不可达；部署后生产库跑一次只读检查 `SELECT count(*) FROM test_results WHERE issue_html LIKE '%'||session_id||'%'` 应为 0（确认完整 session_id 从未进过报告 HTML；对话轮 prompt 的 8 字符 session_id_short 前缀残留不可利用，已接受）
- [ ] **访问语义不变**：私有 issue 凭 slug 在任意浏览器照常可看（元数据 + render 都 200）；`is_public` 只影响画廊/sitemap/robots
- [ ] **无孤儿信件**：build 后开 issue 页停留 10s 不点击——后端无 `POST /letters` 日志、`test_sessions` 行数不变（所有 `/letters/new` Link 已 `prefetch={false}`，Task 3.1 Step 3）
- [ ] **认领链接**：隐身窗口贴 `#claim=` 链接 → 公开开关可用、fragment 被抹掉；干净分享链接仍是接收者视角；真机微信（手机 + 桌面端各一次）文件传输助手转发后认领成功
- [ ] 双视角眼球 gate：owner=复制地址 primary + 画廊/换命题/导出信匣弱链；接收者=「写一封自己的」primary + 复制降弱；各自恒一个 accent
- [ ] 复制粘贴出两行钩子文案 + URL（issue-chrome 与封缄仪式两处一致）
- [ ] 历史黑底报告 `GET /render` 带归因页脚且不破版；正文已含域名的不重复注入
- [ ] 埋点逐个真实触发一次：`new_letter_from_issue` / `issue_published` / `issue_opened{is_owner,referrer}` / `letter_created{domain,ref_slug}` 落库 201
- [ ] 真机微信：贴链接出钩子文案；（4.2）分享图长按可存；（4.4）转发出图否则撤
- [ ] 部署顺序：skill-repo 先 commit+push（色温护栏批 → 落款域名批分开）→ 主仓 bump submodule → 按 `deploy-scripts-broken-prod-reality` 备忘走手动流程（npm + ops 名 + `git submodule update`）→ curl 生产 200 + 上述 gate 复跑
- [ ] D-1 runbook 单独 sign-off 后择机执行（不随代码部署自动发生）

## Self-review notes

- **杠杆排序的依据**：漏斗后段不漏 → 报告持有者≈忠诚用户 → 增长瓶颈在「报告的接收者没有被当成用户对待」。Batch 2 全部火力打这一点；Batch 4 服务截图文化；Batch 5 解公开侧鸡生蛋；Batch 6 刻意轻——一次性品类的留存投入要等 2.5 的数据背书。
- **每个新增都过了减法测试**：受众分流不加 accent 数量；归因页脚是结构保证非装饰；接力语/徽章/计数器/P.S. 续写全部砍掉或挂数据门。
- **D-A 是本方案唯一的契约级改动**，一刀换三个修复（P0/D-2/身份污染），前端代价是 owner 态全部转 localStorage 反查——与「无账号」哲学同向。
- **风险**：① owner 在新浏览器/微信 webview 打开自己的链接会落到「接收者」视角——0.3 认领链接 + 6.2 信匣导出双缓解，未认领时的体验损失仅限「管理动作回原浏览器做」；终局场景（原浏览器 localStorage 也没了）= publish 权永久丢失，**显式接受**（与无账号哲学一致），这也是 0.2 Step 0 淘汰保护 + 6.2 提前上线的理由；② 认领链接被误发 = 把「改公开状态」的能力交出去（仅此而已：看本来开放、对话原文不可达）——靠入口文案/与分享按钮严格分离/403 自清兜底，与 capability-URL 的整体安全模型同源；③ 2.4 注入对极端 LLM 排版可能突兀——半透明 mono 小字 + 眼球 gate 兜底；④ 4.4 微信首图是玄学——明确写了不出图就撤。

