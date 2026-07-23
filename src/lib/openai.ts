// Design Ref: §2.1 — OpenAI 클라이언트 + 모델 폴백 이중화 (FR-08)
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { EvaluationError } from "@/judge/types";
import { getOpenAIKey } from "./config";

const OPENAI_TIMEOUT_MS = 120_000;

export function createClient(): OpenAI {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    throw new EvaluationError(
      "OPENAI_API_KEY가 설정되지 않았습니다. 환경변수를 확인해 주세요.",
    );
  }
  return new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_MS });
}

/** 폴백 사용 여부를 평가 단위로 추적 */
export interface FallbackState {
  fallbackUsed: boolean;
}

interface ParseOptions<Schema extends z.ZodType> {
  system: string;
  user: string;
  schema: Schema;
  schemaName: string;
}

async function parseOnce<Schema extends z.ZodType>(
  client: OpenAI,
  model: string,
  options: ParseOptions<Schema>,
): Promise<z.infer<Schema>> {
  const response = await client.responses.parse({
    model,
    input: [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ],
    text: { format: zodTextFormat(options.schema, options.schemaName) },
  });
  const parsed = response.output_parsed;
  if (parsed == null) {
    throw new EvaluationError("평가 결과를 파싱하지 못했습니다.");
  }
  return parsed as z.infer<Schema>;
}

/** 주 모델 실패 시 폴백 모델로 1회 재시도하는 structured output 호출 */
export async function parseStructured<Schema extends z.ZodType>(
  client: OpenAI,
  models: { primary: string; fallback: string },
  options: ParseOptions<Schema>,
  state: FallbackState,
): Promise<z.infer<Schema>> {
  try {
    return await parseOnce(client, models.primary, options);
  } catch (primaryError) {
    if (models.fallback && models.fallback !== models.primary) {
      try {
        const result = await parseOnce(client, models.fallback, options);
        state.fallbackUsed = true;
        return result;
      } catch {
        // 폴백도 실패 — 원래 오류 기준으로 보고
      }
    }
    const message =
      primaryError instanceof Error ? primaryError.message : String(primaryError);
    throw new EvaluationError(`OpenAI API 오류: ${message}`);
  }
}
