// 모델별 분야1(공공기관 적합성) 캘리브레이션 비교
// 실행: npx tsx scripts/model-calibration.mts
import { readFileSync } from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env");
try {
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // 환경변수 그대로 사용
}

const OpenAI = (await import("openai")).default;
const { zodTextFormat } = await import("openai/helpers/zod");
const { publicSectorScoresSchema } = await import("../src/judge/schemas");

const MODELS = ["gpt-5", "gpt-5.5", "gpt-5.6-terra"];
const SAMPLES = 3;

const plan = readFileSync(
  path.join(process.cwd(), "examples", "01_csv_dashboard", "PLAN.md"),
  "utf-8",
);
const system = readFileSync(
  path.join(process.cwd(), "prompts", "domain1_public.txt"),
  "utf-8",
);

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000 });

const results: Record<string, unknown> = {};

for (const model of MODELS) {
  try {
    const samples = await Promise.all(
      Array.from({ length: SAMPLES }, async () => {
        const response = await client.responses.parse({
          model,
          input: [
            { role: "system", content: system },
            { role: "user", content: `## 기획서\n${plan.trim()}` },
          ],
          text: { format: zodTextFormat(publicSectorScoresSchema, "public_sector_scores") },
        });
        const parsed = response.output_parsed!;
        return {
          avg: Math.round(
            ((parsed.pain_point_clarity +
              parsed.solution_appropriateness +
              parsed.public_feasibility) /
              3) * 10,
          ) / 10,
          ...parsed,
        };
      }),
    );
    results[model] = samples;
    console.error(`${model}: ${samples.map((s) => s.avg).join(", ")}`);
  } catch (error) {
    results[model] = { error: error instanceof Error ? error.message : String(error) };
    console.error(`${model}: ERROR ${results[model] instanceof Object ? (results[model] as { error?: string }).error : ""}`);
  }
}

console.log(JSON.stringify(results, null, 2));
