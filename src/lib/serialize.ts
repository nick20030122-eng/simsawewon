// Design Ref: §4.2 — EvaluationOutput → 프론트엔드 JSON 응답 직렬화
// 분야1 이름이 트랙별로 달라지므로 점수 키는 domain1_score/domain2_score로 중립화한다.
import {
  detailScoreRows,
  domain1Score,
  domainSummaryRows,
  intentImplementationScore,
  totalScore,
} from "@/judge/score";
import { criterionMeta } from "@/judge/riskBuilder";
import { trackSpec } from "@/judge/tracks";
import { INTENT_DOMAIN_LABEL } from "@/judge/types";
import type { EvaluationOutput } from "./evaluator";

export function evaluationToResponse(output: EvaluationOutput): Record<string, unknown> {
  const { scores, assessment, track } = output;
  const spec = trackSpec(track);
  return {
    ...scores,
    track,
    track_label: spec.label,
    strengths: output.strengths,
    risks: output.risks,
    final_verdict: output.final_verdict,
    total_score: totalScore(track, scores),
    domain1_score: domain1Score(track, scores),
    domain2_score: intentImplementationScore(scores),
    domain_labels: { domain1: spec.domain1Label, domain2: INTENT_DOMAIN_LABEL },
    domain_summary_rows: domainSummaryRows(track, scores),
    detail_score_rows: detailScoreRows(track, scores),
    review_fallback: output.review_fallback,
    evaluation_mode: output.evaluation_mode,
    skip_reasons: {
      domain1: assessment.domain1_reasons,
      domain2: assessment.domain2_reasons,
    },
    domain_skipped: {
      domain1: !assessment.domain1_ok,
      domain2: !assessment.domain2_ok,
    },
    // 앙상블 확장 (v2.0): 항목별 표본·편차·불안정 플래그
    ensemble: output.ensemble,
    criteria: output.criteria.map((item) => {
      const [domain, label] = criterionMeta(track, item.key);
      return {
        key: item.key,
        domain,
        label,
        score: item.score,
        samples: item.samples,
        range: item.range,
        unstable: item.unstable,
      };
    }),
  };
}
