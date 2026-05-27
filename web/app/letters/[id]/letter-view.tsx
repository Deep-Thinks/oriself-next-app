"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Masthead } from "@/components/masthead";
import { Composer } from "@/components/letter/composer";
import { ConvergingOverlay } from "@/components/letter/converging-overlay";
import { Turn } from "@/components/letter/turn";
import { AuthorModal } from "@/components/primitives/author-modal";
import { composeResult, rewriteLastTurn, sendTurnStream } from "@/lib/api";
import { upsertLetter } from "@/lib/history";
import type { LetterState, TurnRecord, TurnStatus } from "@/lib/types";

/**
 * 空态话题种子 · 点一下自动填进 Composer。
 * 故意不加"/"、"？"、"："等标点——它们是线头，用户接着写自己的细节。
 */
const SEED_OPENERS = [
  "最近在忙的事",
  "昨晚睡不着时在想的",
  "这周印象最深的一个画面",
];

interface Props {
  letterId: string;
  initialState: LetterState;
  /** 已 converge 的 letter — 渲染"看报告"入口替换 composer。 */
  issueSlug?: string | null;
  /** 回看时注入的完整历史轮。 */
  initialTurns: TurnRecord[];
}

/**
 * Letter view · v2.4 的对话界面。
 *
 * 不变式：
 *  - 无气泡、无头像、无时间戳。
 *  - OriSelf 的新回复按 token 流逐字出现。
 *  - Composer 是一条线，不是一个框。
 *  - 最近一个 oriself 轮下方显示「让 TA 重写」按钮。
 *  - LLM 在流末尾声明 STATUS: CONVERGE → 服务端剥除；前端收到 done.status=CONVERGE
 *    自动触发报告生成并跳 /issues/:slug。
 */
export function LetterView({
  letterId,
  initialState,
  issueSlug,
  initialTurns,
}: Props) {
  const router = useRouter();
  const isCompleted = initialState.status === "completed";

  const [turns, setTurns] = useState<TurnRecord[]>(initialTurns);
  const [isStreaming, setIsStreaming] = useState(false);
  // 收信生成报告 in-flight 锁 · 防止双击 / 自动 CONVERGE 与手动按钮并发
  const [isConverging, setIsConverging] = useState(false);
  const [lastStatus, setLastStatus] = useState<TurnStatus | null>(
    initialState.last_status ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [authorOpen, setAuthorOpen] = useState(false);
  // halt（NEED_USER）横幅的"暂隐"状态：点「还想接着写」后隐藏，直到下一次 LLM 再喊 halt
  const [haltDismissed, setHaltDismissed] = useState(false);
  // 「现在收信」按钮首次出现时的解释提示 · 第 6 轮第一次满足条件时淡入一句
  // mono 小字解释按钮含义；用 sessionStorage 标记同一封信不再重复（Probe #16 反馈）
  const [showConvergeHint, setShowConvergeHint] = useState(false);
  const convergeHintShownRef = useRef(false);
  // 空态话题种子预填 · 用 token 触发，同一种子可重复点
  const [prefill, setPrefill] = useState<{
    text: string;
    token: number;
  } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // 自动滚到最新
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, isStreaming]);

  // 初始同步 · 让本地历史在进入信件（包括首次进 + 回看）时就有条目
  useEffect(() => {
    const maxRound = initialTurns.reduce(
      (m, t) => (t.round > m ? t.round : m),
      0,
    );
    upsertLetter({
      letterId,
      roundCount: maxRound,
      status: initialState.status === "completed" ? "completed" : "active",
      issueSlug: issueSlug ?? undefined,
    });
  }, [letterId, initialTurns, initialState.status, issueSlug]);

  // ============================================================
  // 流式辅助
  // ============================================================

  const openOriselfStreamingTurn = useCallback((round: number) => {
    setTurns((prev) => [...prev, { speaker: "oriself", text: "", round }]);
  }, []);

  const appendOriselfToken = useCallback((delta: string) => {
    setTurns((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.speaker !== "oriself") return prev;
      const updated = { ...last, text: last.text + delta };
      return [...prev.slice(0, -1), updated];
    });
  }, []);

  const attachQuillLines = useCallback((lines: string[]) => {
    // SSE 的 quill 帧在 token 之前到达；把它挂到当前流式中的 oriself turn 上，
    // QuillNote 会在 token 出来之前就淡入，保持"落笔前停一下"的节奏。
    setTurns((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.speaker !== "oriself") return prev;
      const updated = { ...last, quill_lines: lines };
      return [...prev.slice(0, -1), updated];
    });
  }, []);

  const finalizeOriselfTurn = useCallback((visible: string, round: number) => {
    setTurns((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.speaker !== "oriself") return prev;
      return [
        ...prev.slice(0, -1),
        // 保留流式中拿到的 quillLines；visible 覆盖原文（剥 STATUS 之后的版本）
        { ...last, speaker: "oriself", text: visible, round },
      ];
    });
  }, []);

  // 内部：真正跑收信流程，不查 isConverging lock。retry 走它，避免闭包读旧 state。
  const runConverge = useCallback(async () => {
    setIsConverging(true);
    setError(null);
    // A-2 · 用户已点击收信，hint 任务完成，主动 dismiss 避免它在 overlay 后还残留
    setShowConvergeHint(false);
    try {
      const result = await composeResult(letterId);
      if (result.issue_slug) {
        upsertLetter({
          letterId,
          status: "completed",
          issueSlug: result.issue_slug,
          mbtiType: result.mbti_type,
          cardTitle: result.card_title ?? undefined,
        });
        // ?arrived=1 触发 issue 页的封缄时刻；之后 router.replace 会把它抹掉
        router.push(`/issues/${result.issue_slug}?arrived=1`);
        // 成功 path 不重置 isConverging — router.push 已经跳走，组件即将卸载
      } else {
        // A-1 · 失败保留 isConverging=true，让 ConvergingOverlay 切到错误态
        // 等用户从 overlay 选「再试一次」或「先回去再聊几句」
        setError("信卡住了 · 先稳住，再试一次或回去再聊几句");
      }
    } catch (err) {
      // 保留 raw 给 console.error，UI 显示固定友好文案；'UPSTREAM_LLM_*' 这种
      // 内部 token 不给用户看（Codex P1）
      console.error("[converge] failed:", err);
      setError("信卡住了 · 先稳住，再试一次或回去再聊几句");
    }
  }, [letterId, router]);

  const handleConverge = useCallback(async () => {
    // 公开入口 · 防双击 / 防与自动 CONVERGE 并发：
    // 手动按钮 + 流末尾自动调用可能同时触发
    if (isConverging) return;
    await runConverge();
  }, [isConverging, runConverge]);

  // A-1 · overlay 错误态的两个出口
  const handleOverlayRetry = useCallback(() => {
    // 直接调 runConverge，不经 handleConverge 的 lock 检查；闭包安全
    void runConverge();
  }, [runConverge]);

  const handleOverlayDismiss = useCallback(() => {
    setIsConverging(false);
    setError(null);
  }, []);

  // ============================================================
  // 发送一轮
  // ============================================================

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      const nextRound =
        (turns.filter((t) => t.speaker === "you").slice(-1)[0]?.round ?? 0) + 1;
      setTurns((prev) => [
        ...prev,
        { speaker: "you", text: text.trim(), round: nextRound },
      ]);

      setIsStreaming(true);
      setError(null);
      openOriselfStreamingTurn(nextRound);

      try {
        const done = await sendTurnStream(letterId, text.trim(), {
          onToken: appendOriselfToken,
          onQuill: attachQuillLines,
        });
        finalizeOriselfTurn(done.visible, done.round);
        setLastStatus(done.status);
        // 新的 halt 到来 → 让 banner 重新显示（用户之前即使 dismiss 过，这次要再给出口）
        if (done.status === "NEED_USER") setHaltDismissed(false);
        upsertLetter({
          letterId,
          roundCount: done.round,
          status: "active",
        });
        if (done.status === "CONVERGE") {
          await handleConverge();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "发送失败，稍后再试");
      } finally {
        setIsStreaming(false);
      }
    },
    [
      letterId,
      turns,
      isStreaming,
      openOriselfStreamingTurn,
      appendOriselfToken,
      attachQuillLines,
      finalizeOriselfTurn,
      handleConverge,
    ],
  );

  // ============================================================
  // 重写最近一轮
  // ============================================================

  const handleRewrite = useCallback(async () => {
    if (isStreaming) return;
    const lastOri = [...turns].reverse().find((t) => t.speaker === "oriself");
    if (!lastOri) return;

    setTurns((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].speaker === "oriself") {
          return prev.slice(0, i);
        }
      }
      return prev;
    });

    setIsStreaming(true);
    setError(null);
    openOriselfStreamingTurn(lastOri.round);

    try {
      const done = await rewriteLastTurn(letterId, {
        onToken: appendOriselfToken,
        onQuill: attachQuillLines,
      });
      finalizeOriselfTurn(done.visible, done.round);
      setLastStatus(done.status);
      if (done.status === "NEED_USER") setHaltDismissed(false);
      upsertLetter({
        letterId,
        roundCount: done.round,
        status: "active",
      });
      if (done.status === "CONVERGE") {
        await handleConverge();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "重写失败，稍后再试");
    } finally {
      setIsStreaming(false);
    }
  }, [
    letterId,
    isStreaming,
    turns,
    openOriselfStreamingTurn,
    appendOriselfToken,
    attachQuillLines,
    finalizeOriselfTurn,
    handleConverge,
  ]);

  // ============================================================
  // Render
  // ============================================================

  const currentRound = Math.max(...turns.map((t) => t.round), 0);

  // 第 6 轮起允许用户主动收信生成报告（后端 MIN_CONVERGE_ROUND = 6，POST
  // /letters/:id/result 在 round >= 6 时接受）。此前 UI 上没暴露这个能力，
  // 用户被锁在"AI 决定何时结束"的模式里 → 反馈里 5/6 命中"对话节奏焦虑"。
  // 显式的"现在收信"按钮把 agency 还给用户。
  const canRequestResult =
    currentRound >= 6 && !isCompleted && !isStreaming && !isConverging;

  // A-2 · 「现在收信」按钮首次满足条件时淡入解释 hint
  // 用 sessionStorage 同 letterId 记忆，避免每轮都跳出来；storage 不可用时仍展示一次
  useEffect(() => {
    if (!canRequestResult) return;
    if (convergeHintShownRef.current) return;
    if (typeof window === "undefined") return;
    const key = `oriself:converge-hint-seen-${letterId}`;
    let alreadySeen = false;
    try {
      alreadySeen = window.sessionStorage.getItem(key) !== null;
      if (!alreadySeen) window.sessionStorage.setItem(key, "1");
    } catch {
      // storage 不可用（无痕 / quota）—— 本次仍展示一次，只是不会跨 reload 记住
    }
    convergeHintShownRef.current = true;
    if (!alreadySeen) setShowConvergeHint(true);
  }, [canRequestResult, letterId]);

  const lastOriselfIdx = (() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].speaker === "oriself") return i;
    }
    return -1;
  })();

  return (
    <>
      <Masthead
        meta={
          <>
            <span>letter</span>
            <span className="mx-[10px] opacity-50">·</span>
            <span className="text-accent">
              round {String(currentRound).padStart(2, "0")}
            </span>
          </>
        }
        actions={
          <button
            type="button"
            onClick={() => setAuthorOpen(true)}
            className="font-mono text-[10px] tracking-widest uppercase text-ink-muted hover:text-accent transition-colors bg-transparent border-0"
            aria-label="关于作者"
          >
            AUTHOR
          </button>
        }
      />

      <AuthorModal open={authorOpen} onClose={() => setAuthorOpen(false)} />

      <main className="relative z-10 max-w-[620px] mx-auto px-6 sm:px-8 pt-[90px] sm:pt-[140px] pb-[170px] sm:pb-[260px]">
        {turns.length === 0 && (
          <div className="mb-14">
            <span
              className="text-accent"
              style={{
                fontFamily: "var(--font-serif)",
                fontVariationSettings: '"opsz" 144, "SOFT" 100, "WONK" 1',
                fontStyle: "italic",
                fontWeight: 400,
                fontSize: "clamp(72px, 12vw, 132px)",
                lineHeight: 1,
                letterSpacing: "-0.04em",
              }}
            >
              01.
            </span>

            <p className="mt-10 fraunces-body-soft text-[19px] leading-[1.7] text-ink-soft max-w-[520px]">
              随便聊点最近的事就行。
              <br />
              OriSelf 会逐步为你撰写这封属于你一个人的信。
            </p>

            <div className="mt-12">
              <p className="font-mono text-[10px] tracking-widest uppercase text-ink-muted mb-4">
                一时想不起从哪开始 · 点一个自动填到下面
              </p>
              <ul className="flex flex-col gap-3 items-start">
                {SEED_OPENERS.map((seed) => (
                  <li key={seed}>
                    <button
                      type="button"
                      onClick={() =>
                        setPrefill({ text: seed, token: Date.now() })
                      }
                      className="fraunces-body italic text-[17px] text-accent hover:text-accent-soft border-b border-accent/30 hover:border-accent transition-colors pb-[2px] bg-transparent p-0 cursor-pointer text-left"
                    >
                      {seed}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {turns.map((turn, i) => {
          const isLastOriself = i === lastOriselfIdx;
          const showStreaming = isLastOriself && isStreaming;
          return (
            <div key={`${turn.round}-${turn.speaker}-${i}`}>
              <Turn turn={turn} streaming={showStreaming} />
              {isLastOriself && !isStreaming && !isCompleted && (
                <div className="-mt-10 mb-14 pl-0">
                  {showConvergeHint && !isCompleted && (
                    // 渲染条件不绑 canRequestResult：用户点收信后 isConverging=true 会让
                    // canRequestResult 立即变 false；hint 应该在主动 dismiss 时才消失。
                    // 用 animate-settle（translateY 10px 起步）比 animate-rise（18px）更柔。
                    <p
                      className="mb-3 font-mono text-[10px] tracking-wide text-ink-muted animate-settle max-w-[480px] leading-relaxed"
                      aria-live="polite"
                    >
                      现在已经可以收信；再聊几句会更细。
                    </p>
                  )}
                  <div className="flex items-center gap-7 flex-wrap">
                    <button
                      type="button"
                      onClick={handleRewrite}
                      className="font-mono text-[10px] tracking-widest uppercase text-ink-muted hover:text-accent transition-colors duration-300 bg-transparent border-0 cursor-pointer p-0"
                      disabled={isStreaming}
                      aria-label="让 Oriself 重写这一轮"
                    >
                      让 Oriself 重写 <span className="not-italic">↻</span>
                    </button>
                    {canRequestResult && (
                      <button
                        type="button"
                        onClick={handleConverge}
                        className="fraunces-body italic text-[15px] text-accent hover:text-accent-soft border-b border-accent/40 hover:border-accent transition-colors pb-[2px] bg-transparent p-0 cursor-pointer"
                        aria-label="现在收信 · 生成你的报告"
                      >
                        现在收信 <span className="font-mono not-italic">→</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {lastStatus === "NEED_USER" && !isStreaming && !haltDismissed && (
          <div className="mt-12 mb-8 border-t border-b border-rule/30 py-7">
            <p className="font-mono text-[10px] tracking-widest uppercase text-ink-muted mb-3">
              Oriself 想说一句
            </p>
            <p className="fraunces-body-soft text-[17px] leading-[1.75] text-ink max-w-[540px] mb-6">
              先停一下吧 —— 聊到这儿有点卡。这封信已经留着，你不用现在就接下去。
              想再接着写一句什么都行；想歇会儿的话，之后从首页「最近的信」能直接回到这里。
            </p>
            <div className="flex items-center gap-7 flex-wrap">
              <button
                type="button"
                onClick={() => setHaltDismissed(true)}
                className="fraunces-body italic text-[15px] text-accent hover:text-accent-soft border-b border-accent/40 hover:border-accent transition-colors pb-[2px] bg-transparent p-0 cursor-pointer"
              >
                还想接着写 <span className="not-italic">→</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  upsertLetter({
                    letterId,
                    roundCount: currentRound,
                    status: "active",
                  });
                  router.push("/");
                }}
                className="font-mono text-[10px] tracking-widest uppercase text-ink-muted hover:text-accent transition-colors bg-transparent border-0 cursor-pointer p-0"
              >
                先到这里 ↩
              </button>
            </div>
          </div>
        )}

        {error && !isConverging && (
          // converging 路径的 error 由 ConvergingOverlay 显示（A-1）；
          // 这条只承接非 converging 错误（如 sendTurnStream 失败）
          <p className="font-mono text-[11px] tracking-wide uppercase text-accent mt-10">
            {error}
          </p>
        )}

        <div ref={endRef} />
      </main>

      {isCompleted ? (
        <CompletedFooter issueSlug={issueSlug ?? null} />
      ) : (
        <Composer
          onSend={handleSend}
          disabled={isStreaming}
          draftKey={letterId}
          prefill={prefill}
        />
      )}

      {/* A-1 · 收信 in-flight overlay · 覆盖手动 handleConverge 和 handleSend 内
          自动 CONVERGE 两条路径。失败时切到错误态由用户决定再试或回去。 */}
      <ConvergingOverlay
        open={isConverging}
        error={error}
        onRetry={handleOverlayRetry}
        onDismiss={handleOverlayDismiss}
      />
    </>
  );
}

function CompletedFooter({ issueSlug }: { issueSlug: string | null }) {
  return (
    <footer
      // z-20 同步 Composer —— 保证"看报告"链接不会被 main 的 pb-padding 盖住
      className="fixed left-0 right-0 bottom-0 z-20 px-8 pt-20 pb-9 pointer-events-none"
      style={{
        background:
          "linear-gradient(to top, var(--paper) 55%, rgba(245, 240, 230, 0.92) 80%, rgba(245, 240, 230, 0))",
      }}
    >
      <div className="max-w-[620px] mx-auto pointer-events-auto flex items-center justify-between gap-6">
        <p className="font-mono text-[10px] tracking-widest uppercase text-ink-muted">
          这封信已收尾 · 在回看
        </p>
        {issueSlug ? (
          <Link
            href={`/issues/${issueSlug}`}
            className="fraunces-body italic text-[16px] text-accent hover:text-accent-soft border-b border-accent/40 hover:border-accent transition-colors pb-[2px]"
          >
            看你的报告 <span className="font-mono not-italic">→</span>
          </Link>
        ) : (
          <Link
            href="/letters/new"
            className="fraunces-body italic text-[16px] text-accent hover:text-accent-soft border-b border-accent/40 hover:border-accent transition-colors pb-[2px]"
          >
            再写一封 <span className="font-mono not-italic">→</span>
          </Link>
        )}
      </div>
    </footer>
  );
}
