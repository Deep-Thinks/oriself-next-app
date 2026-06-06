/**
 * ClarityBar · 顶栏底沿的进度条（v3.1）。
 *
 * 显示值 = 服务端算好的「旅程节奏(round/target) + clarity 调速」进度：
 *   - 按 ~20 轮的对话设计来铺：R6≈30%、R10(中期)≈50%、R20≈满。
 *   - clarity 当调速器：聊得深填更快、敷衍填更慢，但旅程封顶 → 永不在第 7 轮看着快满。
 * 单调性由**服务端**保证（done 帧 / state 都给单调值）；本组件纯展示。
 * value 为 null / 0（尚无信号，通常第 1 条消息前）时整条隐藏。
 *
 * 30% 处有一道极淡的「可收信最低线」刻度：默认 target=20 时第 6 轮的位置，
 * 提示"过了这条线就能收信，但后面还有大半程"。
 */
const MIN_CONVERGE_MARK_PCT = 30; // 6 / 20（默认 target）

export function ClarityBar({ value }: { value?: number | null }) {
  const v = typeof value === "number" && value > 0 ? Math.min(1, value) : 0;
  if (v <= 0) return null;

  const pct = Math.round(v * 100);

  return (
    <div className="flex items-center gap-[10px] w-full">
      <div
        className="relative flex-1 h-[2px] rounded-full bg-rule/50 overflow-hidden"
        role="progressbar"
        aria-label="对话进度"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="absolute inset-y-0 left-0 bg-accent rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
        {/* 可收信最低线刻度（叠在填充之上，过线后仍可见） */}
        <div
          className="absolute inset-y-0 w-px bg-ink-muted/45"
          style={{ left: `${MIN_CONVERGE_MARK_PCT}%` }}
          aria-hidden
        />
      </div>
      <span className="font-mono text-[9px] tracking-widest uppercase text-ink-muted/80 tabular-nums whitespace-nowrap">
        {pct}%
      </span>
    </div>
  );
}
