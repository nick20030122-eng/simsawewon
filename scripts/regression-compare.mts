// 회귀 대조: 새 TS 엔진으로 examples/ 채점 (Design §8.4)
// 실행: npx tsx scripts/regression-compare.ts
import { readFileSync } from "node:fs";
import path from "node:path";

// .env 수동 로드 (Next 외부 실행)
const envPath = path.join(process.cwd(), ".env");
try {
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // .env 없으면 환경변수 그대로 사용
}

const { runEvaluation } = await import("../src/lib/evaluator");
const { totalScore, publicSectorScore, intentImplementationScore, readmeQualityScore } =
  await import("../src/judge/score");

function loadExample(name: string): [string, string, string] {
  const dir = path.join(process.cwd(), "examples", name);
  return [
    readFileSync(path.join(dir, "PLAN.md"), "utf-8"),
    readFileSync(path.join(dir, "README.md"), "utf-8"),
    readFileSync(path.join(dir, "app.py"), "utf-8"),
  ];
}

async function evaluateOnce(name: string) {
  const [plan, readme, code] = loadExample(name);
  const output = await runEvaluation(plan, readme, code);
  return {
    total: totalScore(output.scores),
    domain1: publicSectorScore(output.scores),
    domain2: intentImplementationScore(output.scores),
    domain3: readmeQualityScore(output.scores),
    mode: output.evaluation_mode,
    unstable: output.ensemble.unstable_count,
    fallback_used: output.ensemble.fallback_used,
  };
}

const REPEATS = Number(process.env.REGRESSION_REPEATS ?? 3);

const results: Record<string, unknown> = {};

// Pass 예상 예시 — 반복 채점으로 재현성(표준편차) 측정
const repeated = [];
for (let i = 0; i < REPEATS; i += 1) {
  const run = await evaluateOnce("01_csv_dashboard");
  repeated.push(run);
  console.error(`01_csv_dashboard run ${i + 1}/${REPEATS}: total=${run.total}`);
}
const totals = repeated.map((r) => r.total);
const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
const std = Math.sqrt(totals.reduce((a, b) => a + (b - mean) ** 2, 0) / totals.length);
results["01_csv_dashboard"] = { runs: repeated, totals, mean, std };

// Fail 예상 예시 — 1회
const fail = await evaluateOnce("02_todo_tracker");
console.error(`02_todo_tracker: total=${fail.total} mode=${fail.mode}`);
results["02_todo_tracker"] = fail;

console.log(JSON.stringify(results, null, 2));
