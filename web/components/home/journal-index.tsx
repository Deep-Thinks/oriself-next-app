import { ArchiveDrawer } from "./archive-drawer";
import { Postcards } from "./postcards";

/**
 * 首页 · 目录页（第二屏）。
 *
 * 两件实物撑起整页：十六型索引卡抽屉（真能拨动、单张抽出）+
 * 专栏两张明信片（方法论 / 公开画廊）。文字内容全部 SSR 可收录；
 * 交互细节分别见 archive-drawer.tsx 与 postcards.tsx。
 */
export function JournalIndex() {
  return (
    <section
      id="contents"
      aria-label="目录"
      className="w-full px-6 sm:px-8 pt-24 pb-28"
    >
      <div className="max-w-[880px] mx-auto">
        <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-accent text-center">
          目录 · Contents
        </p>
        <p className="fraunces-body-soft italic text-[14px] text-ink-soft text-center mt-4">
          正文之外，这一期还备了几页。
        </p>

        {/* 档案抽屉 · 十六型人格（标签牌自带栏目名，不再另起眉题） */}
        <ArchiveDrawer />

        {/* 专栏 · 两张明信片 */}
        <div className="mt-20">
          <p className="font-mono text-[9.5px] tracking-[0.2em] uppercase text-ink-muted mb-4">
            专栏 · 两张明信片
          </p>
          <Postcards />
        </div>
      </div>
    </section>
  );
}
