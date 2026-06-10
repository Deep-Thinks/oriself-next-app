"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

interface Props {
  children: React.ReactNode;
  className?: string;
  domain?: "mbti" | "major";
}

/**
 * Landing 进入 → 入口 · v2.7 A-6 漏斗埋点。
 *
 * 把 page.tsx 入口的 <Link> 包成 client 组件，仅为加 onClick 埋点；
 * domain="major" 时跳 /letters/new?domain=major（Server Component 透传给 createLetter）。
 */
export function LandingEnterLink({ children, className, domain = "mbti" }: Props) {
  const href = domain === "major" ? "/letters/new?domain=major" : "/letters/new";
  return (
    <Link
      href={href}
      // /letters/new 是带副作用的 GET（渲染即 createLetter 落一行 test_sessions）；
      // 关预取避免 hover/进视口就造孤儿会话（Task 3.1 的统一防线，这枚入口先就位）。
      prefetch={false}
      onClick={() => trackEvent("landing_enter_clicked", { domain })}
      className={className}
    >
      {children}
    </Link>
  );
}
