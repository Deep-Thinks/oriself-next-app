import { ImageResponse } from "next/og";
import { getIssue } from "@/lib/api";
import { loadNotoSerifSCSubset } from "@/lib/og-font";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "OriSelf 人格画像";
// node runtime (默认) —— 需要它来解析 process.env.API_INTERNAL_URL 并发出出网请求取字体。

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = await getIssue(slug).catch(() => null);
  const rawTitle = meta?.title ?? "OriSelf";
  // 标题最长可达 200 字（schema card_title），固定 84px 会撑爆 630 画布：先截断再按长度阶梯降字号。
  const title = rawTitle.length > 40 ? `${rawTitle.slice(0, 40)}…` : rawTitle;
  const titleFontSize =
    title.length <= 14 ? 84 : title.length <= 24 ? 64 : 52;
  // 身份 token：mbti 显四字母；major 显真实方向标签，绝不显示占位 "MAJOR"。
  const isMajor = meta?.domain === "major" || meta?.mbti_type === "MAJOR";
  const token = isMajor ? (meta?.result_label ?? "专业方向") : (meta?.mbti_type ?? "");
  // 把卡片上所有会出现的字符一起子集化（含 token / "专业方向" / 省略号），省一次往返。
  const font = await loadNotoSerifSCSubset(
    `${title}…专业方向${token}ORISELF · 一封写给你的信next.oriself.com`,
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "100px",
          background: "linear-gradient(135deg,#1a1410,#2b2018)",
          color: "#f4ece0",
          fontFamily: font ? "Noto Serif SC" : "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 24,
            marginBottom: 32,
          }}
        >
          <div style={{ fontSize: 30, letterSpacing: 8, opacity: 0.6 }}>
            ORISELF · 一封写给你的信
          </div>
          {token ? (
            <div
              style={{
                fontSize: 28,
                letterSpacing: isMajor ? 2 : 11,
                opacity: 0.85,
                color: "#d8a25e",
              }}
            >
              {token}
            </div>
          ) : null}
        </div>
        <div
          style={{
            fontSize: titleFontSize,
            fontWeight: 600,
            lineHeight: 1.15,
            display: "flex",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 28, opacity: 0.7, marginTop: 48 }}>
          next.oriself.com
        </div>
      </div>
    ),
    {
      ...size,
      ...(font
        ? {
            fonts: [
              { name: "Noto Serif SC", data: font, style: "normal", weight: 500 },
            ],
          }
        : {}),
    },
  );
}
