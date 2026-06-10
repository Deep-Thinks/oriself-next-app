import { ImageResponse } from "next/og";
import { getIssue } from "@/lib/api";
import { loadNotoSerifSCSubset } from "@/lib/og-font";

// Route Handler（route.tsx）不接受 size/contentType 元数据导出（那是 opengraph-image.tsx
// 这类文件约定的字段）；这里作为普通局部常量即可。ImageResponse 自身返回 image/png。
const SIZE = { width: 1080, height: 1440 } as const;
// node runtime (默认) —— 需要它来解析 process.env.API_INTERNAL_URL 并发出出网请求取字体 / 元数据。

/**
 * /issues/:slug/share-card · 3:4 竖版分享图（朋友圈 / 小红书截图文化）。
 *
 * 与 opengraph-image.tsx（深色横卡，喂 OG 卡）相反：朋友圈/小红书是白底环境，
 * 这里反相成「暖纸」（warm paper）——浅底深字、单一 oxblood accent，截图发出去更跳。
 * 控制住的标题+身份+域名，胜过用户随手截的半屏报告。
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const meta = await getIssue(slug).catch(() => null);
  const rawTitle = meta?.title ?? "OriSelf";
  // 与 4.1 同一截断/降字号阶梯：>40 字截断；竖卡更高，字号可比横卡略大。
  const title = rawTitle.length > 40 ? `${rawTitle.slice(0, 40)}…` : rawTitle;
  const titleFontSize =
    title.length <= 14 ? 96 : title.length <= 24 ? 72 : 56;
  // 身份 token：mbti 显四字母；major 显真实方向标签，绝不显示占位 "MAJOR"。
  const isMajor = meta?.domain === "major" || meta?.mbti_type === "MAJOR";
  const token = isMajor ? (meta?.result_label ?? "专业方向") : (meta?.mbti_type ?? "");
  const excerpt = meta?.excerpt ?? "";
  // 子集化所有会出现的字符（标题 / token / "专业方向" / 摘录 / kicker / 域名 / 省略号）。
  const font = await loadNotoSerifSCSubset(
    `${title}…专业方向${token}${excerpt}ORISELF · 一封写给你的信next.oriself.com`,
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "104px 100px",
          background: "linear-gradient(160deg,#F7F2E8,#EFE7D6)",
          color: "#1A1512",
          fontFamily: font ? "Noto Serif SC" : "sans-serif",
        }}
      >
        {/* Top · kicker */}
        <div
          style={{
            fontSize: 26,
            letterSpacing: 9,
            opacity: 0.5,
            display: "flex",
          }}
        >
          ORISELF · 一封写给你的信
        </div>

        {/* Middle · 视觉中心：身份 badge + 标题 + （可选）摘录一行 */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {token ? (
            <div
              style={{
                alignSelf: "flex-start",
                fontSize: 28,
                letterSpacing: isMajor ? 2 : 10,
                color: "#7A1F1A",
                border: "1px solid #7A1F1A",
                borderRadius: 3,
                padding: "8px 18px",
                marginBottom: 40,
                display: "flex",
              }}
            >
              {token}
            </div>
          ) : null}
          <div
            style={{
              fontSize: titleFontSize,
              fontWeight: 600,
              lineHeight: 1.18,
              display: "flex",
            }}
          >
            {title}
          </div>
          {excerpt ? (
            <div
              style={{
                fontSize: 30,
                lineHeight: 1.5,
                opacity: 0.55,
                marginTop: 36,
                display: "flex",
              }}
            >
              {excerpt.length > 36 ? `${excerpt.slice(0, 36)}…` : excerpt}
            </div>
          ) : null}
        </div>

        {/* Bottom · 域名 */}
        <div
          style={{
            fontSize: 28,
            letterSpacing: 4,
            opacity: 0.45,
            display: "flex",
          }}
        >
          next.oriself.com
        </div>
      </div>
    ),
    {
      ...SIZE,
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
