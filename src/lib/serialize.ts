// Design Ref: §4.2 — EvaluationOutput → 프론트엔드 JSON 응답 직렬화 (구 serializer.py 필드 호환 + 앙상블 확장)
import {
  detailScoreRows,
  domainSummaryRows,
  intentImplementationScore,
  publicSectorScore,
  readmeQualityScore,
  totalScore,
} from "@/judge/score";
import { CRITERION_META } from "@/judge/riskBuilder";
import { DOMAIN_LABELS } from "@/judge/types";
import type { EvaluationOutput } from "./evaluator";

export function evaluationToResponse(output: EvaluationOutput): Record<string, unknown> {
  const { scores, assessment } = output;
  return {
    ...scores,
    strengths: output.strengths,
    risks: output.risks,
    final_verdict: output.final_verdict,
    total_score: totalScore(scores),
    public_sector_score: publicSectorScore(scores),
    intent_implementation_score: intentImplementationScore(scores),
    readme_quality_score: readmeQualityScore(scores),
    domain_labels: DOMAIN_LABELS,
    domain_summary_rows: domainSummaryRows(scores),
    detail_score_rows: detailScoreRows(scores),
    review_fallback: output.review_fallback,
    evaluation_mode: output.evaluation_mode,
    skip_reasons: {
      domain1: assessment.domain1_reasons,
      domain2: assessment.domain2_reasons,
      domain3: assessment.domain3_reasons,
    },
    domain_skipped: {
      domain1: !assessment.domain1_ok,
      domain2: !assessment.domain2_ok,
      domain3: !assessment.domain3_ok,
    },
    // 앙상블 확장 (v2.0): 항목별 표본·편차·불안정 플래그
    ensemble: output.ensemble,
    criteria: output.criteria.map((item) => ({
      key: item.key,
      domain: CRITERION_META[item.key][0],
      label: CRITERION_META[item.key][1],
      score: item.score,
      samples: item.samples,
      range: item.range,
      unstable: item.unstable,
    })),
  };
}
