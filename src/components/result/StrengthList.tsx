"use client";

import type { ApiEvaluation } from "./types";

/** 잘한 점 — 감점 요인과 대칭. 적정(verdant) 톤으로 구분한다 */
export function StrengthList({ result }: { result: ApiEvaluation }) {
  if (result.strengths.length === 0) return null;

  return (
    <section>
      <h3 className="font-display text-lg font-bold">잘한 점</h3>
      <ul className="mt-3 space-y-2">
        {result.strengths.map((strength, index) => (
          <li
            key={`${index}-${strength}`}
            className="flex gap-3 border border-line bg-paper p-3 text-sm leading-relaxed"
          >
            <span className="shrink-0 font-mono text-xs text-verdant">{index + 1}</span>
            <span>{strength}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
