// Design Ref: §2.2 — 채점 오케스트레이터: 검증 → 앙상블 병렬 호출 → 집계 → 후기
// Plan SC: 앙상블 N회 병렬 호출로 재현성 확보 (FR-05, FR-06), 폴백 이중화 (FR-08)
// 트랙(기관용/기업용)은 분야1에만 영향을 준다 — 분야2·집계·후기 경로는 공통.
import {
  aggregateCriteria,
  representativeSampleIndex,
} from "@/judge/ensemble";
import {
  corporateScoresSchema,
  intentScoresSchema,
  publicSectorScoresSchema,
  reviewSummarySchema,
} from "@/judge/schemas";
import {
  candidatesForPrompt,
  collectRiskCandidates,
  composeRisks,
  criterionMeta,
  type RiskCandidate,
} from "@/judge/riskBuilder";
import { domain1Keys, trackSpec } from "@/judge/tracks";
import { evaluationMode, totalScore, ZERO_SCORES } from "@/judge/score";
import {
  EvaluationError,
  INTENT_DOMAIN_LABEL,
  INTENT_IMPLEMENTATION_FIELDS,
  type CriterionKey,
  type CriterionResult,
  type DomainAssessment,
  type EnsembleMeta,
  type EvaluationMode,
  type JudgeTrack,
  type ReviewSummary,
  type ScoreMap,
} from "@/judge/types";
import { assessDomains } from "@/judge/inputValidator";
import { getConfig } from "./config";
import { createClient, parseStructured, type FallbackState } from "./openai";
import { loadPrompt } from "./prompts";

const MAX_FINAL_VERDICT_CHARS = 450;

const STRENGTH_FILTER_DOMAIN2 = /구현|코드|요구사항|기능\s*\d|실행\s*코드|app\.py/i;

export type EvaluationStage = "validating" | "scoring" | "aggregating" | "reviewing";

export interface EvaluationOutput {
  track: JudgeTrack;
  scores: ScoreMap;
  criteria: CriterionResult[];
  strengths: string[];
  risks: string[];
  final_verdict: string;
  assessment: DomainAssessment;
  review_fallback: boolean;
  evaluation_mode: EvaluationMode;
  ensemble: EnsembleMeta;
}

function truncateVerdict(text: string, maxChars: number = MAX_FINAL_VERDICT_CHARS): string {
  const cleaned = text.trim();
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars - 3).trimEnd() + "...";
}

function zeroCriteria(keys: readonly CriterionKey[]): CriterionResult[] {
  return keys.map((key) => ({ key, score: 0, samples: [], range: 0, unstable: false }));
}

/** 해당 트랙이 결과서에 노출하는 6개 키 (분야1 3 + 분야2 3) */
function trackKeys(track: JudgeTrack): CriterionKey[] {
  return [
    ...domain1Keys(track),
    ...(Object.keys(INTENT_IMPLEMENTATION_FIELDS) as CriterionKey[]),
  ];
}

function buildZeroOutput(
  track: JudgeTrack,
  assessment: DomainAssessment,
  ensemble: EnsembleMeta,
): EvaluationOutput {
  const issues = [...new Set(assessment.fatal_reasons)].slice(0, 5);
  return {
    track,
    scores: { ...ZERO_SCORES },
    criteria: zeroCriteria(trackKeys(track)),
    strengths: ["제출된 자료만으로는 심사할 수 있는 내용이 확인되지 않았습니다."],
    risks: issues.length > 0 ? issues : ["레포에 기획서 파일과 실행 코드를 올린 뒤 다시 제출해 주세요."],
    final_verdict:
      "이번 제출은 심사 기준을 충족하지 않아 모든 항목 0점으로 처리했습니다. " +
      "레포에 기획서 파일(PLAN.md·기획서.md)과 실행 코드를 함께 올려 주시면 정확한 평가가 가능합니다. " +
      "다음 제출을 기대하겠습니다.",
    assessment,
    review_fallback: false,
    evaluation_mode: "fatal_zero",
    ensemble,
  };
}

function skipRiskItems(track: JudgeTrack, assessment: DomainAssessment): string[] {
  const risks: string[] = [];
  const groups: Array<[string, string[]]> = [
    [trackSpec(track).skipLabel, assessment.domain1_reasons],
    ["[의도구현 0점]", assessment.domain2_reasons],
  ];
  for (const [label, reasons] of groups) {
    for (const reason of reasons.slice(0, 2)) {
      risks.push(`${label} ${reason}`);
    }
  }
  return risks;
}

function llmReasonMap(
  review: ReviewSummary,
  allowedKeys: Set<string>,
): Partial<Record<CriterionKey, string>> {
  const mapped: Partial<Record<CriterionKey, string>> = {};
  for (const item of review.risk_reasons) {
    const key = item.criterion_key.trim() as CriterionKey;
    if (allowedKeys.has(key)) mapped[key] = item.reason;
  }
  return mapped;
}

function filterStrengths(
  track: JudgeTrack,
  strengths: string[],
  assessment: DomainAssessment,
): string[] {
  const filters: RegExp[] = [];
  if (!assessment.domain1_ok) filters.push(trackSpec(track).strengthFilter);
  if (!assessment.domain2_ok) filters.push(STRENGTH_FILTER_DOMAIN2);

  if (filters.length === 0) return strengths;

  const filtered = strengths.filter((item) => !filters.some((p) => p.test(item)));
  if (filtered.length > 0) return filtered;

  if (assessment.domain2_ok) return ["의도 구현도 측면에서 참고할 만한 요소가 있습니다."];
  if (assessment.domain1_ok) return ["기획서 방향성 측면에서 참고할 만한 내용이 있습니다."];
  return ["세부 점수표를 참고해 주세요."];
}

function fallbackReview(
  track: JudgeTrack,
  assessment: DomainAssessment,
  scores: ScoreMap,
): ReviewSummary {
  const strengths: string[] = [];
  const firstDomain1Key = domain1Keys(track)[0];
  if (assessment.domain1_ok && scores[firstDomain1Key] > 0) {
    strengths.push("기획서의 문제 정의와 해결 방향이 일정 부분 확인되었습니다.");
  }
  if (assessment.domain2_ok && scores.requirement_coverage > 0) {
    strengths.push("핵심 요구사항이 코드에 반영된 부분이 있습니다.");
  }
  return {
    strengths: strengths.length > 0 ? strengths : ["세부 점수표를 참고해 주세요."],
    risk_reasons: [],
    final_verdict:
      "자동 총평 생성에 일시적인 문제가 있었지만, 분야별·세부 점수는 정상적으로 산출되었습니다. " +
      "점수표와 감점 요인을 함께 참고해 주시면 좋겠습니다. " +
      "다음 제출도 기대하겠습니다.",
  };
}

interface DomainSpec<K extends CriterionKey> {
  keys: readonly K[];
  eligible: boolean;
  call: () => Promise<Record<K, number>>;
}

/** 적격 분야만 N회 앙상블 호출 → 세부 항목별 중앙값 집계 */
async function scoreDomainEnsemble<K extends CriterionKey>(
  spec: DomainSpec<K>,
  n: number,
  rangeThreshold: number,
): Promise<CriterionResult[]> {
  if (!spec.eligible) return zeroCriteria(spec.keys);
  const samples = await Promise.all(Array.from({ length: n }, () => spec.call()));
  return aggregateCriteria(spec.keys, samples, rangeThreshold);
}

export async function runEvaluation(
  planText: string,
  codeText: string,
  options?: { track?: JudgeTrack; onStage?: (stage: EvaluationStage) => void },
): Promise<EvaluationOutput> {
  const track = options?.track ?? "public";
  const spec = trackSpec(track);
  const onStage = options?.onStage ?? (() => {});
  const config = getConfig();
  const emptyEnsemble: EnsembleMeta = {
    n: config.ensembleN,
    model: config.judgeModel,
    fallback_used: false,
    unstable_count: 0,
  };

  // 기획서 미발견은 오류가 아님 — assessDomains가 두 분야 부적격으로 판정
  if (!codeText.trim()) {
    throw new EvaluationError(
      "레포에서 실행 코드(소스 파일)를 찾을 수 없습니다. " +
        "앱 진입점(app.py, index.html, main.js 등)이 포함된 공개 레포인지 확인해 주세요.",
    );
  }

  onStage("validating");
  const assessment = assessDomains(planText, codeText);
  if (assessment.all_fatal) {
    return buildZeroOutput(track, assessment, emptyEnsemble);
  }

  const client = createClient();
  const models = { primary: config.judgeModel, fallback: config.fallbackModel };
  const fallbackState: FallbackState = { fallbackUsed: false };
  const plan = planText.trim();
  const code = codeText.trim();

  const domain1Schema =
    track === "corporate" ? corporateScoresSchema : publicSectorScoresSchema;
  const domain1SchemaName =
    track === "corporate" ? "corporate_scores" : "public_sector_scores";

  onStage("scoring");
  const [domain1Criteria, intentCriteria] = await Promise.all([
    scoreDomainEnsemble(
      {
        keys: domain1Keys(track),
        eligible: assessment.domain1_ok,
        call: () =>
          parseStructured(client, models, {
            system: loadPrompt(spec.domain1Prompt),
            user: `## 기획서\n${plan}`,
            schema: domain1Schema,
            schemaName: domain1SchemaName,
          }, fallbackState) as Promise<Record<CriterionKey, number>>,
      },
      config.ensembleN,
      config.rangeThreshold,
    ),
    scoreDomainEnsemble(
      {
        keys: Object.keys(INTENT_IMPLEMENTATION_FIELDS) as Array<
          keyof typeof INTENT_IMPLEMENTATION_FIELDS
        >,
        eligible: assessment.domain2_ok,
        call: () =>
          parseStructured(client, models, {
            system: loadPrompt("domain2_intent.txt"),
            user: `## 기획서\n${plan}\n\n## 실행 코드\n${code}`,
            schema: intentScoresSchema,
            schemaName: "intent_scores",
          }, fallbackState),
      },
      config.ensembleN,
      config.rangeThreshold,
    ),
  ]);

  onStage("aggregating");
  const criteria = [...domain1Criteria, ...intentCriteria];
  const scores = { ...ZERO_SCORES };
  for (const item of criteria) scores[item.key] = item.score;

  const riskCandidates: RiskCandidate[] = collectRiskCandidates(track, scores, assessment);

  onStage("reviewing");
  const scoresSnapshot = {
    심사_트랙: spec.label,
    [spec.domain1Label]: Object.fromEntries(domain1Criteria.map((c) => [c.key, c.score])),
    [INTENT_DOMAIN_LABEL]: Object.fromEntries(intentCriteria.map((c) => [c.key, c.score])),
    domain1_skipped: !assessment.domain1_ok,
    domain2_skipped: !assessment.domain2_ok,
    skip_reasons: {
      domain1: assessment.domain1_reasons,
      domain2: assessment.domain2_reasons,
    },
  };

  let review: ReviewSummary;
  let reviewFallback = false;
  try {
    const raw = await parseStructured(client, models, {
      system: loadPrompt("review_summary.txt"),
      user:
        `## 심사 트랙\n${spec.label} — ${spec.description}\n` +
        `분야1은 "${spec.domain1Label}"입니다.\n\n` +
        `## 기획서\n${plan}\n\n## 실행 코드\n${code}\n\n` +
        `## 산출 점수\n${JSON.stringify(scoresSnapshot, null, 2)}\n\n` +
        `## 감점 후보\n${candidatesForPrompt(riskCandidates)}\n\n` +
        "## 중요\n" +
        `- domain1_skipped가 true이면 ${spec.domain1Label} 관련 칭찬을 strengths에 넣지 마세요.\n` +
        "- domain2_skipped가 true이면 의도 구현·코드 칭찬을 strengths에 넣지 마세요.\n" +
        "- risk_reasons는 감점 후보에 있는 criterion_key만 사용하세요.\n" +
        "- final_verdict는 3문장 이내, 450자 이하로 작성하세요.",
      schema: reviewSummarySchema,
      schemaName: "review_summary",
    }, fallbackState);
    review = {
      strengths: raw.strengths.map((s) => s.trim()).filter(Boolean),
      risk_reasons: raw.risk_reasons,
      final_verdict: truncateVerdict(raw.final_verdict),
    };
    if (review.strengths.length === 0) {
      review = fallbackReview(track, assessment, scores);
      reviewFallback = true;
    }
  } catch {
    review = fallbackReview(track, assessment, scores);
    reviewFallback = true;
  }

  const skipRisks = skipRiskItems(track, assessment);
  const allowedKeys = new Set(riskCandidates.map((c) => c.key as string));
  const risks = composeRisks(track, riskCandidates, llmReasonMap(review, allowedKeys), skipRisks);
  const strengths = filterStrengths(track, [...review.strengths], assessment);

  return {
    track,
    scores,
    criteria,
    strengths,
    risks,
    final_verdict: truncateVerdict(review.final_verdict),
    assessment,
    review_fallback: reviewFallback,
    evaluation_mode: evaluationMode(track, assessment, scores),
    ensemble: {
      n: config.ensembleN,
      model: config.judgeModel,
      fallback_used: fallbackState.fallbackUsed,
      unstable_count: criteria.filter((c) => c.unstable).length,
    },
  };
}

// representativeSampleIndex는 rationale 확장(후속 사이클)용으로 export 유지
export { representativeSampleIndex, totalScore, criterionMeta };
