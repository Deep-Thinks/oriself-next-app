"use client";

import { useEffect, useState } from "react";

interface Props {
  /** 是否显示（= LetterView.isConverging） */
  open: boolean;
  /** 失败原因 · 非 null 时切换到错误态 */
  error: string | null;
  /** 用户点「再试一次」 */
  onRetry: () => void;
  /** 用户点「先回去再聊几轮」 */
  onDismiss: () => void;
}

/**
 * ConvergingOverlay · 收信 in-flight 视觉占位。
 *
 * Probe 反馈 #16：用户点完「开始收信」之后页面一直没动静，"以为系统出问题了 /
 * 发送到我微信了"。原 handleConverge 期间只有 isConverging lock + button disable，
 * 没有可见反馈。本组件覆盖手动 + 自动 CONVERGE 两条路径。
 *
 * 复用 ArrivalCeremony 的视觉语言（bg-paper、Fraunces italic 标题 / mono 分割线 +
 * 小字 / 分阶段渐入），让两端体验连贯——封缄前的等待和封缄后的展示是同一支笔。
 *
 * z-40：高于 Masthead/IssueChrome (z-30)、Composer (z-20)；正常路径下与
 * ArrivalCeremony 不同屏（converge 成功后 letter-view 已 unmount）。
 */
export function ConvergingOverlay({ open, error, onRetry, onDismiss }: Props) {
  // 渐入阶段：0 = 未挂载，1 = 标题在，2 = 分割线/正文在
  const [phase, setPhase] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    if (!open) {
      setPhase(0);
      return;
    }
    const t1 = setTimeout(() => setPhase(1), 60);
    const t2 = setTimeout(() => setPhase(2), 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [open]);

  // ESC 在失败态等同点「先回去再聊几句」；成功态 ESC 无效（用户不能中途取消生成）
  useEffect(() => {
    if (!open || error === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, error, onDismiss]);

  if (!open) return null;

  const isError = error !== null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-label={isError ? "封缄差一点没成功" : "正在替你封缄这封信"}
      className="fixed inset-0 z-40 bg-paper transition-opacity ease-ease duration-500"
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 sm:px-8 text-center">
        {/* 标题 · 根据成功/失败状态切换文案 */}
        <h2
          className="transition-all duration-[700ms] ease-spring"
          style={{
            fontFamily: "var(--font-serif)",
            fontVariationSettings: '"opsz" 144, "SOFT" 100, "WONK" 1',
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: "clamp(40px, 6vw, 72px)",
            lineHeight: 1.08,
            letterSpacing: "-0.035em",
            color: "var(--ink)",
            opacity: phase >= 1 ? 1 : 0,
            transform: phase >= 1 ? "translateY(0)" : "translateY(14px)",
          }}
        >
          {isError ? "差一点没成功" : "正在替你封缄这封信"}
        </h2>

        {/* 分割线 · 小字说明 */}
        <div
          className="mt-8 sm:mt-12 flex items-center gap-4 sm:gap-5 w-full max-w-[420px] transition-all duration-[600ms] ease-ease"
          style={{
            opacity: phase >= 2 ? 1 : 0,
            transform: phase >= 2 ? "translateY(0)" : "translateY(10px)",
          }}
        >
          <span className="flex-1 h-px bg-rule-strong" />
          <span className="font-mono text-[10px] tracking-widest uppercase text-ink-muted whitespace-nowrap">
            {isError ? "再试一次，或先回去" : "通常 10–20 秒"}
          </span>
          <span className="flex-1 h-px bg-rule-strong" />
        </div>

        {/* 成功态：脉动指示（blink 动画在 tailwind 已定义） */}
        {!isError && (
          <div
            className="mt-10 sm:mt-14 transition-opacity duration-[800ms] ease-ease"
            style={{ opacity: phase >= 2 ? 1 : 0 }}
          >
            <span
              className="inline-block w-[6px] h-[6px] rounded-full bg-accent animate-blink"
              aria-hidden
            />
          </div>
        )}

        {/* 失败态：CTA · 再试一次 + 先回去
            移动端 flex-wrap 防止两个按钮挤一行（Codex P2） */}
        {isError && (
          <div
            className="mt-10 sm:mt-14 flex items-center justify-center gap-8 sm:gap-10 flex-wrap transition-all duration-[700ms] ease-spring"
            style={{
              opacity: phase >= 2 ? 1 : 0,
              transform: phase >= 2 ? "translateY(0)" : "translateY(14px)",
              pointerEvents: phase >= 2 ? "auto" : "none",
            }}
          >
            <button
              type="button"
              onClick={onRetry}
              className="fraunces-body italic text-[18px] text-accent hover:text-accent-soft border-b border-accent/60 hover:border-accent pb-[3px] transition-colors bg-transparent p-0"
              autoFocus
              aria-label="再试一次封缄这封信"
            >
              再试一次 <span className="font-mono not-italic">↻</span>
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="font-mono text-[11px] tracking-widest uppercase text-ink-muted hover:text-accent transition-colors bg-transparent border-0 p-0"
            >
              先回去再聊几句
            </button>
          </div>
        )}

        {/* 失败态键盘提示（ESC = 先回去） */}
        {isError && (
          <p
            className="absolute bottom-6 sm:bottom-10 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-widest uppercase text-ink-muted whitespace-nowrap transition-opacity duration-700"
            style={{ opacity: phase >= 2 ? 0.6 : 0 }}
          >
            按 Esc 先回去
          </p>
        )}
      </div>
    </div>
  );
}
