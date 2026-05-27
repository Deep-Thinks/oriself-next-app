"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

interface Props {
  slug: string;
  letterId?: string | null;
}

/**
 * Issue 页 mount 时发送 `issue_opened` 埋点。
 *
 * 单独 client 组件而不是塞进 HistorySync / IssueChrome，因为：
 * - HistorySync 在 letter 页也用，不能直接 track issue_opened
 * - IssueChrome 是 bottom chrome，比 iframe 慢一点 mount，可能漏埋
 * - 单独组件语义最清楚，未来加 referrer / utm 也只动这里
 *
 * 渲染为 null — 纯副作用。
 */
export function IssueOpenedTracker({ slug, letterId }: Props) {
  useEffect(() => {
    trackEvent(
      "issue_opened",
      { slug, letter_id: letterId ?? null },
      letterId ?? undefined,
    );
  }, [slug, letterId]);
  return null;
}
