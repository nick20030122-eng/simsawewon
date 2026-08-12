"use client";

import { allTrackSpecs } from "@/judge/tracks";
import type { JudgeTrack } from "@/components/result/types";

// 트랙 정의는 judge/tracks.ts 한 곳에서만 관리한다 (설명 문구 중복 방지)
const TRACK_OPTIONS = allTrackSpecs().map((spec) => ({
  id: spec.id,
  label: spec.label,
  summary: spec.description,
}));

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
