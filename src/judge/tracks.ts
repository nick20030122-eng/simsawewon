// 심사 트랙 레지스트리 — 분야1만 트랙별로 갈리므로, 갈리는 데이터를 여기 한 곳에 모은다.
// 코드 실행 경로는 트랙과 무관하게 하나로 유지한다 (분야2·집계·직렬화·UI 공통).
import {
  CORPORATE_FIELDS,
  PUBLIC_SECTOR_FIELDS,
  type CorporateKey,
  type Domain1Key,
  type JudgeTrack,
  type PublicSectorKey,
} from "./types";

/** 점수대별 기본 감점 사유 — [하한, 상한, 문구] */
type ReasonBands = ReadonlyArray<readonly [number, number, string]>;

export interface TrackSpec {
  id: JudgeTrack;
  /** 접수 화면·결과서에 노출되는 트랙 이름 */
  label: string;
  /** 트랙 성격 한 줄 설명 */
  description: string;
  /** 분야1 이름 */
  domain1Label: string;
  /** 분야1 평가 대상 */
  domain1Target: string;
  /** 분야1 소개 문장 (채점 기준 페이지) */
  domain1Intro: string;
  /** 분야1 프롬프트 파일명 */
  domain1Prompt: string;
  /** 분야1 세부 항목 키 → 한국어 라벨 */
  domain1Fields: Readonly<Record<string, string>>;
  /** 분야1 세부 항목별 설명 (채점 기준 페이지) */
  domain1Descriptions: Readonly<Record<string, string>>;
  /** 분야1 세부 항목별 기본 감점 사유 */
  domain1Reasons: Readonly<Record<string, ReasonBands>>;
  /** 분야1 부적격 시 총평에서 걸러낼 칭찬 주제 */
  strengthFilter: RegExp;
  /** 분야1 부적격 시 결과서 감점 목록 라벨 */
  skipLabel: string;
}

const PUBLIC_SPEC: TrackSpec = {
  id: "public",
  label: "기관용",
  description: "공공기관·지자체 업무 현장의 문제 해결을 기준으로 심사합니다.",
  domain1Label: "공공기관 적합성",
  domain1Target: "기획서",
  domain1Intro: "기획서만 읽고 공공 현장의 문제 인식과 해결 방향을 평가합니다.",
  domain1Prompt: "domain1_public.txt",
  domain1Fields: PUBLIC_SECTOR_FIELDS,
  domain1Descriptions: {
    pain_point_clarity: "공공 현장·업무의 문제가 구체적으로 드러나는가.",
    solution_appropriateness: "제시한 해결 방향이 그 문제를 실질적으로 줄이는가.",
    public_feasibility: "보안·개인정보·예산·조직 등 현장 적용 전제를 고려했는가.",
  },
  domain1Reasons: {
    pain_point_clarity: [
      [0, 49, "기획서에 공공 현장·업무의 문제가 구체적으로 드러나지 않습니다."],
      [50, 69, "페인포인트가 추상적이거나 공공 서비스 맥락이 약합니다."],
    ],
    solution_appropriateness: [
      [0, 49, "제시된 해결 방향이 기획된 문제를 실질적으로 줄이지 못합니다."],
      [50, 69, "해결 방향이 공공 서비스 맥락(투명성·접근성·업무 연속성)에 부분적으로만 부합합니다."],
    ],
    public_feasibility: [
      [0, 49, "보안·개인정보·예산·조직·레거시 환경 등 현장 적용 전제가 거의 드러나지 않습니다."],
      [50, 69, "현장 공무원·실무자가 실제로 쓰기 어려운 전제나 누락이 있습니다."],
    ],
  },
  strengthFilter: /공공|기획서|페인|현장|정책|행정|기관|적합성/i,
  skipLabel: "[기획서 0점]",
};

const CORPORATE_SPEC: TrackSpec = {
  id: "corporate",
  label: "기업용",
  description: "사내 업무 개선 효과와 자체 구축 정당성을 기준으로 심사합니다.",
  domain1Label: "사업 타당성",
  domain1Target: "기획서",
  domain1Intro:
    "기획서만 읽고 업무 문제의 구체성과 직접 만들 이유가 있는지를 평가합니다.",
  domain1Prompt: "domain1_corporate.txt",
  domain1Fields: CORPORATE_FIELDS,
  domain1Descriptions: {
    problem_cost_clarity:
      "업무 병목이 시간·건수·금액 등 규모로 환산되어 드러나는가.",
    build_justification:
      "엑셀·노션·기성 SaaS로 대체되지 않고 직접 만들 이유가 있는가.",
    operational_viability:
      "도입 비용·기존 시스템 연동·운영 인력까지 고려됐는가.",
  },
  domain1Reasons: {
    problem_cost_clarity: [
      [0, 49, "누가 어떤 업무에서 왜 불편한지가 기획서에 드러나지 않습니다."],
      [50, 69, "대상 업무는 있으나 '효율 개선' 수준의 추상적 서술에 머뭅니다."],
    ],
    build_justification: [
      [0, 49, "이미 널리 쓰이는 도구의 단순 재구현으로, 직접 만들 이유가 제시되지 않았습니다."],
      [50, 69, "엑셀·노션·기성 SaaS로 상당 부분 대체 가능해 보입니다."],
    ],
    operational_viability: [
      [0, 49, "데이터 확보 경로·운영 인력 등 실제 조직에서 굴릴 전제가 거의 없습니다."],
      [50, 69, "도입 비용·기존 시스템 연동·유지보수 계획 중 일부가 비어 있습니다."],
    ],
  },
  strengthFilter: /기획서|업무|비용|절감|사내|도입|운영|타당성|구축/i,
  skipLabel: "[기획서 0점]",
};

const SPECS: Record<JudgeTrack, TrackSpec> = {
  public: PUBLIC_SPEC,
  corporate: CORPORATE_SPEC,
};

export const DEFAULT_TRACK: JudgeTrack = "public";

export function trackSpec(track: JudgeTrack): TrackSpec {
  return SPECS[track];
}

export function allTrackSpecs(): TrackSpec[] {
  return [PUBLIC_SPEC, CORPORATE_SPEC];
}

/** 해당 트랙이 채점하는 분야1 세부 항목 키 (프롬프트 필드 순서와 일치) */
export function domain1Keys(track: JudgeTrack): Domain1Key[] {
  return Object.keys(SPECS[track].domain1Fields) as Domain1Key[];
}

export const PUBLIC_KEYS = Object.keys(PUBLIC_SECTOR_FIELDS) as PublicSectorKey[];
export const CORPORATE_KEYS = Object.keys(CORPORATE_FIELDS) as CorporateKey[];
