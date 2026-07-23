import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_KR, Noto_Serif_KR } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const notoSerifKr = Noto_Serif_KR({
  weight: ["600", "900"],
  subsets: ["latin"],
  variable: "--font-noto-serif-kr",
  display: "swap",
});

const plexSansKr = IBM_Plex_Sans_KR({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-plex-sans-kr",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  weight: ["500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI 심사위원 — 바이브 코딩 검증",
  description:
    "기획서와 공개 GitHub 레포를 제출하면 3대 분야 9개 항목을 앙상블 채점하고 심사 결과서를 발급합니다.",
};

const NAV_ITEMS = [
  { href: "/", label: "홈" },
  { href: "/evaluate", label: "심사 접수" },
  { href: "/criteria", label: "채점 기준" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body
        className={`${notoSerifKr.variable} ${plexSansKr.variable} ${plexMono.variable} min-h-dvh flex flex-col antialiased`}
      >
        <header className="border-b-2 border-ink bg-sheet">
          <div className="mx-auto flex w-full max-w-4xl items-baseline justify-between gap-4 px-5 py-4">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-display text-xl font-black tracking-tight">
                AI 심사위원
              </span>
              <span className="hidden text-xs text-ink-soft sm:inline">
                공공기관 바이브 코딩 검증
              </span>
            </Link>
            <nav className="flex gap-5 text-sm font-medium">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-ink-soft transition-colors hover:text-seal"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">{children}</main>

        <footer className="border-t border-line bg-sheet">
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-5 py-4 text-xs text-ink-soft">
            <span>AI 심사위원 · 점수는 참고용이며 최종 판정은 심사위원회가 합니다.</span>
            <span className="font-mono">v2.0</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
