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
      onClick={() => trackEvent("landing_enter_clicked")}
      className={className}
    >
      {children}
    </Link>
  );
}
