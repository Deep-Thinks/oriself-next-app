"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LandingEnterLink } from "./landing-enter-link";

/**
 * Landing hero v2 · 会写字的刊头。
 *
 * 解决「点进来不知道是干啥」：刊头逐字写完自己 → 大标整体上移 → 浮出三幕体验预告
 * （这十分钟会怎么过、最后拿到什么）+ 域切换预期说明 + 每域 4 张自动轮播的范例。
 * 单栏、大标不缩；结构/动画样式在 globals.css 的 `.lh-*`。全程肯定句式。
 */

type Domain = "mbti" | "major";
type Variant = "letter" | "quote" | "indexed";

interface Example {
  variant: Variant;
  tag: string;
  titleLines?: string[];
  body: string;
  foot?: string;
}

const EXAMPLES: Record<Domain, Example[]> = {
  mbti: [
    {
      variant: "letter",
      tag: "INFP · 调停者",
      titleLines: ["把世界先在心里，", "悄悄活过一遍的人"],
      body: "你习惯把每个决定，先在想象里彩排到结局，再回到现实里轻轻落下那一子。这份温柔，既体贴世界，也护住自己。",
    },
    {
      variant: "quote",
      tag: "ENTJ · 指挥官",
      body: "你先把山顶画进眼里，再回头一段段修出上山的路。",
      foot: "于是别人还在掂量方向，你已经在铺第一级台阶。",
    },
    {
      variant: "indexed",
      tag: "ISFJ · 守护者",
      titleLines: ["把在意的人，记成一长串清单的人"],
      body: "谁怕冷、谁今天还没吃饭，你都记得。你的体贴，永远是具体的。",
    },
    {
      variant: "letter",
      tag: "ENFP · 探险家",
      titleLines: ["同时爱上十扇门，", "再认真推开一扇的人"],
      body: "你的热情来得又快又真，难的从来是取舍，而非热爱本身。",
    },
  ],
  major: [
    {
      variant: "quote",
      tag: "偏向 传播 / 社会学",
      body: "你想把一团混乱，讲成一个别人愿意听下去的故事。",
      foot: "这股「让人看懂」的劲，常领你走向人与叙事。",
    },
    {
      variant: "letter",
      tag: "偏向 数学 / 物理",
      titleLines: ["愿意为一行公式，", "失眠到天亮的人"],
      body: "你享受「卡住——再卡住——忽然通了」的过程，纯粹本身就是回报。",
    },
    {
      variant: "indexed",
      tag: "偏向 工业设计 / 机械",
      titleLines: ["想把脑子里的想法，捏成实物的人"],
      body: "屏幕里的东西让你不够满足，手要碰到真东西，心里才踏实。",
    },
    {
      variant: "quote",
      tag: "偏向 产品 / 认知科学",
      body: "你总站在人和系统中间，替两边把话翻译给对方听。",
      foot: "这份「居中调度」的本能，是产品与认知科学的底色。",
    },
  ],
};

const GLOSS: Record<Domain, string> = {
  mbti: "聊出你的 16 型人格，和它背后那个你",
  major: "看清你到底最想学什么，选择权一直在你手里",
};

const LINE1 = "从你说的话里，长出你自己本来的样子。";
const LINE2 = "聊十分钟，带走一封写给自己的信。";

const WORDMARK_STYLE: CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontVariationSettings: '"opsz" 144, "SOFT" 100, "WONK" 1',
  fontStyle: "italic",
  fontWeight: 400,
  fontSize: "clamp(78px, 12.5vw, 168px)",
  lineHeight: 0.92,
  letterSpacing: "-0.045em",
  margin: 0, // 清掉 h1 默认 0.67em 外边距，避免大标上下多余留白
};

const TYPE_LINE_STYLE: CSSProperties = {
  fontStyle: "italic",
  fontVariationSettings: '"opsz" 22, "SOFT" 50, "WONK" 0',
  fontSize: "clamp(16px, 2.4vw, 20px)",
  lineHeight: 1.7,
  margin: 0,
  minHeight: "1.7em",
};

function ExampleCard({ ex, domain }: { ex: Example; domain: Domain }) {
  const kicker = `本期范例 · ${domain === "mbti" ? "MBTI 人格" : "专业方向"}`;
  const title = ex.titleLines?.map((line, i) => (
    <span key={i}>
      {i > 0 ? <br /> : null}
      {line}
    </span>
  ));

  if (ex.variant === "quote") {
    return (
      <div className="lh-card lh-card-quote">
        <p className="lh-k">{kicker}</p>
        <p className="lh-cq">{ex.body}</p>
        {ex.foot ? <p className="lh-cf">{ex.foot}</p> : null}
        <p className="lh-cw" style={{ marginBottom: 0 }}>
          {ex.tag}
        </p>
      </div>
    );
  }
  if (ex.variant === "indexed") {
    return (
      <div className="lh-card lh-card-indexed">
        <p className="lh-k">{kicker}</p>
        <p className="lh-ct">{title}</p>
        <p className="lh-ce">{ex.body}</p>
        <p className="lh-cw" style={{ margin: "13px 0 0" }}>
          {ex.tag}
        </p>
      </div>
    );
  }
  return (
    <div className="lh-card lh-card-letter">
      <p className="lh-k">{kicker}</p>
      <p className="lh-ct">{title}</p>
      <p className="lh-cw">{ex.tag}</p>
      <p className="lh-ce">{ex.body}</p>
    </div>
  );
}

export function LandingHero() {
  const [t1, setT1] = useState("");
  const [t2, setT2] = useState("");
  const [cursorLine, setCursorLine] = useState<0 | 1 | 2>(1);
  const [lifted, setLifted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [started, setStarted] = useState(false);

  const [domain, setDomain] = useState<Domain>("mbti");
  const [idx, setIdx] = useState(0);
  const pausedRef = useRef(false);

  // 打字机 → 上移 → 浮出 → 启动轮播（尊重 reduced-motion：直接全显）
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setT1(LINE1);
      setT2(LINE2);
      setCursorLine(0);
      setLifted(true);
      setRevealed(true);
      setStarted(true);
      return;
    }

    const timers: number[] = [];
    const push = (fn: () => void, d: number) =>
      timers.push(window.setTimeout(fn, d));
    let i1 = 0;
    let i2 = 0;

    const finish = () => {
      setLifted(true);
      setRevealed(true);
      push(() => setCursorLine(0), 600);
      push(() => setStarted(true), 720);
    };
    const typeLine2 = () => {
      if (i2 < LINE2.length) {
        i2 += 1;
        setT2(LINE2.slice(0, i2));
        push(typeLine2, 72 + Math.random() * 60);
      } else {
        push(finish, 240);
      }
    };
    const typeLine1 = () => {
      if (i1 < LINE1.length) {
        i1 += 1;
        setT1(LINE1.slice(0, i1));
        push(typeLine1, 72 + Math.random() * 60);
      } else {
        setCursorLine(2);
        push(typeLine2, 430);
      }
    };
    push(typeLine1, 600);

    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  // 轮播：启动后每 3.8s 推进；域切换时重置并重启（鼠标悬停暂停）
  useEffect(() => {
    if (!started) return;
    setIdx(0);
    const id = window.setInterval(() => {
      if (!pausedRef.current) {
        setIdx((prev) => (prev + 1) % EXAMPLES[domain].length);
      }
    }, 3800);
    return () => clearInterval(id);
  }, [started, domain]);

  const list = EXAMPLES[domain];
  const safeIdx = idx % list.length;

  const revealStyle = (order: number): CSSProperties =>
    revealed ? { animationDelay: `${0.3 + order * 0.16}s` } : {};

  const cls = (_order: number) =>
    `lh-reveal${revealed ? " lh-shown" : ""}`;

  return (
    <section
      className="lh-hero relative z-10 flex-1 w-full flex flex-col items-center px-6"
    >
      <div className="text-center">
        <h1 className="text-ink animate-settle" style={WORDMARK_STYLE}>
          OriSelf
        </h1>
        <div className="mx-auto" style={{ maxWidth: 620, marginTop: 16 }}>
          <p style={TYPE_LINE_STYLE}>
            {t1}
            {cursorLine === 1 ? <span className="writing-cursor" /> : null}
          </p>
          <p style={{ ...TYPE_LINE_STYLE, color: "var(--ink-soft)", marginTop: 6 }}>
            {t2}
            {cursorLine === 2 ? <span className="writing-cursor" /> : null}
          </p>
        </div>
      </div>

      <div
        className={`lh-below ${lifted ? "lh-open" : ""}`}
        style={{ width: "100%", maxWidth: 540 }}
      >
        <div className="lh-below-inner">
          <p
            className={`${cls(0)} font-mono text-[10.5px] tracking-[0.18em] text-ink-muted text-center`}
            style={{ ...revealStyle(0), marginTop: 18 }}
          >
            用对话代替选择题
          </p>

          <section
            className={cls(1)}
            style={{ ...revealStyle(1), width: "100%", maxWidth: 440, marginTop: 18 }}
          >
            <p className="fraunces-body-soft italic text-[15px] text-ink-soft text-center mb-4">
              接下来这十分钟，大概会这样展开 ——
            </p>
            <ol className="lh-acts">
              {[
                ["01", "它先递来一个问题", "像写信一样一来一回，你只管说想说的。"],
                ["02", "越聊越贴着你", "每个追问都顺着你上一句长出来，越聊越准。"],
                ["03", "收一封写给自己的信", "一份人格画像落成，存得下也分享得出去。"],
              ].map(([n, t, d]) => (
                <li key={n}>
                  <span className="lh-num">{n}</span>
                  <span>
                    <span className="fraunces-body block text-[16px] text-ink leading-tight">
                      {t}
                    </span>
                    <span className="fraunces-body-soft block text-[12.5px] text-ink-soft leading-snug mt-[3px]">
                      {d}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <div
            className={`${cls(2)} flex flex-col items-center gap-[14px]`}
            style={{ ...revealStyle(2), marginTop: 18 }}
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDomain("mbti")}
                className={`font-mono text-[11px] tracking-wide transition-colors duration-300 ${
                  domain === "mbti"
                    ? "text-accent border-b border-accent pb-0.5"
                    : "text-ink-muted hover:text-ink-soft"
                }`}
              >
                MBTI 人格
              </button>
              <span className="text-ink-muted opacity-40 select-none">·</span>
              <button
                type="button"
                onClick={() => setDomain("major")}
                className={`font-mono text-[11px] tracking-wide transition-colors duration-300 ${
                  domain === "major"
                    ? "text-accent border-b border-accent pb-0.5"
                    : "text-ink-muted hover:text-ink-soft"
                }`}
              >
                专业方向
              </button>
            </div>

            <p
              className="fraunces-body-soft italic text-[13px] text-ink-muted text-center"
              style={{ minHeight: "1.5em" }}
            >
              {GLOSS[domain]}
            </p>

            <LandingEnterLink
              domain={domain}
              className="inline-block fraunces-body-soft italic text-accent text-[18px] border-b border-accent pb-1 transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-accent-soft hover:border-accent-soft"
            >
              开始写我的那一封 →
            </LandingEnterLink>
          </div>

          <div
            className={`${cls(3)} w-full flex flex-col items-center`}
            style={{ ...revealStyle(3), marginTop: 18 }}
            onMouseEnter={() => (pausedRef.current = true)}
            onMouseLeave={() => (pausedRef.current = false)}
          >
            <div className="lh-stage">
              <ExampleCard ex={list[safeIdx]} domain={domain} />
            </div>
            <div className="flex gap-[9px] justify-center mt-5">
              {list.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`范例 ${i + 1}`}
                  onClick={() => setIdx(i)}
                  className={`lh-dot${i === safeIdx ? " lh-dot-on" : ""}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
