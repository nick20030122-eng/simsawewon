// 신규: 앙상블 집계 (FR-06, FR-07)
import { describe, expect, it } from "vitest";
import { aggregateCriteria, median, representativeSampleIndex } from "@/judge/ensemble";

describe("median", () => {
  it("홀수 개수 — 가운데 값", () => {
    expect(median([78, 82, 80])).toBe(80);
  });

  it("짝수 개수 — 가운데 두 값 평균 반올림", () => {
    expect(median([70, 75])).toBe(73);
    expect(median([70, 80, 90, 100])).toBe(85);
  });

  it("단일 표본(N=1) 통과", () => {
    expect(median([64])).toBe(64);
  });

  it("빈 배열은 오류", () => {
    expect(() => median([])).toThrow();
  });
});

describe("aggregateCriteria", () => {
  const keys = ["pain_point_clarity", "solution_appropriateness"] as const;

  it("중앙값·range·unstable 계산", () => {
    const samples = [
      { pain_point_clarity: 78, solution_appropriateness: 60 },
      { pain_point_clarity: 82, solution_appropriateness: 90 },
      { pain_point_clarity: 80, solution_appropriateness: 72 },
    ];
    const result = aggregateCriteria(keys, samples, 15);

    const pain = result.find((item) => item.key === "pain_point_clarity");
    expect(pain?.score).toBe(80);
    expect(pain?.range).toBe(4);
    expect(pain?.unstable).toBe(false);

    const solution = result.find((item) => item.key === "solution_appropriateness");
    expect(solution?.score).toBe(72);
    expect(solution?.range).toBe(30);
    expect(solution?.unstable).toBe(true);
  });

  it("N=1이면 unstable 플래그 없음", () => {
    const result = aggregateCriteria(keys, [{ pain_point_clarity: 50, solution_appropriateness: 40 }], 15);
    expect(result.every((item) => !item.unstable)).toBe(true);
    expect(result.every((item) => item.range === 0)).toBe(true);
  });
});

describe("representativeSampleIndex", () => {
  it("중앙값 합에 가장 가까운 회차 선택", () => {
    const keys = ["pain_point_clarity"] as const;
    const samples = [
      { pain_point_clarity: 60 },
      { pain_point_clarity: 80 },
      { pain_point_clarity: 100 },
    ];
    const aggregated = aggregateCriteria(keys, samples, 15);
    expect(representativeSampleIndex(keys, samples, aggregated)).toBe(1);
  });
});
