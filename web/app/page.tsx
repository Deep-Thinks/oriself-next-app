import { DomainToggle } from "@/components/home/domain-toggle";
import { RecentLetters } from "@/components/home/recent-letters";
import { APP_VERSION, getServerVersion } from "@/lib/version";

/**
 * Landing · 作品集风格。
 *
 * 不卖。当成一个作品。一个名字、一行版权页式注释、一个入口。
 * 没有 hero 广告语、没有"发生什么"分段、没有 CTA 文案动员。
 */
export default async function LandingPage() {
  const serverVersion = await getServerVersion();
  return (
    <main className="relative z-10 min-h-screen flex flex-col">
      {/* Hero — single word, monumental */}
      <section className="flex-1 flex flex-col items-center justify-center px-6">
        {/* The name. That's it. */}
        <h1
          className="text-ink text-center"
          style={{
            fontFamily: "var(--font-serif)",
            fontVariationSettings: '"opsz" 144, "SOFT" 100, "WONK" 1',
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: "clamp(96px, 18vw, 220px)",
            lineHeight: 0.92,
            letterSpacing: "-0.045em",
          }}
        >
          OriSelf
        </h1>

        {/* Catalogue note · masthead style */}
        <p className="fraunces-body-soft italic text-[17px] leading-[1.55] text-ink-soft mt-10 text-center max-w-[520px]">
          原自我 · 从你说的话里，长出你自己本来的样子
        </p>

        {/* 期望管理小字 · 告诉用户能拿到什么（Probe 反馈 #6/#14/#19/#21 都误以为是占卜/MBTI 测验）
            注：tracking-widest+uppercase 是英文栏目标签风，中文长句不适用，降到 tracking-wide；
            加 max-w + leading-relaxed + px 兜底移动端中文换行。 */}
        <p className="font-mono text-[10px] tracking-wide text-ink-muted mt-6 text-center max-w-[520px] leading-relaxed px-6">
          聊 10 分钟，留下一封写给自己的信，在下方选择测试类型↓
        </p>

        {/* Entry — 域切换（MBTI / 专业方向）+ 进入入口
            v2.7 A-6 埋点 · major 域切换 */}
        <DomainToggle />
      </section>

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
