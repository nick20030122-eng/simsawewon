"use client";

import type { StreamStage } from "@/components/result/types";

const STAGES: Array<{ stage: StreamStage; label: string }> = [
  { stage: "fetching", label: "자료 수집" },
  { stage: "validating", label: "적격성 검증" },
  { stage: "scoring", label: "앙상블 채점" },
  { stage: "aggregating", label: "점수 집계" },
  { stage: "reviewing", label: "후기 작성" },
];

interface ProgressStepperProps {
  current: StreamStage | null;
  finished: boolean;
}

/** 결재란 은유 — 단계가 끝날 때마다 "완" 도장이 찍힙니다. */
export function ProgressStepper({ current, finished }: ProgressStepperProps) {
  const currentIndex = current
    ? STAGES.findIndex((item) => item.stage === current)
    : -1;

  return (
    <div data-print-hide className="border border-line bg-sheet p-4">
      {/* 현재 단계만 낭독 — 컨테이너 전체를 live region으로 두면 매 단계마다 전부 재낭독된다 */}
      <p className="sr-only" role="status" aria-live="polite">
        {finished
          ? "심사 완료"
          : currentIndex >= 0
            ? `${STAGES[currentIndex].label} 진행 중 (${currentIndex + 1}/${STAGES.length}단계)`
            : ""}
      </p>
      <p className="text-xs font-medium tracking-widest text-ink-soft">심사 진행</p>
      <ol className="mt-3 grid grid-cols-5 divide-x divide-line border border-line">
        {STAGES.map((item, index) => {
          const done = finished || index < currentIndex;
          const active = !finished && index === currentIndex;
          return (
            <li key={item.stage} className="flex flex-col">
              {/* 라벨 줄 수가 칸마다 달라 구분선이 어긋나지 않도록 높이 고정 */}
              <span className="flex min-h-[2.4rem] items-center justify-center border-b border-line px-1 py-1 text-center text-xs text-ink-soft">
                {item.label}
              </span>
              <span className="flex h-12 items-center justify-center" aria-hidden>
                {done ? (
                  <span className="flex h-8 w-8 rotate-[-8deg] items-center justify-center rounded-full border-2 border-seal font-display text-sm font-bold text-seal">
                    완
                  </span>
                ) : active ? (
                  <span className="step-pulse h-2.5 w-2.5 rounded-full bg-ink" />
                ) : (
                  <span className="h-2.5 w-2.5 rounded-full border border-line-strong" />
                )}
              </span>
              <span className="sr-only">
                {item.label}: {done ? "완료" : active ? "진행 중" : "대기"}
              </span>
            </li>
          );
        })}
      </ol>
      {current === "scoring" && (
        <p className="mt-2 text-xs text-ink-soft">
          항목마다 여러 번 채점해 중앙값을 구하는 중입니다. 1~2분 정도 걸릴 수 있습니다.
        </p>
      )}
    </div>
  );
}
