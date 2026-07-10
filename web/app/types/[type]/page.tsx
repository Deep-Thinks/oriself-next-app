import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LandingEnterLink } from "@/components/home/landing-enter-link";
import { JsonLd } from "@/components/seo/json-ld";
import { TYPE_ORDER, TYPE_PROFILES } from "@/lib/type-profiles";
import { SITE_URL } from "@/lib/site";

/**
 * /types/:type · 档案页（十六型人格 · 首批四型）。
 *
 * 一页刊物档案：mono 眉题 + 信的题眼作大标 + 信体正文；
 * 「常被误读」「分野」承接搜索长尾，「在对话里」把读者接回产品。
 * 内容单一事实源在 lib/type-profiles.ts，本文件只管排版。
 * 纯静态（SSG），dynamicParams=false：未刊出的类型 404。
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return TYPE_ORDER.map((type) => ({ type }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}): Promise<Metadata> {
  const { type } = await params;
  const t = TYPE_PROFILES[type];
  if (!t) return {};
  return {
    title: `${t.code}「${t.alias}」——${t.epithetLines.join("")}`,
    description: t.seoDescription,
    alternates: { canonical: `/types/${type}` },
    openGraph: {
      type: "article",
      url: `/types/${type}`,
      title: `${t.code} · ${t.epithetLines.join("")}`,
      description: t.definition,
    },
  };
}

/** mono 眉题 —— 档案页的小节标题都走这一款（语义上是 h2，视觉上极安静） */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[10px] tracking-[0.22em] uppercase text-accent font-normal mt-14 mb-5">
      {children}
    </h2>
  );
}

export default async function TypeArchivePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  const t = TYPE_PROFILES[type];
  if (!t) notFound();
  const others = TYPE_ORDER.filter((id) => id !== type);

  return (
    <main className="relative z-10 min-h-screen px-6 sm:px-8 py-20">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Article",
              "@id": `${SITE_URL}/types/${type}#article`,
              headline: `${t.code}「${t.alias}」——${t.epithetLines.join("")}`,
              description: t.definition,
              inLanguage: "zh-CN",
              author: { "@type": "Organization", name: "OriSelf" },
              publisher: { "@type": "Organization", name: "OriSelf", url: SITE_URL },
              mainEntityOfPage: `${SITE_URL}/types/${type}`,
            },
            {
              "@type": "FAQPage",
              mainEntity: t.faq.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            },
          ],
        }}
      />

      <article className="max-w-[620px] mx-auto">
        {/* 档案眉头 */}
        <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-accent">
          档案 · 十六型人格 · № {t.no}
        </p>

        <h1
          className="text-ink mt-7"
          style={{
            fontVariationSettings: '"opsz" 60, "SOFT" 100, "WONK" 1',
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: "clamp(30px, 5.6vw, 44px)",
            lineHeight: 1.24,
            letterSpacing: "-0.02em",
            margin: 0,
            marginTop: 28,
          }}
        >
          {t.epithetLines.map((line, i) => (
            <span key={i}>
              {i > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </h1>

        <p className="font-mono text-[11px] tracking-[0.2em] text-ink-muted mt-5">
          {t.code} · {t.alias}
        </p>

        {/* 定义段 · 全篇唯一一段「说明书口吻」，也是给 AI 引擎的引用位 */}
        <p className="fraunces-body text-[16px] leading-[1.85] text-ink border-t border-rule mt-9 pt-8">
          {t.definition}
        </p>

        <Eyebrow>TA 的里子</Eyebrow>
        {t.portrait.map((p, i) => (
          <p
            key={i}
            className="fraunces-body-soft text-[15px] leading-[1.9] text-ink-soft mb-5"
          >
            {p}
          </p>
        ))}

        <Eyebrow>常被误读的地方</Eyebrow>
        <ul className="list-none m-0 p-0">
          {t.misread.map((m, i) => (
            <li key={i} className="border-t border-rule py-5">
              <p className="fraunces-body italic text-[15.5px] text-ink m-0">
                「{m.claim}」
              </p>
              <p className="fraunces-body-soft text-[14px] leading-[1.85] text-ink-soft mt-2 mb-0">
                {m.truth}
              </p>
            </li>
          ))}
        </ul>

        <Eyebrow>分野</Eyebrow>
        {t.contrast.map((c, i) => (
          <div key={i} className="mb-7">
            <p className="font-mono text-[11px] tracking-[0.18em] text-ink-muted m-0">
              {t.code} × {c.vs}
            </p>
            <p className="fraunces-body-soft text-[15px] leading-[1.9] text-ink-soft mt-2 mb-0">
              {c.text}
            </p>
          </div>
        ))}

        <Eyebrow>在一场对话里，它长这样</Eyebrow>
        <p className="fraunces-body-soft text-[15px] leading-[1.9] text-ink-soft">
          {t.inConversation}
        </p>

        <Eyebrow>几个常被问起的问题</Eyebrow>
        <dl className="m-0">
          {t.faq.map((f, i) => (
            <div key={i} className="border-t border-rule py-5">
              <dt className="fraunces-body italic text-[15.5px] text-ink">
                {f.q}
              </dt>
              <dd className="fraunces-body-soft text-[14px] leading-[1.85] text-ink-soft mt-2 ml-0">
                {f.a}
              </dd>
            </div>
          ))}
        </dl>

        {/* 收信口 · 沿用范例轮播的信笺卡语言 */}
        <div className="lh-card lh-card-letter mt-16" style={{ transform: "rotate(-0.6deg)" }}>
          <p className="lh-k">写一封自己的</p>
          <p className="lh-ct">读到这里的样子，未必是你的样子。</p>
          {/* 中文段落一律单行字符串：JSX 源码换行会渲染成半角空格 */}
          <p className="lh-ce">
            {"档案写的是一类人的轮廓；你的那封信，得由你亲口说出来。聊十分钟，看看对话里长出来的你，和这一页差多远。"}
          </p>
          <p style={{ margin: "18px 0 0" }}>
            {/* /letters/new 是带副作用的 GET —— 复用 LandingEnterLink（prefetch=false + 埋点） */}
            <LandingEnterLink
              domain="mbti"
              className="fraunces-body-soft italic text-accent text-[16px] border-b border-accent pb-0.5 no-underline hover:text-accent-soft hover:border-accent-soft transition-colors duration-300"
            >
              开始写我的那一封 →
            </LandingEnterLink>
          </p>
        </div>

        {/* 档案间互链 + 返航 */}
        <nav
          aria-label="其他档案"
          className="mt-16 pt-5 border-t border-rule flex flex-wrap items-baseline gap-x-5 gap-y-3 font-mono text-[10px] tracking-widest uppercase text-ink-muted"
        >
          <span className="text-ink-muted">其他档案</span>
          {others.map((id) => (
            <Link
              key={id}
              href={`/types/${id}`}
              className="hover:text-accent transition-colors"
            >
              {TYPE_PROFILES[id].code}
            </Link>
          ))}
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <Link href="/about" className="hover:text-accent transition-colors">
            方法论
          </Link>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <Link href="/" className="hover:text-accent transition-colors">
            ← OriSelf
          </Link>
        </nav>
      </article>
    </main>
  );
}
