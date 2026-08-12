import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "채점 기준 — AI 심사위원",
};

interface CriterionSpec {
  key: string;
  label: string;
  description: string;
}

interface DomainSpec {
  no: string;
  title: string;
  target: string;
  intro: string;
  criteria: CriterionSpec[];
}

const DOMAINS: DomainSpec[] = [
  {
    no: "제1분야",
    title: "공공기관 적합성",
    target: "기획서",
    intro: "기획서만 읽고 공공 현장의 문제 인식과 해결 방향을 평가합니다.",
    criteria: [
      {
        key: "pain_point_clarity",
        label: "페인포인트 명확성",
        description: "공공 현장·업무의 문제가 구체적으로 드러나는가.",
      },
      {
        key: "solution_appropriateness",
        label: "해결 방향 적절성",
        description: "제시한 해결 방향이 그 문제를 실질적으로 줄이는가.",
      },
      {
        key: "public_feasibility",
        label: "공공 현장 적용 가능성",
        description: "보안·개인정보·예산·조직 등 현장 적용 전제를 고려했는가.",
      },
    ],
  },
  {
    no: "제2분야",
    title: "의도 구현도",
    target: "기획서 ↔ 실행 코드",
    intro: "기획서에 적은 내용이 실행 코드에 실제로 구현됐는지 대조합니다.",
    criteria: [
      {
        key: "requirement_coverage",
        label: "핵심 요구사항 구현",
        description: "기획서의 핵심 기능이 코드에 반영됐는가.",
      },
      {
        key: "success_criteria_met",
        label: "성공 기준 충족",
        description: "기획서의 성공 기준·UI·예외 처리 요구가 충족됐는가.",
      },
      {
        key: "fidelity_no_bloat",
        label: "기획 의도 일치",
        description: "기획 의도가 왜곡되지 않았고, 무관한 기능이 과하지 않은가.",
      },
    ],
  },
];

export default function CriteriaPage() {
  return (
    <div className="flex flex-col gap-10">
      <header>
        <p className="text-xs font-medium tracking-[0.3em] text-ink-soft">채점 기준 고시</p>
        <h1 className="mt-2 font-display text-3xl font-black">2개 분야 · 6개 항목</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          모든 항목은 0~100점으로 채점합니다. 분야 점수는 세부 3개 항목의 평균,
          종합 점수는 2개 분야의 평균입니다. 70점 미만 항목은 감점 요인으로 결과서에
          기록됩니다.
        </p>
      </header>

      {DOMAINS.map((domain) => (
        <section key={domain.title} className="border border-line bg-sheet">
          <div className="border-b border-line px-6 py-4">
            <p className="text-xs font-medium tracking-widest text-seal">{domain.no}</p>
            <h2 className="mt-1 font-display text-xl font-bold">{domain.title}</h2>
            <p className="mt-1 text-xs text-ink-soft">
              평가 대상 · {domain.target} — {domain.intro}
            </p>
          </div>
          <ul className="divide-y divide-line">
            {domain.criteria.map((criterion) => (
              <li key={criterion.key} className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:items-baseline sm:gap-6">
                <span className="w-44 shrink-0 text-sm font-bold">{criterion.label}</span>
                <span className="text-sm text-ink-soft">{criterion.description}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
