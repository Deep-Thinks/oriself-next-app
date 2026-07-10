import type { Metadata } from "next";
import Link from "next/link";
import { LandingEnterLink } from "@/components/home/landing-enter-link";
import { JsonLd } from "@/components/seo/json-ld";
import { SITE_URL } from "@/lib/site";

/**
 * /about · 专栏 · 方法论：为什么用对话，不用选择题。
 *
 * 本页有两个读者：想弄清原理的人，和替人转述的 AI 引擎（GEO 首要引用面）。
 * 所以每节首句都写成可独立引用的直接回答；FAQ 与 FAQPage 结构化数据同源。
 * 纯静态。
 */

export const metadata: Metadata = {
  title: "为什么用对话，不用选择题 · 方法论",
  description:
    "OriSelf 是免费、无需注册的对话式 MBTI / 16 型人格测试：不做选择题，通过 6–30 轮 AI 对话生成人格画像。这一页解释它为什么这样设计——选择题的天花板、对话如何工作、你的隐私去了哪里。",
  alternates: { canonical: "/about" },
};

const FAQ = [
  {
    q: "测一次要多久？",
    a: "大约十分钟。对话最少 6 轮、最多 30 轮，多数信在 10 轮上下自然收笔——聊到画像立得住为止，而不是聊满某个固定题量。",
  },
  {
    q: "真的免费吗？",
    a: "免费，且无需注册。OriSelf 是一个开源项目（Apache 2.0），以公益服务的方式运行，没有付费解锁的部分。",
  },
  {
    q: "结果准吗？",
    a: "诚实的回答：MBTI 是镜子，不是判决。对话式测量避开了选择题里「答成想成为的自己」的偏差，但任何人格框架都只是理解自己的一种语言。读画像时请只对号，别入座。",
  },
  {
    q: "我说的话会被别人看到吗？",
    a: "只有你决定公开时才会。OriSelf 没有账号体系，报告链接本身就是凭证；不公开的报告不进画廊、不进搜索引擎（noindex），对话原文任何时候都只属于你。",
  },
  {
    q: "和普通的 MBTI 测试有什么不同？",
    a: "普通量表请你给自己打分，OriSelf 只请你说话。判断来自你说话的纹理——用词、在意的点、绕开的地方——而不是你对自己的评分。最后你带走的也不是四个字母加一张雷达图，而是一封写给你的信。",
  },
  {
    q: "能测第二次吗？",
    a: "能，随时。不同状态下写出的信本来就该不一样——把它当成给自己的定期来信，而不是一锤定音的鉴定。",
  },
];

/** mono 眉题 · 与档案页同款（语义 h2，视觉安静） */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[10px] tracking-[0.22em] uppercase text-accent font-normal mt-14 mb-5">
      {children}
    </h2>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p className="fraunces-body-soft text-[15px] leading-[1.9] text-ink-soft mb-5">
      {children}
    </p>
  );
}

export default function AboutPage() {
  return (
    <main className="relative z-10 min-h-screen px-6 sm:px-8 py-20">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Article",
              "@id": `${SITE_URL}/about#article`,
              headline: "为什么用对话，不用选择题",
              description:
                "OriSelf 的方法论：对话式 MBTI 测量如何避开自陈量表的社会期许偏差。",
              inLanguage: "zh-CN",
              author: { "@type": "Organization", name: "OriSelf" },
              publisher: { "@type": "Organization", name: "OriSelf", url: SITE_URL },
              mainEntityOfPage: `${SITE_URL}/about`,
            },
            {
              "@type": "FAQPage",
              mainEntity: FAQ.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            },
          ],
        }}
      />

      <article className="max-w-[620px] mx-auto">
        <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-accent">
          专栏 · 方法论
        </p>

        <h1
          className="text-ink"
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
          为什么用对话，
          <br />
          不用选择题
        </h1>

        {/* 定义段 · 给人也给 AI 引擎的一句话回答 */}
        {/* 中文段落一律单行字符串：JSX 源码换行会渲染成半角空格 */}
        <p className="fraunces-body text-[16px] leading-[1.85] text-ink border-t border-rule mt-9 pt-8">
          {"OriSelf 是一个免费、无需注册的对话式 MBTI / 16 型人格测试：不做选择题，和 AI 像写信一样聊十分钟，收到一封写给你的人格画像。这一页解释它为什么长成这样。"}
        </p>

        {/* 刊首语 · 作者的信——愿景整理自项目全程的真实决策记录，理想化是刻意的 */}
        <Eyebrow>刊首语 · 想把它做成的样子</Eyebrow>
        <div className="fraunces-body-soft italic text-[15px] leading-[1.95] text-ink-soft">
          <p className="mb-5">
            {"做这个东西的起点，是受够了。受够了九十三道选择题把一个活人压缩成四个字母加一张雷达图；受够了人在给自己打分的时候，答出来的其实是想成为的那个自己。我始终相信，真正的你不在分数里，在你说话的纹理里——你选的词、你在意的点、你绕开的地方。"}
          </p>
          <p className="mb-5">
            {"所以我想做的从来不是一个更准的测试，而是一次认真的阅读：一个人坐下来，好好说十分钟话，然后被认真地读一次。读完的凭证不该是报表，该是一封信——有你的名字，引用你说过的话，落款处盖一枚章。"}
          </p>
          <p className="mb-5">
            {"这决定了很多别扭的坚持。连「要么A、要么B」这样的提问方式，我们都当成瑕疵，一个版本一个版本地修剪——因为二选一是把人往格子里赶，而好的追问应该顺着你上一句长出来。丑，在这里是一票否决；模板感，是最重的罪名。这些标准写出来近乎偏执，但一封信但凡敷衍一句，收信的人是读得出来的。"}
          </p>
          <p className="mb-5">
            {"还有几条底线，从第一天起就没有让过步：它是公益的，免费、无需注册，永远如此；隐私是默认值，链接即凭证，你不公开，就没有任何人看得到；方法论全部开源，提问的品味、追问的分寸都写在公开的文本里，任何人可以翻看、挑错、拿走去做得更好。"}
          </p>
          <p className="mb-5">
            {"至于远景——我先看见了它建成的样子，才回头造今天的每一块砖：一间安静的档案馆，或者说一间慢邮局。谁都可以推门进来，坐下写一封，把自己带走；架上是十六型的档案，画廊里挂着人们自愿分享的信。世界太习惯给人打分了，这里想练习的是另一件事：给人回信。"}
          </p>
          <p className="mb-0">
            {"如果一定要用一句话说完：愿每个认真说过话的人，都被认真地读一次。"}
          </p>
          <p className="text-right font-mono text-[10px] tracking-[0.2em] not-italic text-ink-muted mt-6 mb-0">
            —— 原自我 · 作者
          </p>
        </div>

        <Eyebrow>选择题的天花板</Eyebrow>
        <Body>
          {"传统人格量表是自我报告：给你一句描述，请你打「符合 / 不符合」。可人在给自己打分的时候，答的常常是想成为的那个自己——心理测量学里叫社会期许偏差。同一道题，面试前答和深夜答，能差出两个人格。"}
        </Body>
        <Body>
          {"于是自测出的「理想型人格」比例总是异常地高，而分数背后那个真的你，恰恰被打分这个动作挡住了。"}
        </Body>

        <Eyebrow>对话怎么工作</Eyebrow>
        <Body>
          {"OriSelf 只请你做一件事：说话。它先递来一个问题，你只管说想说的；每个追问都顺着你上一句长出来，一来一回，最少 6 轮、最多 30 轮，多数信在 10 轮上下自然收笔。"}
        </Body>
        <Body>
          {"判断的依据是你说话的纹理——你选的词、你在意的点、你绕开的地方、你讲一件小事时先交代的是什么。这些东西装不了太久，也无法被一个「1 到 5 分」概括。样本是话本身，不是你对自己的评分。"}
        </Body>

        <Eyebrow>你带走什么</Eyebrow>
        <Body>
          {"一封写给你的信：一份自成一页的人格画像，有你的类型，更有类型背后那个具体的你——你说过的细节会被认真引用。存得下，也分享得出去。除了 MBTI 人格，也可以聊聊你适合学什么专业。"}
        </Body>

        <Eyebrow>你的话去了哪里</Eyebrow>
        <Body>
          {"OriSelf 没有账号体系。报告链接本身就是凭证：不转发，就只有你看得到；不主动公开，就不进画廊、不进搜索引擎。对话原文任何时候都只属于你。"}
        </Body>
        <Body>
          {"整个项目开源（Apache 2.0），提问的品味、追问的分寸，都写在公开的 skill 文本里，任何人都可以翻看、挑错、改进。"}
        </Body>

        <Eyebrow>几个常被问起的问题</Eyebrow>
        <dl className="m-0">
          {FAQ.map((f, i) => (
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

        {/* 收信口 */}
        <div
          className="lh-card lh-card-letter mt-16"
          style={{ transform: "rotate(-0.6deg)" }}
        >
          <p className="lh-k">写一封自己的</p>
          <p className="lh-ct">道理讲到这里，剩下的得亲自聊。</p>
          <p className="lh-ce">
            十分钟，一来一回。看看当你只是说话的时候，会长出一个什么样的你。
          </p>
          <p style={{ margin: "18px 0 0" }}>
            <LandingEnterLink
              domain="mbti"
              className="fraunces-body-soft italic text-accent text-[16px] border-b border-accent pb-0.5 no-underline hover:text-accent-soft hover:border-accent-soft transition-colors duration-300"
            >
              开始写我的那一封 →
            </LandingEnterLink>
          </p>
        </div>

        <nav
          aria-label="相关页面"
          className="mt-16 pt-5 border-t border-rule flex flex-wrap items-baseline gap-x-5 gap-y-3 font-mono text-[10px] tracking-widest uppercase text-ink-muted"
        >
          <Link href="/types" className="hover:text-accent transition-colors">
            档案 · 十六型人格
          </Link>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <Link href="/issues" className="hover:text-accent transition-colors">
            公开画廊
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
