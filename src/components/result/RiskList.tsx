"use client";

import type { ApiEvaluation } from "./types";

/** 감점 요인 — 최대 5개 */
export function RiskList({ result }: { result: ApiEvaluation }) {
  return (
    <section>
      <h3 className="font-display text-lg font-bold">감점 요인</h3>
      <ol className="mt-3 space-y-2">
        {result.risks.map((risk, index) => (
          <li key={risk} className="flex gap-3 border border-line bg-paper p-3 text-sm leading-relaxed">
            <span className="shrink-0 font-mono text-xs text-seal">{index + 1}</span>
            <span>{risk}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
