// 기존 tests/test_risk_builder.py 케이스 동등 이식 + 트랙 분기 검증
import { describe, expect, it } from "vitest";
import {
  collectRiskCandidates,
  composeRisks,
  criterionMeta,
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
    problem_cost_clarity: 80,
    build_justification: 80,
    operational_viability: 80,
    requirement_coverage: 80,
    success_criteria_met: 80,
    fidelity_no_bloat: 80,
    ...overrides,
  };
}

function assessment(): DomainAssessment {
  return {
    domain1_ok: true,
    domain1_reasons: [],
    domain2_ok: true,
    domain2_reasons: [],
    all_fatal: false,
    fatal_reasons: [],
  };
}

describe("riskBuilder", () => {
  it("70점 미만 항목만 후보로 수집 (점수 오름차순)", () => {
    const candidates = collectRiskCandidates(
      "public",
      scores({ pain_point_clarity: 55, requirement_coverage: 40, success_criteria_met: 85 }),
      assessment(),
    );
    const keys = new Set(candidates.map((item) => item.key));
    expect(keys).toEqual(new Set(["pain_point_clarity", "requirement_coverage"]));
    expect(candidates[0].score).toBe(40);
  });

  it("다른 트랙의 분야1 항목은 후보에 섞이지 않는다", () => {
    const low = scores({ pain_point_clarity: 30, build_justification: 20 });
    const publicKeys = collectRiskCandidates("public", low, assessment()).map((c) => c.key);
    const corporateKeys = collectRiskCandidates("corporate", low, assessment()).map(
      (c) => c.key,
    );
    expect(publicKeys).toContain("pain_point_clarity");
    expect(publicKeys).not.toContain("build_justification");
    expect(corporateKeys).toContain("build_justification");
    expect(corporateKeys).not.toContain("pain_point_clarity");
  });

  it("criterionMeta는 트랙별 분야1 라벨을 돌려준다", () => {
    expect(criterionMeta("public", "pain_point_clarity")).toEqual([
      "공공기관 적합성",
      "페인포인트 명확성",
    ]);
    expect(criterionMeta("corporate", "build_justification")).toEqual([
      "사업 타당성",
      "자체 구축 정당성",
    ]);
    // 분야2는 트랙과 무관하게 동일
    expect(criterionMeta("public", "requirement_coverage")).toEqual(
      criterionMeta("corporate", "requirement_coverage"),
    );
  });

  it("감점 요인은 [분야] 라벨(점수): 형식", () => {
    const candidate: RiskCandidate = {
      key: "requirement_coverage",
      domain: "의도 구현도",
      label: "핵심 요구사항 구현",
      score: 42,
    };
    const line = formatRisk("public", candidate, "기획서의 CSV 업로드 기능이 코드에 없습니다.");
    expect(line.startsWith("[의도 구현도] 핵심 요구사항 구현(42점):")).toBe(true);
    expect(line).toContain("CSV 업로드");
  });

  it("금지 주제(스타일 지적 등) LLM 사유는 기본 사유로 대체", () => {
    const candidate: RiskCandidate = {
      key: "public_feasibility",
      domain: "공공기관 적합성",
      label: "공공 현장 적용 가능성",
      score: 60,
    };
    const line = formatRisk("public", candidate, "변수명이 일관되지 않아 가독성이 떨어집니다.");
    expect(line).not.toContain("변수명");
    expect(line).toContain("현장");
  });

  it("기업용 기본 감점 사유는 자체 구축 정당성을 짚는다", () => {
    const candidate: RiskCandidate = {
      key: "build_justification",
      domain: "사업 타당성",
      label: "자체 구축 정당성",
      score: 55,
    };
    const line = formatRisk("corporate", candidate, "");
    expect(line).toContain("기성 SaaS");
  });

  it("후보 없음 → 중립 메시지", () => {
    const candidates = collectRiskCandidates("public", scores(), assessment());
    expect(composeRisks("public", candidates, {}, [])).toEqual([NO_SIGNIFICANT_RISKS]);
  });

  it("skip 사유가 저점 항목보다 우선", () => {
    const candidates = collectRiskCandidates(
      "public",
      scores({ requirement_coverage: 50 }),
      assessment(),
    );
    const skip = ["[기획서 0점] 기획서가 비어 있습니다."];
    const risks = composeRisks("public", candidates, {}, skip);
    expect(risks[0]).toBe(skip[0]);
    expect(risks.some((item) => item.includes("핵심 요구사항 구현"))).toBe(true);
  });

  it("금지 토큰 포함 사유는 빈 문자열", () => {
    expect(sanitizeReason("GitHub URL 제출 방식이 불편합니다.")).toBe("");
  });
});
