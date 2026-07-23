// Design Ref: §2.2 — 채점 오케스트레이터: 검증 → 앙상블 병렬 호출 → 집계 → 후기
// Plan SC: 앙상블 N회 병렬 호출로 재현성 확보 (FR-05, FR-06), 폴백 이중화 (FR-08)
import type OpenAI from "openai";
import {
  aggregateCriteria,
  representativeSampleIndex,
} from "@/judge/ensemble";
import {
  intentScoresSchema,
  publicSectorScoresSchema,
  readmeScoresSchema,
  reviewSummarySchema,
} from "@/judge/schemas";
import {
  candidatesForPrompt,
  collectRiskCandidates,
  composeRisks,
  CRITERION_META,
  type RiskCandidate,
} from "@/judge/riskBuilder";
import { evaluationMode, totalScore, ZERO_SCORES } from "@/judge/score";
import {
  EvaluationError,
  INTENT_IMPLEMENTATION_FIELDS,
  PUBLIC_SECTOR_FIELDS,
  README_QUALITY_FIELDS,
  type CriterionKey,
  type CriterionResult,
  type DomainAssessment,
  type EnsembleMeta,
  type EvaluationMode,
  type ReviewSummary,
  type ScoreMap,
} from "@/judge/types";
import { assessDomains } from "@/judge/inputValidator";
import { getConfig } from "./config";
import { createClient, parseStructured, type FallbackState } from "./openai";
import { loadPrompt, loadReadmeRubric } from "./prompts";

const MAX_FINAL_VERDICT_CHARS = 450;

const STRENGTH_FILTER_DOMAIN1 = /공공|기획서|페인|현장|정책|행정|기관|적합성/i;
const STRENGTH_FILTER_DOMAIN2 = /구현|코드|요구사항|기능\s*\d|실행\s*코드|app\.py/i;
const STRENGTH_FILTER_DOMAIN3 = /readme|문서|설치|실행\s*안내|가이드|requirements/i;

export type EvaluationStage = "validating" | "scoring" | "aggregating" | "reviewing";

export interface EvaluationOutput {
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

function buildZeroOutput(assessment: DomainAssessment, ensemble: EnsembleMeta): EvaluationOutput {
  const issues = [...new Set(assessment.fatal_reasons)].slice(0, 5);
  const allKeys = [
    ...(Object.keys(PUBLIC_SECTOR_FIELDS) as CriterionKey[]),
    ...(Object.keys(INTENT_IMPLEMENTATION_FIELDS) as CriterionKey[]),
    ...(Object.keys(README_QUALITY_FIELDS) as CriterionKey[]),
  ];
  return {
    scores: { ...ZERO_SCORES },
    criteria: zeroCriteria(allKeys),
    strengths: ["제출된 자료만으로는 심사할 수 있는 내용이 확인되지 않았습니다."],
    risks: issues.length > 0 ? issues : ["기획서와 GitHub 공개 레포를 제출해 주세요."],
    final_verdict:
      "이번 제출은 심사 기준을 충족하지 않아 모든 항목 0점으로 처리했습니다. " +
      "기획서와 공개 GitHub 레포(README·코드 포함)를 준비해 주시면 정확한 평가가 가능합니다. " +
      "다음 제출을 기대하겠습니다.",
    assessment,
    review_fallback: false,
    evaluation_mode: "fatal_zero",
    ensemble,
  };
}

function skipRiskItems(assessment: DomainAssessment): string[] {
  const risks: string[] = [];
  const groups: Array<[string, string[]]> = [
    ["[기획서 0점]", assessment.domain1_reasons],
    ["[의도구현 0점]", assessment.domain2_reasons],
    ["[README 0점]", assessment.domain3_reasons],
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
    if (allowedKeys.has(key) && key in CRITERION_META) {
      mapped[key] = item.reason;
    }
  }
  return mapped;
}

function filterStrengths(strengths: string[], assessment: DomainAssessment): string[] {
  const filters: RegExp[] = [];
  if (!assessment.domain1_ok) filters.push(STRENGTH_FILTER_DOMAIN1);
  if (!assessment.domain2_ok) filters.push(STRENGTH_FILTER_DOMAIN2);
  if (!assessment.domain3_ok) filters.push(STRENGTH_FILTER_DOMAIN3);

  if (filters.length === 0) return strengths;

  const filtered = strengths.filter((item) => !filters.some((p) => p.test(item)));
  if (filtered.length > 0) return filtered;

  if (assessment.domain2_ok) return ["의도 구현 및 실행 코드 측면에서 참고할 만한 요소가 있습니다."];
  if (assessment.domain3_ok) return ["README 문서화 측면에서 참고할 만한 내용이 있습니다."];
  if (assessment.domain1_ok) return ["기획서 방향성 측면에서 참고할 만한 내용이 있습니다."];
  return ["세부 점수표를 참고해 주세요."];
}

function fallbackReview(assessment: DomainAssessment, scores: ScoreMap): ReviewSummary {
  const strengths: string[] = [];
  if (assessment.domain1_ok && scores.public_feasibility > 0) {
    strengths.push("기획서의 문제 정의와 해결 방향이 일정 부분 확인되었습니다.");
  }
  if (assessment.domain2_ok && scores.requirement_coverage > 0) {
    strengths.push("핵심 요구사항이 코드에 반영된 부분이 있습니다.");
  }
  if (assessment.domain3_ok && scores.setup_instructions > 0) {
    strengths.push("README에 설치·실행 안내가 포함되어 있습니다.");
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
  readmeText: string,
  codeText: string,
  options?: { onStage?: (stage: EvaluationStage) => void },
): Promise<EvaluationOutput> {
  const onStage = options?.onStage ?? (() => {});
  const config = getConfig();
  const emptyEnsemble: EnsembleMeta = {
    n: config.ensembleN,
    model: config.judgeModel,
    fallback_used: false,
    unstable_count: 0,
  };

  // 기획서 미발견은 오류가 아님 — assessDomains가 분야1·2 부적격으로 판정
  if (!readmeText.trim()) throw new EvaluationError("레포에서 README를 찾을 수 없습니다.");
  if (!codeText.trim()) throw new EvaluationError("레포에서 Python 소스 코드를 찾을 수 없습니다.");

  onStage("validating");
  const assessment = assessDomains(planText, readmeText, codeText);
  if (assessment.all_fatal) {
    return buildZeroOutput(assessment, emptyEnsemble);
  }

  const client = createClient();
  const models = { primary: config.judgeModel, fallback: config.fallbackModel };
  const fallbackState: FallbackState = { fallbackUsed: false };
  const readmeRubric = loadReadmeRubric();
  const plan = planText.trim();
  const readme = readmeText.trim();
  const code = codeText.trim();

  onStage("scoring");
  const [publicCriteria, intentCriteria, readmeCriteria] = await Promise.all([
    scoreDomainEnsemble(
      {
        keys: Object.keys(PUBLIC_SECTOR_FIELDS) as Array<keyof typeof PUBLIC_SECTOR_FIELDS>,
        eligible: assessment.domain1_ok,
        call: () =>
          parseStructured(client, models, {
            system: loadPrompt("domain1_public.txt"),
            user: `## 기획서\n${plan}`,
            schema: publicSectorScoresSchema,
            schemaName: "public_sector_scores",
          }, fallbackState),
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
    scoreDomainEnsemble(
      {
        keys: Object.keys(README_QUALITY_FIELDS) as Array<keyof typeof README_QUALITY_FIELDS>,
        eligible: assessment.domain3_ok,
        call: () =>
          parseStructured(client, models, {
            system: loadPrompt("domain3_readme.txt", { readmeRubric }),
            user: `## README\n${readme}\n\n## 기획서\n${plan}\n\n## 실행 코드\n${code}`,
            schema: readmeScoresSchema,
            schemaName: "readme_scores",
          }, fallbackState),
      },
      config.ensembleN,
      config.rangeThreshold,
    ),
  ]);

  onStage("aggregating");
  const criteria = [...publicCriteria, ...intentCriteria, ...readmeCriteria];
  const scores = { ...ZERO_SCORES };
  for (const item of criteria) scores[item.key] = item.score;

  const riskCandidates: RiskCandidate[] = collectRiskCandidates(scores, assessment);

  onStage("reviewing");
  const scoresSnapshot = {
    "공공기관 적합성": Object.fromEntries(publicCriteria.map((c) => [c.key, c.score])),
    "의도 구현도": Object.fromEntries(intentCriteria.map((c) => [c.key, c.score])),
    "README 품질": Object.fromEntries(readmeCriteria.map((c) => [c.key, c.score])),
    domain1_skipped: !assessment.domain1_ok,
    domain2_skipped: !assessment.domain2_ok,
    domain3_skipped: !assessment.domain3_ok,
    skip_reasons: {
      domain1: assessment.domain1_reasons,
      domain2: assessment.domain2_reasons,
      domain3: assessment.domain3_reasons,
    },
  };

  let review: ReviewSummary;
  let reviewFallback = false;
  try {
    const raw = await parseStructured(client, models, {
      system: loadPrompt("review_summary.txt"),
      user:
        `## 기획서\n${plan}\n\n## README\n${readme}\n\n## 실행 코드\n${code}\n\n` +
        `## 산출 점수\n${JSON.stringify(scoresSnapshot, null, 2)}\n\n` +
        `## 감점 후보\n${candidatesForPrompt(riskCandidates)}\n\n` +
        "## 중요\n" +
        "- domain1_skipped가 true이면 공공기관 적합성 관련 칭찬을 strengths에 넣지 마세요.\n" +
        "- domain2_skipped가 true이면 의도 구현·코드 칭찬을 strengths에 넣지 마세요.\n" +
        "- domain3_skipped가 true이면 README 칭찬을 strengths에 넣지 마세요.\n" +
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
      review = fallbackReview(assessment, scores);
      reviewFallback = true;
    }
  } catch {
    review = fallbackReview(assessment, scores);
    reviewFallback = true;
  }

  const skipRisks = skipRiskItems(assessment);
  const allowedKeys = new Set(riskCandidates.map((c) => c.key as string));
  const risks = composeRisks(riskCandidates, llmReasonMap(review, allowedKeys), skipRisks);
  const strengths = filterStrengths([...review.strengths], assessment);

  return {
    scores,
    criteria,
    strengths,
    risks,
    final_verdict: truncateVerdict(review.final_verdict),
    assessment,
    review_fallback: reviewFallback,
    evaluation_mode: evaluationMode(assessment, scores),
    ensemble: {
      n: config.ensembleN,
      model: config.judgeModel,
      fallback_used: fallbackState.fallbackUsed,
      unstable_count: criteria.filter((c) => c.unstable).length,
    },
  };
}

// representativeSampleIndex는 rationale 확장(후속 사이클)용으로 export 유지
export { representativeSampleIndex, totalScore };
