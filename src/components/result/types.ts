// /api/evaluate 스트림의 result payload 타입 (src/lib/serialize.ts 출력과 1:1)

export type EvaluationMode = "full" | "partial" | "full_zero" | "fatal_zero";

export interface ApiCriterion {
  key: string;
  domain: string;
  label: string;
  score: number;
  samples: number[];
  range: number;
  unstable: boolean;
}

export interface ApiEvaluation {
  strengths: string[];
  risks: string[];
  final_verdict: string;
  total_score: number;
  public_sector_score: number;
  intent_implementation_score: number;
  readme_quality_score: number;
  review_fallback: boolean;
  evaluation_mode: EvaluationMode;
  skip_reasons: { domain1: string[]; domain2: string[]; domain3: string[] };
  domain_skipped: { domain1: boolean; domain2: boolean; domain3: boolean };
  ensemble: { n: number; model: string; fallback_used: boolean; unstable_count: number };
  criteria: ApiCriterion[];
  repo?: { url: string; branch: string; files: string[]; plan_path: string | null };
}

export type StreamStage =
  | "fetching"
  | "validating"
  | "scoring"
  | "aggregating"
  | "reviewing";

export type StreamLine =
  | { type: "stage"; stage: StreamStage; message: string }
  | { type: "result"; data: ApiEvaluation }
  | { type: "error"; error: { code: string; message: string } };

/** 점수대별 시각 톤 — 70 이상 적정(청록), 50~69 주의(황갈), 미만 미흡(인주) */
export function scoreTone(score: number): "verdant" | "caution" | "seal" {
  if (score >= 70) return "verdant";
  if (score >= 50) return "caution";
  return "seal";
}

export const TONE_TEXT: Record<ReturnType<typeof scoreTone>, string> = {
  verdant: "text-verdant",
  caution: "text-caution",
  seal: "text-seal",
};

export const MODE_BADGES: Record<EvaluationMode, { label: string; className: string }> = {
  full: { label: "정식 심사", className: "bg-verdant-soft text-verdant" },
  partial: { label: "부분 심사", className: "bg-caution-soft text-caution" },
  full_zero: { label: "전 항목 0점", className: "bg-seal-soft text-seal" },
  fatal_zero: { label: "심사 부적격", className: "bg-seal-soft text-seal" },
};
