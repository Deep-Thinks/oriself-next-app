import type { Metadata } from "next";
import Link from "next/link";
import { TYPE_ORDER, TYPE_PROFILES } from "@/lib/type-profiles";

/**
 * /types · 档案索引（十六型人格）。
 *
 * 与首页目录同一套点线 Contents 语言；每型多给一行 mono 别名，
 * 作为 /types/:type 的登载目录。纯静态。
 */

export const metadata: Metadata = {
  title: "档案 · 十六型人格",
  description:
    "MBTI 十六型人格档案：INFP、INFJ、INTJ、ENFP……每一型先从一句话认识起——它如何看世界、如何落决定，以及常被误读的地方。",
  alternates: { canonical: "/types" },
};

export default function TypesIndexPage() {
  return (
    <main className="relative z-10 min-h-screen px-6 sm:px-8 py-24">
      <div className="max-w-[560px] mx-auto">
        <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-accent text-center">
          档案 · 十六型人格
        </p>
        <h1 className="fraunces-body italic text-ink text-center font-normal mt-6 mb-4 text-[clamp(26px,4.5vw,36px)] leading-snug">
          每一型，都先从一句话认识起
        </h1>
        <p className="fraunces-body-soft italic text-[14px] text-ink-soft text-center mb-14">
          写的是一类人的轮廓，读的时候请只对号，别入座。
        </p>

        <ul className="list-none m-0 p-0 border-t border-rule">
          {TYPE_ORDER.map((id) => {
            const t = TYPE_PROFILES[id];
            return (
              <li key={id}>
                <Link
                  href={`/types/${id}`}
                  className="group block py-[18px] no-underline border-b border-rule"
                >
                  <span className="flex items-baseline gap-4">
                    <span className="fraunces-body italic text-[17px] leading-snug text-ink group-hover:text-accent transition-colors duration-300">
                      {t.epithetLines.join("")}
                    </span>
                    <span aria-hidden className="toc-leader" />
                    <span className="flex-none font-mono text-[10px] tracking-[0.18em] text-ink-muted group-hover:text-accent transition-colors duration-300">
                      {t.code}
                    </span>
                  </span>
                  <span className="block font-mono text-[10px] tracking-[0.16em] text-ink-muted mt-[6px]">
                    № {t.no} · {t.alias}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-16 flex items-baseline gap-5 font-mono text-[10px] tracking-widest uppercase text-ink-muted">
          <Link href="/about" className="hover:text-accent transition-colors">
            方法论
          </Link>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <Link href="/" className="hover:text-accent transition-colors">
            ← OriSelf
          </Link>
        </div>
      </div>
    </main>
  );
}
