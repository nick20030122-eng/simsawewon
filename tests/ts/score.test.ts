// 신규: 점수 산출·evaluation_mode 판정 (트랙별 분야1 + 공통 분야2)
import { describe, expect, it } from "vitest";
import {
  detailScoreRows,
  domain1Score,
  domainSummaryRows,
  evaluationMode,
  intentImplementationScore,
  totalScore,
  ZERO_SCORES,
} from "@/judge/score";
import type { DomainAssessment, ScoreMap } from "@/judge/types";

const FULL_OK: DomainAssessment = {
  domain1_ok: true,
  domain1_reasons: [],
  domain2_ok: true,
  domain2_reasons: [],
  all_fatal: false,
  fatal_reasons: [],
};

const SAMPLE: ScoreMap = {
  // 기관용 분야1 — 평균 75
  pain_point_clarity: 80,
  solution_appropriateness: 70,
  public_feasibility: 75,
  // 기업용 분야1 — 평균 60
  problem_cost_clarity: 55,
  build_justification: 40,
  operational_viability: 85,
  // 공통 분야2 — 평균 87.7
  requirement_coverage: 90,
  success_criteria_met: 85,
  fidelity_no_bloat: 88,
};

describe("점수 산출 (파이썬 round(x,1) 동등)", () => {
  it("분야1 점수는 트랙별 세부 3항목 평균", () => {
    expect(domain1Score("public", SAMPLE)).toBe(75);
    expect(domain1Score("corporate", SAMPLE)).toBe(60);
  });

  it("분야2는 트랙 공통", () => {
    expect(intentImplementationScore(SAMPLE)).toBe(87.7);
  });

  it("종합 = 분야1·분야2 평균, 트랙마다 다르다", () => {
    // 기관용: (75 + 87.7) / 2 = 81.35 → 81.4
    expect(totalScore("public", SAMPLE)).toBe(81.4);
    // 기업용: (60 + 87.7) / 2 = 73.85 → 73.9
    expect(totalScore("corporate", SAMPLE)).toBe(73.9);
  });

  it("요약·세부 행 구조", () => {
    expect(domainSummaryRows("public", SAMPLE)).toHaveLength(3);
    expect(detailScoreRows("public", SAMPLE)).toHaveLength(6);
    expect(detailScoreRows("corporate", SAMPLE)).toHaveLength(6);
  });

  it("세부 행에는 해당 트랙의 분야1 항목만 담긴다", () => {
    const publicLabels = detailScoreRows("public", SAMPLE).map((r) => r["세부 항목"]);
    const corporateLabels = detailScoreRows("corporate", SAMPLE).map((r) => r["세부 항목"]);
    expect(publicLabels).toContain("페인포인트 명확성");
    expect(publicLabels).not.toContain("자체 구축 정당성");
    expect(corporateLabels).toContain("자체 구축 정당성");
    expect(corporateLabels).not.toContain("페인포인트 명확성");
  });

  it("분야1 라벨이 트랙별로 다르다", () => {
    expect(domainSummaryRows("public", SAMPLE)[0]["분야"]).toBe("공공기관 적합성");
    expect(domainSummaryRows("corporate", SAMPLE)[0]["분야"]).toBe("사업 타당성");
  });
});

describe("evaluationMode", () => {
  it("두 분야 적격 + 점수 존재 → full", () => {
    expect(evaluationMode("public", FULL_OK, SAMPLE)).toBe("full");
    expect(evaluationMode("corporate", FULL_OK, SAMPLE)).toBe("full");
  });

  it("일부 분야 부적격 → partial", () => {
    expect(evaluationMode("public", { ...FULL_OK, domain2_ok: false }, SAMPLE)).toBe(
      "partial",
    );
  });

  it("두 분야 모두 부적격(기획서 미발견) → partial이 아닌 full_zero", () => {
    const noPlan = { ...FULL_OK, domain1_ok: false, domain2_ok: false };
    expect(evaluationMode("public", noPlan, ZERO_SCORES)).toBe("full_zero");
    expect(evaluationMode("corporate", noPlan, ZERO_SCORES)).toBe("full_zero");
  });

  it("두 분야 적격이지만 0점 → full_zero", () => {
    expect(evaluationMode("public", FULL_OK, ZERO_SCORES)).toBe("full_zero");
  });

  it("all_fatal → fatal_zero", () => {
    expect(evaluationMode("public", { ...FULL_OK, all_fatal: true }, ZERO_SCORES)).toBe(
      "fatal_zero",
    );
  });
});
