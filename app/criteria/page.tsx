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
  {
    no: "제3분야",
    title: "README 품질",
    target: "README 문서",
    intro: "README만으로 프로젝트를 재현하고 유지보수할 수 있는지 평가합니다.",
    criteria: [
      {
        key: "setup_instructions",
        label: "설치·실행 안내",
        description: "환경·의존성·실행 명령까지 재현 가능한 안내가 있는가.",
      },
      {
        key: "documentation_accuracy",
        label: "기획·코드 정합성",
        description: "README의 설명이 기획서·실행 코드와 일치하는가.",
      },
      {
        key: "maintainability",
        label: "유지보수·확장 가이드",
        description: "프로젝트 구조와 핵심 파일 역할, 확장 시 주의점이 명확한가.",
      },
    ],
  },
];

const README_BANDS: Array<{ range: string; summary: string }> = [
  { range: "90~100", summary: "환경·의존성·환경변수·실행 명령까지 누락 없이 재현 가능" },
  { range: "70~89", summary: "실행 가능하나 일부 전제(버전·경로)가 암묵적" },
  { range: "50~69", summary: "개요만 있고 실제 실행 단계·역할 설명이 불충분" },
  { range: "0~49", summary: "실행 방법·구조 정보가 없거나 실제 프로젝트와 동떨어짐" },
];

export default function CriteriaPage() {
  return (
    <div className="flex flex-col gap-10">
      <header>
        <p className="text-xs font-medium tracking-[0.3em] text-ink-soft">채점 기준 고시</p>
        <h1 className="mt-2 font-display text-3xl font-black">3개 분야 · 9개 항목</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          모든 항목은 0~100점으로 채점합니다. 분야 점수는 세부 3개 항목의 평균,
          종합 점수는 3개 분야의 평균입니다. 70점 미만 항목은 감점 요인으로 결과서에
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

      <section className="border border-line bg-sheet p-6">
        <h2 className="font-display text-xl font-bold">README 점수대 기준 요약</h2>
        <p className="mt-1 text-xs text-ink-soft">
          제3분야는 별도 루브릭(README 평가 규칙)에 따라 채점합니다.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-sm">
            <thead>
              <tr className="border-y-2 border-ink text-left">
                <th className="py-2 pr-4 font-mono text-xs">점수대</th>
                <th className="py-2 font-bold">기준</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {README_BANDS.map((band) => (
                <tr key={band.range}>
                  <td className="py-2 pr-4 font-mono text-xs">{band.range}</td>
                  <td className="py-2 text-ink-soft">{band.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
