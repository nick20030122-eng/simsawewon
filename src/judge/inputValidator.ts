// Design Ref: §2.2 — 분야별 입력 검증(해당 분야만 0점 처리). judge/input_validator.py 동등 이식
import type { DomainAssessment } from "./types";

const MIN_PLAN_CHARS = 80;
const MIN_CODE_CHARS = 40;
const MIN_PLAN_WORDS = 12;
const MIN_CODE_LINES = 2;

const PLAN_DOC_KEYWORDS =
  /요구|기능|목적|성공|기획|구현|UI|예외|범위|페인|문제|해결|기준|대시보드|앱/i;
const PLAN_SOFTWARE_KEYWORDS =
  /앱|웹|web|시스템|소프트|streamlit|기능|구현|UI|코드|대시보드|업로드|API|실행|app\.py|python|사용자|화면|입력|출력|파일|데이터|서비스|프로그램|개발/i;
// 실질 기술 문서 신호 — 짧은 문서가 placeholder로 오판되는 것을 막는 예외 조건
const DOC_KEYWORDS =
  /설치|실행|streamlit|pip|python|app\.py|프로젝트|requirements|구조|환경|venv|install|setup|usage|getting\s+started|how\s+to|run|start|dependency|dependencies/i;
const CODE_KEYWORDS =
  /\b(import|def|class|streamlit|st\.|if __name__|return|try|except|for|while|function|const|let|var|export|require|async|await|fn|func|public|void)\b|=>|<html|<!doctype|<script|<div/i;

// [토큰, 정규화 주제] — 한글·영문 동의어는 같은 주제로 접어 기획서(한글)와 코드(영문) 간
// 표기 차이만으로 "주제 불일치"가 뜨는 것을 방지한다.
const TOPIC_SIGNALS: ReadonlyArray<readonly [string, string]> = [
  ["csv", "csv"],
  ["대시보드", "dashboard"], ["dashboard", "dashboard"],
  ["할일", "todo"], ["todo", "todo"],
  ["streamlit", "streamlit"],
  ["업로드", "upload"], ["upload", "upload"],
  ["포켓몬", "pokemon"], ["pokemon", "pokemon"],
  ["뉴스", "news"], ["news", "news"],
  ["정산", "settlement"],
  ["영수증", "receipt"],
  ["그래프", "chart"], ["chart", "chart"],
];
// 결과서에 노출되는 주제 표시명 — 내부 키(dashboard 등)를 그대로 보여주지 않는다
const TOPIC_LABELS: Record<string, string> = {
  csv: "CSV 데이터",
  dashboard: "대시보드",
  todo: "할 일 관리",
  streamlit: "Streamlit 앱",
  upload: "파일 업로드",
  pokemon: "포켓몬",
  news: "뉴스",
  settlement: "정산",
  receipt: "영수증",
  chart: "그래프",
};

function topicLabels(topics: Set<string>): string {
  return [...topics]
    .map((topic) => TOPIC_LABELS[topic] ?? topic)
    .sort()
    .join(", ");
}

const OFF_TOPIC_PLAN = /포켓몬|pokemon/i;

const WORD_PATTERN = /[\w가-힣]+/gu;
// 숫자 연속(000000000028 등 ID·URL)은 정상 문서·코드에 흔함 — 문자만 검사
const REPEAT_CHAR_PATTERN = /([a-zA-Z가-힣])\1{7,}/;
const SUBSTANTIAL_TEXT_CHARS = 500;
const SUBSTANTIAL_TEXT_WORDS = 40;

const PLACEHOLDER_EXACT = new Set([
  "안녕하세요", "안녕", "hello", "hi", "test", "테스트", "테스트 설명",
  "test description", "asdf", "qwerty", "123", "1234", "가나다", "바보",
  "바보 카카", "abc", "sample", "샘플", "예시", "입력", "내용", "코드",
  "기획서",
]);

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function wordCount(text: string): number {
  return (text.match(WORD_PATTERN) ?? []).length;
}

function lineCount(text: string): number {
  return text.split(/\r?\n/).filter((line) => line.trim()).length;
}

function isPlaceholder(text: string): boolean {
  const norm = normalize(text);
  if (PLACEHOLDER_EXACT.has(norm)) return true;
  if (norm.length <= 30) {
    for (const p of PLACEHOLDER_EXACT) {
      if (norm === p || norm.startsWith(p + " ")) return true;
    }
  }
  for (const p of ["테스트 설명", "test description", "안녕하세요"]) {
    if (norm.includes(p) && wordCount(text) < 25 && !DOC_KEYWORDS.test(text)) {
      return true;
    }
  }
  return false;
}

function isSubstantialText(text: string): boolean {
  const stripped = text.trim();
  return (
    stripped.length >= SUBSTANTIAL_TEXT_CHARS &&
    wordCount(stripped) >= SUBSTANTIAL_TEXT_WORDS
  );
}

export function isTrivialGarbage(text: string): boolean {
  const stripped = text.trim();
  if (!stripped || isPlaceholder(stripped)) return true;
  if (!isSubstantialText(stripped) && REPEAT_CHAR_PATTERN.test(stripped)) return true;
  // 숫자·공백·기호만으로 이루어진 입력.
  // JS의 \w는 ASCII 한정이라 한글만 쓴 문서가 "기호뿐"으로 잡히던 문제가 있어,
  // 문자(letter) 존재 여부를 유니코드 속성으로 판정한다.
  if (!/\p{L}/u.test(stripped)) return true;
  const words = stripped.match(WORD_PATTERN) ?? [];
  if (words.length === 0) return true;
  if (new Set(words).size <= 2 && words.length >= 3) return true;
  return false;
}

function topicSignals(text: string): Set<string> {
  const lowered = text.toLowerCase();
  const signals = new Set<string>();
  for (const [token, topic] of TOPIC_SIGNALS) {
    if (lowered.includes(token)) signals.add(topic);
  }
  if (lowered.includes("read_csv") || lowered.includes("pd.read_csv")) signals.add("csv");
  // "st."는 단어 경계로만 매칭 — request./list./test. 같은 흔한 식별자가
  // streamlit 신호로 오인되어 주제 불일치 오판정을 내던 문제를 막는다.
  if (/\bst\./.test(lowered) || lowered.includes("streamlit")) {
    signals.add("streamlit");
    signals.add("dashboard");
  }
  if (lowered.includes("upload") || lowered.includes("file_uploader")) signals.add("upload");
  return signals;
}

function checkPlanForDomain1(planText: string): string[] {
  const issues: string[] = [];
  const stripped = planText.trim();

  if (isTrivialGarbage(stripped)) return ["기획서가 무의미한 입력입니다."];

  if (stripped.length < MIN_PLAN_CHARS || wordCount(stripped) < MIN_PLAN_WORDS) {
    issues.push("기획서 내용이 너무 짧거나 실질 정보가 없습니다.");
  }
  if (!PLAN_DOC_KEYWORDS.test(stripped)) {
    issues.push("기획서 형식(요구사항·기능·성공 기준 등)이 아닙니다.");
  }
  if (!PLAN_SOFTWARE_KEYWORDS.test(stripped)) {
    issues.push(
      "소프트웨어·웹앱 개발 기획서가 아닙니다. " +
        "(정책 아이디어·유머·코드 심사와 무관한 주제는 0점)",
    );
  }
  if (
    OFF_TOPIC_PLAN.test(stripped) &&
    !/streamlit|app\.py|UI|기능\s*\d|구현|API|대시보드\s*앱/i.test(stripped)
  ) {
    issues.push("코드 심사와 무관한 주제입니다.");
  }
  return issues;
}

function checkCodeForDomain2(codeText: string): string[] {
  const issues: string[] = [];
  const stripped = codeText.trim();

  if (isTrivialGarbage(stripped)) return ["실행 코드가 무의미한 입력입니다."];

  if (stripped.length < MIN_CODE_CHARS) {
    issues.push("실행 코드가 너무 짧습니다.");
  }
  if (!CODE_KEYWORDS.test(stripped)) {
    issues.push("실행 코드로 볼 수 있는 소스(import, function, class 등)가 아닙니다.");
  }
  if (lineCount(stripped) < MIN_CODE_LINES && stripped.length < 120) {
    issues.push("실행 가능한 앱 수준의 코드가 아닙니다.");
  }
  return issues;
}

function checkPlanCodeAlignment(planText: string, codeText: string): string[] {
  const planTopics = topicSignals(planText);
  const codeTopics = topicSignals(codeText);
  if (planTopics.size === 0 || codeTopics.size === 0) return [];

  const overlap = [...planTopics].some((topic) => codeTopics.has(topic));
  if (!overlap) {
    return [
      "기획서와 실행 코드의 주제가 일치하지 않습니다. " +
        `(기획서: ${topicLabels(planTopics)} / 코드: ${topicLabels(codeTopics)})`,
    ];
  }
  return [];
}

export function assessDomains(planText: string, codeText: string): DomainAssessment {
  const result: DomainAssessment = {
    domain1_ok: true,
    domain1_reasons: [],
    domain2_ok: true,
    domain2_reasons: [],
    all_fatal: false,
    fatal_reasons: [],
  };

  if (!codeText.trim()) {
    result.all_fatal = true;
    result.fatal_reasons = ["레포에서 실행 코드를 수집하지 못했습니다."];
    return result;
  }

  // 기획서 미발견(레포 자동 수집 기준) — 두 분야 모두 부적격 처리
  const planMissing = !planText.trim();
  const planMissingReason =
    "레포에서 기획서 파일(PLAN.md·기획서.md 등)을 찾을 수 없습니다.";

  const allGarbage =
    !planMissing && isTrivialGarbage(planText) && isTrivialGarbage(codeText);
  if (allGarbage) {
    result.all_fatal = true;
    result.fatal_reasons = ["기획서·실행 코드 모두 무의미한 텍스트입니다."];
    return result;
  }

  const d1 = planMissing ? [planMissingReason] : checkPlanForDomain1(planText);
  if (d1.length > 0) {
    result.domain1_ok = false;
    result.domain1_reasons = d1;
  }

  const d2Code = checkCodeForDomain2(codeText);
  const d2Align = planMissing ? [] : checkPlanCodeAlignment(planText, codeText);
  const d2PlanMin: string[] = [];
  if (planMissing) {
    d2PlanMin.push(planMissingReason);
  } else if (isTrivialGarbage(planText) || !PLAN_SOFTWARE_KEYWORDS.test(planText)) {
    d2PlanMin.push("기획서가 코드 심사용 개발 기획서가 아닙니다.");
  }
  if (d2Code.length > 0 || d2Align.length > 0 || d2PlanMin.length > 0) {
    result.domain2_ok = false;
    result.domain2_reasons = [...d2Code, ...d2Align, ...d2PlanMin];
  }

  return result;
}
