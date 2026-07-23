// Design Ref: §2.3 — 기존 프롬프트·루브릭 자산 로드 (prompts/, specs/ 경로 불변)
import { readFileSync } from "node:fs";
import path from "node:path";
import { EvaluationError } from "@/judge/types";

const PROMPTS_DIR = path.join(process.cwd(), "prompts");
const SPECS_DIR = path.join(process.cwd(), "specs");

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

export function loadPrompt(filename: string, options?: { readmeRubric?: string }): string {
  const text = readCached(path.join(PROMPTS_DIR, filename), "프롬프트");
  return text.replaceAll("{readme_rubric}", options?.readmeRubric ?? "");
}

export function loadReadmeRubric(): string {
  return readCached(path.join(SPECS_DIR, "README_RUBRIC.md"), "README 평가 규칙");
}
