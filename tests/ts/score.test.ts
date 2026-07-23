// 신규: 점수 산출·evaluation_mode 판정 (judge/models.py·serializer.py 동등성)
import { describe, expect, it } from "vitest";
import {
  detailScoreRows,
  domainSummaryRows,
  evaluationMode,
  publicSectorScore,
  totalScore,
  ZERO_SCORES,
} from "@/judge/score";
import type { DomainAssessment, ScoreMap } from "@/judge/types";

const FULL_OK: DomainAssessment = {
  domain1_ok: true,
  domain1_reasons: [],
  domain2_ok: true,
  domain2_reasons: [],
  domain3_ok: true,
  domain3_reasons: [],
  all_fatal: false,
  fatal_reasons: [],
};

const SAMPLE: ScoreMap = {
  pain_point_clarity: 80,
  solution_appropriateness: 70,
  public_feasibility: 75,
  requirement_coverage: 90,
  success_criteria_met: 85,
  fidelity_no_bloat: 88,
  setup_instructions: 60,
  documentation_accuracy: 65,
  maintainability: 55,
};

describe("점수 산출 (파이썬 round(x,1) 동등)", () => {
  it("분야 점수 = 세부 3항목 평균 소수 1자리", () => {
    expect(publicSectorScore(SAMPLE)).toBe(75);
  });

  it("종합 = 분야 평균", () => {
    // 분야: 75, 87.7, 60 → (75 + 87.7 + 60) / 3 = 74.2333... → 74.2
    expect(totalScore(SAMPLE)).toBe(74.2);
  });

  it("요약·세부 행 구조", () => {
    expect(domainSummaryRows(SAMPLE)).toHaveLength(4);
    expect(detailScoreRows(SAMPLE)).toHaveLength(9);
  });
});

describe("evaluationMode", () => {
  it("전 분야 적격 + 점수 존재 → full", () => {
    expect(evaluationMode(FULL_OK, SAMPLE)).toBe("full");
  });

  it("일부 분야 부적격 → partial", () => {
    expect(evaluationMode({ ...FULL_OK, domain3_ok: false }, SAMPLE)).toBe("partial");
  });

  it("전 분야 적격이지만 0점 → full_zero", () => {
    expect(evaluationMode(FULL_OK, ZERO_SCORES)).toBe("full_zero");
  });

  it("all_fatal → fatal_zero", () => {
    expect(evaluationMode({ ...FULL_OK, all_fatal: true }, ZERO_SCORES)).toBe("fatal_zero");
  });
});
