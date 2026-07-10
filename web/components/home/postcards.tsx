import Link from "next/link";

/**
 * 专栏 · 两张明信片（方法论 / 公开画廊）。
 *
 * 明信片背面的经典分区：左半留言、右半邮票 + 邮戳 + 地址栏；
 * 整张卡即链接。纯 Server Component，样式见 globals.css 的 .pc-*。
 */

const POSTCARDS = [
  {
    href: "/about",
    eyebrow: "专栏 · 方法论",
    title: "为什么用对话，不用选择题",
    line: "选择题请你给自己打分；对话只请你说话，样子自己长出来。",
    go: "去读这一篇 →",
    stampChar: "问",
    to: "收件人 · 还在做选择题的你",
  },
  {
    href: "/issues",
    eyebrow: "专栏 · 公开画廊",
    title: "别人聊完，带走了什么",
    line: "由作者们选择公开的信，一封一封挂在画廊里。",
    go: "去画廊看看 →",
    stampChar: "信",
    to: "收件人 · 想先看看的你",
  },
] as const;

export function Postcards() {
  return (
    <div className="pc-grid">
      {POSTCARDS.map((c) => (
        <Link key={c.href} href={c.href} className="pc-card">
          <span className="pc-msg">
            <span className="pc-eyebrow">{c.eyebrow}</span>
            <span className="pc-title">{c.title}</span>
            <span className="pc-line">{c.line}</span>
            <span className="pc-go">{c.go}</span>
          </span>
          <span className="pc-side" aria-hidden>
            <span className="pc-stamp">
              <span className="pc-stamp-in">
                <span className="pc-stamp-char">{c.stampChar}</span>
                <span className="pc-stamp-val">ORISELF POST</span>
              </span>
            </span>
            <span className="pc-mark">
              ORISELF
              <br />
              · 2026 ·
            </span>
            <span className="pc-addr">
              <span className="pc-addr-to">{c.to}</span>
              <i />
              <i />
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
