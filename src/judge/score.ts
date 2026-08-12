// Design Ref: §3.1 — 세부→분야→종합 점수 산출 및 evaluation_mode 판정. judge/models.py·serializer.py 동등
import { domain1Keys, trackSpec } from "./tracks";
import {
  INTENT_DOMAIN_LABEL,
  INTENT_IMPLEMENTATION_FIELDS,
  type DomainAssessment,
  type EvaluationMode,
  type JudgeTrack,
  type ScoreMap,
} from "./types";

/** 파이썬 round(x, 1) 동등 — 소수 첫째 자리 반올림 */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function avg(values: number[]): number {
  return round1(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/** 분야1 점수 — 트랙별 세부 3항목 평균 */
export function domain1Score(track: JudgeTrack, scores: ScoreMap): number {
  return avg(domain1Keys(track).map((key) => scores[key]));
}

export function intentImplementationScore(scores: ScoreMap): number {
  return avg([
    scores.requirement_coverage,
    scores.success_criteria_met,
    scores.fidelity_no_bloat,
  ]);
}

export function totalScore(track: JudgeTrack, scores: ScoreMap): number {
  return avg([domain1Score(track, scores), intentImplementationScore(scores)]);
}

export function evaluationMode(
  track: JudgeTrack,
  assessment: DomainAssessment,
  scores: ScoreMap,
): EvaluationMode {
  if (assessment.all_fatal) return "fatal_zero";
  // 두 분야가 모두 부적격이면 채점된 항목이 하나도 없다 — "부분 심사"가 아닌 전 항목 0점
  if (!assessment.domain1_ok && !assessment.domain2_ok) return "full_zero";
  if (!assessment.domain1_ok || !assessment.domain2_ok) return "partial";
  if (totalScore(track, scores) === 0) return "full_zero";
  return "full";
}

export function domainSummaryRows(track: JudgeTrack, scores: ScoreMap) {
  return [
    { 분야: trackSpec(track).domain1Label, 점수: domain1Score(track, scores) },
    { 분야: INTENT_DOMAIN_LABEL, 점수: intentImplementationScore(scores) },
    { 분야: "종합", 점수: totalScore(track, scores) },
  ];
}

export function detailScoreRows(track: JudgeTrack, scores: ScoreMap) {
  const spec = trackSpec(track);
  const rows: Array<{ 분야: string; "세부 항목": string; 점수: number }> = [];
  for (const key of domain1Keys(track)) {
    rows.push({
      분야: spec.domain1Label,
      "세부 항목": spec.domain1Fields[key],
      점수: scores[key],
    });
  }
  for (const [field, label] of Object.entries(INTENT_IMPLEMENTATION_FIELDS)) {
    rows.push({
      분야: INTENT_DOMAIN_LABEL,
      "세부 항목": label,
      점수: scores[field as keyof ScoreMap],
    });
  }
  return rows;
}

export const ZERO_SCORES: ScoreMap = {
  pain_point_clarity: 0,
  solution_appropriateness: 0,
  public_feasibility: 0,
  problem_cost_clarity: 0,
  build_justification: 0,
  operational_viability: 0,
  requirement_coverage: 0,
  success_criteria_met: 0,
  fidelity_no_bloat: 0,
};
