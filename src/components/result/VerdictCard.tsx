"use client";

import type { ApiEvaluation } from "./types";

/** 최종 한마디 */
export function VerdictCard({ result }: { result: ApiEvaluation }) {
  return (
    <section className="border-l-4 border-seal bg-paper p-5">
      <h3 className="text-xs font-medium tracking-[0.3em] text-ink-soft">심사위원 총평</h3>
      <p className="mt-2 font-display text-lg font-semibold leading-relaxed">
        {result.final_verdict}
      </p>
      {result.review_fallback && (
        <p className="mt-2 text-xs text-ink-soft">
          자동 총평 생성에 문제가 있어 기본 총평으로 대체했습니다. 점수는 정상
          산출되었습니다.
        </p>
      )}
    </section>
  );
}
