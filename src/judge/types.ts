// Design Ref: §3.1 — 필드명은 프롬프트·기존 API와 동일한 snake_case 유지 (회귀 방지)

/** 분야별 세부 항목 키 → 한국어 라벨 */
export const PUBLIC_SECTOR_FIELDS = {
  pain_point_clarity: "페인포인트 명확성",
  solution_appropriateness: "해결 방향 적절성",
  public_feasibility: "공공 현장 적용 가능성",
} as const;

export const INTENT_IMPLEMENTATION_FIELDS = {
  requirement_coverage: "핵심 요구사항 구현",
  success_criteria_met: "성공 기준 충족",
  fidelity_no_bloat: "기획 의도 일치",
} as const;

export const README_QUALITY_FIELDS = {
  setup_instructions: "설치·실행 안내",
  documentation_accuracy: "기획·코드 정합성",
  maintainability: "유지보수·확장 가이드",
} as const;

export const DOMAIN_LABELS = {
  public_sector: "공공기관 적합성",
  intent_implementation: "의도 구현도",
  readme_quality: "README 품질",
} as const;

export type PublicSectorKey = keyof typeof PUBLIC_SECTOR_FIELDS;
export type IntentKey = keyof typeof INTENT_IMPLEMENTATION_FIELDS;
export type ReadmeKey = keyof typeof README_QUALITY_FIELDS;
export type CriterionKey = PublicSectorKey | IntentKey | ReadmeKey;

export const ALL_CRITERION_KEYS: CriterionKey[] = [
  ...(Object.keys(PUBLIC_SECTOR_FIELDS) as PublicSectorKey[]),
  ...(Object.keys(INTENT_IMPLEMENTATION_FIELDS) as IntentKey[]),
  ...(Object.keys(README_QUALITY_FIELDS) as ReadmeKey[]),
];

/** 분야별 LLM structured output (1회 호출분) */
export interface PublicSectorScores {
  pain_point_clarity: number;
  solution_appropriateness: number;
  public_feasibility: number;
}

export interface IntentScores {
  requirement_coverage: number;
  success_criteria_met: number;
  fidelity_no_bloat: number;
}

export interface ReadmeScores {
  setup_instructions: number;
  documentation_accuracy: number;
  maintainability: number;
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
  domain3_ok: boolean;
  domain3_reasons: string[];
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

/** 9개 세부 항목 점수 집합 (앙상블 집계 후 확정값) */
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
  readme: string;
  plan: string;
  plan_path: string | null;
  code_bundle: string;
  files_included: string[];
}

export class EvaluationError extends Error {}
export class RepoFetchError extends Error {}
