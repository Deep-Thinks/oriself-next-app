"use client";

import { useEffect } from "react";
import { findByIssueSlug, isOwnerOf } from "@/lib/history";
import { trackEvent } from "@/lib/analytics";

interface Props {
  slug: string;
}

/**
 * Issue 页 mount 时发送 `issue_opened` 埋点。
 *
 * 单独 client 组件而不是塞进 IssueChrome，因为：
 * - IssueChrome 是 bottom chrome，mount 略晚于 iframe，单独组件避免漏埋
 * - 语义最清楚，未来加 referrer / utm（Task 2.5）也只动这里
 *
 * letterId 由本地历史按 slug 反查（D-A：letter_id 不再走公开 API；仅 owner 浏览器有本地条目）。
 * 渲染为 null — 纯副作用。
 */
export function IssueOpenedTracker({ slug }: Props) {
  useEffect(() => {
    // isOwnerOf 内部已幂等消费 #claim= 并统一 owner 判定（与 issue-chrome 同源）。
    const isOwner = isOwnerOf(slug);
    const entry = findByIssueSlug(slug);
    const referrer =
      (typeof document !== "undefined" ? document.referrer.slice(0, 200) : "") ||
      null;
    trackEvent(
      "issue_opened",
      { slug, letter_id: entry?.letterId ?? null, is_owner: isOwner, referrer },
      entry?.letterId ?? undefined,
    );
  }, [slug]);
  return null;
}
