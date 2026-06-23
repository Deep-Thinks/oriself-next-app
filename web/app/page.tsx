import Link from "next/link";
import { LandingHero } from "@/components/home/landing-hero";
import { RecentLetters } from "@/components/home/recent-letters";
import { APP_VERSION, getServerVersion } from "@/lib/version";

/**
 * Landing · 作品集风格 + 会写字的刊头（v2）。
 *
 * 首屏交给 <LandingHero>：刊头逐字写完自己 → 大标上移 → 浮出体验预告与范例轮播，
 * 让初来者清楚「这是什么、会怎么过、能带走什么」。下方保留最近信件与版权页脚。
 */
export default async function LandingPage() {
  const serverVersion = await getServerVersion();
  return (
    <main className="relative z-10 flex flex-col">
      {/* 首屏：单栏大标上移 + 三幕预告 + 范例轮播 */}
      <LandingHero />

      {/* Recent letters · local-only, shown only if there are entries */}
      <RecentLetters />

      {/* Colophon — barely visible, edge of the page */}
      <footer className="px-6 sm:px-8 pb-16 sm:pb-8 pt-16">
        <div className="max-w-[1200px] mx-auto flex flex-wrap justify-between items-baseline gap-y-3 gap-x-6 font-mono text-[10px] tracking-widest uppercase text-ink-muted">
          <span>
            {`OriSelf · Issue 04 · web v${APP_VERSION}${
              serverVersion ? ` · server v${serverVersion}` : ""
            }`}
          </span>
          <div className="flex items-baseline gap-[14px]">
            {/* 公开画廊弱内链（Next Link，内部无 ↗）；样式与外链同级，不抢 accent 预算 */}
            <Link
              href="/issues"
              className="hover:text-accent transition-colors"
              aria-label="公开画廊"
            >
              公开画廊
            </Link>
            <span aria-hidden className="opacity-40">
              ·
            </span>
            <a
              href="https://github.com/Deep-Thinks/oriself-next"
              className="hover:text-accent transition-colors"
              target="_blank"
              rel="noopener"
              aria-label="Skill 仓库 · GitHub"
            >
              Skill ↗
            </a>
            <span aria-hidden className="opacity-40">
              ·
            </span>
            <a
              href="https://github.com/Deep-Thinks/oriself-next-app"
              className="hover:text-accent transition-colors"
              target="_blank"
              rel="noopener"
              aria-label="App 仓库 · GitHub"
            >
              App ↗
            </a>
            <span aria-hidden className="opacity-40">
              ·
            </span>
            <span>Apache 2.0</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
