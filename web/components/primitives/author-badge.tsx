"use client";

import { usePathname } from "next/navigation";

/**
 * AuthorBadge · 右下角常驻 "AUTHOR" 入口。
 *
 * - 极小极低调，mono + tracking widest，像画册版权页那样远远挂着。
 * - 点击直接跳作者主页 niuniu869.com（不再弹对话框）。
 * - issue 页 chrome 已占据底部核心区，这里避开不渲染按钮，避免撞 chrome 的按钮。
 */
export function AuthorBadge() {
  const pathname = usePathname();

  // 只在首页挂右下角 badge。
  //   - letter 页：composer 右下会撞"发送"按钮，改由 Masthead 右侧入口承载。
  //   - issue 页：chrome 左组已内置 AUTHOR 入口。
  const onLanding = pathname === "/";
  if (!onLanding) return null;

  return (
    <a
      href="https://niuniu869.com"
      target="_blank"
      rel="noopener"
      aria-label="关于作者 · niuniu869.com"
      className="fixed bottom-[14px] right-[14px] z-[50] font-mono text-[10px] tracking-widest uppercase text-ink-muted hover:text-accent bg-transparent border-0 p-2 transition-colors"
    >
      AUTHOR
    </a>
  );
}
