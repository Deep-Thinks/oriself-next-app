"use client";

import { useEffect, useState } from "react";
import { getAllLetters } from "@/lib/history";
import { getIssue, publishIssue } from "@/lib/api";

/**
 * 「公开到画廊」开关 · §5。
 *
 * 仅当本地历史里存有这条命题的 ownerToken（= 生成者本人）时才渲染；否则返回 null
 * （被分享者 / 陌生访客看不到此入口）。访问仍是 capability-URL：私有不影响凭链接看，
 * 公开只决定是否进 sitemap/画廊、被搜索引擎收录。
 *
 * 视觉：弱文本链接，与 AUTHOR/反馈 同级 —— 不抢「复制地址」唯一 accent primary 的预算（P4）。
 */
export function PublishToggle({
  slug,
  letterId,
}: {
  slug: string;
  letterId?: string;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!letterId) return;
    const entry = getAllLetters().find((e) => e.letterId === letterId);
    if (entry?.ownerToken) {
      setToken(entry.ownerToken);
      // 只有本人才拉 is_public 当前值（避免给非本人发无谓请求）。
      getIssue(slug)
        .then((m) => setIsPublic(m.is_public))
        .catch(() => {});
    }
  }, [slug, letterId]);

  // 非本人（无 token）或状态未就绪 → 不渲染。
  if (!token || isPublic === null) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      const m = await publishIssue(slug, !isPublic, token);
      setIsPublic(m.is_public);
    } catch {
      /* 失败保持原状态，不打断报告浏览 */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="hover:text-accent transition-colors bg-transparent border-0 p-0 disabled:opacity-50"
      title={
        isPublic
          ? "已公开到画廊（可被搜索到），点此转回私有"
          : "公开这条命题到画廊（将被搜索引擎收录）"
      }
    >
      {isPublic ? "已公开 · 转私有" : "公开到画廊"}
    </button>
  );
}
