"use client";

import { scoreTone, TONE_TEXT, type ApiEvaluation } from "./types";

/** 6개 세부 항목 점수표 — 편차·판정 불안정 표식 포함 */
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
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span>
          <span className="font-bold text-verdant">■</span> 적정 70점 이상
        </span>
        <span>
          <span className="font-bold text-caution">■</span> 주의 50~69점
        </span>
        <span>
          <span className="font-bold text-seal">■</span> 미흡 50점 미만
        </span>
      </p>
      {/* 모바일에서 가로 스크롤이 생기므로 키보드로도 스크롤할 수 있게 포커스 대상으로 만든다 */}
      <div
        data-print-expand
        className="mt-3 overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="세부 채점표 (좌우 스크롤)"
      >
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <caption className="sr-only">
            세부 항목별 점수와 반복 채점 표본, 점수 폭
          </caption>
          <thead>
            <tr className="border-y-2 border-ink text-left text-xs">
              <th scope="col" className="py-2 pr-3 font-bold">분야</th>
              <th scope="col" className="py-2 pr-3 font-bold">세부 항목</th>
              <th scope="col" className="py-2 pr-3 text-right font-bold">점수</th>
              {showSpread && (
                <th scope="col" className="py-2 pr-3 text-right font-bold">표본</th>
              )}
              {showSpread && (
                <th scope="col" className="py-2 text-right font-bold">점수 폭</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {result.criteria.map((item) => (
              <tr key={item.key}>
                <td className="py-2.5 pr-3 text-xs text-ink-soft">{item.domain}</td>
                <td className="py-2.5 pr-3">
                  {item.label}
                  {item.unstable && (
                    <span className="ml-2 inline-block bg-caution-soft px-1.5 py-0.5 text-xs font-bold text-caution">
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
                    {item.samples.length > 1 ? item.range : "—"}
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
