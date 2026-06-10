import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getIssue } from "@/lib/api";
import { IssueChrome } from "@/components/issue/issue-chrome";
import { IssueFrame } from "@/components/issue/issue-frame";
import { IssueOpenedTracker } from "@/components/issue/issue-opened-tracker";
import { ArrivalCeremony } from "@/components/issue/arrival-ceremony";

/**
 * /issues/:slug · the report page.
 *
 * The LLM-generated HTML is untrusted user-generated content, so we render it
 * in an <iframe sandbox>. The iframe is full-viewport; we layer a thin chrome
 * bar over the bottom for navigation, sharing, and feedback — the report stays
 * the visual centerpiece.
 *
 * Key security:
 *  - sandbox="allow-scripts" (no allow-same-origin = no access to parent)
 *  - src points to /api/issues/:slug/render which returns CSP-sandboxed HTML
 */
// ISR：issue 元数据/外壳生成后基本不变，缓存 1h 让公开页可被 CDN/爬虫高效抓取。
// 报告正文是 iframe → /api/issues/:slug/render（始终动态），这里只缓存薄壳。
// 注意：letters/[id] 必须保持 force-dynamic（实时对话态），不要顺手改那边。
export const revalidate = 3600;

export default async function IssuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let meta;
  try {
    meta = await getIssue(slug);
  } catch {
    notFound();
  }

  // The render endpoint returns the full standalone HTML document.
  const renderUrl = `/api/issues/${slug}/render`;

  return (
    <>
      {/* The iframe IS the page. 暖纸托底 + opacity 显影（z-10 底 < z-20 iframe < z-30 chrome）。 */}
      <IssueFrame src={renderUrl} title={meta.title} />

      {/* D-A：letter_id 不再走公开 API；owner 态由 IssueChrome 内部按 slug 反查本地历史。
          domain/title 现在透传（供 Batch 2 受众分流用）。 */}
      <IssueChrome slug={meta.slug} domain={meta.domain} title={meta.title} />

      {/* A-6 · issue_opened 埋点（issue 页 mount 时一次）；letterId 由组件内部按 slug 反查 */}
      <IssueOpenedTracker slug={meta.slug} />

      {/* 封缄时刻 · 仅在 ?arrived=1 首次到达时出现 */}
      <Suspense fallback={null}>
        <ArrivalCeremony slug={meta.slug} />
      </Suspense>

      {/* Hidden heading for accessibility / crawlers */}
      <h1 className="sr-only">{meta.title} · OriSelf Issue</h1>
    </>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    const meta = await getIssue(slug);
    // major 域不显示伪四字母（mbti_type 为占位 "MAJOR"），用通用文案。
    const isMajor = meta.domain === "major" || meta.mbti_type === "MAJOR";
    const desc = isMajor
      ? "一封关于你想学什么的信。"
      : `一封关于 ${meta.mbti_type} 的信。`;
    const isPublic = !!meta.is_public;
    return {
      // 裸标题 → 根 layout 的 title.template 追加 " · OriSelf"（避免双后缀）。
      title: meta.title,
      description: desc,
      alternates: { canonical: `/issues/${slug}` },
      // 私有命题：slug 仍是访问凭证，保持 noindex；用户主动公开后才放开收录。
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
