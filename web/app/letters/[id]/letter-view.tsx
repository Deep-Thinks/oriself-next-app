"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Masthead } from "@/components/masthead";
import { ClarityBar } from "@/components/letter/clarity-bar";
import { Composer } from "@/components/letter/composer";
import { ConvergingOverlay } from "@/components/letter/converging-overlay";
import { Turn } from "@/components/letter/turn";
import { AuthorModal } from "@/components/primitives/author-modal";
import { trackEvent } from "@/lib/analytics";
import { composeResult, rewriteLastTurn, sendTurnStream } from "@/lib/api";
import { canShowManualConvergeAction } from "@/lib/converge";
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

const MAJOR_SEED_OPENERS = [
  "我现在完全空白",
  "我有几个方向但不确定",
  "我已经有专业了想验证",
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
  // v3.1 · 顶栏进度条值 [0,1] = 服务端算好的旅程节奏(round/target) + clarity 调速。
  // 服务端已保证单调；这里仍取 Math.max 兜底，任何顺序下都不回退。回看用 initialState 回灌。
  const [progress, setProgress] = useState<number | null>(
    Number.isFinite(initialState.progress)
      ? Math.min(1, Math.max(0, initialState.progress as number))
      : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [authorOpen, setAuthorOpen] = useState(false);
  // halt（NEED_USER）横幅的"暂隐"状态：点「还想接着写」后隐藏，直到下一次 LLM 再喊 halt
  const [haltDismissed, setHaltDismissed] = useState(false);
  // 「现在收信」按钮首次出现时的解释提示 · 旅程接近尾声或模型已声明 CONVERGE
  // 时淡入一句。mono 小字解释按钮含义；用 sessionStorage 标记同一封信不再重复。
  const [showConvergeHint, setShowConvergeHint] = useState(false);
  const convergeHintShownRef = useRef(false);
  // A-6 · runConverge 的 in-flight ref lock；防 retry 双击 / auto+manual 并发
  // 进入并发的双倍 composeResult 调用（isConverging state 在 retry 路径仍是 true，
  // 不能用作幂等检查；ref 更稳）
  const convergeInFlightRef = useRef(false);
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

  // A-6 · letter_created 埋点（只在第一次进信、且没有 turn 时打——这是新建路径）
  // 用 sessionStorage 同 letterId 防 reload 重复
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (initialTurns.length > 0) return; // 回看不算 created
    const key = `oriself:tracked-create-${letterId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // storage 不可用时仍发一次，宁可重复也不漏（漏斗顶端不能丢）
    }
    // ?from= 来源 slug（受 new/page.tsx 白名单约束）；缺省时 null
    const refSlug = new URLSearchParams(window.location.search).get("from");
    trackEvent(
      "letter_created",
      { letter_id: letterId, domain: initialState.domain, ref_slug: refSlug },
      letterId,
    );
    // 埋点已落 → 抹掉 ?from=，避免回看/分享时泄露来源。
    // 用 replaceState 而非 router.replace：letter 页 force-dynamic，
    // router.replace 会在接收者最脆弱的首帧触发 state+transcript 全量 RSC 重取；
    // replaceState 只是客户端改 URL，零网络。仅删 from，保留其余参数。
    if (refSlug !== null) {
      const params = new URLSearchParams(window.location.search);
      params.delete("from");
      const remaining = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (remaining ? `?${remaining}` : ""),
      );
    }
  }, [letterId, initialTurns.length]);

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

  // 守卫 #1 · 流式失败时（后端发 ORISELF_EMPTY_REPLY 等）抹掉 openOriselfStreamingTurn
  // 压入的那个空 oriself 气泡——否则用户看到"空气泡 + 报错" = "TA 没说话"（开口者流失杀手）。
  const dropTrailingEmptyOriselfTurn = useCallback(() => {
    setTurns((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.speaker === "oriself" && !last.text.trim()) {
        return prev.slice(0, -1);
      }
      return prev;
    });
  }, []);

  // 内部：真正跑收信流程，不查 isConverging lock。retry 走它，避免闭包读旧 state。
  // A-6 · 加 trigger 参数区分 manual / auto / retry 漏斗源
  // ref-based in-flight lock 防 retry 双击 / 并发触发双倍 composeResult（Codex P1）
  const runConverge = useCallback(
    async (trigger: "manual" | "auto" | "retry") => {
      if (convergeInFlightRef.current) return;
      convergeInFlightRef.current = true;
      trackEvent("converge_clicked", { trigger, letter_id: letterId }, letterId);
      setIsConverging(true);
      setError(null);
      // A-2 · 用户已点击收信，hint 任务完成，主动 dismiss
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
            domain: result.domain,
            resultLabel: result.result_label ?? undefined,
            // §5 · 把 publish 凭证存进本地历史，供 issue 页 PublishToggle 鉴权使用。
            ownerToken: result.owner_token ?? undefined,
          });
          trackEvent(
            "converge_result_success",
            { letter_id: letterId, issue_slug: result.issue_slug },
            letterId,
          );
          // ?arrived=1 触发 issue 页的封缄时刻；之后 router.replace 会把它抹掉
          router.push(`/issues/${result.issue_slug}?arrived=1`);
          // 成功 path 不重置 isConverging — router.push 已经跳走，组件即将卸载
        } else {
          // A-1 · 失败保留 isConverging=true，让 ConvergingOverlay 切到错误态
          setError("信卡住了 · 先稳住，再试一次或回去再聊几句");
          trackEvent(
            "converge_result_failed",
            { letter_id: letterId, reason: "no_issue_slug" },
            letterId,
          );
        }
      } catch (err) {
        console.error("[converge] failed:", err);
        setError("信卡住了 · 先稳住，再试一次或回去再聊几句");
        trackEvent(
          "converge_result_failed",
          {
            letter_id: letterId,
            reason: err instanceof Error ? err.message.slice(0, 200) : "unknown",
          },
          letterId,
        );
      } finally {
        // 释放 in-flight lock。成功 path 也会执行（router.push 跳走前），
        // 但组件即将卸载所以不影响。retry/failure path 必须释放才能让下次 retry 启动。
        convergeInFlightRef.current = false;
      }
    },
    [letterId, router],
  );

  const handleConverge = useCallback(async () => {
    // 公开入口 · 防双击 / 防与自动 CONVERGE 并发：
    // 手动按钮 + 流末尾自动调用可能同时触发
    if (isConverging) return;
    await runConverge("manual");
  }, [isConverging, runConverge]);

  // A-1 · overlay 错误态的两个出口
  const handleOverlayRetry = useCallback(() => {
    // 直接调 runConverge，不经 handleConverge 的 lock 检查；闭包安全
    void runConverge("retry");
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
        // 顶栏进度条：Number.isFinite 挡掉 NaN/Infinity，clamp [0,1]，Math.max 兜底单调。
        if (Number.isFinite(done.progress)) {
          const v = Math.min(1, Math.max(0, done.progress as number));
          setProgress((p) => Math.max(p ?? 0, v));
        }
        // 新的 halt 到来 → 让 banner 重新显示（用户之前即使 dismiss 过，这次要再给出口）
        if (done.status === "NEED_USER") setHaltDismissed(false);
        upsertLetter({
          letterId,
          roundCount: done.round,
          status: "active",
        });
        // A-6 · 漏斗里程碑 round=1/3/6/10 埋点
        if ([1, 3, 6, 10].includes(done.round)) {
          trackEvent(
            "round_reached",
            { round: done.round, letter_id: letterId },
            letterId,
          );
        }
        if (done.status === "CONVERGE") {
          // A-6 · 自动 CONVERGE 走 runConverge('auto')，不通过 handleConverge
          // 避免重复 track 'manual'
          await runConverge("auto");
        }
      } catch (err) {
        // 先抹掉空 oriself 气泡，再显示友好错误（err.message 已是 friendlyError 脱敏后的人话）
        dropTrailingEmptyOriselfTurn();
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
      runConverge,
      dropTrailingEmptyOriselfTurn,
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
      // 顶栏进度条：同上，有限性校验 + clamp + Math.max 兜底单调。
      if (Number.isFinite(done.progress)) {
        const v = Math.min(1, Math.max(0, done.progress as number));
        setProgress((p) => Math.max(p ?? 0, v));
      }
      if (done.status === "NEED_USER") setHaltDismissed(false);
      upsertLetter({
        letterId,
        roundCount: done.round,
        status: "active",
      });
      if (done.status === "CONVERGE") {
        // A-6 · 重写后流末尾自动 CONVERGE 也算 auto 触发
        await runConverge("auto");
      }
    } catch (err) {
      // 重写失败：服务端 v2.6.4 已保住原轮（成功才丢弃旧轮）。前端去掉这次重写开的
      // （空 / 半截）气泡，把原回复放回去——让"重写"看起来像没发生，和服务端一致。
      setTurns((prev) => {
        const base =
          prev.length > 0 && prev[prev.length - 1].speaker === "oriself"
            ? prev.slice(0, -1)
            : prev;
        return [...base, lastOri];
      });
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
    runConverge,
  ]);

  // ============================================================
  // Render
  // ============================================================

  const currentRound = Math.max(...turns.map((t) => t.round), 0);

  const canRequestResult = canShowManualConvergeAction({
    currentRound,
    isCompleted,
    isStreaming,
    isConverging,
    lastStatus,
    progress,
  });

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

  const isMajor = initialState.domain === "major";
  const emptyCopy = isMajor ? (
    <>
      不用先想清楚答案。
      <br />
      从空白、犹豫，或者一个已经冒出来的专业开始都可以。
    </>
  ) : (
    <>
      随便聊点最近的事就行。
      <br />
      OriSelf 会逐步为你撰写这封属于你一个人的信。
    </>
  );
  const emptyChips = isMajor ? MAJOR_SEED_OPENERS : SEED_OPENERS;

  return (
    <>
      <Masthead
        progress={<ClarityBar value={progress} />}
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
          // A-3 · 保留 hero（01. 招牌字 + 说明）；种子 chips 已下移到 Composer
          // 上方紧贴 textarea。这样视觉中心 = hero，操作焦点 = composer。
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
              {emptyCopy}
            </p>
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
                    {!canRequestResult && currentRound >= 1 && (
                      <button
                        type="button"
                        onClick={() => router.push("/")}
                        className="font-mono text-[10px] tracking-widest uppercase text-ink-muted hover:text-accent transition-colors duration-300 bg-transparent border-0 cursor-pointer p-0"
                        aria-label="先到这里 · 保留这封信稍后再聊"
                      >
                        先到这里 <span className="not-italic">↩</span>
                      </button>
                    )}
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
        <CompletedFooter
          issueSlug={issueSlug ?? null}
          domain={initialState.domain}
        />
      ) : (
        <Composer
          onSend={handleSend}
          disabled={isStreaming}
          draftKey={letterId}
          // A-3 · 空态时把情境 chips 紧贴 textarea 上方；非空态不渲染
          chips={turns.length === 0 ? emptyChips : undefined}
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

function CompletedFooter({
  issueSlug,
  domain,
}: {
  issueSlug: string | null;
  domain?: string;
}) {
  // 6.1 · 域交叉「换个命题」：刚写完一封信 → 对面域有全新内容可写（major↔mbti）。
  const crossDomain = domain === "major" ? "mbti" : "major";
  const crossDomainLabel = domain === "major" ? "再写一封 · 性格画像" : "再写一封 · 专业方向";

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
          // 6.1 · 有报告时：弱文本「换个命题」（域交叉）置于 accent 主链「看报告」左侧，
          // 保持从属（mono muted，不抢 accent 预算）。/letters/new 有副作用 → prefetch={false}。
          <div className="flex items-center gap-5">
            <Link
              href={`/letters/new?domain=${crossDomain}`}
              prefetch={false}
              onClick={() =>
                trackEvent("new_letter_from_issue", {
                  slug: issueSlug,
                  domain,
                  cross_domain: true,
                })
              }
              className="font-mono text-[10px] tracking-widest uppercase text-ink-muted hover:text-accent transition-colors whitespace-nowrap"
              aria-label="再写一封，写另一域的信"
            >
              {crossDomainLabel} →
            </Link>
            <Link
              href={`/issues/${issueSlug}`}
              className="fraunces-body italic text-[16px] text-accent hover:text-accent-soft border-b border-accent/40 hover:border-accent transition-colors pb-[2px] whitespace-nowrap"
            >
              看你的报告 <span className="font-mono not-italic">→</span>
            </Link>
          </div>
        ) : (
          <Link
            href="/letters/new"
            // /letters/new 是带副作用的 GET（渲染即 createLetter 落一行 test_sessions）→ prefetch={false} 防孤儿会话
            prefetch={false}
            className="fraunces-body italic text-[16px] text-accent hover:text-accent-soft border-b border-accent/40 hover:border-accent transition-colors pb-[2px]"
          >
            再写一封 <span className="font-mono not-italic">→</span>
          </Link>
        )}
      </div>
    </footer>
  );
}
