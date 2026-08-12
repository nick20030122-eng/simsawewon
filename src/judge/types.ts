// Design Ref: §3.1 — 필드명은 프롬프트·기존 API와 동일한 snake_case 유지 (회귀 방지)

/** 심사 트랙 — 분야1(기획 평가)만 트랙별로 갈리고, 분야2(의도 구현도)는 공통 */
export type JudgeTrack = "public" | "corporate";

export const JUDGE_TRACKS: readonly JudgeTrack[] = ["public", "corporate"];

export function isJudgeTrack(value: unknown): value is JudgeTrack {
  return value === "public" || value === "corporate";
}

/** 분야별 세부 항목 키 → 한국어 라벨 */
export const PUBLIC_SECTOR_FIELDS = {
  pain_point_clarity: "페인포인트 명확성",
  solution_appropriateness: "해결 방향 적절성",
  public_feasibility: "공공 현장 적용 가능성",
} as const;

export const CORPORATE_FIELDS = {
  problem_cost_clarity: "문제·비용 구체성",
  build_justification: "자체 구축 정당성",
  operational_viability: "도입·운영 현실성",
} as const;

export const INTENT_IMPLEMENTATION_FIELDS = {
  requirement_coverage: "핵심 요구사항 구현",
  success_criteria_met: "성공 기준 충족",
  fidelity_no_bloat: "기획 의도 일치",
} as const;

/** 분야2 라벨은 트랙 공통. 분야1 라벨은 트랙 스펙(judge/tracks.ts)에서 가져온다 */
export const INTENT_DOMAIN_LABEL = "의도 구현도";

export type PublicSectorKey = keyof typeof PUBLIC_SECTOR_FIELDS;
export type CorporateKey = keyof typeof CORPORATE_FIELDS;
export type Domain1Key = PublicSectorKey | CorporateKey;
export type IntentKey = keyof typeof INTENT_IMPLEMENTATION_FIELDS;
export type CriterionKey = Domain1Key | IntentKey;

export const ALL_CRITERION_KEYS: CriterionKey[] = [
  ...(Object.keys(PUBLIC_SECTOR_FIELDS) as PublicSectorKey[]),
  ...(Object.keys(CORPORATE_FIELDS) as CorporateKey[]),
  ...(Object.keys(INTENT_IMPLEMENTATION_FIELDS) as IntentKey[]),
];

/** 분야별 LLM structured output (1회 호출분) */
export interface PublicSectorScores {
  pain_point_clarity: number;
  solution_appropriateness: number;
  public_feasibility: number;
}

export interface CorporateScores {
  problem_cost_clarity: number;
  build_justification: number;
  operational_viability: number;
}

export interface IntentScores {
  requirement_coverage: number;
  success_criteria_met: number;
  fidelity_no_bloat: number;
}

export interface RiskReasonItem {
  criterion_key: string;
  reason: string;
}

export interface ReviewSummary {
  strengths: string[];
  risk_reasons: RiskReasonItem[];
  final_verdict: string;
}

/** 분야별 심사 가능 여부 (input_validator 판정 결과) */
export interface DomainAssessment {
  domain1_ok: boolean;
  domain1_reasons: string[];
  domain2_ok: boolean;
  domain2_reasons: string[];
  all_fatal: boolean;
  fatal_reasons: string[];
}

/** 앙상블 집계 결과 — 세부 항목 단위 */
export interface CriterionResult {
  key: CriterionKey;
  score: number;
  samples: number[];
  range: number;
  unstable: boolean;
}

/**
 * 세부 항목 점수 집합 (앙상블 집계 후 확정값).
 * 전체 키를 담되 실제로 채점되는 것은 트랙별 6개 — 나머지 분야1 키는 0으로 남는다.
 */
export type ScoreMap = Record<CriterionKey, number>;

/** 앙상블 메타 정보 */
export interface EnsembleMeta {
  n: number;
  model: string;
  fallback_used: boolean;
  unstable_count: number;
}

export type EvaluationMode = "full" | "partial" | "full_zero" | "fatal_zero";

/** 최종 평가 결과 (직렬화 대상) */
export interface EvaluationResult {
  scores: ScoreMap;
  criteria: CriterionResult[];
  strengths: string[];
  risks: string[];
  final_verdict: string;
}

/** 레포 스냅샷 */
export interface RepoSnapshot {
  owner: string;
  repo: string;
  branch: string;
  repo_url: string;
  plan: string;
  plan_path: string | null;
  code_bundle: string;
  files_included: string[];
}

export class EvaluationError extends Error {}
export class RepoFetchError extends Error {}
