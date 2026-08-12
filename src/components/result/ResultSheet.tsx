"use client";

import { AudioBriefing } from "./AudioBriefing";
import { CriteriaTable } from "./CriteriaTable";
import { DomainCards } from "./DomainCard";
import { RiskList } from "./RiskList";
import { ScoreHero } from "./ScoreHero";
import { StrengthList } from "./StrengthList";
import { VerdictCard } from "./VerdictCard";
import type { ApiEvaluation } from "./types";

/** 심사 결과서 — 공문서 프레임 */
export function ResultSheet({ result }: { result: ApiEvaluation }) {
  return (
    <article className="border-2 border-ink bg-sheet">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink px-6 py-4">
        <h2 className="font-display text-2xl font-black tracking-tight">심사 결과서</h2>
        {/* min-w-0: flex 항목 기본 min-width:auto가 긴 URL을 밀어내는 것을 막는다 */}
        <div className="min-w-0 text-left text-xs text-ink-soft sm:text-right">
          {result.repo && (
            <p>
              <a
                href={result.repo.url}
                target="_blank"
                rel="noreferrer"
                className="font-mono break-all underline underline-offset-2 hover:text-seal"
              >
                {result.repo.url.replace("https://github.com/", "")}
              </a>
              <span className="ml-1">
                @ {result.repo.branch} · 파일 {result.repo.files.length}개 수집
              </span>
            </p>
          )}
          {result.repo && (
            <p>
              기획서:{" "}
              {result.repo.plan_path ? (
                <span className="font-mono break-all">{result.repo.plan_path}</span>
              ) : (
                <span className="text-seal">레포에서 발견되지 않음</span>
              )}
            </p>
          )}
          <p className="font-mono">
            {result.ensemble.model} · 항목당 {result.ensemble.n}회 채점
            {result.ensemble.fallback_used && " · 예비 모델 사용"}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-8 px-6 py-8">
        <ScoreHero result={result} />
        <DomainCards result={result} />
        <CriteriaTable result={result} />
        <StrengthList result={result} />
        <RiskList result={result} />
        <VerdictCard result={result} />
        <AudioBriefing result={result} />
      </div>
    </article>
  );
}
