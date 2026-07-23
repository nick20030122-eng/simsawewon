// Design Ref: §4.2 /api/narration — 채점 결과 → TTS용 2구간 대본. judge/narration.py 동등 이식
import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { voiceNarrationSchema } from "@/judge/schemas";
import { loadPrompt } from "./prompts";

export interface NarrationSegment {
  id: string;
  label: string;
  icon: string;
  text: string;
}

export interface NarrationPayload {
  total_score: number;
  public_sector_score: number;
  intent_implementation_score: number;
  readme_quality_score: number;
  final_verdict: string;
}

function toSegments(scoreIntro: string, verdictPart: string): NarrationSegment[] {
  return [
    { id: "score", label: "종합 점수", icon: "leaderboard", text: scoreIntro.trim() },
    { id: "verdict", label: "최종 평가", icon: "gavel", text: verdictPart.trim() },
  ];
}

/** LLM 대본 생성 실패 시 사용하는 기본 2구간 대본 */
export function buildFallbackNarrationSegments(payload: NarrationPayload): NarrationSegment[] {
  return [
    {
      id: "score",
      label: "종합 점수",
      icon: "leaderboard",
      text:
        "안녕하세요, AI 심사위원입니다. " +
        `종합 점수는 ${payload.total_score}점이고, ` +
        `공공기관 적합성 ${payload.public_sector_score}점, ` +
        `의도 구현도 ${payload.intent_implementation_score}점, ` +
        `README 품질 ${payload.readme_quality_score}점입니다.`,
    },
    {
      id: "verdict",
      label: "최종 평가",
      icon: "gavel",
      text:
        "마지막으로 드리는 말씀입니다. " +
        `${payload.final_verdict.trim()} ` +
        "오늘도 수고 많으셨습니다.",
    },
  ];
}

/** 채점 결과로부터 TTS용 2구간 대본 생성 (2회 재시도) */
export async function generateVoiceNarration(
  payload: NarrationPayload,
  client: OpenAI,
  model: string,
): Promise<NarrationSegment[]> {
  let userContent =
    "아래 채점 결과를 바탕으로 음성 대본 2구간을 작성하세요.\n\n" +
    `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await client.responses.parse({
        model,
        input: [
          { role: "system", content: loadPrompt("voice_narration.txt") },
          { role: "user", content: userContent },
        ],
        text: { format: zodTextFormat(voiceNarrationSchema, "voice_narration") },
      });
      const parsed = response.output_parsed;
      if (parsed == null) throw new Error("음성 대본을 생성하지 못했습니다.");
      return toSegments(parsed.score_intro, parsed.verdict_part);
    } catch (error) {
      if (attempt === 0) {
        userContent += "\n\n각 구간은 짧고 자연스러운 구어체로 다시 작성하세요.";
        continue;
      }
      throw error;
    }
  }
  throw new Error("음성 대본을 생성하지 못했습니다.");
}
