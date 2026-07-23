// 기존 tests/test_risk_builder.py 케이스 동등 이식
import { describe, expect, it } from "vitest";
import {
  collectRiskCandidates,
  composeRisks,
  formatRisk,
  NO_SIGNIFICANT_RISKS,
  sanitizeReason,
  type RiskCandidate,
} from "@/judge/riskBuilder";
import type { DomainAssessment, ScoreMap } from "@/judge/types";

function scores(overrides: Partial<ScoreMap> = {}): ScoreMap {
  return {
    pain_point_clarity: 80,
    solution_appropriateness: 80,
    public_feasibility: 80,
    requirement_coverage: 80,
    success_criteria_met: 80,
    fidelity_no_bloat: 80,
    setup_instructions: 80,
    documentation_accuracy: 80,
    maintainability: 80,
    ...overrides,
  };
}

function assessment(): DomainAssessment {
  return {
    domain1_ok: true,
    domain1_reasons: [],
    domain2_ok: true,
    domain2_reasons: [],
    domain3_ok: true,
    domain3_reasons: [],
    all_fatal: false,
    fatal_reasons: [],
  };
}

describe("riskBuilder", () => {
  it("70점 미만 항목만 후보로 수집 (점수 오름차순)", () => {
    const candidates = collectRiskCandidates(
      scores({ pain_point_clarity: 55, requirement_coverage: 40, setup_instructions: 85 }),
      assessment(),
    );
    const keys = new Set(candidates.map((item) => item.key));
    expect(keys).toEqual(new Set(["pain_point_clarity", "requirement_coverage"]));
    expect(candidates[0].score).toBe(40);
  });

  it("감점 요인은 [분야] 라벨(점수): 형식", () => {
    const candidate: RiskCandidate = {
      key: "requirement_coverage",
      domain: "의도 구현도",
      label: "핵심 요구사항 구현",
      score: 42,
    };
    const line = formatRisk(candidate, "기획서의 CSV 업로드 기능이 코드에 없습니다.");
    expect(line.startsWith("[의도 구현도] 핵심 요구사항 구현(42점):")).toBe(true);
    expect(line).toContain("CSV 업로드");
  });

  it("금지 주제(스타일 지적 등) LLM 사유는 기본 사유로 대체", () => {
    const candidate: RiskCandidate = {
      key: "setup_instructions",
      domain: "README 품질",
      label: "설치·실행 안내",
      score: 60,
    };
    const line = formatRisk(candidate, "변수명이 일관되지 않아 가독성이 떨어집니다.");
    expect(line).not.toContain("변수명");
    expect(line).toContain("설치·실행");
  });

  it("후보 없음 → 중립 메시지", () => {
    const candidates = collectRiskCandidates(scores(), assessment());
    expect(composeRisks(candidates, {}, [])).toEqual([NO_SIGNIFICANT_RISKS]);
  });

  it("skip 사유가 저점 항목보다 우선", () => {
    const candidates = collectRiskCandidates(scores({ requirement_coverage: 50 }), assessment());
    const skip = ["[README 0점] README가 비어 있습니다."];
    const risks = composeRisks(candidates, {}, skip);
    expect(risks[0]).toBe(skip[0]);
    expect(risks.some((item) => item.includes("핵심 요구사항 구현"))).toBe(true);
  });

  it("금지 토큰 포함 사유는 빈 문자열", () => {
    expect(sanitizeReason("GitHub URL 제출 방식이 불편합니다.")).toBe("");
  });
});
