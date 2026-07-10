import Link from "next/link";
import { JsonLd } from "@/components/seo/json-ld";
import { JournalIndex } from "@/components/home/journal-index";
import { LandingHero } from "@/components/home/landing-hero";
import { RecentLetters } from "@/components/home/recent-letters";
import { SITE_URL } from "@/lib/site";
import { APP_VERSION, getServerVersion } from "@/lib/version";

/**
 * Landing · 作品集风格 + 会写字的刊头（v2）。
 *
 * 首屏交给 <LandingHero>：刊头逐字写完自己 → 大标上移 → 浮出体验预告与范例轮播，
 * 让初来者清楚「这是什么、会怎么过、能带走什么」。折叠首屏仍保持 16:9 一屏
 * （hero + 信匣 tab + 目录暗号）；往下翻是目录页（档案/专栏），页脚移到文末——
 * 印刷刊物的版权页本来就在最后。
 */
export default async function LandingPage() {
  const serverVersion = await getServerVersion();
  return (
    <main className="relative z-10 min-h-screen flex flex-col">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              "@id": `${SITE_URL}/#website`,
              url: SITE_URL,
              name: "OriSelf",
              alternateName: "原自我",
              description:
                "免费、无需注册的对话式 MBTI / 16 型人格测试：不做选择题，和 AI 像写信一样聊十分钟，收到一封写给你的人格画像。",
              inLanguage: "zh-CN",
            },
            {
              "@type": "WebApplication",
              "@id": `${SITE_URL}/#app`,
              url: SITE_URL,
              name: "OriSelf",
              applicationCategory: "LifestyleApplication",
              operatingSystem: "Web",
              inLanguage: "zh-CN",
              isAccessibleForFree: true,
              offers: { "@type": "Offer", price: "0", priceCurrency: "CNY" },
              description:
                "对话式人格画像：通过 6–30 轮 AI 对话生成 MBTI 人格或专业方向报告，开源（Apache 2.0）。",
            },
          ],
        }}
      />

      {/* 第一屏 · 折叠态一屏（hero 弹性占满；信匣 tab 与目录暗号落底） */}
      <div className="flex flex-col" style={{ minHeight: "100svh" }}>
        <LandingHero />

        {/* Recent letters · local-only, shown only if there are entries */}
        <RecentLetters />

        {/* 目录暗号 · 与信匣 tab 同一 register 的一行 mono，提示下面还有几页 */}
        <div className="text-center pb-5">
          <a
            href="#contents"
            className="font-mono text-[10px] tracking-widest uppercase text-ink-muted hover:text-accent transition-colors no-underline"
          >
            目录 ↓
          </a>
        </div>
      </div>

      {/* 第二屏 · 目录页（档案 × 十六型人格 / 专栏） */}
      <JournalIndex />

      {/* Colophon — barely visible, edge of the page */}
      <footer className="px-6 sm:px-8 pb-3 pt-3">
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
