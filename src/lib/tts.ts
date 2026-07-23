// Design Ref: §4.2 /api/tts — OpenAI TTS (edge-tts 대체). 실패 시 상위에서 501 처리
import type OpenAI from "openai";
import { getConfig } from "./config";

// 차분·공손한 남성 톤 — 심사위원 음성에 적합
const DEFAULT_VOICE = "onyx";
const LEGACY_SPEED = 1.34; // 구 버전(edge-tts +34%)과 동일한 체감 속도

export async function synthesizeSpeech(client: OpenAI, text: string): Promise<Buffer> {
  const { ttsModel } = getConfig();
  const isLegacyModel = ttsModel.startsWith("tts-");

  const response = await client.audio.speech.create({
    model: ttsModel,
    voice: DEFAULT_VOICE,
    input: text.trim(),
    response_format: "mp3",
    // gpt-4o-mini-tts는 instructions, tts-1 계열은 speed로 톤·속도 제어
    ...(isLegacyModel
      ? { speed: LEGACY_SPEED }
      : {
          instructions:
            "차분하고 공손한 한국어 남성 심사위원의 톤으로, 또렷하고 약간 빠르게 읽어주세요.",
        }),
  });

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length === 0) throw new Error("음성 데이터가 비어 있습니다.");
  return audio;
}
