import Link from "next/link";

const DOMAINS = [
  {
    no: "제1분야",
    title: "공공기관 적합성",
    target: "기획서",
    items: ["페인포인트 명확성", "해결 방향 적절성", "공공 현장 적용 가능성"],
  },
  {
    no: "제2분야",
    title: "의도 구현도",
    target: "기획서 ↔ 실행 코드",
    items: ["핵심 요구사항 구현", "성공 기준 충족", "기획 의도 일치"],
  },
  {
    no: "제3분야",
    title: "README 품질",
    target: "README 문서",
    items: ["설치·실행 안내", "기획·코드 정합성", "유지보수·확장 가이드"],
  },
] as const;

export default function HomePage() {
  return (
    <div className="flex flex-col gap-14">
      {/* 히어로 — 문서 표제 */}
      <section className="border-2 border-ink bg-sheet px-6 py-12 sm:px-12">
        <p className="text-xs font-medium tracking-[0.3em] text-ink-soft">
          공공기관 바이브 코딩 검증
        </p>
        <h1 className="mt-4 font-display text-4xl font-black leading-snug tracking-tight sm:text-5xl">
          기획서와 코드를 읽고,
          <br />
          아홉 항목을 세 번씩 채점합니다.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-soft">
          공개 GitHub 레포 주소만 제출하면 AI 심사위원이 레포에서 기획서(PLAN.md)와
          README·코드를 수집해 3개 분야 9개 항목을 채점하고, 심사 결과서를
          발급합니다. 같은 제출물에는 같은 점수가 나오도록 항목마다 여러 번 채점해
          중앙값을 기록합니다.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/evaluate"
            className="border-2 border-ink bg-ink px-6 py-3 text-sm font-bold text-sheet transition-colors hover:border-seal hover:bg-seal"
          >
            심사 접수하기
          </Link>
          <Link
            href="/criteria"
            className="text-sm font-medium text-ink-soft underline underline-offset-4 hover:text-seal"
          >
            채점 기준 먼저 보기
          </Link>
        </div>
      </section>

      {/* 3대 분야 */}
      <section>
        <h2 className="font-display text-2xl font-black">심사 분야</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {DOMAINS.map((domain) => (
            <article key={domain.title} className="border border-line bg-sheet p-5">
              <p className="text-xs font-medium tracking-widest text-seal">{domain.no}</p>
              <h3 className="mt-1 font-display text-lg font-bold">{domain.title}</h3>
              <p className="mt-1 text-xs text-ink-soft">평가 대상 · {domain.target}</p>
              <ul className="mt-4 space-y-2 border-t border-line pt-3 text-sm text-ink-soft">
                {domain.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden className="text-line-strong">
                      —
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* 채점 방식 */}
      <section className="border border-line bg-sheet p-6 sm:p-8">
        <h2 className="font-display text-2xl font-black">채점 방식</h2>
        <dl className="mt-5 grid gap-6 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-bold">앙상블 채점</dt>
            <dd className="mt-1 leading-relaxed text-ink-soft">
              항목마다 독립적으로 여러 번 채점하고 중앙값을 최종 점수로 기록합니다.
              실행할 때마다 점수가 흔들리는 문제를 줄입니다.
            </dd>
          </div>
          <div>
            <dt className="font-bold">판정 불안정 표시</dt>
            <dd className="mt-1 leading-relaxed text-ink-soft">
              반복 채점 간 편차가 큰 항목에는 별도 표식을 남깁니다. 표식이 있는
              항목은 심사위원의 직접 확인을 권합니다.
            </dd>
          </div>
          <div>
            <dt className="font-bold">부적격 분야 0점</dt>
            <dd className="mt-1 leading-relaxed text-ink-soft">
              무의미한 입력이나 주제가 다른 제출물은 해당 분야만 0점으로
              처리하고, 사유를 결과서에 명시합니다.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
