"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FeedbackSheet } from "@/components/feedback/feedback-sheet";
import { AuthorModal } from "@/components/primitives/author-modal";
import { PublishToggle } from "@/components/issue/publish-toggle";
import { findByIssueSlug, isOwnerOf } from "@/lib/history";
import { trackEvent } from "@/lib/analytics";
import { buildShareText } from "@/lib/share";

interface Props {
  slug: string;
  /** Batch 2（受众分流）：接收者 CTA 跳 /letters/new?domain=… 时透传。 */
  domain?: string;
  /** Batch 2（分享文案）：复制地址时用 buildShareText 把标题写进分享文本。 */
  title: string;
}

/**
 * Issue chrome · 报告页底部一条克制的工具栏。
 *
 * 设计：
 *  - 默认半透明、几乎贴底、文字而非图标，让 iframe 内的报告本身是视觉主角。
 *  - 层级（P4）：accent 预算 = 恰好 1 个 primary；按受众分流谁来持有这唯一的 accent：
 *      · owner（本人，本地有此信）：复制地址 = accent primary（分享是拉新主杠杆）。
 *      · receiver（被分享者，已持链接）：复制地址对其无意义，唯一转化是「写一封自己的」
 *        → 这枚 <Link> 接管 accent primary；复制地址降为弱文本链接（再转发仍有价值）。
 *      · 判定未完成（null）：渲染中性弱占位，绝不默认 owner 版再翻转——避免接收者侧 hydration 闪变。
 *    反馈/导航始终是弱文本链接，不参与 accent 预算。
 *  - 包含：← 首页 · 回看(owner) · 再写一封(owner) · 公开到画廊(仅本人) · AUTHOR · primary(分流) · 反馈
 *  - 访问模型是 capability-URL：slug 即钥匙；报告默认私有(noindex)，本人凭 owner_token
 *    主动「公开到画廊」才放开收录（PublishToggle —— 仅持本地 owner_token 的本人可见）。
 */
export function IssueChrome({ slug, domain, title }: Props) {
  const [copied, setCopied] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [authorOpen, setAuthorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // D-A：letter_id 不再走公开 API。owner 态（含「回看」入口）由本地历史按 slug 反查。
  // localStorage 只能在客户端读 → useState+useEffect 保证 SSR 期不读、避免 hydration 失配。
  // isOwner === null 表示判定未完成（同步 localStorage 读，快设备上只是 hydration 前一瞬）。
  const [letterId, setLetterId] = useState<string | undefined>(undefined);
  const [isOwner, setIsOwner] = useState<boolean | null>(null); // null = 判定未完成
  useEffect(() => {
    // isOwnerOf 内部已幂等消费 #claim=（微信认领链接）并统一 owner 判定。
    setIsOwner(isOwnerOf(slug));
    setLetterId(findByIssueSlug(slug)?.letterId);
  }, [slug]);

  const handleCopyLink = useCallback(async () => {
    try {
      const url =
        typeof window !== "undefined"
          ? `${window.location.origin}/issues/${slug}`
          : `/issues/${slug}`;
      // 微信对话不渲染 OG 卡：粘贴出来的纯文本就是「分享卡」→ 复制带标题钩子的两行文本。
      await navigator.clipboard.writeText(buildShareText(title, url));
      setCopied(true);
      // §P4 · 复制分享地址埋点（可发现性 / 拉新验证）
      trackEvent("link_copied", { slug, letter_id: letterId }, letterId);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("复制失败");
    }
  }, [slug, letterId, title]);

  return (
    <>
      <div
        className="fixed left-0 right-0 bottom-0 z-30 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(245, 240, 230, 0.99) 0%, rgba(245, 240, 230, 0.86) 60%, rgba(245, 240, 230, 0))",
        }}
      >
        <nav
          className="pointer-events-auto max-w-[920px] mx-auto px-4 sm:px-6 py-3.5 sm:py-4 flex flex-wrap items-center justify-between gap-x-4 sm:gap-x-6 gap-y-2 font-mono text-[10px] tracking-widest uppercase text-ink-muted"
          aria-label="报告操作"
        >
          {/* 左：导航 + 作者入口 */}
          <div className="flex items-center flex-wrap gap-x-4 sm:gap-x-5 gap-y-1">
            <Link
              href="/"
              className="hover:text-accent transition-colors"
              aria-label="返回首页"
            >
              ← 首页
            </Link>
            {letterId && (
              <Link
                href={`/letters/${letterId}`}
                className="hover:text-accent transition-colors"
                aria-label="回看这封信的对话"
              >
                ← 回看
              </Link>
            )}
            {/* 「再写一封」仅 owner 可见；判定未完成(null)也不渲染，避免接收者侧闪现。
                /letters/new 是有副作用的 GET（render 时建 test_sessions 行）→ prefetch={false} 防孤儿信。 */}
            {isOwner === true && (
              <Link
                href="/letters/new"
                prefetch={false}
                className="text-ink-soft hover:text-accent transition-colors"
                aria-label="开始一封新的信"
              >
                再写一封 →
              </Link>
            )}
            <button
              type="button"
              onClick={() => setAuthorOpen(true)}
              className="hover:text-accent transition-colors bg-transparent border-0 p-0"
              aria-label="关于作者"
            >
              AUTHOR
            </button>
            {/* 公开到画廊 · 仅持本地 owner_token 的本人可见，作为弱文本链接（不抢 accent 预算） */}
            <PublishToggle slug={slug} />
          </div>

          {/* 右：primary（按受众分流持有唯一 accent） · 反馈 */}
          <div className="flex items-center flex-wrap gap-x-3 sm:gap-x-4 gap-y-2">
            {/* 受众分流 · accent 预算恒为 1：仅由当前态决定谁是 accent primary。
                两侧受众都只经历「弱→强」，绝不经历「错的 primary→对的 primary」翻转。 */}
            {isOwner === null ? (
              // 判定未完成：中性弱占位（feedback-button 风格，无 accent 边框）。
              // reserve min-width 避免判定落地时布局跳动。
              <button
                type="button"
                onClick={handleCopyLink}
                aria-label="复制这封信的地址"
                title="复制这封信的地址"
                className="group inline-flex items-center justify-center gap-[6px] min-w-[88px] text-ink-muted hover:text-accent transition-colors normal-case tracking-[0.08em] text-[11px] cursor-pointer bg-transparent border-0 p-0"
              >
                <span className="fraunces-body italic">
                  {copied ? "已抄下" : "复制地址"}
                </span>
                <span
                  aria-hidden
                  className="font-mono text-[12px] leading-none not-italic"
                >
                  {copied ? "✓" : "⎘"}
                </span>
              </button>
            ) : isOwner ? (
              // OWNER · 复制地址 = accent primary（分享是拉新主杠杆，视觉权重最高）
              <button
                type="button"
                onClick={handleCopyLink}
                aria-label="复制这封信的地址"
                className="group inline-flex items-center gap-[6px] border border-accent/70 rounded-[2px] px-[10px] py-[5px] normal-case tracking-[0.04em] transition-colors hover:border-accent hover:bg-accent/5"
                title="复制这封信的地址，分享给想看的人"
              >
                <span
                  className={`fraunces-body italic text-[11px] transition-colors ${
                    copied ? "text-accent" : "text-accent group-hover:text-accent"
                  }`}
                >
                  {copied ? "已抄下" : "复制地址"}
                </span>
                <span
                  aria-hidden
                  className="font-mono text-[12px] leading-none not-italic text-accent transition-colors"
                >
                  {copied ? "✓" : "⎘"}
                </span>
              </button>
            ) : (
              // RECEIVER · 「写一封自己的」接管 accent primary；复制地址降为弱文本链接（再转发仍有价值）
              <>
                <Link
                  href={`/letters/new?domain=${domain ?? "mbti"}&from=${slug}`}
                  prefetch={false}
                  onClick={() =>
                    trackEvent("new_letter_from_issue", { slug, domain })
                  }
                  aria-label="也写一封写给自己的信"
                  title="也写一封写给自己的信"
                  className="group inline-flex items-center gap-[6px] border border-accent/70 rounded-[2px] px-[10px] py-[5px] normal-case tracking-[0.04em] transition-colors hover:border-accent hover:bg-accent/5"
                >
                  <span className="fraunces-body italic text-[11px] text-accent transition-colors">
                    写一封自己的
                  </span>
                  <span
                    aria-hidden
                    className="font-mono text-[12px] leading-none not-italic text-accent transition-colors"
                  >
                    →
                  </span>
                </Link>
                {/* 复制地址降为弱文本链接：接收者再转发仍有价值，但不抢 accent */}
                <button
                  type="button"
                  onClick={handleCopyLink}
                  aria-label="复制这封信的地址"
                  title="复制这封信的地址"
                  className="group inline-flex items-center gap-[6px] text-ink-muted hover:text-accent transition-colors normal-case tracking-[0.08em] text-[11px] cursor-pointer bg-transparent border-0 p-0"
                >
                  <span className="fraunces-body italic">
                    {copied ? "已抄下" : "复制地址"}
                  </span>
                  <span
                    aria-hidden
                    className="font-mono text-[12px] leading-none not-italic"
                  >
                    {copied ? "✓" : "⎘"}
                  </span>
                </button>
              </>
            )}
            {/* P4 · 反馈降为弱文本链接（此前是最显眼按钮，造成「反馈>分享」层级倒置） */}
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              className="group inline-flex items-center gap-[6px] text-ink-muted hover:text-accent transition-colors normal-case tracking-[0.08em] text-[11px] cursor-pointer bg-transparent border-0 p-0"
              aria-label="对这封信提反馈"
              title="对这封信说一句（匿名，1 分钟就好）"
            >
              <span aria-hidden className="font-mono text-[12px] leading-none">
                ✎
              </span>
              {/* 窄屏缩为"反馈"，sm+ 展开为"对这封信说一句" */}
              <span className="fraunces-body italic">
                <span className="sm:hidden">反馈</span>
                <span className="hidden sm:inline">对这封信说一句</span>
              </span>
            </button>
          </div>

          {error && (
            <p className="basis-full text-accent normal-case tracking-normal">
              {error}
            </p>
          )}
        </nav>
      </div>

      <FeedbackSheet
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        letterId={letterId}
        issueSlug={slug}
      />

      <AuthorModal open={authorOpen} onClose={() => setAuthorOpen(false)} />
    </>
  );
}
