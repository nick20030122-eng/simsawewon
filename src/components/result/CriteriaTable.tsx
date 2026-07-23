"use client";

import { scoreTone, TONE_TEXT, type ApiEvaluation } from "./types";

/** 9개 세부 항목 점수표 — 편차·판정 불안정 표식 포함 */
export function CriteriaTable({ result }: { result: ApiEvaluation }) {
  const showSpread = result.ensemble.n > 1;

  return (
    <section>
      <h3 className="font-display text-lg font-bold">세부 채점표</h3>
      {showSpread && (
        <p className="mt-1 text-xs text-ink-soft">
          각 항목을 {result.ensemble.n}회 채점해 중앙값을 기록했습니다. 편차가 큰
          항목에는 <span className="font-bold text-caution">판정 불안정</span> 표식이
          붙습니다.
        </p>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-y-2 border-ink text-left text-xs">
              <th className="py-2 pr-3 font-bold">분야</th>
              <th className="py-2 pr-3 font-bold">세부 항목</th>
              <th className="py-2 pr-3 text-right font-bold">점수</th>
              {showSpread && <th className="py-2 pr-3 text-right font-bold">표본</th>}
              {showSpread && <th className="py-2 text-right font-bold">편차</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {result.criteria.map((item) => (
              <tr key={item.key}>
                <td className="py-2.5 pr-3 text-xs text-ink-soft">{item.domain}</td>
                <td className="py-2.5 pr-3">
                  {item.label}
                  {item.unstable && (
                    <span className="ml-2 bg-caution-soft px-1.5 py-0.5 text-[0.65rem] font-bold text-caution">
                      판정 불안정
                    </span>
                  )}
                </td>
                <td
                  className={`py-2.5 pr-3 text-right font-mono font-semibold tabular-nums ${TONE_TEXT[scoreTone(item.score)]}`}
                >
                  {item.score}
                </td>
                {showSpread && (
                  <td className="py-2.5 pr-3 text-right font-mono text-xs tabular-nums text-ink-soft">
                    {item.samples.length > 0 ? item.samples.join(" · ") : "—"}
                  </td>
                )}
                {showSpread && (
                  <td className="py-2.5 text-right font-mono text-xs tabular-nums text-ink-soft">
                    {item.samples.length > 1 ? `±${item.range}` : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
