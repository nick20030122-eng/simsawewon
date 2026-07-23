// Design Ref: §3.1 — LLM structured output 스키마 (zod, 파이썬 pydantic 모델 동등)
import { z } from "zod";

const score = z.number().int().min(0).max(100);

export const publicSectorScoresSchema = z.object({
  pain_point_clarity: score,
  solution_appropriateness: score,
  public_feasibility: score,
});

export const intentScoresSchema = z.object({
  requirement_coverage: score,
  success_criteria_met: score,
  fidelity_no_bloat: score,
});

export const readmeScoresSchema = z.object({
  setup_instructions: score,
  documentation_accuracy: score,
  maintainability: score,
});

export const riskReasonItemSchema = z.object({
  criterion_key: z
    .string()
    .describe(
      "감점 후보에 명시된 키만 사용 " +
        "(pain_point_clarity, solution_appropriateness, public_feasibility, " +
        "requirement_coverage, success_criteria_met, fidelity_no_bloat, " +
        "setup_instructions, documentation_accuracy, maintainability)",
    ),
  reason: z
    .string()
    .min(8)
    .max(180)
    .describe("해당 세부 항목의 감점 사유 1문장 (제출 자료 근거)"),
});

export const reviewSummarySchema = z.object({
  strengths: z.array(z.string()).min(1),
  risk_reasons: z
    .array(riskReasonItemSchema)
    .describe("감점 후보에 해당하는 항목만. 후보가 없으면 빈 배열."),
  final_verdict: z
    .string()
    .min(30)
    .max(450)
    .describe(
      "최종 한마디: 정확히 3문장(3줄). 칭찬·격려 중심, 간결한 총평. " +
        "읽는 이가 기분 좋게 느낄 따뜻한 톤.",
    ),
});

export const voiceNarrationSchema = z.object({
  score_intro: z.string().min(20).max(800),
  verdict_part: z.string().min(15).max(800),
});

export const evaluateRequestSchema = z.object({
  repo_url: z.string().min(8).max(500),
});

export const ttsRequestSchema = z.object({
  text: z.string().min(1).max(4096),
});
