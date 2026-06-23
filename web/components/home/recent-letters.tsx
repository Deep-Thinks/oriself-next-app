"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  exportLetters,
  getAllLetters,
  importLetters,
  removeLetter,
  type LocalLetterEntry,
} from "@/lib/history";

/**
 * 首页 · 信匣（最近写过的信 + 导出/导入），默认折叠成一行 tab。
 *
 * - 纯 localStorage，没有网络。
 * - 折叠态只占一行（「历史记录 · N 封 ▾」），保证首屏 16:9 放得下；点开才展列表。
 * - 空信匣：只留一枚极低调的「导入信匣」（换设备恢复用）。
 */
export function RecentLetters() {
  const [entries, setEntries] = useState<LocalLetterEntry[]>([]);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);

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

  const handleImport = useCallback(() => {
    try {
      const { imported, total } = importLetters(importText);
      setEntries(getAllLetters());
      setImportText("");
      setImportMsg(`已导入 ${imported} 封 · 信匣共 ${total} 封 ✓`);
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "导入失败");
    }
  }, [importText]);

  // SSR 期间不渲染（localStorage 仅客户端）
  if (!mounted) return null;

  const hasEntries = entries.length > 0;
  const tabClass =
    "font-mono text-[10px] tracking-widest uppercase text-ink-muted hover:text-accent transition-colors bg-transparent border-0 cursor-pointer p-0";

  // 空信匣：只留一枚导入入口（换设备恢复）。
  if (!hasEntries) {
    return (
      <section
        aria-label="信匣"
        className="w-full max-w-[620px] mx-auto px-6 sm:px-8 pb-3 text-center"
      >
        <button
          type="button"
          onClick={() => {
            setImporting((v) => !v);
            setImportMsg(null);
          }}
          className={tabClass}
          aria-label="导入信匣 · 粘贴备份凭证恢复"
        >
          导入信匣 ⎗
        </button>
        {importing && (
          <ImportPanel
            value={importText}
            onChange={setImportText}
            onImport={handleImport}
            msg={importMsg}
          />
        )}
      </section>
    );
  }

  return (
    <section
      aria-label="信匣"
      className="w-full max-w-[620px] mx-auto px-6 sm:px-8 pb-3"
    >
      {/* 折叠 tab：一行，保证折叠态首屏放得下 */}
      <div className="text-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={tabClass}
          aria-expanded={open}
          aria-label={open ? "收起历史记录" : "展开历史记录"}
        >
          历史记录 · {entries.length} 封 {open ? "▴" : "▾"}
        </button>
      </div>

      {open && (
        <div className="mt-6">
          <ul className="space-y-5">
            {entries.map((e) => (
              <LetterRow key={e.letterId} entry={e} onRemove={handleRemove} />
            ))}
          </ul>

          <div className="mt-6 flex items-center gap-5 flex-wrap">
            <button
              type="button"
              onClick={handleExport}
              className={tabClass}
              aria-label="导出信匣 · 抄下清单与凭证"
              title="抄下你信匣的清单与凭证（换设备时粘回来即可找回）"
            >
              {copied ? "已抄下 ✓" : "导出信匣 ⎘"}
            </button>
            <button
              type="button"
              onClick={() => {
                setImporting((v) => !v);
                setImportMsg(null);
              }}
              className={tabClass}
              aria-label="导入信匣 · 粘贴备份凭证恢复"
            >
              导入信匣 ⎗
            </button>
          </div>

          {importing && (
            <ImportPanel
              value={importText}
              onChange={setImportText}
              onImport={handleImport}
              msg={importMsg}
            />
          )}
        </div>
      )}
    </section>
  );
}

function ImportPanel({
  value,
  onChange,
  onImport,
  msg,
}: {
  value: string;
  onChange: (v: string) => void;
  onImport: () => void;
  msg: string | null;
}) {
  return (
    <div className="mt-4 text-left">
      <textarea
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        rows={4}
        placeholder="把之前「导出信匣」抄下的整段文本粘贴到这里"
        className="no-scrollbar w-full bg-paper-warm border border-rule rounded-sm p-3 font-mono text-[12px] leading-relaxed text-ink-soft placeholder:text-ink-muted resize-none focus:outline-none focus:border-accent"
      />
      <div className="mt-2 flex items-center gap-4">
        <button
          type="button"
          onClick={onImport}
          disabled={value.trim().length === 0}
          className="fraunces-body-soft italic text-[14px] text-accent hover:text-accent-soft border-b border-accent disabled:opacity-40 disabled:cursor-default transition-colors"
        >
          导入 →
        </button>
        {msg && (
          <span className="font-mono text-[10px] tracking-wide text-ink-muted">
            {msg}
          </span>
        )}
      </div>
    </div>
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
