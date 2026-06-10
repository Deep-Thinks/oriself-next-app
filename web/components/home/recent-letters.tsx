"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  exportLetters,
  getAllLetters,
  removeLetter,
  type LocalLetterEntry,
} from "@/lib/history";

/**
 * 首页 · 最近在你浏览器里写过的信。
 *
 * - 纯 localStorage，没有网络。
 * - 空态直接不渲染，保留作品集极简感。
 * - 每条一行：左侧标题 / 元信息，右侧入口链接，最右小 × 可删（本地删除，不影响后端数据）。
 */
export function RecentLetters() {
  const [entries, setEntries] = useState<LocalLetterEntry[]>([]);
  const [mounted, setMounted] = useState(false);
  // 6.2 · 导出信匣的「已抄下」反馈（同 issue-chrome 的 copied 模式，1.6s 后复位）
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEntries(getAllLetters());
    setMounted(true);
  }, []);

  const handleRemove = useCallback((id: string) => {
    removeLetter(id);
    setEntries(getAllLetters());
  }, []);

  const handleExport = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(exportLetters());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard 不可用（无 https / 权限）— 静默 */
    }
  }, []);

  // SSR 期间 / 空历史 · 不渲染整块
  if (!mounted || entries.length === 0) return null;

  return (
    <section
      aria-label="你最近的信"
      className="w-full max-w-[620px] mx-auto px-6 sm:px-8 pb-20"
    >
      <p className="font-mono text-[10px] tracking-widest uppercase text-ink-muted mb-6">
        最近在你的浏览器里 · 本地保存 · 未上传
      </p>
      <ul className="space-y-5">
        {entries.map((e) => (
          <LetterRow key={e.letterId} entry={e} onRemove={handleRemove} />
        ))}
      </ul>
      {/* 6.2 · 信匣导出 · 弱 mono 链接：抄下人可读清单 + JSON 凭证（换设备手动找回 publish 权的备份）。
          仅做导出，不做导入/云/二维码（跨设备恢复靠认领链接，此处只是离线备份）。 */}
      <button
        type="button"
        onClick={handleExport}
        className="mt-6 font-mono text-[10px] tracking-widest uppercase text-ink-muted hover:text-accent transition-colors bg-transparent border-0 cursor-pointer p-0"
        aria-label="导出信匣 · 抄下清单与凭证"
        title="抄下你信匣的清单与凭证（换设备时粘贴回来即可找回）"
      >
        {copied ? "已抄下 ✓" : "导出信匣 ⎘"}
      </button>
    </section>
  );
}

function LetterRow({
  entry,
  onRemove,
}: {
  entry: LocalLetterEntry;
  onRemove: (id: string) => void;
}) {
  const isDone = entry.status === "completed" && !!entry.issueSlug;
  const targetHref = isDone
    ? `/issues/${entry.issueSlug}`
    : `/letters/${entry.letterId}`;
  const targetLabel = isDone ? "看报告" : "回到这封信";

  return (
    <li className="flex items-start justify-between gap-3 sm:gap-4 border-b border-rule pb-4">
      <div className="min-w-0 flex-1">
        <Link
          href={targetHref}
          className="group block no-underline"
          aria-label={`${targetLabel} · ${entry.letterId.slice(0, 8)}`}
        >
          <div className="flex items-baseline gap-3">
            {isDone && entry.domain === "major" ? (
              <span className="fraunces-body italic text-[13px] text-accent">
                {entry.resultLabel ?? entry.cardTitle ?? "专业方向"}
              </span>
            ) : isDone && entry.mbtiType ? (
              <span className="font-mono text-[12px] tracking-[0.18em] text-accent">
                {entry.mbtiType}
              </span>
            ) : (
              <span className="font-mono text-[10px] tracking-widest uppercase text-ink-muted">
                进行中 · R{String(entry.roundCount).padStart(2, "0")}
              </span>
            )}
            <span
              className="font-mono text-[10px] tracking-widest uppercase text-ink-muted"
              aria-hidden
            >
              {formatDate(entry.updatedAt)}
            </span>
          </div>

          <p
            className="fraunces-body italic text-[17px] leading-snug text-ink mt-[6px] truncate group-hover:text-accent transition-colors duration-300"
            title={entry.cardTitle ?? entry.letterId}
          >
            {entry.cardTitle ??
              (isDone ? "（未命名报告）" : "还没收尾的一封信")}
          </p>
        </Link>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 pt-[2px]">
        <Link
          href={targetHref}
          className="fraunces-body italic text-[14px] text-accent hover:text-accent-soft border-b border-accent/40 hover:border-accent transition-colors whitespace-nowrap"
        >
          {targetLabel} <span className="font-mono not-italic">→</span>
        </Link>
        <button
          type="button"
          onClick={() => onRemove(entry.letterId)}
          aria-label="从本地历史移除这条（后端数据不受影响）"
          title="从本地历史移除（后端数据不受影响）"
          className="font-mono text-[14px] leading-none text-ink-muted hover:text-accent transition-colors bg-transparent border-0 cursor-pointer p-1"
        >
          ×
        </button>
      </div>
    </li>
  );
}

function formatDate(ts: number): string {
  try {
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}.${m}.${day}`;
  } catch {
    return "";
  }
}
