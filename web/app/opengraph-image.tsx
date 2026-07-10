import { ImageResponse } from "next/og";
import { loadGoogleFontSubset, loadNotoSerifSCSubset } from "@/lib/og-font";

/**
 * 根 og:image · 刊头卡（1200×630）。
 *
 * 与站内同一张纸：paper 底、ink 字、oxblood 一笔。字标用 Fraunces italic
 * （css2 轴参数取不到变轴 TTF，就用静态 italic 400），中文走 Noto Serif SC；
 * 任一字体取不到都降级为系统衬线，卡片本身始终能出。
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "OriSelf · 用对话代替选择题的 MBTI 人格测试";

const TAGLINE = "用对话代替选择题";
const SUBLINE = "聊十分钟，带走一封写给自己的信。";

export default async function Image() {
  const [fraunces, noto] = await Promise.all([
    loadGoogleFontSubset("Fraunces:ital,wght@1,400", "OriSelf"),
    loadNotoSerifSCSubset(`${TAGLINE}${SUBLINE}·对话式人格画像 MBTI`),
  ]);

  const fonts = [
    ...(fraunces
      ? [{ name: "Fraunces", data: fraunces, style: "italic" as const, weight: 400 as const }]
      : []),
    ...(noto
      ? [{ name: "Noto Serif SC", data: noto, style: "normal" as const, weight: 500 as const }]
      : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "88px 96px",
          background: "#F5F0E6",
          backgroundImage:
            "radial-gradient(ellipse at center, rgba(26,21,18,0) 55%, rgba(26,21,18,0.07) 100%)",
          color: "#1A1512",
          fontFamily: noto ? "Noto Serif SC" : "serif",
        }}
      >
        <div
          style={{
            fontSize: 22,
            letterSpacing: 10,
            color: "#7A1F1A",
            display: "flex",
          }}
        >
          ORISELF · 对话式人格画像 · MBTI
        </div>
        <div
          style={{
            fontFamily: fraunces ? "Fraunces" : "serif",
            fontStyle: "italic",
            fontSize: 176,
            lineHeight: 1,
            letterSpacing: -7,
            marginTop: 26,
            display: "flex",
          }}
        >
          OriSelf
        </div>
        <div
          style={{
            width: 132,
            height: 3,
            background: "#7A1F1A",
            marginTop: 40,
            display: "flex",
          }}
        />
        <div
          style={{
            fontSize: 42,
            marginTop: 36,
            color: "#1A1512",
            display: "flex",
          }}
        >
          {TAGLINE}
        </div>
        <div
          style={{
            fontSize: 27,
            marginTop: 16,
            color: "#4A3F36",
            display: "flex",
          }}
        >
          {SUBLINE}
        </div>
      </div>
    ),
    { ...size, ...(fonts.length ? { fonts } : {}) },
  );
}
