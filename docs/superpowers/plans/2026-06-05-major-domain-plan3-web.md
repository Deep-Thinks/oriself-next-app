# Major 域 · Plan 3 · web（首页切换 + 直接能用）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 或 executing-plans。Steps 用 `- [ ]`。

**Goal:** 首页加「MBTI 人格 / 专业方向」切换；选「专业方向」后建信带 `domain=major`，对话与报告全程不显示伪四字母，最近信件能区分两域——让 major 域**直接能用**。

**Architecture:** Query 路线（最小、零全局 state，贴现有「page.tsx 是 async Server Component + 入口是薄 client wrapper」架构）：toggle → `/letters/new?domain=major` → Server Component 读 `searchParams.domain` → `createLetter(undefined, domain)`（`api.ts` 已支持 domain）。前端按 `domain` 兜住几处硬编码四字母（recent-letters 徽章、issue metadata、HistorySync）。

**Tech Stack:** Next.js 15 App Router（`searchParams` 是 Promise）· React 19 · Tailwind（自定义调色盘：`paper*`/`ink*`/`accent*`/`rule*`）· localStorage 历史。

**前置（Plan 1 需补的 server 字段）：** `ResultResponse` / `IssueResponse` / `StateResponse` 需带 `domain: str` 与 `result_label: Optional[str]`（Plan 1 已落 `TestResult.result_label`；本 Plan Task 1 补响应字段，属 server，但因纯为前端渲染服务，归在此处一并做）。

---

## File Structure
- Modify `server/.../routes/letters.py`（`ResultResponse`/`StateResponse` 加 `domain`+`result_label`）、`routes/issues.py`（`IssueResponse` 加 `domain`+`result_label`）
- Modify `web/lib/types.ts`（`LetterResult`/`IssueMeta`/`StateResponse` 加可选 `domain?`/`result_label?`）
- Modify `web/components/home/landing-enter-link.tsx`（加 `domain` prop）
- Modify `web/app/page.tsx`（Hero 加 toggle）
- Modify `web/app/letters/new/page.tsx`（读 searchParams → 传 domain）
- Modify `web/lib/history.ts`（`LocalLetterEntry.domain?`）+ `web/components/home/recent-letters.tsx`（徽章按域）
- Modify `web/app/letters/[id]/letter-view.tsx`（completed upsert 带 domain + result_label）
- Modify `web/app/issues/[slug]/page.tsx`（metadata + HistorySync 按域）

---

## Task 1: server 补响应字段（domain + result_label）

**Files:** `server/oriself_server/routes/letters.py:101-107,125-135`、`routes/issues.py:46-49`
**Test:** `server/tests/test_major_domain.py`

- [ ] **Step 1: 写失败测试** — 追加：断言 major 信封的 `/state` 返回 `domain=="major"`，`/result`（mock 跑满 6 轮后）返回 `result_label`。若 mock 跑满轮成本高，最小测改为：直接构造 `ResultResponse(domain="major", result_label="认知科学这一类", ...)` 能实例化（字段存在）。
```python
def test_result_response_has_domain_and_label():
    from oriself_server.routes.letters import ResultResponse
    r = ResultResponse(letter_id="x", mbti_type="MAJOR", card_title="t",
                        issue_slug="major-abc", domain="major", result_label="认知科学这一类")
    assert r.domain == "major" and r.result_label == "认知科学这一类"
```
- [ ] **Step 2: 跑测试确认失败** — `cd server && pytest tests/test_major_domain.py::test_result_response_has_domain_and_label -v` → FAIL（字段不存在）
- [ ] **Step 3: 加字段**
  - `ResultResponse`（`letters.py:125-135`）加 `domain: str = "mbti"` + `result_label: Optional[str] = None`；`compose_result` 返回时 major 分支填 `domain="major", result_label=fields["result_label"]`，mbti 分支 `domain="mbti", result_label=None`。
  - `StateResponse`（`letters.py:101-107`）加 `domain: str = "mbti"`；`get_letter_state` 从 `state.domain` 填。
  - `IssueResponse`（`routes/issues.py:46-49`）加 `domain: str = "mbti"` + `result_label: Optional[str] = None`；从 `TestResult`（已落 `result_label`；domain 经 `TestResult.session→TestSession.domain` 或 join）填。注意 `mbti_type` 字段保留（major 为占位 `"MAJOR"`）。
- [ ] **Step 4: 跑测试 + 回归** — `cd server && pytest tests/ -v` → 全绿
- [ ] **Step 5: Commit** — `git commit -m "feat(major): expose domain+result_label in Result/State/Issue responses"`

---

## Task 2: 前端类型 + createLetter 入口接 domain

**Files:** `web/lib/types.ts:7-21,54-69`、`web/app/letters/new/page.tsx:10-22`
**Test:** `web/` typecheck（`pnpm typecheck`）

- [ ] **Step 1: 改类型** `web/lib/types.ts`：
  - `LetterResult` 加 `domain?: string;` + `result_label?: string | null;`
  - `IssueMeta` 加 `domain?: string;` + `result_label?: string | null;`
  - 若有 `StateResponse` 类型，加 `domain?: string;`
- [ ] **Step 2: 改 `/letters/new` 读 searchParams**（Next 15 searchParams 是 Promise）：
```tsx
export const dynamic = 'force-dynamic';

export default async function NewLetterPage(
  { searchParams }: { searchParams: Promise<{ domain?: string }> }
) {
  const { domain } = await searchParams;
  const safeDomain = domain === "major" ? "major" : "mbti";  // 白名单兜底
  try {
    const letter = await createLetter(undefined, safeDomain);
    redirect(`/letters/${letter.letter_id}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('NEXT_REDIRECT')) throw err;
    throw err;
  }
}
```
- [ ] **Step 3: typecheck** — `cd web && pnpm typecheck` → 0 error
- [ ] **Step 4: Commit** — `git commit -m "feat(major): letters/new reads ?domain= and passes to createLetter"`

---

## Task 3: 首页 toggle

**Files:** `web/components/home/landing-enter-link.tsx:1-27`、`web/app/page.tsx:45-53`
**Test:** typecheck + 手测

- [ ] **Step 1: landing-enter-link 加 domain prop**
```tsx
type Props = { children: React.ReactNode; className?: string; domain?: "mbti" | "major" };

export function LandingEnterLink({ children, className, domain = "mbti" }: Props) {
  const href = domain === "major" ? "/letters/new?domain=major" : "/letters/new";
  return (
    <Link href={href} onClick={() => trackEvent("landing_enter_clicked", { domain })} className={className}>
      {children}
    </Link>
  );
}
```
> 若 `trackEvent` 不接第二参，去掉 `{ domain }` 或按其签名调整（先看 `web/lib/` 里 trackEvent 定义）。
- [ ] **Step 2: page.tsx Hero 加 toggle**——在「进入 →」上方加一个 mono 双词切换（client 小组件 `web/components/home/domain-toggle.tsx`，`useState` 选中域，渲染两个标签 + 一个随选中域变 href 的「进入 →」）。形态贴现有小字范式（`font-mono text-[10px] tracking-wide`），选中 `text-accent border-b border-accent`，未选 `text-ink-muted`，中间 `·` 分隔（`opacity-40`）。把原 `<LandingEnterLink>` 收进该组件、按选中域传 `domain`。
```tsx
// web/components/home/domain-toggle.tsx (新)
"use client";
import { useState } from "react";
import { LandingEnterLink } from "./landing-enter-link";

export function DomainToggle() {
  const [domain, setDomain] = useState<"mbti" | "major">("mbti");
  const tab = (d: "mbti" | "major", label: string) => (
    <button onClick={() => setDomain(d)}
      className={`font-mono text-[11px] tracking-wide transition-colors ${
        domain === d ? "text-accent border-b border-accent pb-0.5" : "text-ink-muted"}`}>
      {label}
    </button>
  );
  return (
    <div className="mt-20 flex flex-col items-center gap-6">
      <div className="flex items-center gap-3">
        {tab("mbti", "MBTI 人格")}
        <span className="text-ink-muted opacity-40">·</span>
        {tab("major", "专业方向")}
      </div>
      <LandingEnterLink domain={domain}
        className="inline-block fraunces-body-soft italic text-accent text-[18px] border-b border-accent pb-1 transition-colors duration-300 hover:text-accent-soft hover:border-accent-soft">
        进入 →
      </LandingEnterLink>
    </div>
  );
}
```
`page.tsx:45-50` 把原 `<LandingEnterLink>…进入 →…</LandingEnterLink>` 替换成 `<DomainToggle />`（import 之）。
- [ ] **Step 3: typecheck + build** — `cd web && pnpm typecheck && pnpm build` → 通过
- [ ] **Step 4: Commit** — `git commit -m "feat(major): homepage MBTI/专业方向 toggle"`

---

## Task 4: 最近信件区分两域

**Files:** `web/lib/history.ts:11-21,87-96`、`web/components/home/recent-letters.tsx:73-89`、`web/app/letters/[id]/letter-view.tsx:181-187`、`web/app/issues/[slug]/page.tsx:60-67`
**Test:** typecheck + 手测

- [ ] **Step 1: `LocalLetterEntry` 加 domain + resultLabel**（`history.ts:11-21`）：加 `domain?: string;` + `resultLabel?: string;`；新建分支（`:87-96`）补 `domain: patch.domain`。`upsertLetter` 合并逻辑无需改（已 filter undefined）。
- [ ] **Step 2: completed upsert 透传 domain + result_label**（`letter-view.tsx:181-187`）：`upsertLetter({ ..., domain: result.domain, resultLabel: result.result_label ?? undefined })`。`issues/[slug]/page.tsx:60-67` 的 HistorySync 同理传 `domain={meta.domain}`。
  > letter-view 拿 domain：`composeResult` 的返回（Task 1 已加 `domain`）即可，无需改 state 接口。
- [ ] **Step 3: 徽章按域**（`recent-letters.tsx:73-89`）：完成态——`entry.domain === "major"` 显示 `entry.resultLabel ?? entry.cardTitle`（serif 小字，非四字母 mono），否则保持现有 `entry.mbtiType` mono 四字母。
- [ ] **Step 4: typecheck + 手测** — `cd web && pnpm typecheck`；手动建一封 major 信，回首页看徽章是方向名不是四字母。
- [ ] **Step 5: Commit** — `git commit -m "feat(major): recent-letters distinguishes major (direction label, not 4-letter)"`

---

## Task 5: issue 页 major 文案兜底

**Files:** `web/app/issues/[slug]/page.tsx:88-97`
**Test:** typecheck

- [ ] **Step 1: metadata 按域**（`page.tsx:88-97`）：`description` 不再写死「关于 ${meta.mbti_type}」。改成：major（`meta.domain==="major"` 或 `meta.mbti_type==="MAJOR"`）用「一封关于你想学什么的信。」或基于 `meta.result_label`；mbti 保持原文案。OG description 同步。
- [ ] **Step 2: typecheck + build** — `cd web && pnpm typecheck && pnpm build` → 通过
- [ ] **Step 3: Commit** — `git commit -m "feat(major): issue metadata avoids fake 4-letter for major"`

---

## Task 6: 端到端验证（真能用）

**Files:** 无（验证 task）

- [ ] **Step 1: 起前后端**（mock 或 gemini-relay provider）：后端 `cd server && ORISELF_PROVIDER=mock uvicorn oriself_server.main:app --port 8000`；前端 `cd web && pnpm dev`。
- [ ] **Step 2: 走 major 用户旅程**（browse/Playwright 或手测）：首页 → 切「专业方向」→「进入 →」→ URL 是 `/letters/new?domain=major` → 落到 `/letters/[id]` → 聊几轮 → （满 6 轮）出报告 → 报告页 iframe 渲染、无伪四字母 → 回首页最近信件显示方向名。
- [ ] **Step 3: 对照 MBTI 旅程零回归**：首页默认/切回「MBTI 人格」→ 建信 domain=mbti → 现有 MBTI 流程一切照旧（四字母报告、徽章四字母）。
- [ ] **Step 4: 截图存证 + 汇报**（用 gstack/browse 截图首页 toggle、major 对话、major 报告、最近信件）。

---

## Self-Review
- **Spec coverage**：首页 toggle（T3）/ domain 透传建信（T2）/ 不显示伪四字母（T1 server 字段 + T4 徽章 + T5 metadata）/ 直接能用（T6 e2e）。
- **Placeholder scan**：无 TBD；`trackEvent` 二参、`StateResponse` 类型名等给了"先看定义"指引。
- **Type consistency**：`ResultResponse.domain/result_label`（T1）↔ `LetterResult.domain/result_label`（T2）↔ `LocalLetterEntry.domain/resultLabel`（T4）↔ 徽章读取（T4）一致。
- **依赖**：Plan 1（result_label 列）+ Plan 2（major 报告真能产出 direction_label）完成后，本 Plan 的 e2e 才完整。
