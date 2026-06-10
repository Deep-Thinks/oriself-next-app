/**
 * 漏斗埋点客户端 · v2.7 A-6
 *
 * 设计：fire-and-forget，失败静默——埋点不能阻塞用户操作。
 *
 * 白名单事件由后端 `routes/analytics.py::ALLOWED_EVENTS` 校验；
 * 这里的 TS 类型只是开发期提示，运行时由后端拒收 unknown event。
 *
 * 不引入任何第三方 SDK，不做批量缓冲——v2.7 只是要"从今天开始有漏斗"，
 * 不是做增长分析平台。
 */

export type AnalyticsEvent =
  | "landing_enter_clicked"
  | "letter_created"
  | "round_reached"
  | "converge_clicked"
  | "converge_result_success"
  | "converge_result_failed"
  | "issue_opened"
  | "arrival_dismissed"
  | "link_copied" // §P4 · 报告页复制分享地址（可发现性验证）
  | "new_letter_from_issue" // Batch 2 · 接收者从报告页点「写一封自己的」
  | "issue_published" // Batch 2 · 本人把报告公开到画廊
  | "share_card_opened"; // Task 4.2 · owner 打开竖版分享图（朋友圈/小红书弱入口）

export function trackEvent(
  event: AnalyticsEvent,
  props?: Record<string, unknown>,
  sessionId?: string,
): void {
  if (typeof window === "undefined") return;
  // 走 Next rewrite /api/* 反代到后端；与 lib/api.ts 一致
  void fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // 跳页 / 关 tab 时仍要把请求发出去（Beacon-like 行为）
    keepalive: true,
    body: JSON.stringify({
      event,
      props: props ?? null,
      session_id: sessionId ?? null,
    }),
  }).catch(() => {
    // 静默 · 不阻塞 / 不报错给用户
  });
}
