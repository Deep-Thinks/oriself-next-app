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
  title: { default: "OriSelf · 对话式人格画像", template: "%s · OriSelf" },
  description: "用一场对话，写下只属于你的人格命题。中文 · 2026。",
  alternates: { canonical: "/" },
  // Favicon 走 app/icon.svg（Next 15 自动探测），不要在这里写死 icons。
  // /favicon.ico 绝对路径 —— 之前 public/ 并不存在导致 404。
  openGraph: {
    type: "website",
    siteName: "OriSelf",
    locale: "zh_CN",
    url: SITE_URL,
    title: "OriSelf · 对话式人格画像",
    description: "用一场对话，写下只属于你的人格命题。",
  },
  twitter: {
    card: "summary_large_image",
    title: "OriSelf · 对话式人格画像",
    description: "用一场对话，写下只属于你的人格命题。",
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
