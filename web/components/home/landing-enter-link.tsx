"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

interface Props {
  children: React.ReactNode;
  className?: string;
}

/**
 * Landing 进入 → 入口 · v2.7 A-6 漏斗埋点。
 *
 * 把 page.tsx 入口的 <Link> 包成 client 组件，仅为加 onClick 埋点；
 * 其他视觉 / SSR 行为保持不变。
 */
export function LandingEnterLink({ children, className }: Props) {
  return (
    <Link
      href="/letters/new"
      onClick={() => trackEvent("landing_enter_clicked")}
      className={className}
    >
      {children}
    </Link>
  );
}
