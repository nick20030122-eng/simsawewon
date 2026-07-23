// Design Ref: §2.2 — 분야별 입력 검증(해당 분야만 0점 처리). judge/input_validator.py 동등 이식
import type { DomainAssessment } from "./types";

const MIN_PLAN_CHARS = 80;
const MIN_README_CHARS = 60;
const MIN_CODE_CHARS = 40;
const MIN_PLAN_WORDS = 12;
const MIN_README_WORDS = 8;
const MIN_CODE_LINES = 2;

const PLAN_DOC_KEYWORDS =
  /요구|기능|목적|성공|기획|구현|UI|예외|범위|페인|문제|해결|기준|대시보드|앱/i;
const PLAN_SOFTWARE_KEYWORDS =
  /앱|웹|web|시스템|소프트|streamlit|기능|구현|UI|코드|대시보드|업로드|API|실행|app\.py|python|사용자|화면|입력|출력|파일|데이터|서비스|프로그램|개발/i;
const README_KEYWORDS =
  /설치|실행|streamlit|pip|python|app\.py|프로젝트|readme|requirements|구조|환경|venv|install|setup|usage|getting\s+started|how\s+to|run|start|dependency|dependencies/i;
const CODE_KEYWORDS =
  /\b(import|def|class|streamlit|st\.|if __name__|return|try|except|for|while|function|const|let|var|export|require|async|await|fn|func|public|void)\b|=>|<html|<!doctype|<script|<div/i;

const TOPIC_SIGNALS = [
  "csv", "대시보드", "dashboard", "할일", "todo", "streamlit", "업로드", "upload",
  "포켓몬", "pokemon", "뉴스", "news", "정산", "영수증", "그래프", "chart",
] as const;
const OFF_TOPIC_PLAN = /포켓몬|pokemon/i;

const WORD_PATTERN = /[\w가-힣]+/gu;
// 숫자 연속(000000000028 등 ID·URL)은 정상 README/코드에 흔함 — 문자만 검사
const REPEAT_CHAR_PATTERN = /([a-zA-Z가-힣])\1{7,}/;
const SUBSTANTIAL_TEXT_CHARS = 500;
const SUBSTANTIAL_TEXT_WORDS = 40;

const PLACEHOLDER_EXACT = new Set([
  "안녕하세요", "안녕", "hello", "hi", "test", "테스트", "테스트 설명",
  "test description", "asdf", "qwerty", "123", "1234", "가나다", "바보",
  "바보 카카", "abc", "sample", "샘플", "예시", "입력", "내용", "코드",
  "기획서", "readme",
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
    if (norm.includes(p) && wordCount(text) < 25 && !README_KEYWORDS.test(text)) {
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
  // 숫자·공백·기호만으로 이루어진 입력
  if (/^[\d\s\W]+$/u.test(stripped)) return true;
  const words = stripped.match(WORD_PATTERN) ?? [];
  if (words.length === 0) return true;
  if (new Set(words).size <= 2 && words.length >= 3) return true;
  return false;
}

function topicSignals(text: string): Set<string> {
  const lowered = text.toLowerCase();
  const signals = new Set<string>();
  for (const signal of TOPIC_SIGNALS) {
    if (lowered.includes(signal)) signals.add(signal);
  }
  if (lowered.includes("read_csv") || lowered.includes("pd.read_csv")) signals.add("csv");
  if (lowered.includes("st.") || lowered.includes("streamlit")) {
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
    issues.push("코드 심사와 무관한 주제(예: 포켓몬 도입)입니다.");
  }
  return issues;
}

function checkReadmeForDomain3(readmeText: string): string[] {
  const issues: string[] = [];
  const stripped = readmeText.trim();

  if (isTrivialGarbage(stripped)) return ["README가 무의미한 입력입니다."];

  if (stripped.length < MIN_README_CHARS || wordCount(stripped) < MIN_README_WORDS) {
    issues.push("README 내용이 너무 짧습니다.");
  }
  if (!README_KEYWORDS.test(stripped)) {
    issues.push("README에 설치·실행·프로젝트 구조 안내가 없습니다.");
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
        `(기획: ${[...planTopics].sort().join(", ")} / 코드: ${[...codeTopics].sort().join(", ")})`,
    ];
  }
  return [];
}

function checkReadmeCodeAlignment(readmeText: string, codeText: string): string[] {
  const issues: string[] = [];
  const codeLower = codeText.toLowerCase();
  const readmeLower = readmeText.toLowerCase();

  if (codeLower.includes("streamlit") && !readmeLower.includes("streamlit")) {
    if (!/pip|실행|run|8501|app\.py/.test(readmeLower)) {
      issues.push("README에 Streamlit 실행 안내가 없습니다.");
    }
  }

  const readmeTopics = topicSignals(readmeText);
  const codeTopics = topicSignals(codeText);
  if (
    readmeTopics.size > 0 &&
    codeTopics.size > 0 &&
    ![...readmeTopics].some((topic) => codeTopics.has(topic))
  ) {
    issues.push("README와 실행 코드가 서로 다른 프로젝트를 설명합니다.");
  }
  return issues;
}

export function assessDomains(
  planText: string,
  readmeText: string,
  codeText: string,
): DomainAssessment {
  const result: DomainAssessment = {
    domain1_ok: true,
    domain1_reasons: [],
    domain2_ok: true,
    domain2_reasons: [],
    domain3_ok: true,
    domain3_reasons: [],
    all_fatal: false,
    fatal_reasons: [],
  };

  if (!readmeText.trim() || !codeText.trim()) {
    result.all_fatal = true;
    result.fatal_reasons = ["레포에서 수집한 README·코드가 필요합니다."];
    return result;
  }

  // 기획서 미발견(레포 자동 수집 기준) — 분야1·2만 부적격, README 채점은 진행
  const planMissing = !planText.trim();
  const planMissingReason =
    "레포에서 기획서 파일(PLAN.md·기획서.md 등)을 찾을 수 없습니다.";

  const allGarbage =
    !planMissing &&
    isTrivialGarbage(planText) &&
    isTrivialGarbage(readmeText) &&
    isTrivialGarbage(codeText);
  if (allGarbage) {
    result.all_fatal = true;
    result.fatal_reasons = ["세 입력 모두 무의미한 텍스트입니다."];
    return result;
  }

  const d1 = planMissing ? [planMissingReason] : checkPlanForDomain1(planText);
  if (d1.length > 0) {
    result.domain1_ok = false;
    result.domain1_reasons = d1;
  }

  const d3 = checkReadmeForDomain3(readmeText);
  const readmeCode = checkReadmeCodeAlignment(readmeText, codeText);
  if (d3.length > 0 || readmeCode.length > 0) {
    result.domain3_ok = false;
    result.domain3_reasons = [...d3, ...readmeCode];
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
