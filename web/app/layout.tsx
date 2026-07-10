import type { Metadata } from "next";
import {
  Fraunces,
  Instrument_Sans,
  JetBrains_Mono,
  Noto_Serif_SC,
} from "next/font/google";
import { AuthorBadge } from "@/components/primitives/author-badge";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
  style: ["normal", "italic"],
});

const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const notoSerifSC = Noto_Serif_SC({
  subsets: ["latin"],
  variable: "--font-noto-serif-sc",
  display: "swap",
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // title/description 面向真实搜索词（mbti测试/16型人格/ai人格测试），
  // 品牌语「用对话代替选择题」本身就是差异化关键词；勿回退成自造词「人格画像」单打。
  title: {
    default: "OriSelf · 用对话代替选择题的 MBTI 人格测试",
    template: "%s · OriSelf",
  },
  description:
    "免费、无需注册的对话式 MBTI / 16 型人格测试。不做选择题——像写信一样和 AI 聊十分钟，收到一封写给你的人格画像。也可以聊聊你适合学什么专业。",
  alternates: { canonical: "/" },
  // Favicon 走 app/icon.svg（Next 15 自动探测），不要在这里写死 icons。
  // /favicon.ico 绝对路径 —— 之前 public/ 并不存在导致 404。
  // og:image 走 app/opengraph-image.tsx（Next 自动注入，twitter 复用同图）。
  openGraph: {
    type: "website",
    siteName: "OriSelf",
    locale: "zh_CN",
    url: SITE_URL,
    title: "OriSelf · 用对话代替选择题的 MBTI 人格测试",
    description:
      "不做选择题——像写信一样和 AI 聊十分钟，收到一封写给你的人格画像。免费、无需注册。",
  },
  twitter: {
    card: "summary_large_image",
    title: "OriSelf · 用对话代替选择题的 MBTI 人格测试",
    description:
      "不做选择题——像写信一样和 AI 聊十分钟，收到一封写给你的人格画像。免费、无需注册。",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="zh-CN"
      className={`${fraunces.variable} ${instrument.variable} ${jetbrains.variable} ${notoSerifSC.variable}`}
    >
      <body>
        {children}
        <AuthorBadge />
      </body>
    </html>
  );
}
