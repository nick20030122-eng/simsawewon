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
    "공개 GitHub 레포를 제출하면 기관용·기업용 트랙으로 2개 분야 6개 항목을 " +
    "앙상블 채점하고 심사 결과서를 발급합니다.",
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
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:border-2 focus:border-ink focus:bg-sheet focus:px-4 focus:py-2 focus:text-sm focus:font-bold"
        >
          본문으로 건너뛰기
        </a>
        <header data-site-header className="border-b-2 border-ink bg-sheet">
          <div className="mx-auto flex w-full max-w-4xl items-baseline justify-between gap-4 px-5 py-4">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-display text-xl font-black tracking-tight">
                AI 심사위원
              </span>
              <span className="hidden text-xs text-ink-soft sm:inline">
                기관·기업 바이브 코딩 검증
              </span>
            </Link>
            <nav aria-label="주요 메뉴" className="flex gap-5 text-sm font-medium">
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

        <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
          {children}
        </main>

        <footer data-site-footer className="border-t border-line bg-sheet">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-1 px-5 py-4 text-xs text-ink-soft sm:flex-row sm:items-center sm:justify-between">
            <span>AI 심사위원 · 점수는 참고용이며 최종 심사를 대신하지 않습니다.</span>
            <span className="shrink-0 font-mono">v2.1</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
