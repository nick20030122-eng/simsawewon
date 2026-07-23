"use client";

import { MODE_BADGES, type ApiEvaluation } from "./types";

/** 관인 스탬프 + 종합 점수 — 결과서의 시그니처 요소 */
export function ScoreHero({ result }: { result: ApiEvaluation }) {
  const badge = MODE_BADGES[result.evaluation_mode];

  return (
    <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium tracking-[0.3em] text-ink-soft">종합 점수</p>
          <span className={`px-2 py-0.5 text-[0.65rem] font-bold ${badge.className}`}>
            {badge.label}
          </span>
        </div>
        <p className="mt-1 font-mono text-6xl font-semibold tabular-nums">
          {result.total_score}
          <span className="ml-1 text-lg text-ink-soft">/ 100</span>
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {[
            ["공공기관 적합성", result.public_sector_score],
            ["의도 구현도", result.intent_implementation_score],
            ["README 품질", result.readme_quality_score],
          ].map(([label, score]) => (
            <div key={String(label)} className="flex items-baseline gap-2">
              <dt className="text-ink-soft">{label}</dt>
              <dd className="font-mono font-semibold tabular-nums">{score}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="stamp stamp-appear shrink-0 self-center" aria-hidden>
        <span className="font-display text-xs font-bold tracking-[0.35em]">심사필</span>
        <span className="font-mono text-3xl font-semibold tabular-nums">
          {result.total_score}
        </span>
        <span className="text-[0.6rem] tracking-widest">AI 심사위원</span>
      </div>
    </div>
  );
}
