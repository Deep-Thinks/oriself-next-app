"use client";

import { useEffect, useState } from "react";
import { clearClaim, getOwnerToken } from "@/lib/history";
import { ApiError, getIssue, publishIssue } from "@/lib/api";

/**
 * 「公开到画廊」开关 · §5。
 *
 * 仅当本浏览器持有这条命题的 owner_token（= 生成者本人；写出 ownerToken 或认领 claim）时
 * 才渲染；否则返回 null（被分享者 / 陌生访客看不到此入口）。owner 凭证统一走
 * `getOwnerToken(slug)`：先幂等消费 URL fragment(#claim=)，再查本地写出/认领。访问仍是
 * capability-URL：私有不影响凭链接看，公开只决定是否进 sitemap/画廊、被搜索引擎收录。
 *
 * 视觉：弱文本链接，与 AUTHOR/反馈 同级 —— 不抢「复制地址」唯一 accent primary 的预算（P4）。
 */
export function PublishToggle({ slug }: { slug: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [claimCopied, setClaimCopied] = useState(false);

  useEffect(() => {
    // getOwnerToken 会顺带消费 #claim= fragment（跨浏览器认领，微信场景）。
    const tok = getOwnerToken(slug);
    if (tok) {
      setToken(tok);
      // 只有本人才拉 is_public 当前值（避免给非本人发无谓请求）。
      getIssue(slug)
        .then((m) => setIsPublic(m.is_public))
        .catch(() => {});
    }
  }, [slug]);

  // 非本人（无 token）或状态未就绪 → 不渲染。
  if (!token || isPublic === null) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      const m = await publishIssue(slug, !isPublic, token);
      setIsPublic(m.is_public);
    } catch (err) {
      // 403 = 凭证已失效（认领链接的 token 被轮换 / DB 重置）→ 自清，收起入口。
      if (err instanceof ApiError && err.status === 403) {
        clearClaim(slug);
        setToken(null);
      }
      /* 其它失败保持原状态，不打断报告浏览 */
    } finally {
      setBusy(false);
    }
  };

  const copyClaimLink = async () => {
    try {
      const url = `${window.location.origin}/issues/${slug}#claim=${token}`;
      await navigator.clipboard.writeText(url);
      setClaimCopied(true);
      setTimeout(() => setClaimCopied(false), 1600);
    } catch {
      /* 复制失败静默 —— 不打断报告浏览 */
    }
  };

  return (
    <>
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
      {/* 认领链接 · 仅本人可见（跨浏览器 / 换设备管理 publish 态，微信场景）。
          链接含 #claim=<token>，fragment 不发服务器；持有者仅能改公开态，看不到对话。 */}
      <button
        type="button"
        onClick={copyClaimLink}
        className="text-ink-muted hover:text-accent transition-colors bg-transparent border-0 p-0 font-mono text-[10px]"
        title="仅发给自己（如文件传输助手）。持有此链接的人可以更改这封信的公开状态"
      >
        {claimCopied ? "已抄下 ✓" : "在微信/其他设备管理 ⎘"}
      </button>
    </>
  );
}
