// Design Ref: §2.2 [stage: aggregating] — 앙상블 집계: 세부 항목별 중앙값 채택 + 편차 기록
// Plan SC: 동일 입력 3회 반복 시 종합 점수 표준편차 ≤ 3점 (FR-06, FR-07)
import type { CriterionKey, CriterionResult } from "./types";

/** 중앙값 — 짝수 개면 가운데 두 값 평균을 반올림 (점수는 정수 유지) */
export function median(values: number[]): number {
  if (values.length === 0) {
    throw new Error("중앙값을 계산할 표본이 없습니다.");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * 세부 항목별 N개 표본 → 중앙값·편차(range)·불안정 플래그 집계.
 * samples: 회차별 {criterion: score} 목록 (같은 분야의 N회 호출 결과)
 */
export function aggregateCriteria<K extends CriterionKey>(
  keys: readonly K[],
  samples: ReadonlyArray<Record<K, number>>,
  rangeThreshold: number,
): CriterionResult[] {
  if (samples.length === 0) {
    throw new Error("집계할 앙상블 표본이 없습니다.");
  }
  return keys.map((key) => {
    const values = samples.map((sample) => sample[key]);
    const score = median(values);
    const range = Math.max(...values) - Math.min(...values);
    return {
      key,
      score,
      samples: values,
      range,
      unstable: samples.length > 1 && range > rangeThreshold,
    };
  });
}

/**
 * 대표 회차 선택 — 세부 점수 합이 중앙값 합에 가장 가까운 회차의 인덱스.
 * (분야 rationale 등 텍스트 필드를 중앙값과 정합성 있게 고르기 위함)
 */
export function representativeSampleIndex<K extends CriterionKey>(
  keys: readonly K[],
  samples: ReadonlyArray<Record<K, number>>,
  aggregated: CriterionResult[],
): number {
  const medianSum = aggregated.reduce((sum, item) => sum + item.score, 0);
  let bestIndex = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  samples.forEach((sample, index) => {
    const sum = keys.reduce((acc, key) => acc + sample[key], 0);
    const diff = Math.abs(sum - medianSum);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  });
  return bestIndex;
}
