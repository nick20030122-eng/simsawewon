"use client";

import { useEffect, useRef, useState } from "react";
import { ProgressStepper } from "./ProgressStepper";
import { isValidRepoUrl, RepoUrlInput } from "./RepoUrlInput";
import { ResultSheet } from "@/components/result/ResultSheet";
import type { ApiEvaluation, StreamLine, StreamStage } from "@/components/result/types";

type Phase =
  | { name: "idle" }
  | { name: "running"; stage: StreamStage | null }
  | { name: "done"; result: ApiEvaluation }
  | { name: "error"; code: string; message: string };

export function EvaluateClient() {
  const [repoUrl, setRepoUrl] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [keyMissing, setKeyMissing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void fetch("/api/health")
      .then((response) => response.json())
      .then((data: { openai_configured: boolean }) => {
        setKeyMissing(!data.openai_configured);
      })
      .catch(() => {});
    // 언마운트 시 진행 중인 심사 요청 취소
    return () => abortRef.current?.abort();
  }, []);

  const running = phase.name === "running";
  const canSubmit = !running && isValidRepoUrl(repoUrl) && !keyMissing;

  async function submit() {
    if (!canSubmit) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ name: "running", stage: null });

    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: repoUrl.trim() }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as {
          error?: { code: string; message: string };
        } | null;
        setPhase({
          name: "error",
          code: data?.error?.code ?? "LLM_FAILED",
          message:
            data?.error?.message ?? "심사를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      const handleLine = (raw: string) => {
        if (!raw.trim()) return;
        const line = JSON.parse(raw) as StreamLine;
        if (line.type === "stage") {
          setPhase({ name: "running", stage: line.stage });
        } else if (line.type === "result") {
          finished = true;
          setPhase({ name: "done", result: line.data });
        } else if (line.type === "error") {
          finished = true;
          setPhase({ name: "error", code: line.error.code, message: line.error.message });
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) handleLine(raw);
      }
      if (buffer.trim()) handleLine(buffer);

      if (!finished) {
        setPhase({
          name: "error",
          code: "LLM_FAILED",
          message: "심사 도중 연결이 끊어졌습니다. 잠시 후 다시 시도해 주세요.",
        });
      }
    } catch {
      if (controller.signal.aborted) return; // 취소된 요청 — 상태 갱신 없음
      setPhase({
        name: "error",
        code: "NETWORK",
        message: "서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {keyMissing && (
        <p className="border border-seal bg-seal-soft px-4 py-3 text-sm text-seal">
          OpenAI API 키가 설정되지 않아 심사를 진행할 수 없습니다. 운영자에게 문의해
          주세요.
        </p>
      )}

      <section className="border border-line bg-sheet p-6">
        <h2 className="font-display text-xl font-black">심사 접수</h2>
        <p className="mt-1 text-sm text-ink-soft">
          공개 GitHub 레포 주소만 제출하면 레포에서 기획서·README·코드를 수집해 바로
          심사가 시작됩니다.
        </p>
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <RepoUrlInput value={repoUrl} onChange={setRepoUrl} disabled={running} />
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="shrink-0 border-2 border-ink bg-ink px-8 py-3 text-sm font-bold text-sheet transition-colors hover:border-seal hover:bg-seal disabled:cursor-not-allowed disabled:border-line disabled:bg-line disabled:text-ink-soft"
          >
            {running ? "심사 진행 중…" : "심사 시작"}
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          기획서는 레포 안의 <span className="font-mono">PLAN.md</span> 또는{" "}
          <span className="font-mono">기획서.md</span> 파일에서 자동으로 읽습니다. 파일이
          없으면 공공기관 적합성·의도 구현도 분야는 부적격(0점) 처리됩니다.
        </p>
      </section>

      {running && (
        <ProgressStepper
          current={phase.name === "running" ? phase.stage : null}
          finished={false}
        />
      )}

      {phase.name === "error" && (
        <div className="border border-seal bg-seal-soft p-5 text-sm leading-relaxed text-seal">
          <p className="font-bold">심사를 완료하지 못했습니다.</p>
          <p className="mt-1 whitespace-pre-wrap">{phase.message}</p>
          {phase.code === "RATE_LIMITED" && (
            <p className="mt-2 text-xs">
              같은 서버를 여러 사람이 쓰면 GitHub 조회 한도에 걸릴 수 있습니다. 몇 분
              후 다시 시도해 주세요.
            </p>
          )}
        </div>
      )}

      {phase.name === "done" && (
        <>
          <ProgressStepper current={null} finished />
          <ResultSheet result={phase.result} />
        </>
      )}
    </div>
  );
}
