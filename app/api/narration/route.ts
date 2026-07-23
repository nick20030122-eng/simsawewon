// Design Ref: §4.2 POST /api/narration — 실패 시 fallback 대본 반환 (200 유지, 기존 동작)
import { z } from "zod";
import { getConfig, getOpenAIKey } from "@/lib/config";
import {
  buildFallbackNarrationSegments,
  generateVoiceNarration,
} from "@/lib/narration";
import { createClient } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 120;

const score = z.number().min(0).max(100);

const narrationRequestSchema = z.object({
  total_score: score,
  public_sector_score: score,
  intent_implementation_score: score,
  readme_quality_score: score,
  final_verdict: z.string().min(1).max(1000),
});

export async function POST(request: Request) {
  const parsed = narrationRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: "채점 결과 데이터가 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  if (getOpenAIKey() === null) {
    return Response.json({ segments: buildFallbackNarrationSegments(payload), fallback: true });
  }

  try {
    const client = createClient();
    const segments = await generateVoiceNarration(payload, client, getConfig().narrationModel);
    return Response.json({ segments, fallback: false });
  } catch {
    return Response.json({ segments: buildFallbackNarrationSegments(payload), fallback: true });
  }
}
