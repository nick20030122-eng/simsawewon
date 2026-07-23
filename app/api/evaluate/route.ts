// Design Ref: §4.2 POST /api/evaluate — NDJSON 스트리밍 (진행 단계 → 최종 결과)
import { evaluateRequestSchema } from "@/judge/schemas";
import { EvaluationError, RepoFetchError } from "@/judge/types";
import { getOpenAIKey } from "@/lib/config";
import { runEvaluation, type EvaluationStage } from "@/lib/evaluator";
import { fetchGithubRepo } from "@/lib/github";
import { evaluationToResponse } from "@/lib/serialize";

export const runtime = "nodejs";
export const maxDuration = 300;

const STAGE_MESSAGES: Record<"fetching" | EvaluationStage, string> = {
  fetching: "레포 수집 중",
  validating: "입력 적격성 검증 중",
  scoring: "분야별 앙상블 채점 중",
  aggregating: "점수 집계 중",
  reviewing: "평가 후기 작성 중",
};

function ndjson(line: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(line) + "\n");
}

function errorLine(code: string, message: string): Record<string, unknown> {
  return { type: "error", error: { code, message } };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: "요청 본문이 올바른 JSON이 아닙니다." } },
      { status: 400 },
    );
  }

  const parsed = evaluateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "요청 형식이 올바르지 않습니다. 기획서와 GitHub 레포 URL을 확인해 주세요.",
        },
      },
      { status: 400 },
    );
  }

  if (getOpenAIKey() === null) {
    return Response.json(
      {
        error: {
          code: "MISSING_API_KEY",
          message: "OpenAI API 키가 설정되지 않았습니다. 운영자에게 문의해 주세요.",
        },
      },
      { status: 503 },
    );
  }

  const { repo_url } = parsed.data;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 클라이언트 중도 이탈 시 enqueue/close가 throw하지 않도록 방어
      let closed = false;
      const send = (line: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(ndjson(line));
        } catch {
          closed = true;
        }
      };
      const sendStage = (stage: "fetching" | EvaluationStage) =>
        send({ type: "stage", stage, message: STAGE_MESSAGES[stage] });

      try {
        sendStage("fetching");
        const snapshot = await fetchGithubRepo(repo_url);

        const output = await runEvaluation(
          snapshot.plan,
          snapshot.readme,
          snapshot.code_bundle,
          { onStage: sendStage },
        );

        const response = evaluationToResponse(output);
        response.repo = {
          url: snapshot.repo_url,
          branch: snapshot.branch,
          files: snapshot.files_included,
          plan_path: snapshot.plan_path,
        };
        send({ type: "result", data: response });
      } catch (error) {
        if (error instanceof RepoFetchError) {
          const rateLimited = error.message.includes("요청 한도");
          send(errorLine(rateLimited ? "RATE_LIMITED" : "REPO_FETCH_FAILED", error.message));
        } else if (error instanceof EvaluationError) {
          send(errorLine("LLM_FAILED", error.message));
        } else {
          send(
            errorLine(
              "LLM_FAILED",
              "예상치 못한 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
            ),
          );
        }
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            // 이미 닫힌 스트림 — 무시
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
