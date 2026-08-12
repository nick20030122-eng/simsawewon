"use client";

import type { JudgeTrack } from "@/components/result/types";

interface TrackOption {
  id: JudgeTrack;
  label: string;
  summary: string;
}

export const TRACK_OPTIONS: TrackOption[] = [
  {
    id: "public",
    label: "기관용",
    summary: "공공기관·지자체 업무 현장의 문제 해결을 기준으로 심사합니다.",
  },
  {
    id: "corporate",
    label: "기업용",
    summary: "사내 업무 개선 효과와 직접 만들 이유가 있는지를 기준으로 심사합니다.",
  },
];

interface TrackSelectorProps {
  value: JudgeTrack;
  onChange: (value: JudgeTrack) => void;
  disabled: boolean;
}

/** 심사 트랙 선택 — 분야1(기획 평가) 기준이 트랙별로 달라집니다 */
export function TrackSelector({ value, onChange, disabled }: TrackSelectorProps) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="text-sm font-bold">심사 트랙</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {TRACK_OPTIONS.map((option) => {
          const selected = option.id === value;
          return (
            <label
              key={option.id}
              className={`flex cursor-pointer flex-col gap-1 border p-3 transition-colors ${
                selected
                  ? "border-ink bg-paper"
                  : "border-line bg-sheet hover:border-line-strong"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="judge-track"
                  value={option.id}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onChange(option.id)}
                  className="accent-seal"
                />
                <span className="text-sm font-bold">{option.label}</span>
              </span>
              <span className="text-xs leading-relaxed text-ink-soft">{option.summary}</span>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-ink-soft">
        두 트랙은 채점 기준이 달라 점수를 서로 비교할 수 없습니다. 의도 구현도 분야는
        공통입니다.
      </p>
    </fieldset>
  );
}
