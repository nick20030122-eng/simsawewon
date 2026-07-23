// Design Ref: §3.2 — 환경변수 → 타입 안전 설정 (모델 이중화 FR-08)

export interface JudgeConfig {
  judgeModel: string;
  fallbackModel: string;
  narrationModel: string;
  ttsModel: string;
  ensembleN: number;
  rangeThreshold: number;
}

// 채점 기본 모델은 gpt-5 — 기존 gpt-4o 캘리브레이션과 가장 근접 (2026-07 비교 측정)
const DEFAULTS = {
  judgeModel: "gpt-5",
  fallbackModel: "gpt-5.6-luna",
  narrationModel: "gpt-5.6-luna",
  ttsModel: "gpt-4o-mini-tts",
  ensembleN: 3,
  rangeThreshold: 15,
} as const;

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function getConfig(): JudgeConfig {
  return {
    judgeModel: process.env.JUDGE_MODEL?.trim() || DEFAULTS.judgeModel,
    fallbackModel: process.env.JUDGE_FALLBACK_MODEL?.trim() || DEFAULTS.fallbackModel,
    narrationModel: process.env.NARRATION_MODEL?.trim() || DEFAULTS.narrationModel,
    ttsModel: process.env.TTS_MODEL?.trim() || DEFAULTS.ttsModel,
    ensembleN: intEnv("JUDGE_ENSEMBLE_N", DEFAULTS.ensembleN, 1, 7),
    rangeThreshold: intEnv("JUDGE_RANGE_THRESHOLD", DEFAULTS.rangeThreshold, 1, 100),
  };
}

export function getOpenAIKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim() ?? "";
  if (!key || key.startsWith("sk-your")) return null;
  return key;
}
