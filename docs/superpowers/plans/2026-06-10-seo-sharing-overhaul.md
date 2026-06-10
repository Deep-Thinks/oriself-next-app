# OriSelf SEO & Sharing Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OriSelf's public reports discoverable (robots/sitemap/metadata), give every shared link a Chinese-title OG preview image, and ship a privacy-correct "publish to public" opt-in loop with real owner auth.

**Architecture:** Three front-end-only batches (metadata conventions → dynamic OG image → ISR) plus a backend batch that adds a `GET /issues/public` enumeration endpoint and a per-report `owner_token` capability so `PATCH /issues/{slug}/publish` can be authenticated. Reports flip to **private-by-default**; users opt in via a publish toggle that only appears to the owner (whoever holds the `owner_token` in localStorage). Indexing, sitemap, and the gallery only ever surface `issue_is_public = 1` rows.

**Tech Stack:** Next.js 15.5 App Router (metadata API, `MetadataRoute`, `next/og` `ImageResponse`, ISR `revalidate`), React 19, FastAPI + SQLAlchemy 2 + SQLite, pytest + `fastapi.testclient`.

**This plan corrects the source audit (`/Token-Exchange/oriself-next-seo-plan.md`) where it diverges from the real code — see "Audit corrections" below.**

---

## Audit corrections (verified against code)

| Plan claim | Reality | Action |
|---|---|---|
| B6: `card_json={}` is a 96% generation bug, fix before sharing | By-design legacy since v2.5.2; `letters.py:882-883` writes literal `"{}"` unconditionally; `issue_html` is fully populated | **Strike B6.** No card_json work. og:description (B4) reads from `issue_html`, not `insight_json`. |
| `issue_is_public` is always false / robots split is a no-op | `letters.py:888` sets `issue_is_public=True` on **every** report | Robots split would index **everything** on ship. Flip default to private + privatize existing rows (gated decision D-1). |
| sitemap maps `i.updated_at` | `TestResult` has no `updated_at`; only `issue_generated_at` / `created_at` | Use `issue_generated_at` (fallback `created_at`). |
| `import { getIssue } from "@/lib/issues"` | Helper lives in `@/lib/api`; `@/lib/issues` does not exist | Import from `@/lib/api`. |
| C1: add `revalidate=3600` (one-liner) | Issue page has `force-dynamic` (mutually exclusive) + shared `jsonFetch` hardcodes `cache:"no-store"` + spread-order bug clobbers per-call overrides | 3 coordinated edits, issue page only. |
| §5 publish loop is a half-day item alongside batch 2 | No UI caller of `publishIssue`; endpoint unauthenticated; `letter_id` is public via `getIssue` | Full feature: owner_token column + auth + UI + default-private + existing-row migration. |
| OG image: fetch a font "if you want serif" (optional) | CJK font is **mandatory** (titles are Chinese); `next/og` default font is latin-only; satori rejects woff2; **prod is in China so `fonts.googleapis.com` is blocked** | Runtime subset via `fonts.googleapis.cn` (TTF) + vendored fallback + brand-card fallback. |

## Decisions required before Batch 4 (§5)

- **D-1 (mutating real data):** Existing `test_results` rows are all `issue_is_public=1`. After Batch 1+3 ship, they become indexable. Recommended: **one-time UPDATE to set existing rows private** (consent-safe; capability-URL implied "unlisted", not "searchable"). They stay private until an owner republishes (owners of pre-token rows cannot republish — acceptable). Run `SELECT count(*)` first to confirm blast radius. **Get explicit sign-off.**
- **D-2 (pre-existing privacy leak, flag-only):** `getIssue` returns `letter_id`, and `IssueChrome` renders a "← 回看" link to the full conversation transcript for anyone holding the slug. Making issues public amplifies this. Out of scope for SEO, but **flag to user**: decide whether public issues should hide the transcript link / whether `/letters/{id}/transcript` needs gating.

---

## File structure

**Create:**
- `web/app/robots.ts` — crawl rules + sitemap pointer
- `web/app/sitemap.ts` — homepage + public issues
- `web/app/issues/[slug]/opengraph-image.tsx` — dynamic 1200×630 OG card with Chinese title
- `web/app/issues/page.tsx` — public gallery (Server Component, crawlable)
- `web/lib/site.ts` — single `SITE_URL` constant
- `web/lib/og-font.ts` — runtime CJK font loader (CN mirror + fallback)
- `web/components/issue/publish-toggle.tsx` — owner-only publish control
- `server/tests/test_issues_public.py` — endpoint + auth tests

**Modify:**
- `web/app/layout.tsx` — metadataBase, full OG/Twitter, title template, `lang=zh-CN`
- `web/app/issues/[slug]/page.tsx` — robots split, canonical, title fix, ISR
- `web/lib/api.ts` — per-call cache override fix, `getIssue` cached variant, `listPublicIssues`, `publishIssue` owner_token arg
- `web/lib/types.ts` — `LetterResult.owner_token`, `PublicIssueSummary`
- `web/lib/history.ts` — `LocalLetterEntry.ownerToken`
- `web/app/letters/[id]/letter-view.tsx` — persist `ownerToken` on converge
- `server/oriself_server/models.py` — `issue_owner_token` column
- `server/oriself_server/database.py` — in-place migration for the column
- `server/oriself_server/routes/issues.py` — `GET /issues/public`, publish auth
- `server/oriself_server/routes/letters.py` — generate token, default private, return token

---

## Batch 1 — Front-end metadata conventions (no backend; safe to ship first)

### Task 1.1: SITE_URL constant

**Files:** Create `web/lib/site.ts`

- [ ] **Step 1: Create the constant**

```ts
// web/lib/site.ts
/** Canonical production origin · single source for metadataBase / sitemap / robots. */
export const SITE_URL = "https://next.oriself.com";
```

- [ ] **Step 2: typecheck**

Run: `cd web && pnpm typecheck`
Expected: PASS (no usage yet).

### Task 1.2: layout metadata — metadataBase, OG, Twitter, title template, lang

**Files:** Modify `web/app/layout.tsx` (metadata block `:39-49`, `<html lang>` `:58`)

- [ ] **Step 1: Replace the metadata export**

```ts
// web/app/layout.tsx — replace the existing `export const metadata` block
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "OriSelf · 对话式人格画像", template: "%s · OriSelf" },
  description: "用一场对话，写下只属于你的人格命题。中文 · 2026。",
  alternates: { canonical: "/" },
  // Favicon 走 app/icon.svg（Next 15 自动探测），不要在这里写死 icons。
  openGraph: {
    type: "website",
    siteName: "OriSelf",
    locale: "zh_CN",
    url: SITE_URL,
    title: "OriSelf · 对话式人格画像",
    description: "用一场对话，写下只属于你的人格命题。",
  },
  twitter: {
    card: "summary_large_image",
    title: "OriSelf · 对话式人格画像",
    description: "用一场对话，写下只属于你的人格命题。",
  },
};
```

- [ ] **Step 2: Change `<html lang>`**

In `web/app/layout.tsx:58` change `lang="zh"` → `lang="zh-CN"`. Leave `className` untouched.

- [ ] **Step 3: Keep the favicon comment block intact.** Do NOT add `icons:` (would override `app/icon.svg` auto-detection and 404 since `public/` doesn't exist).

- [ ] **Step 4: typecheck + build**

Run: `cd web && pnpm typecheck && pnpm build`
Expected: PASS. (Build needs backend reachable for `getServerVersion`/SSR? It tolerates null — homepage fetch returns null on failure.)

### Task 1.3: robots.ts

**Files:** Create `web/app/robots.ts`

- [ ] **Step 1: Create**

```ts
// web/app/robots.ts
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/letters/", "/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
```

- [ ] **Step 2: Verify locally**

Run: `cd web && pnpm build && pnpm start &` then `curl -s http://localhost:3000/robots.txt`
Expected: real robots body with `Disallow: /letters/`, `Disallow: /api/`, `Sitemap: https://next.oriself.com/sitemap.xml`. Kill the server after.

### Task 1.4: Issue page — robots split, canonical, title fix (depends on §5 for is_public to ever be true, but safe now: default-private means new issues stay noindex)

**Files:** Modify `web/app/issues/[slug]/page.tsx` (`generateMetadata` `:82-108`)

- [ ] **Step 1: Replace generateMetadata body** (preserve the `isMajor` desc logic the source snippet dropped)

```ts
// web/app/issues/[slug]/page.tsx — generateMetadata
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    const meta = await getIssue(slug);
    const isMajor = meta.domain === "major" || meta.mbti_type === "MAJOR";
    const desc = isMajor
      ? "一封关于你想学什么的信。"
      : `一封关于 ${meta.mbti_type} 的信。`;
    const isPublic = !!meta.is_public;
    return {
      // bare title → root template appends " · OriSelf" (no double suffix)
      title: meta.title,
      description: desc,
      alternates: { canonical: `/issues/${slug}` },
      // 私有命题：slug 仍是访问凭证，保持 noindex。公开后才放开收录。
      robots: isPublic
        ? { index: true, follow: true }
        : { index: false, follow: false },
      openGraph: {
        type: "article",
        url: `/issues/${slug}`,
        title: meta.title,
        description: desc,
      },
      twitter: { card: "summary_large_image", title: meta.title, description: desc },
    };
  } catch {
    return { title: { absolute: "OriSelf" } };
  }
}
```

- [ ] **Step 2: typecheck**

Run: `cd web && pnpm typecheck`
Expected: PASS (`meta.is_public` already exists on `IssueMeta`).

- [ ] **Step 3: Verify title suffix once.** After Batch 2/3 build, confirm a generated issue's `<title>` is `<title> · OriSelf` (single suffix), and the homepage `<title>` is `OriSelf · 对话式人格画像`.

---

## Batch 2 — Dynamic OG image (Chinese title via CN font mirror)

### Task 2.1: Runtime CJK font loader

**Files:** Create `web/lib/og-font.ts`

> satori (next/og) accepts ttf/otf/woff, **NOT woff2**. Google's css2 returns TTF when the request UA does not advertise woff2 support. Prod is in China, so use `fonts.googleapis.cn` (Google's official mainland mirror), not `.com`.

- [ ] **Step 1: Create the loader**

```ts
// web/lib/og-font.ts
/**
 * Load a Noto Serif SC TTF subset covering exactly the glyphs in `text`,
 * for next/og ImageResponse (which cannot use next/font and rejects woff2).
 * Uses Google's China mirror (prod runs in CN where fonts.googleapis.com is blocked).
 * Returns null on any failure so the OG route can fall back to a title-less brand card.
 */
export async function loadNotoSerifSCSubset(
  text: string,
): Promise<ArrayBuffer | null> {
  const chars = Array.from(new Set(text)).join("");
  if (!chars) return null;
  const cssUrl =
    `https://fonts.googleapis.cn/css2?family=Noto+Serif+SC:wght@500` +
    `&text=${encodeURIComponent(chars)}`;
  try {
    // No modern-browser UA → Google serves `format('truetype')` (TTF), which satori accepts.
    const css = await fetch(cssUrl, {
      headers: { "User-Agent": "Mozilla/4.0" },
      signal: AbortSignal.timeout(4000),
    }).then((r) => (r.ok ? r.text() : ""));
    const m = css.match(/src:\s*url\((https:\/\/[^)]+)\)\s*format\('(?:truetype|opentype)'\)/);
    if (!m) return null;
    const fontRes = await fetch(m[1], { signal: AbortSignal.timeout(4000) });
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: typecheck**

Run: `cd web && pnpm typecheck`
Expected: PASS.

### Task 2.2: opengraph-image route

**Files:** Create `web/app/issues/[slug]/opengraph-image.tsx`

- [ ] **Step 1: Create the route**

```tsx
// web/app/issues/[slug]/opengraph-image.tsx
import { ImageResponse } from "next/og";
import { getIssue } from "@/lib/api";
import { loadNotoSerifSCSubset } from "@/lib/og-font";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "OriSelf 命题";
// node runtime (default) so process.env.API_INTERNAL_URL resolves & outbound fetch works.

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = await getIssue(slug).catch(() => null);
  const title = meta?.title ?? "OriSelf";
  const font = await loadNotoSerifSCSubset(title + "ORISELF · 一封写给你的信next.oriself.com");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "100px",
          background: "linear-gradient(135deg,#1a1410,#2b2018)",
          color: "#f4ece0",
          fontFamily: font ? "Noto Serif SC" : "sans-serif",
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: 8, opacity: 0.6, marginBottom: 32 }}>
          ORISELF · 一封写给你的信
        </div>
        <div style={{ fontSize: 84, fontWeight: 600, lineHeight: 1.15, display: "flex" }}>
          {title}
        </div>
        <div style={{ fontSize: 28, opacity: 0.7, marginTop: 48 }}>next.oriself.com</div>
      </div>
    ),
    {
      ...size,
      ...(font
        ? { fonts: [{ name: "Noto Serif SC", data: font, style: "normal", weight: 500 }] }
        : {}),
    },
  );
}
```

- [ ] **Step 2: typecheck + build**

Run: `cd web && pnpm typecheck && pnpm build`
Expected: PASS. Build output lists `/issues/[slug]/opengraph-image` as a route.

- [ ] **Step 3: Visual verification (REQUIRED — do not claim done without it).** With backend + web running and a real issue slug, fetch the PNG and open it; the Chinese title must render as glyphs, not tofu:

Run: `curl -s http://localhost:3000/issues/<real-slug>/opengraph-image -o /tmp/og.png && file /tmp/og.png`
Expected: `PNG image data, 1200 x 630`. Open `/tmp/og.png` and confirm the Chinese title is visible. If tofu: the font fetch failed (check CN mirror reachability from the runtime) — fix before proceeding.

---

## Batch 4 — Backend §5: owner_token, default-private, publish auth, public enumeration

> Batch 4 must land before Batch 3's sitemap/gallery have correct (consent-gated) data. Ordered before Batch 3 here.

### Task 4.1: owner_token column + migration

**Files:** Modify `server/oriself_server/models.py` (`TestResult` after `:148`), `server/oriself_server/database.py` (new ALTER block after the `result_label` migration `:115-134`)

- [ ] **Step 1: Add the column to the model**

```python
# server/oriself_server/models.py — inside TestResult, after issue_is_public
    # §5 · owner capability token, generated at converge, returned ONLY from
    # POST /letters/{id}/result. Required to flip issue_is_public via PATCH publish.
    # Never exposed via GET /issues/{slug}. Legacy rows = NULL (cannot be published).
    issue_owner_token = Column(String(64), nullable=True)
```

- [ ] **Step 2: Add the in-place migration**

```python
# server/oriself_server/database.py — add after the result_label migration block
    # §5 · test_results.issue_owner_token (publish capability). Same in-place范式.
    try:
        url = str(engine.url)
        with engine.begin() as conn:
            if url.startswith("sqlite"):
                cols = conn.exec_driver_sql(
                    "PRAGMA table_info(test_results)"
                ).fetchall()
                existing = {row[1] for row in cols}
                if "issue_owner_token" not in existing:
                    conn.exec_driver_sql(
                        "ALTER TABLE test_results ADD COLUMN issue_owner_token VARCHAR(64)"
                    )
            else:
                conn.exec_driver_sql(
                    "ALTER TABLE test_results "
                    "ADD COLUMN IF NOT EXISTS issue_owner_token VARCHAR(64)"
                )
    except Exception:
        pass
```

- [ ] **Step 3: Run existing tests to confirm no regression**

Run: `cd server && pytest -q`
Expected: PASS.

### Task 4.2: Converge — generate token, default private, return token (TDD)

**Files:** Modify `server/oriself_server/routes/letters.py` (`ResultResponse` `:138-150`, the existing-result branch `:779-787`, the insert `:877-902`); Test `server/tests/test_issues_public.py`

- [ ] **Step 1: Write the failing test (token is returned & report is private)**

```python
# server/tests/test_issues_public.py
from fastapi.testclient import TestClient
from oriself_server.database import reset_for_tests, session_scope
from oriself_server.main import app
from oriself_server.models import TestResult, TestSession


def _seed_completed_issue(slug="intj-deadbeef0000", public=False, token="tok123"):
    with session_scope() as db:
        sess = TestSession(provider="mock", domain="mbti", skill_version="t")
        db.add(sess)
        db.flush()
        db.add(
            TestResult(
                session_id=sess.session_id,
                mbti_type="INTJ",
                issue_slug=slug,
                issue_title="一份关于掌控权的账目自审",
                issue_html="<!doctype html><html><body>x</body></html>",
                issue_is_public=public,
                issue_owner_token=token,
                insight_json="{}",
                card_json="{}",
                confidence_json="{}",
            )
        )
        return sess.session_id


def test_new_report_is_private_and_returns_owner_token():
    reset_for_tests()
    client = TestClient(app)
    r = client.post("/letters", json={"provider": "mock", "domain": "mbti"})
    letter_id = r.json()["letter_id"]
    # 6 turns to clear MIN_CONVERGE_ROUND (mock backend declares CONTINUE/CONVERGE)
    for _ in range(6):
        with client.stream("POST", f"/letters/{letter_id}/turn", json={"user_message": "嗯，我想想。"}) as s:
            for _line in s.iter_lines():
                pass
    res = client.post(f"/letters/{letter_id}/result")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["owner_token"]  # token present
    # the stored issue must be private by default
    slug = body["issue_slug"]
    meta = client.get(f"/issues/{slug}").json()
    assert meta["is_public"] is False
    # public GET must NOT leak the token
    assert "owner_token" not in meta
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `cd server && pytest tests/test_issues_public.py::test_new_report_is_private_and_returns_owner_token -v`
Expected: FAIL (`owner_token` not in response; `is_public` is True).

- [ ] **Step 3: Implement — add field to ResultResponse**

```python
# routes/letters.py — ResultResponse
class ResultResponse(BaseModel):
    letter_id: str
    mbti_type: str
    card_title: Optional[str] = None
    issue_slug: Optional[str] = None
    domain: str = "mbti"
    result_label: Optional[str] = None
    owner_token: Optional[str] = None   # §5 · publish capability (owner-only)
```

- [ ] **Step 4: Implement — return token on the existing-result branch**

```python
# routes/letters.py — in compose_result, the `if existing is not None:` branch
        if existing is not None:
            return ResultResponse(
                letter_id=letter_id,
                mbti_type=existing.mbti_type,
                card_title=existing.issue_title,
                issue_slug=existing.issue_slug,
                domain=sess.domain,
                result_label=existing.result_label,
                owner_token=existing.issue_owner_token,
            )
```

- [ ] **Step 5: Implement — generate token, default private, store, return**

```python
# routes/letters.py — replace the TestResult(...) insert and the final return
        owner_token = secrets.token_hex(16)  # 128-bit publish capability
        db.add(
            TestResult(
                session_id=letter_id,
                mbti_type=stored_mbti,
                result_label=result_label,
                insight_json="{}",
                card_json="{}",
                confidence_json=confidence_json,
                issue_slug=slug,
                issue_title=title,
                issue_html=safe_html,
                issue_is_public=False,          # §5 · default private; opt-in via publish
                issue_owner_token=owner_token,
                issue_generated_at=datetime.now(timezone.utc),
            )
        )
        sess.status = "completed"
        db.commit()

        return ResultResponse(
            letter_id=letter_id,
            mbti_type=stored_mbti,
            card_title=title,
            issue_slug=slug,
            domain=sess.domain,
            result_label=result_label,
            owner_token=owner_token,
        )
```

- [ ] **Step 6: Run the test, expect PASS**

Run: `cd server && pytest tests/test_issues_public.py::test_new_report_is_private_and_returns_owner_token -v`
Expected: PASS.

### Task 4.3: GET /issues/public (TDD)

**Files:** Modify `server/oriself_server/routes/issues.py` (add handler BEFORE `get_issue` `:71`); Test `server/tests/test_issues_public.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_issues_public.py — append
def test_public_endpoint_lists_only_public_renderable():
    reset_for_tests()
    client = TestClient(app)
    _seed_completed_issue(slug="intj-private0001", public=False, token="a")
    _seed_completed_issue(slug="enfp-public0002", public=True, token="b")
    r = client.get("/issues/public")
    assert r.status_code == 200
    slugs = [i["slug"] for i in r.json()]
    assert "enfp-public0002" in slugs
    assert "intj-private0001" not in slugs
    assert all("generated_at" in i for i in r.json())


def test_public_route_not_shadowed_by_slug():
    reset_for_tests()
    client = TestClient(app)
    # /issues/public must hit the list handler, not be treated as slug="public"
    r = client.get("/issues/public")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
```

- [ ] **Step 2: Run, expect FAIL** (404 — endpoint missing)

Run: `cd server && pytest tests/test_issues_public.py -k public -v`
Expected: FAIL.

- [ ] **Step 3: Implement — declare BEFORE `@router.get("/{slug}")`**

```python
# routes/issues.py — add ABOVE get_issue (route order matters: /public before /{slug})
class PublicIssueItem(BaseModel):
    slug: str
    title: str
    mbti_type: str
    domain: str = "mbti"
    result_label: Optional[str] = None
    generated_at: datetime


@router.get("/public", response_model=list[PublicIssueItem])
def list_public_issues(db: Session = Depends(get_db)):
    """收录进公开展示墙的命题（issue_is_public=1 且有渲染内容）。喂 sitemap + 画廊。"""
    rows = (
        db.query(TestResult)
        .filter(TestResult.issue_is_public.is_(True))
        .filter(TestResult.issue_html.isnot(None))
        .order_by(TestResult.issue_generated_at.desc())
        .all()
    )
    return [
        PublicIssueItem(
            slug=r.issue_slug,
            title=r.issue_title or r.mbti_type,
            mbti_type=r.mbti_type,
            domain=_issue_domain(r),
            result_label=r.result_label,
            generated_at=r.issue_generated_at or r.created_at,
        )
        for r in rows
    ]
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd server && pytest tests/test_issues_public.py -k public -v`
Expected: PASS.

### Task 4.4: PATCH publish — require owner_token (TDD)

**Files:** Modify `server/oriself_server/routes/issues.py` (`PublishRequest` `:62-63`, `publish_issue` `:126-155`); Test `server/tests/test_issues_public.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_issues_public.py — append
def test_publish_requires_owner_token():
    reset_for_tests()
    client = TestClient(app)
    _seed_completed_issue(slug="intj-tok00001", public=False, token="secret-token")
    # wrong token → 403
    bad = client.patch("/issues/intj-tok00001/publish", json={"is_public": True, "owner_token": "nope"})
    assert bad.status_code == 403
    assert client.get("/issues/intj-tok00001").json()["is_public"] is False
    # correct token → 200 and flips
    ok = client.patch("/issues/intj-tok00001/publish", json={"is_public": True, "owner_token": "secret-token"})
    assert ok.status_code == 200
    assert ok.json()["is_public"] is True
```

- [ ] **Step 2: Run, expect FAIL** (currently unauthenticated → 200 with wrong token)

Run: `cd server && pytest tests/test_issues_public.py::test_publish_requires_owner_token -v`
Expected: FAIL.

- [ ] **Step 3: Implement**

```python
# routes/issues.py
import secrets as _secrets  # top of file with other imports

class PublishRequest(BaseModel):
    is_public: bool
    owner_token: str


@router.patch("/{slug}/publish", response_model=IssueResponse)
def publish_issue(slug: str, req: PublishRequest, db: Session = Depends(get_db)):
    """切换 issue_is_public。需 owner_token（converge 时下发，仅本人持有）。"""
    result = (
        db.query(TestResult).filter(TestResult.issue_slug == slug).first()
    )
    if result is None or not result.issue_html:
        raise HTTPException(status_code=404, detail="issue not found")
    if not result.issue_owner_token or not _secrets.compare_digest(
        result.issue_owner_token, req.owner_token
    ):
        raise HTTPException(status_code=403, detail="not the owner of this issue")
    result.issue_is_public = req.is_public
    db.commit()
    db.refresh(result)
    return IssueResponse(
        slug=result.issue_slug,
        title=result.issue_title or result.mbti_type,
        mbti_type=result.mbti_type,
        is_public=result.issue_is_public,
        created_at=result.issue_generated_at or result.created_at,
        letter_id=result.session_id,
        domain=_issue_domain(result),
        result_label=result.result_label,
    )
```

- [ ] **Step 4: Run full new test file, expect PASS**

Run: `cd server && pytest tests/test_issues_public.py -v`
Expected: all PASS.

- [ ] **Step 5: Full suite + coverage**

Run: `cd server && pytest --cov=oriself_server -q`
Expected: PASS.

### Task 4.5: [D-1 — GATED] Privatize existing rows

**Files:** one-time op (not committed code). Only after sign-off.

- [ ] **Step 1: Count blast radius on prod (read-only first)**

`SELECT count(*) FROM test_results WHERE issue_is_public = 1;`

- [ ] **Step 2: With sign-off, privatize**

`UPDATE test_results SET issue_is_public = 0;`  (run inside a transaction; verify count, then commit)

---

## Batch 3 — sitemap, gallery, ISR (depends on Batch 4 endpoint)

### Task 3.1: listPublicIssues + PublicIssueSummary + per-call cache fix

**Files:** Modify `web/lib/types.ts`, `web/lib/api.ts`

- [ ] **Step 1: Add the type**

```ts
// web/lib/types.ts — append
export interface PublicIssueSummary {
  slug: string;
  title: string;
  mbti_type: string;
  domain?: string;
  result_label?: string | null;
  generated_at: string;
}
```

- [ ] **Step 2: Fix jsonFetch so a caller-supplied cache/next wins over the no-store default**

```ts
// web/lib/api.ts — jsonFetch: move the default BEFORE the spread so init overrides it
async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${baseUrl()}${path}`;
  const res = await fetch(url, {
    cache: "no-store",          // default; a caller-supplied cache/next now overrides it
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  // ...unchanged below
```

- [ ] **Step 3: Add listPublicIssues (server-only direct backend fetch; copy version.ts pattern)**

```ts
// web/lib/api.ts — under // ───── Issues ─────
import type { PublicIssueSummary } from "./types";

export async function listPublicIssues(): Promise<PublicIssueSummary[]> {
  const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
  try {
    const res = await fetch(`${base}/issues/public`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as PublicIssueSummary[]) : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: typecheck**

Run: `cd web && pnpm typecheck`
Expected: PASS.

### Task 3.2: sitemap.ts

**Files:** Create `web/app/sitemap.ts`

- [ ] **Step 1: Create (uses generated_at, NOT updated_at)**

```ts
// web/app/sitemap.ts
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { listPublicIssues } from "@/lib/api";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const issues = await listPublicIssues();
  return [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/issues`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    ...issues.map((i) => ({
      url: `${SITE_URL}/issues/${i.slug}`,
      lastModified: new Date(i.generated_at),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
```

- [ ] **Step 2: Verify**

Run: `cd web && pnpm build && pnpm start &` then `curl -s http://localhost:3000/sitemap.xml`
Expected: valid XML, homepage + `/issues` + any public issue URLs. Kill server.

### Task 3.3: Gallery page `/issues`

**Files:** Create `web/app/issues/page.tsx`

- [ ] **Step 1: Create (Server Component, crawlable; reuse RecentLetters' catalogue aesthetic)**

```tsx
// web/app/issues/page.tsx
import Link from "next/link";
import type { Metadata } from "next";
import { listPublicIssues } from "@/lib/api";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "公开命题 · 画廊",
  description: "OriSelf 上由作者公开的人格命题选集 —— 对话式人格画像、自我认知、MBTI。",
  alternates: { canonical: "/issues" },
  robots: { index: true, follow: true },
};

export default async function GalleryPage() {
  const issues = await listPublicIssues();
  return (
    <main className="relative z-10 min-h-screen flex flex-col items-center px-6 py-24">
      <h1
        className="text-ink text-center fraunces-body italic"
        style={{ fontSize: "clamp(40px, 7vw, 72px)", letterSpacing: "-0.03em" }}
      >
        公开命题
      </h1>
      <p className="font-mono text-[10px] tracking-widest uppercase text-ink-muted mt-6 mb-14">
        由作者选择公开 · 对话式人格画像
      </p>
      {issues.length === 0 ? (
        <p className="fraunces-body-soft italic text-ink-soft">还没有公开的命题。</p>
      ) : (
        <ul className="w-full max-w-[620px] space-y-5">
          {issues.map((i) => (
            <li key={i.slug} className="border-b border-rule pb-4">
              <Link href={`/issues/${i.slug}`} className="group block no-underline">
                <div className="flex items-baseline gap-3">
                  {i.domain === "major" ? (
                    <span className="fraunces-body italic text-[13px] text-accent">
                      {i.result_label ?? "专业方向"}
                    </span>
                  ) : (
                    <span className="font-mono text-[12px] tracking-[0.18em] text-accent">
                      {i.mbti_type}
                    </span>
                  )}
                </div>
                <p className="fraunces-body italic text-[17px] leading-snug text-ink mt-[6px] truncate group-hover:text-accent transition-colors">
                  {i.title}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: typecheck + build + visual check**

Run: `cd web && pnpm typecheck && pnpm build`
Expected: PASS; `/issues` listed as ISR route. Open in browser, confirm it matches the catalogue aesthetic (custom palette, serif).

### Task 3.4: Issue page ISR (replace force-dynamic; cache getIssue)

**Files:** Modify `web/app/issues/[slug]/page.tsx` (`:21`), `web/lib/api.ts` (`getIssue`)

- [ ] **Step 1: Swap render mode on the issue page ONLY**

In `web/app/issues/[slug]/page.tsx` replace `export const dynamic = "force-dynamic";` with `export const revalidate = 3600;`. **Do not touch `web/app/letters/[id]/page.tsx`** (must stay dynamic).

- [ ] **Step 2: Make getIssue cacheable (per-call override, default no-store untouched for other callers)**

```ts
// web/lib/api.ts
export async function getIssue(slug: string): Promise<IssueMeta> {
  return jsonFetch(`/issues/${slug}`, { next: { revalidate: 3600 } });
}
```

> Relies on Task 3.1 Step 2 (default-before-spread) so `next` is not clobbered by `cache:"no-store"`.

- [ ] **Step 3: Verify cache headers flipped (and letter flow did NOT)**

Run: `cd web && pnpm build`
Expected: build output marks `/issues/[slug]` as ISR (revalidate), `/letters/[id]` still `ƒ` dynamic.
After deploy: `curl -sI .../issues/<slug>` shows ISR cache headers (NOT `no-store`); `curl -sI .../letters/<id>` still `no-store`.

---

## Batch 5 — §5 publish UI + history + frontend auth wiring

### Task 5.1: history ownerToken field

**Files:** Modify `web/lib/history.ts`

- [ ] **Step 1: Add field to LocalLetterEntry + the new-entry constructor**

```ts
// web/lib/history.ts — LocalLetterEntry interface, add:
  /** §5 · publish 凭证（converge 时下发，仅本人浏览器持有）。 */
  ownerToken?: string;
```
And in `upsertLetter`'s new-entry branch add `ownerToken: patch.ownerToken,` alongside the other optional fields.

- [ ] **Step 2: typecheck**

Run: `cd web && pnpm typecheck`
Expected: PASS.

### Task 5.2: Capture ownerToken on converge

**Files:** Modify `web/lib/types.ts` (`LetterResult`), `web/app/letters/[id]/letter-view.tsx` (`:196-204`)

- [ ] **Step 1: Add to LetterResult type**

```ts
// web/lib/types.ts — LetterResult, add:
  owner_token?: string | null;   // §5 · publish 凭证
```

- [ ] **Step 2: Persist it in the converge upsert**

```ts
// letter-view.tsx — inside the upsertLetter call after composeResult
          upsertLetter({
            letterId,
            status: "completed",
            issueSlug: result.issue_slug,
            mbtiType: result.mbti_type,
            cardTitle: result.card_title ?? undefined,
            domain: result.domain,
            resultLabel: result.result_label ?? undefined,
            ownerToken: result.owner_token ?? undefined,
          });
```

- [ ] **Step 3: typecheck**

Run: `cd web && pnpm typecheck`
Expected: PASS.

### Task 5.3: publishIssue owner_token arg

**Files:** Modify `web/lib/api.ts` (`publishIssue` `:255-263`)

- [ ] **Step 1: Add token arg**

```ts
// web/lib/api.ts
export async function publishIssue(
  slug: string,
  isPublic: boolean,
  ownerToken: string,
): Promise<IssueMeta> {
  return jsonFetch(`/issues/${slug}/publish`, {
    method: "PATCH",
    body: JSON.stringify({ is_public: isPublic, owner_token: ownerToken }),
  });
}
```

- [ ] **Step 2: typecheck**

Run: `cd web && pnpm typecheck`
Expected: PASS.

### Task 5.4: PublishToggle (owner-only)

**Files:** Create `web/components/issue/publish-toggle.tsx`; Modify `web/app/issues/[slug]/page.tsx` (render it), `web/components/issue/issue-chrome.tsx` (host it)

- [ ] **Step 1: Create the toggle (client; reads ownerToken from local history by letterId)**

```tsx
// web/components/issue/publish-toggle.tsx
"use client";

import { useEffect, useState } from "react";
import { getAllLetters } from "@/lib/history";
import { publishIssue, getIssue } from "@/lib/api";

/** 仅当本地历史里存有本命题的 ownerToken（=本人）时渲染；否则返回 null。 */
export function PublishToggle({ slug, letterId }: { slug: string; letterId?: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!letterId) return;
    const entry = getAllLetters().find((e) => e.letterId === letterId);
    if (entry?.ownerToken) setToken(entry.ownerToken);
    getIssue(slug).then((m) => setIsPublic(m.is_public)).catch(() => {});
  }, [slug, letterId]);

  if (!token || isPublic === null) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      const next = !isPublic;
      const m = await publishIssue(slug, next, token);
      setIsPublic(m.is_public);
    } catch {
      /* keep prior state */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="hover:text-accent transition-colors bg-transparent border-0 p-0 disabled:opacity-50"
      title={isPublic ? "已公开到画廊，点此转为私有" : "公开这条命题到画廊（可被搜索到）"}
    >
      {isPublic ? "已公开 · 转私有" : "公开到画廊"}
    </button>
  );
}
```

- [ ] **Step 2: Host it in IssueChrome's left nav group** (after the AUTHOR button, `issue-chrome.tsx:82-89`)

```tsx
// issue-chrome.tsx — add prop + render
// add to Props: nothing new; reuse slug + letterId already passed
import { PublishToggle } from "@/components/issue/publish-toggle";
// inside the left nav <div>, after the AUTHOR button:
            <PublishToggle slug={slug} letterId={letterId} />
```

Update the IssueChrome doc comment: it previously said "没有公开/私有开关" — change to note the owner-only publish toggle.

- [ ] **Step 3: typecheck + build**

Run: `cd web && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 4: End-to-end manual verification (happy path).** With backend (mock) + web running: create a letter, run ≥6 turns, generate the report, land on `/issues/<slug>` — the "公开到画廊" toggle appears (owner). Click it → returns 200, gallery/sitemap now include the slug, and `curl` of the issue page shows `robots: index,follow`. Open the same slug in a private window (no localStorage) → toggle is absent (not owner).

---

## Batch 6 — Content SEO (optional; design-sensitive, not auto-mergeable)

### Task 6.1: Homepage indexable content (D1)

**Files:** Modify `web/app/page.tsx` (insert a `<section>` between `<RecentLetters />` and `<footer>`)

- [ ] **Step 1: Add a semantic, taste-matched content block** (keep the monumental H1 untouched; subordinate copy; weave keywords as differentiation, not stuffing). Draft `<h2>` subheads: "对话式人格画像，不是又一个 MBTI 测验" / "从一次自我认知的对话开始". Use existing classes (`fraunces-body-soft`, `font-mono text-ink-muted`, `paper/ink/accent`). **Run past the user / `/plan-design-review` — do not auto-merge AI-slop copy.**

- [ ] **Step 2: typecheck + visual review.**

### Task 6.2: JSON-LD (C3, optional)

**Files:** Modify `web/app/layout.tsx` (WebSite+SearchAction), `web/app/issues/[slug]/page.tsx` (Article, public only)

- [ ] **Step 1:** Inject `<script type="application/ld+json">` via a string in the component tree. Defer until Batches 1–5 verified.

### Task 6.3: og:description from issue_html (B4)

**Files:** Modify `web/app/issues/[slug]/page.tsx` generateMetadata

- [ ] **Step 1:** If a richer description is wanted, derive it from a stripped first `<p>` of the report — but the report HTML is not in `IssueMeta`. Either extend `GET /issues/{slug}` to return a server-extracted `excerpt`, or keep the current per-type desc. **Do NOT read `insight_json` (it is `"{}"`).** Lowest-effort: keep current desc; revisit only if previews look thin.

---

## Verification checklist (plan §6, corrected)

- [ ] `curl .../robots.txt` → real robots (Disallow /letters/, /api/; Sitemap pointer)
- [ ] `curl .../sitemap.xml` → homepage + /issues + public issue URLs (after some are published)
- [ ] Public issue `curl` head robots = `index,follow`; private = `noindex`
- [ ] `curl .../issues/<slug>/opengraph-image` → 1200×630 PNG with **Chinese title rendered** (open and eyeball)
- [ ] OG card title not tofu (CN font mirror reachable from prod runtime)
- [ ] Issue `<title>` single suffix `… · OriSelf`; homepage `OriSelf · 对话式人格画像`
- [ ] `curl -sI .../issues/<slug>` not `no-store`; `curl -sI .../letters/<id>` still `no-store`
- [ ] Publish toggle: visible to owner, absent to non-owner; wrong token → 403
- [ ] `pytest --cov=oriself_server` green
- [ ] Twitter Card Validator / 微博分享调试 / WeChat preview show large-image card

---

## Self-review notes

- **Spec coverage:** A1/A2/A3/A4/A5 ✓ (1.3, 1.4, 3.2, 4.3); B1/B2/B3/B5 ✓ (2.x, 1.2); B4 → 6.3 (adapted off insight_json); B6 struck (audit correction); C1 ✓ (3.4); C2 ✓ (canonical in 1.2/1.4); C3 → 6.2; D1 → 6.1; D2 ✓ (3.3); §5 ✓ (Batch 4+5).
- **Type consistency:** `owner_token` (server `ResultResponse` / TS `LetterResult.owner_token`) ↔ `ownerToken` (history/UI); `PublicIssueItem` (server) ↔ `PublicIssueSummary` (TS) share fields {slug,title,mbti_type,domain,result_label,generated_at}; `listPublicIssues` used by both sitemap.ts and gallery.
- **Ordering caveat:** `GET /issues/public` declared before `GET /{slug}` (route capture). Batch 4 before Batch 3 (endpoint feeds sitemap/gallery). Batch 1.4 robots split is safe pre-§5 because default-private keeps new issues noindex.
- **Risks:** CN font-mirror reachability (Task 2.2 Step 3 gates it); D-1 mutates prod data (gated); D-2 transcript leak flagged not fixed.

---
---

# Part II — UX Polish Track (Batches 7–10)

> **Separate concern, bundled here on purpose.** These four batches come from the UX optimization workflow (2026-06-09, 9-agent diagnosis of 5 user-reported问题). They are **independent of the SEO/sharing work above** and can ship on their own — but they **edit three of the same files** as the SEO batches (`layout.tsx`, `issue-chrome.tsx`, `issues/[slug]/page.tsx`), so they live in the same plan to keep those edits coordinated. Use the same sub-skill (subagent-driven-development / executing-plans) and checkbox tracking.
>
> **User-approved scope (2026-06-09):** ✅ delete custom cursor (P1+P2) · ✅ report bottom-nav hierarchy + share analytics (P4) · ✅ skill warm-floor color guardrail (P5 色温) · ✅ report iframe warm-paper transition (P5 兜底).
> **Explicitly deferred by user (do NOT do this round):** P3 专业方向垂直化 / 时令默认入口 · landing 卖点文案重锚 (`landing` stays as-is; "只内部统一叙事"). The卖点 thesis is recorded in "Differentiation thesis" below as design-guiding context only — no `page.tsx` copy edits.

## Differentiation thesis (context only — not a code task)

> 不是又一个人格测试、不是训练 AI 分身、也不是报志愿工具——花 10 分钟对话,让它替你写下一封"读起来像有人真的懂你"的信:此刻的镜子,而非数字替身。

Use this to steer taste decisions in Batch 9/10 (warmth = the physical质感 of "a letter"), **not** as landing copy. It also reinforces why the SEO OG card (Batch 2) says "一封写给你的信".

## Coordination matrix — UX × SEO file overlaps

| File | SEO batch edits | UX batch edits | Conflict? | Rule |
|---|---|---|---|---|
| `web/app/layout.tsx` | B1 T1.2: metadata block `:39-49`, `<html lang>` `:58` | **B7 T7.1**: remove `CustomCursor` import `:8` + mount `:64` | No (disjoint lines) | Apply both; cursor removal deletes lines 8 & 64, metadata rewrites 39-49 & 58. Re-verify line numbers after the first edit shifts them. |
| `web/components/issue/issue-chrome.tsx` | B5 T5.4: host `<PublishToggle>` in left nav after AUTHOR; update doc comment | **B8 T8.2**: hierarchy rework (复制地址→primary, 反馈→plain link, 再写一封→ink-soft); add `trackEvent("link_copied")` | **Yes — same component** | Land B8 first (establishes the hierarchy), then B5's PublishToggle joins the left nav **as a plain text link** (same weight as the downgraded 反馈), never as a second accent button. One accent primary only = 复制地址. |
| `web/app/issues/[slug]/page.tsx` | B1 T1.4: `generateMetadata` `:82-108` · B3 T3.4: `force-dynamic`→`revalidate=3600` `:21` | **B10 T10.2**: replace inline `<iframe>` `:43-48` with `<IssueFrame>` | No (disjoint regions) | Independent regions. If both land, the iframe-swap is purely the JSX at `:43-48`; render-mode/metadata are elsewhere. |
| `web/lib/analytics.ts` | — | **B8 T8.1**: add `"link_copied"` to union | No | UX-only. |
| `server/oriself_server/routes/analytics.py` | — | **B8 T8.1**: add `"link_copied"` to `ALLOWED_EVENTS` | No | UX-only (backend validates the whitelist — must change too or the event 400s). |
| `skill-repo/skills/oriself/CONVERGE.md` | — | **B9 T9.1**: insert color-temperature guardrail | No | UX-only; submodule. |

## Grounding (verified against code, 2026-06-09)

| Claim | Evidence | Consequence |
|---|---|---|
| 桌面"点击不准"根因是自绘光标,不是响应式缺失 | `globals.css:101-114` 全量 `cursor:none`;`custom-cursor.tsx:45` lerp `*0.22`(可见红点滞后真实指针);`:32-37` 用 `target.matches()` 不走 `closest()`(漏判按钮内 `<span>`);`:68` `mixBlendMode:'multiply'` 让红点在 oxblood 按钮上隐形 | 移动端 `sm:` 断点/`min-h-[40px]`/`env(safe-area-inset-bottom)`/`@media(hover:none)` 跳过挂载都已就位 → **不动断点**,只删光标 |
| 仅 `layout.tsx` 引用 CustomCursor | `rg custom-cursor\|CustomCursor\|cursor-dot web` → 命中仅 `layout.tsx:8,64` + `globals.css` 注释/`.cursor-dot.expanded` + 组件自身 | 删除零外部引用面 |
| `.writing-cursor`(流式打字 caret)与自绘光标无关 | `globals.css:125-134` 独立块,由 `caret-color`/inline typewriter 用 | **保留**,只删 `:97-123` |
| 底栏"看不出来"是层级塌平非丑 | `issue-chrome.tsx:54` nav 容器钉死 `text-ink-muted`+10px mono;复制地址 pill 用 `border-rule-strong`(0.22 近不可见,`:99`),反馈 pill 用 `border-accent/70`(`:125`,最显眼) | 视觉权重最高的是反馈而非分享 → **层级倒置**,单文件重排可纠 |
| 后端埋点白名单 8 项,缺 `link_copied`/`issue_opened` 之外的分享事件 | `analytics.py:48-57` `ALLOWED_EVENTS` set;`:90` `if v not in ALLOWED_EVENTS` 直接拒收 | 复制行为当前**完全未埋点**,改完无法验证 → 必须加 `link_copied` |
| 报告偏黑是 skill 刻意奖励多样性的产物,非 web bug | `CONVERGE.md:161` "凌晨+键盘+bug → 深黑底";`:221` Luxury "深色高对比";`:224` Retro "CRT 绿/琥珀";`design-principles:18` "每一份报告都要长得不一样…绝不收敛";全文无品牌色温约束 | 根因在 `CONVERGE.md`,**改 skill 不改 web**;护栏给"温度下限"而非锁色,不违背 design-principles |
| `issues/[slug]/page.tsx` 是 Server Component,iframe `fixed inset-0 z-20` 无暖纸托底 | `page.tsx:21` `force-dynamic`(async);`:43-48` iframe;`IssueChrome` z-30;ArrivalCeremony 暖纸 6s 后消散即把整屏交给可能纯黑的 iframe | 过渡帧需一个 client 子组件(onLoad 在 `sandbox="allow-scripts"` 下仍触发,load 事件不受同源限制) |

---

## Batch 7 — Remove custom cursor (P1 桌面点击 + P2 光标"不灵活"/同质化)

> Pure subtraction. ~10 min, zero regression surface. Resolves both P1 (瞄准滞后) and the cursor half of P2 (圆点跟随是 AI-slop 高发套路). Mobile is untouched (already skips mount on `hover:none`).

### Task 7.1: Drop the mount from layout.tsx

**Files:** Modify `web/app/layout.tsx` (`:8` import, `:64` mount)

- [ ] **Step 1: Remove the import line `:8`**

Delete: `import { CustomCursor } from "@/components/primitives/custom-cursor";`

- [ ] **Step 2: Remove the mount `:64`**

Delete the `<CustomCursor />` line in `<body>` (keep `<AuthorBadge />` and `{children}`).

> **Coordination:** B1 T1.2 also edits this file (metadata `:39-49`, `lang` `:58`). Disjoint lines. If B1 lands first, line numbers shift — match on the literal strings, not numbers.

### Task 7.2: Remove the cursor CSS from globals.css

**Files:** Modify `web/app/globals.css` (`:97-123`)

- [ ] **Step 1: Delete two blocks**

Remove (a) the comment header + `@media (hover: hover) and (pointer: fine) { … cursor: none; }` block (`:97-114`) and (b) the `.cursor-dot.expanded { … }` block (`:116-123`).

- [ ] **Step 2: KEEP everything else.** Do **not** touch `.writing-cursor` (`:125-134`, the streaming typewriter caret — unrelated), `:focus-visible`, selection, noise, vignette.

### Task 7.3: Delete the component + verify

**Files:** Delete `web/components/primitives/custom-cursor.tsx`

- [ ] **Step 1: Confirm no remaining references**

Run: `cd /niuniu869_dev/oriself-next-app && rg -n "custom-cursor|CustomCursor|cursor-dot" web`
Expected: **no matches** (after 7.1/7.2). If any remain, fix before deleting.

- [ ] **Step 2: Delete the file**

`rm web/components/primitives/custom-cursor.tsx`

- [ ] **Step 3: typecheck + build**

Run: `cd web && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 4: Desktop visual verification (REQUIRED).** At desktop width, hover + click `进入 →` (home DomainToggle), `发 送 →`, `现在收信 →`, and the empty-state chips. Native cursor: zero lag, I-beam over the composer underline, pointer-hand over links, ring-aiming gone. Confirm the oxblood-on-oxblood "invisible dot" problem is gone.

---

## Batch 8 — Report bottom-nav hierarchy + `link_copied` analytics (P4)

> Single-component restyle + one whitelisted event. ~25 min. Fixes the level-flattening so the share lever (复制地址 = 拉新) is the eye's first landing point; corrects the 反馈>分享 inversion. Keeps the "克制不抢报告" intent via **one** accent primary + everything else demoted (subtraction, not a louder button).

### Task 8.1: Whitelist `link_copied` (frontend type + backend validator)

**Files:** Modify `web/lib/analytics.ts` (`AnalyticsEvent` union `:13-21`), `server/oriself_server/routes/analytics.py` (`ALLOWED_EVENTS` `:48-57`, docstring `:14-21`)

- [ ] **Step 1: Frontend union — add the event**

```ts
// web/lib/analytics.ts — AnalyticsEvent, append:
  | "issue_opened"
  | "arrival_dismissed"
  | "link_copied";   // §P4 · 报告页复制分享地址（可发现性验证）
```

- [ ] **Step 2: Backend whitelist — add the event (else 400)**

```python
# server/oriself_server/routes/analytics.py — ALLOWED_EVENTS set, add:
    "issue_opened",
    "arrival_dismissed",
    "link_copied",          # §P4 · 复制分享地址 · props {slug, letter_id?}
```
Also add a line to the module docstring (`:19-20` area) documenting `link_copied  props: {slug, letter_id?}` to match the existing event ledger.

- [ ] **Step 3: Backend test stays green**

Run: `cd server && pytest -q`
Expected: PASS (no event-name assertion breaks).

### Task 8.2: issue-chrome.tsx — re-rank visual weight + fire the event

**Files:** Modify `web/components/issue/issue-chrome.tsx`

- [ ] **Step 1: 复制地址 → the one primary.** On the copy `<button>` (`:95-121`): border `border-rule-strong` → `border-accent/70 hover:border-accent`, add `hover:bg-accent/5`; inner label `text-ink-soft` → `text-accent` (keep the `copied` accent state); icon `text-ink-muted` → `text-accent`. Keep `rounded-[2px]` + the `fraunces-body italic` / mono `⎘` mix (no new icon lib).

- [ ] **Step 2: 反馈 → demote to a plain text link.** On the feedback `<button>` (`:122-137`): drop `border border-accent/70 hover:bg-accent/5 … rounded-[2px]`; make it match nav links — `text-ink-muted hover:text-accent transition-colors` + the `✎` glyph + `对这封信说一句`/`反馈` responsive labels. Removes the inversion (反馈 was louder than 分享).

- [ ] **Step 3: 再写一封 → second-visible.** On the `← 再写一封 →` `<Link>` (`:75-81`): override the nav-default muted with `text-ink-soft` (one shade darker) so it reads as the secondary action. `← 首页` / `← 回看` / `AUTHOR` stay weakest (inherit `text-ink-muted`).

- [ ] **Step 4: Slightly firmer footer divide.** Container gradient (`:48-51`) first stop `0.96` → `0.99`; nav padding (`:54`) `py-3 sm:py-4` → `py-3.5 sm:py-4`. A clearer page-foot line without a solid bar.

- [ ] **Step 5: Fire `link_copied` on successful copy.** In `handleCopyLink` (`:30-42`), after `setCopied(true)`:

```ts
// issue-chrome.tsx — top: import { trackEvent } from "@/lib/analytics";
// inside handleCopyLink, after navigator.clipboard.writeText(url) succeeds:
      trackEvent("link_copied", { slug, letter_id: letterId }, letterId);
```

> **Coordination with B5 T5.4 (PublishToggle):** when that lands, render `<PublishToggle>` in the **left** nav group styled as a plain text link (`text-ink-muted hover:text-accent`), peer to AUTHOR/反馈 — **not** a second accent control. The accent budget is spent entirely on 复制地址.

- [ ] **Step 6: typecheck + build**

Run: `cd web && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 7: Real-device contrast check (REQUIRED).** On `next.oriself.com` (or local) over a real report: the oxblood `复制地址` pill must read as the clear primary against the paper-noise gradient; 反馈/首页/回看 recede; tap 复制地址 → clipboard works + (after deploy) a `link_copied` row lands. **Eyeball it — don't claim done from typecheck.**

---

## Batch 9 — Skill warm-floor color guardrail (P5 色温) · [layer: skill-repo, submodule]

> Root-cause fix for 暖纸 app → 黑底报告 的断裂. The report's palette is the LLM's call, steered by `CONVERGE.md`. We add a **soft** temperature floor (not a fixed palette) so "求变" happens inside a warm light. ~30 min incl. eyeballing. **Soft constraint — LLM not 100% guaranteed; verify on real letters.** Respects `design-principles:18` (still每张不一样).

### Task 9.1: Insert the color-temperature guardrail into CONVERGE.md

**Files:** Modify `skill-repo/skills/oriself/CONVERGE.md` (insert after 第二步 COLOR `:197`/before 词汇表 `:216`; amend `:161`, `:221`, `:224`; footer note `:286`)

- [ ] **Step 1: Insert a guardrail section** between 第二步 (`:204` divider) and 第三步 (`:206`), or right before 词汇表 (`:216`). Draft (match the doc's Chinese design-director voice):

```markdown
## 第二步半 · 色温护栏（硬底线，不锁配色）

**报告是一封信的里子，不是另开一个网站。** 宿主壳是暖纸：paper `#F5F0E6` · ink `#1A1512` · oxblood `#7A1F1A`。
你的报告可以走任何美学方向、可深可浅，但 **主背景必须有体温**：

- ✅ 允许：暖白 / 米 / 陶土 / 深褐 / 暖墨。深色也要带暖调（如 `#1A1512`、`#211A15` 这类墨褐）。
- ❌ 禁止：纯黑 `#000`、手术室冷白、冷青灰仪表盘底（`#0E1116` / `#0A0A0A` 一类）。
- accent 可以冷（霓虹、CRT 绿、电蓝都行）——但 **底色不许冷**。深色报告 = 暖墨深褐底 + 单色暖光，不是 OLED 黑屏。
- 对比压住：疗愈感来自低对比、柔过渡，不是高反差仪表盘。

把这条当作「温度下限」而非「指定配色」——你依然要让每张报告长得不一样（见 design-principles），
只是这种「不一样」发生在同一束暖光下。让人从暖纸信封翻到信纸里子，而不是跳进另一个 app。
```

- [ ] **Step 2: Amend the contradicting映射 examples.** `:161` `"凌晨 + 键盘 + bug" → 深黑底、单色亮光` → `→ 暖墨褐底（如 #1A1512，非纯黑）+ 单色亮光、等宽字、硬边`. In 词汇表: `:221` Luxury `深色高对比` → `深暖墨高对比`; `:224` Retro-Futuristic `CRT 绿/琥珀` → keep accent but add `底用暖墨褐而非纯黑`.

- [ ] **Step 3: Footer reinforcement.** Near the footer署名 (`:286`), add one line: 报告读起来应像「同一封信的里子」，与暖纸信封同源。

- [ ] **Step 4: Verify on real generations (REQUIRED — soft constraint).**

Run: generate 3–5 reports that would previously trend dark, e.g. seed conversations约 "凌晨/键盘/bug/数据/规矩" then `POST /letters/{id}/result` (mock won't exercise this — use a real provider, e.g. `ORISELF_PROVIDER=gemini`). Open each `/issues/<slug>/render`.
Expected: dark reports now use warm墨褐 grounds, not pure black; accent may stay cool; reports still差异化. If any come back冷黑, tighten wording (the floor is soft).

> **Submodule note:** edits land in the `skill-repo` working tree (`git status` shows `m skill-repo`). Per CLAUDE.md, skill text lives in skill-repo — commit there separately when ready (not this round; user asked plan-only).

---

## Batch 10 — Report iframe warm-paper transition (P5 兜底)

> Web-side complement to Batch 9: warm-paper underlay + opacity dissolve so the报告 fades up from paper instead of snapping in. Also covers **legacy black reports** (no regeneration needed). ~20 min. The current page is a Server Component, so the fade needs a tiny client child.

### Task 10.1: IssueFrame client component

**Files:** Create `web/components/issue/issue-frame.tsx`

- [ ] **Step 1: Create**

```tsx
// web/components/issue/issue-frame.tsx
"use client";

import { useState } from "react";

/**
 * IssueFrame · 让报告从暖纸里「显影」而非硬切。
 *  - 身后铺一张 bg-paper 托底（z-10）：加载白屏的一瞬、报告若留边处，都漏出暖纸而非系统白/黑。
 *  - iframe（z-20）opacity 0→1 on load，~400ms ease，消除暖纸→报告的断崖切换。
 *  - sandbox="allow-scripts"（无 allow-same-origin）：load 事件不受同源限制，onLoad 正常触发。
 */
export function IssueFrame({ src, title }: { src: string; title: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <div aria-hidden className="fixed inset-0 z-10 bg-paper" />
      <iframe
        src={src}
        title={title}
        sandbox="allow-scripts"
        onLoad={() => setLoaded(true)}
        className="fixed inset-0 w-full h-full border-0 z-20 transition-opacity duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </>
  );
}
```

### Task 10.2: Use it on the issue page

**Files:** Modify `web/app/issues/[slug]/page.tsx` (`:43-48`)

- [ ] **Step 1: Replace the inline iframe** (`:43-48`) with `<IssueFrame src={renderUrl} title={meta.title} />` and import it. Leave the security model identical (`sandbox="allow-scripts"` is preserved inside IssueFrame). Keep `IssueChrome` (z-30), trackers, ArrivalCeremony, sr-only `<h1>` untouched.

> **z-index ladder (unchanged contract):** underlay z-10 < iframe z-20 < IssueChrome z-30. ArrivalCeremony renders above on `?arrived=1` and is unaffected (z-10 underlay is the lowest layer). Body bg is already `--paper`, so the underlay is belt-and-suspenders for the load frame.

> **Coordination:** B1 T1.4 (`generateMetadata`) and B3 T3.4 (`force-dynamic`→`revalidate`) edit other regions of this same file — disjoint from the `:43-48` JSX swap.

- [ ] **Step 2: typecheck + build**

Run: `cd web && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 3: Transition visual check (REQUIRED).** Open a real `/issues/<slug>` (ideally a legacy dark one): the report should **dissolve up from warm paper**, no white/black flash. With `?arrived=1`, the封缄 ceremony hands off to the dissolve without a hard cut.

---

## UX verification checklist (Batches 7–10)

- [ ] `rg custom-cursor|CustomCursor|cursor-dot web` → no matches; `pnpm typecheck && pnpm build` green
- [ ] Desktop: native cursor, precise aim on `进入→`/`发送→`/`现在收信→`/chips; I-beam over composer; oxblood-dot-invisible bug gone
- [ ] `.writing-cursor` streaming caret still works during a turn
- [ ] Report底栏: 复制地址 = single clear primary; 反馈/首页/回看 recede; no level-flattening
- [ ] `link_copied` event accepted by backend (not 400) and lands a row on copy
- [ ] 3–5 real dark-leaning reports come back warm墨褐 (not pure black); reports still差异化
- [ ] Issue page: report dissolves up from paper, no white/black flash; legacy dark report covered
- [ ] `cd server && pytest -q` green (analytics whitelist change)

## Sequencing & ship notes

- **Independent of SEO.** Batches 7–10 carry no backend schema/migration risk and can ship **before** the SEO work (lower blast radius). Recommended solo order: **7 → 8 → 10 → 9** (3 web subtractions first, skill change + provider-eyeball last). 9 is the only one needing a real LLM provider to verify.
- **If both tracks land together:** resolve the `issue-chrome.tsx` overlap by landing **B8 before B5** (hierarchy first, PublishToggle joins as a plain link); apply `layout.tsx` (B7+B1) and `issues/[slug]/page.tsx` (B10+B1+B3) as disjoint-region edits, re-checking line numbers after the first edit in each file.
- **One core thing at a time** (周末原型纪律): each batch is independently verifiable; do not batch-merge 7–10 blindly — eyeball gates (7.4, 8.7, 9.4, 10.3) are not optional.

## Self-review notes (Part II)

- **Scope fidelity:** only the 4 user-approved items; P3/卖点-landing explicitly excluded and labeled. Thesis kept as context, not copy.
- **Root-cause not symptom:** P1+P2 → one root (隐藏系统光标再 JS 追) → delete, not tune; P4 → level-flattening → re-rank, not "louder"; P5 → skill rewards diversity with no temp floor → soft floor in CONVERGE.md, not a web band-aid.
- **AI-slop guard:** every change is subtraction or a constraint, not a new decorative layer — deleting the follow-cursor, demoting buttons, warming (not neon-darkening) reports, dissolving (no spinner/skeleton).
- **Coordination is the reason for bundling:** three shared files with the SEO batches; matrix above is the contract. Skip it and B8↔B5 will fight over the bottom nav.
- **Risks:** B9 is a soft constraint (LLM adherence not guaranteed → real-provider eyeball gates it); B9 touches the submodule (separate commit); B10's underlay is redundant with body bg by design (safe). No data mutation, no schema change in this track.
