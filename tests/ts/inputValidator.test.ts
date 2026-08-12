// 기존 tests/test_input_validator.py 케이스 동등 이식
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assessDomains, isTrivialGarbage } from "@/judge/inputValidator";

const EXAMPLE = path.join(process.cwd(), "examples", "01_csv_dashboard");

function loadExample(): [string, string] {
  const plan = readFileSync(path.join(EXAMPLE, "PLAN.md"), "utf-8");
  const code = readFileSync(path.join(EXAMPLE, "app.py"), "utf-8");
  return [plan, code];
}

describe("assessDomains", () => {
  it("Pass 예상 예시는 두 분야 모두 적격", () => {
    const assessment = assessDomains(...loadExample());
    expect(assessment.all_fatal).toBe(false);
    expect(assessment.domain1_ok).toBe(true);
    expect(assessment.domain2_ok).toBe(true);
  });

  it("기획서에 csv 문자열이 없어도 코드와 주제 매칭", () => {
    const [plan, code] = loadExample();
    const planWithoutCsv = plan.replaceAll("csv", "데이터 파일");
    const assessment = assessDomains(planWithoutCsv, code);
    expect(assessment.domain2_ok).toBe(true);
  });

  it("placeholder 입력은 전체 부적격(fatal)", () => {
    const assessment = assessDomains("테스트", "테스트");
    expect(assessment.all_fatal).toBe(true);
  });

  it("기획서 미발견 시 두 분야 모두 부적격", () => {
    const [, code] = loadExample();
    const assessment = assessDomains("", code);
    expect(assessment.all_fatal).toBe(false);
    expect(assessment.domain1_ok).toBe(false);
    expect(assessment.domain2_ok).toBe(false);
    expect(assessment.domain1_reasons[0]).toContain("기획서 파일");
  });

  it("코드가 없으면 fatal", () => {
    const assessment = assessDomains("", "");
    expect(assessment.all_fatal).toBe(true);
  });

  it("영문이 하나도 없는 순수 한글 기획서도 무의미 입력이 아니다", () => {
    // JS의 \w는 ASCII 한정이라 한글만 쓴 문서가 "기호뿐인 입력"으로 오판되던 회귀
    const plan =
      "# 팀 업무 관리 보드 기획서\n\n" +
      "## 배경\n우리 팀은 업무를 관리할 도구가 필요합니다.\n\n" +
      "## 기능\n1. 할 일 추가\n2. 목록 보기\n3. 완료 체크\n\n" +
      "## 성공 기준\n담당자가 화면에서 바로 확인할 수 있다.\n";
    expect(isTrivialGarbage(plan)).toBe(false);
  });

  it("숫자·기호만 있는 입력은 여전히 무의미 입력", () => {
    expect(isTrivialGarbage("1234 !!! ... 5678 ???")).toBe(true);
  });

  it("README가 없는 레포도 정상 심사 (README 축 폐지)", () => {
    const [plan, code] = loadExample();
    const assessment = assessDomains(plan, code);
    expect(assessment.all_fatal).toBe(false);
    expect(assessment.domain1_ok).toBe(true);
    expect(assessment.domain2_ok).toBe(true);
  });

  it("JavaScript 코드도 실행 코드로 인정 (언어 중립)", () => {
    const [plan] = loadExample();
    const code =
      "import { parse } from 'csv-parse';\n\n" +
      "export function summarize(rows) {\n  const totals = rows.map(Number);\n  return totals;\n}\n" +
      "const upload = document.querySelector('#csv-upload');\n";
    const assessment = assessDomains(plan, code);
    expect(assessment.domain2_ok).toBe(true);
  });

  it("공공 API 숫자 ID가 있어도 코드 정상 인식", () => {
    const [plan] = loadExample();
    const code =
      "import streamlit as st\n\n" +
      "# RSS: detailRssTagService.do?bbsId=MOSFBBS_000000000028\n" +
      "def main():\n    st.title('ReleasePick')\n\n" +
      "if __name__ == '__main__':\n    main()\n";
    const assessment = assessDomains(plan, code);
    expect(assessment.domain2_ok).toBe(true);
  });
});
