// Design Ref: §4.2 POST /api/tts — 실패 시 501 (클라이언트는 대본 텍스트만 표시)
import { ttsRequestSchema } from "@/judge/schemas";
import { getOpenAIKey } from "@/lib/config";
import { createClient } from "@/lib/openai";
import { synthesizeSpeech } from "@/lib/tts";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const parsed = ttsRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: "음성으로 변환할 텍스트가 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  if (getOpenAIKey() === null) {
    return Response.json(
      { error: { code: "TTS_UNAVAILABLE", message: "음성 합성을 사용할 수 없습니다." } },
      { status: 501 },
    );
  }

  try {
    const audio = await synthesizeSpeech(createClient(), parsed.data.text);
    return new Response(new Uint8Array(audio), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: { code: "TTS_UNAVAILABLE", message: "음성 합성에 실패했습니다." } },
      { status: 501 },
    );
  }
}
