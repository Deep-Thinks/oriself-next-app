import Link from "next/link";
import type { Metadata } from "next";
import { listPublicIssues } from "@/lib/api";

/**
 * 公开命题画廊 · /issues
 *
 * 只列出作者主动「公开到画廊」的命题（issue_is_public=1）。Server Component → SSR
 * 文本可被收录，承接长尾词并做站内互链。视觉沿用首页「最近信件」的目录册语言。
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "公开命题 · 画廊",
  description:
    "OriSelf 上由作者公开的人格命题选集 —— 对话式人格画像、自我认知、MBTI。",
  alternates: { canonical: "/issues" },
  robots: { index: true, follow: true },
};

export default async function GalleryPage() {
  const issues = await listPublicIssues();
  return (
    <main className="relative z-10 min-h-screen flex flex-col items-center px-6 py-24">
      <h1
        className="text-ink text-center fraunces-body italic"
        style={{ fontSize: "clamp(40px, 7vw, 72px)", letterSpacing: "-0.03em" }}
      >
        公开命题
      </h1>
      <p className="font-mono text-[10px] tracking-widest uppercase text-ink-muted mt-6 mb-14">
        由作者选择公开 · 对话式人格画像
      </p>

      {issues.length === 0 ? (
        <p className="fraunces-body-soft italic text-[17px] text-ink-soft">
          还没有公开的命题。
        </p>
      ) : (
        <ul className="w-full max-w-[620px] space-y-5">
          {issues.map((i) => (
            <li key={i.slug} className="border-b border-rule pb-4">
              <Link href={`/issues/${i.slug}`} className="group block no-underline">
                <div className="flex items-baseline gap-3">
                  {i.domain === "major" ? (
                    <span className="fraunces-body italic text-[13px] text-accent">
                      {i.result_label ?? "专业方向"}
                    </span>
                  ) : (
                    <span className="font-mono text-[12px] tracking-[0.18em] text-accent">
                      {i.mbti_type}
                    </span>
                  )}
                </div>
                <p className="fraunces-body italic text-[17px] leading-snug text-ink mt-[6px] truncate group-hover:text-accent transition-colors duration-300">
                  {i.title}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/"
        className="font-mono text-[10px] tracking-widest uppercase text-ink-muted hover:text-accent transition-colors mt-20"
      >
        ← OriSelf
      </Link>
    </main>
  );
}
