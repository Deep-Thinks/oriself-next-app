"use client";

import { useState } from "react";
import { LandingEnterLink } from "./landing-enter-link";

/**
 * 首页域切换：MBTI 人格 / 专业方向。
 *
 * mono 双词低调切换，贴首页极简作品集气质；选中域传给 LandingEnterLink，
 * "进入 →" 据此跳 /letters/new 或 /letters/new?domain=major。
 */
export function DomainToggle() {
  const [domain, setDomain] = useState<"mbti" | "major">("mbti");

  const tab = (d: "mbti" | "major", label: string) => (
    <button
      type="button"
      onClick={() => setDomain(d)}
      className={`font-mono text-[11px] tracking-wide transition-colors duration-300 ${
        domain === d
          ? "text-accent border-b border-accent pb-0.5"
          : "text-ink-muted hover:text-ink-soft"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-20 flex flex-col items-center gap-7">
      <div className="flex items-center gap-3">
        {tab("mbti", "MBTI 人格")}
        <span className="text-ink-muted opacity-40 select-none">·</span>
        {tab("major", "专业方向")}
      </div>

      {domain === "major" && (
        <p className="fraunces-body-soft italic text-ink-muted text-[12px] max-w-[19rem] text-center leading-relaxed">
          不替你选学校，帮你看清你到底想学什么
        </p>
      )}

      <LandingEnterLink
        domain={domain}
        className="inline-block fraunces-body-soft italic text-accent text-[18px] border-b border-accent pb-1 transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-accent-soft hover:border-accent-soft"
      >
        进入 →
      </LandingEnterLink>
    </div>
  );
}
