// Design Ref: §2.3 — 기존 프롬프트 자산 로드 (prompts/ 경로 불변)
import { readFileSync } from "node:fs";
import path from "node:path";
import { EvaluationError } from "@/judge/types";

const PROMPTS_DIR = path.join(process.cwd(), "prompts");

const cache = new Map<string, string>();

function readCached(filePath: string, label: string): string {
  const hit = cache.get(filePath);
  if (hit !== undefined) return hit;
  let text: string;
  try {
    text = readFileSync(filePath, "utf-8");
  } catch {
    throw new EvaluationError(`${label} 파일을 찾을 수 없습니다: ${filePath}`);
  }
  cache.set(filePath, text);
  return text;
}

export function loadPrompt(filename: string): string {
  return readCached(path.join(PROMPTS_DIR, filename), "프롬프트");
}
