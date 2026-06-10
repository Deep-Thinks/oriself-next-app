import { ImageResponse } from "next/og";
import { getIssue } from "@/lib/api";
import { loadNotoSerifSCSubset } from "@/lib/og-font";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "OriSelf 命题";
// node runtime (默认) —— 需要它来解析 process.env.API_INTERNAL_URL 并发出出网请求取字体。

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = await getIssue(slug).catch(() => null);
  const title = meta?.title ?? "OriSelf";
  // 把卡片上所有会出现的中文字符一起子集化，省一次往返。
  const font = await loadNotoSerifSCSubset(
    `${title}ORISELF · 一封写给你的信next.oriself.com`,
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
            fontSize: 30,
            letterSpacing: 8,
            opacity: 0.6,
            marginBottom: 32,
          }}
        >
          ORISELF · 一封写给你的信
        </div>
        <div style={{ fontSize: 84, fontWeight: 600, lineHeight: 1.15, display: "flex" }}>
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
