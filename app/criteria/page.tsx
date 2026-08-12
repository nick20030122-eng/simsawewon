import type { Metadata } from "next";
import { allTrackSpecs } from "@/judge/tracks";
import { INTENT_DOMAIN_LABEL, INTENT_IMPLEMENTATION_FIELDS } from "@/judge/types";

export const metadata: Metadata = {
  title: "채점 기준 — AI 심사위원",
};

const INTENT_DESCRIPTIONS: Record<string, string> = {
  requirement_coverage: "기획서의 핵심 기능이 코드에 반영됐는가.",
  success_criteria_met: "기획서의 성공 기준·UI·예외 처리 요구가 충족됐는가.",
  fidelity_no_bloat: "기획 의도가 왜곡되지 않았고, 무관한 기능이 과하지 않은가.",
};

interface CriterionRow {
  key: string;
  label: string;
  description: string;
}

function DomainSection({
  no,
  title,
  target,
  intro,
  criteria,
}: {
  no: string;
  title: string;
  target: string;
  intro: string;
  criteria: CriterionRow[];
}) {
  return (
    <section className="border border-line bg-sheet">
      <div className="border-b border-line px-6 py-4">
        <p className="text-xs font-medium tracking-widest text-seal">{no}</p>
        <h3 className="mt-1 font-display text-xl font-bold">{title}</h3>
        <p className="mt-1 text-xs text-ink-soft">
          평가 대상 · {target} — {intro}
        </p>
      </div>
      <ul className="divide-y divide-line">
        {criteria.map((criterion) => (
          <li
            key={criterion.key}
            className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:items-baseline sm:gap-6"
          >
            <span className="w-44 shrink-0 text-sm font-bold">{criterion.label}</span>
            <span className="text-sm text-ink-soft">{criterion.description}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const INTENT_CRITERIA: CriterionRow[] = Object.entries(INTENT_IMPLEMENTATION_FIELDS).map(
  ([key, label]) => ({ key, label, description: INTENT_DESCRIPTIONS[key] }),
);

export default function CriteriaPage() {
  return (
    <div className="flex flex-col gap-14">
      <header>
        <p className="text-xs font-medium tracking-[0.3em] text-ink-soft">채점 기준 고시</p>
        <h1 className="mt-2 font-display text-3xl font-black">
          트랙별 2개 분야 · 6개 항목
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          심사는 기관용·기업용 두 트랙으로 나뉩니다. 제1분야는 트랙마다 기준이 다르고,
          제2분야(의도 구현도)는 두 트랙 공통입니다. 모든 항목은 0~100점으로 채점하며,
          분야 점수는 세부 3개 항목의 평균, 종합 점수는 2개 분야의 평균입니다. 70점 미만
          항목은 감점 요인으로 결과서에 기록됩니다.
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-seal">
          두 트랙은 채점 기준이 다르므로 점수를 서로 비교할 수 없습니다.
        </p>
      </header>

      {allTrackSpecs().map((spec) => (
        <div key={spec.id} className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-2xl font-black">{spec.label} 트랙</h2>
            <p className="mt-1 text-sm text-ink-soft">{spec.description}</p>
          </div>
          <DomainSection
            no="제1분야"
            title={spec.domain1Label}
            target={spec.domain1Target}
            intro={spec.domain1Intro}
            criteria={Object.entries(spec.domain1Fields).map(([key, label]) => ({
              key,
              label,
              description: spec.domain1Descriptions[key],
            }))}
          />
          <DomainSection
            no="제2분야 (공통)"
            title={INTENT_DOMAIN_LABEL}
            target="기획서 ↔ 실행 코드"
            intro="기획서에 적은 내용이 실행 코드에 실제로 구현됐는지 대조합니다."
            criteria={INTENT_CRITERIA}
          />
        </div>
      ))}
    </div>
  );
}
