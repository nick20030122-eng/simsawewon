"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiEvaluation } from "./types";

interface Segment {
  id: string;
  label: string;
  text: string;
}

type Status = "idle" | "loading" | "playing" | "text-only" | "error";

/** 음성 브리핑 — 대본 생성 후 구간별 TTS 재생. 합성 실패 시 대본 텍스트만 표시 */
export function AudioBriefing({ result }: { result: ApiEvaluation }) {
  const [status, setStatus] = useState<Status>("idle");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [activeSegment, setActiveSegment] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      audioRef.current?.pause();
    };
  }, []);

  function stop() {
    cancelledRef.current = true;
    audioRef.current?.pause();
    audioRef.current = null;
    setActiveSegment(null);
    setStatus(segments.length > 0 ? "text-only" : "idle");
  }

  async function fetchSegments(): Promise<Segment[]> {
    const response = await fetch("/api/narration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total_score: result.total_score,
        public_sector_score: result.public_sector_score,
        intent_implementation_score: result.intent_implementation_score,
        readme_quality_score: result.readme_quality_score,
        final_verdict: result.final_verdict,
      }),
    });
    if (!response.ok) throw new Error("narration failed");
    const data = (await response.json()) as { segments: Segment[] };
    return data.segments;
  }

  async function playSegment(segment: Segment): Promise<boolean> {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: segment.text }),
    });
    if (!response.ok) return false;

    const url = URL.createObjectURL(await response.blob());
    try {
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => resolve();
        // 정지·언마운트로 pause()될 때도 promise를 정리해 blob URL 누수 방지
        audio.onpause = () => resolve();
        audio.onerror = () => reject(new Error("audio error"));
        void audio.play().catch(reject);
      });
      return true;
    } catch {
      return false;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function start() {
    cancelledRef.current = false;
    setStatus("loading");
    try {
      const loaded = segments.length > 0 ? segments : await fetchSegments();
      setSegments(loaded);
      setStatus("playing");
      for (const segment of loaded) {
        if (cancelledRef.current) return;
        setActiveSegment(segment.id);
        const ok = await playSegment(segment);
        if (!ok) {
          // 합성 실패 — 대본 텍스트만 표시
          setActiveSegment(null);
          setStatus("text-only");
          return;
        }
      }
      setActiveSegment(null);
      setStatus("text-only");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="border border-line bg-paper p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">음성 브리핑</h3>
          <p className="text-xs text-ink-soft">심사 결과를 심사위원 음성으로 들려드립니다.</p>
        </div>
        {status === "playing" ? (
          <button
            type="button"
            onClick={stop}
            className="border border-ink px-4 py-2 text-xs font-bold hover:border-seal hover:text-seal"
          >
            정지
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void start()}
            disabled={status === "loading"}
            className="border border-ink px-4 py-2 text-xs font-bold hover:border-seal hover:text-seal disabled:opacity-50"
          >
            {status === "loading" ? "대본 준비 중…" : "재생"}
          </button>
        )}
      </div>

      {status === "error" && (
        <p className="mt-3 text-xs text-seal">
          음성 브리핑을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      {segments.length > 0 && status !== "error" && (
        <dl className="mt-3 space-y-2 border-t border-line pt-3">
          {segments.map((segment) => (
            <div
              key={segment.id}
              className={`text-sm leading-relaxed ${
                activeSegment === segment.id ? "text-ink" : "text-ink-soft"
              }`}
            >
              <dt className="text-[0.65rem] font-bold tracking-widest">
                {segment.label}
                {activeSegment === segment.id && (
                  <span className="step-pulse ml-2 inline-block h-1.5 w-1.5 rounded-full bg-seal align-middle" />
                )}
              </dt>
              <dd className="mt-0.5">{segment.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
