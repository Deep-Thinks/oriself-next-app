"use client";

import { useEffect, useRef, useState } from "react";

/**
 * IssueFrame · 让报告从暖纸里「显影」而非硬切（P5 兜底）。
 *  - 身后铺一张 bg-paper 托底（z-10）：加载白屏的一瞬、报告若留边处，都漏出暖纸而非系统白/黑。
 *  - iframe（z-20）opacity 0→1 on load，~400ms ease，消除暖纸→报告的断崖切换；
 *    也覆盖历史里那些纯黑底的旧报告（无需重新生成）。
 *  - sandbox="allow-scripts"（无 allow-same-origin）：安全模型与此前内联 iframe 完全一致。
 *
 * 关键修复：iframe 在服务端就渲染进首屏 HTML，浏览器解析时即开始加载，**很可能在 React
 * hydrate 绑上 onLoad 之前就已 load 完**——那样 onLoad 永不再触发、报告会永久停在 opacity:0
 * （只剩暖纸底）。因此：挂载时用 ref 再绑一次 load，并加一个安全超时无条件显影，
 * 保证报告绝不会因为这个过渡而隐形。
 */
export function IssueFrame({ src, title }: { src: string; title: string }) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const el = ref.current;
    const reveal = () => setLoaded(true);
    if (el) el.addEventListener("load", reveal);
    // 兜底：无论 load 是否在 hydrate 前就错过，都让报告显影（跨域 sandbox 读不到
    // iframe readyState，故用超时而非轮询）。1.2s 足够本地/线上 SSR 报告 paint。
    const t = window.setTimeout(reveal, 1200);
    return () => {
      if (el) el.removeEventListener("load", reveal);
      window.clearTimeout(t);
    };
  }, []);

  return (
    <>
      <div aria-hidden className="fixed inset-0 z-10 bg-paper" />
      <iframe
        ref={ref}
        src={src}
        title={title}
        sandbox="allow-scripts"
        onLoad={() => setLoaded(true)}
        className="fixed inset-0 w-full h-full border-0 z-20 transition-opacity duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </>
  );
}
