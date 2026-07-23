// 기존 tests/test_input_validator.py 케이스 동등 이식
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assessDomains } from "@/judge/inputValidator";

const EXAMPLE = path.join(process.cwd(), "examples", "01_csv_dashboard");

function loadExample(): [string, string, string] {
  const plan = readFileSync(path.join(EXAMPLE, "PLAN.md"), "utf-8");
  const readme = readFileSync(path.join(EXAMPLE, "README.md"), "utf-8");
  const code = readFileSync(path.join(EXAMPLE, "app.py"), "utf-8");
  return [plan, readme, code];
}

describe("assessDomains", () => {
  it("Pass 예상 예시는 세 분야 모두 적격", () => {
    const assessment = assessDomains(...loadExample());
    expect(assessment.all_fatal).toBe(false);
    expect(assessment.domain1_ok).toBe(true);
    expect(assessment.domain2_ok).toBe(true);
    expect(assessment.domain3_ok).toBe(true);
  });

  it("기획서에 csv 문자열이 없어도 코드와 주제 매칭", () => {
    const [plan, readme, code] = loadExample();
    const planWithoutCsv = plan.replaceAll("csv", "데이터 파일");
    const assessment = assessDomains(planWithoutCsv, readme, code);
    expect(assessment.domain2_ok).toBe(true);
  });

  it("영문 README 키워드 인정", () => {
    const [plan, , code] = loadExample();
    const readme =
      "# App\n\n## Install\n\npip install -r requirements.txt\n\n## Run\n\nstreamlit run app.py\n";
    const assessment = assessDomains(plan, readme, code);
    expect(assessment.domain3_ok).toBe(true);
  });

  it("placeholder 입력은 전체 부적격(fatal)", () => {
    const assessment = assessDomains("테스트", "테스트", "테스트");
    expect(assessment.all_fatal).toBe(true);
  });

  it("기획서 미발견 시 분야1·2만 부적격, README 채점은 진행", () => {
    const [, readme, code] = loadExample();
    const assessment = assessDomains("", readme, code);
    expect(assessment.all_fatal).toBe(false);
    expect(assessment.domain1_ok).toBe(false);
    expect(assessment.domain2_ok).toBe(false);
    expect(assessment.domain3_ok).toBe(true);
    expect(assessment.domain1_reasons[0]).toContain("기획서 파일");
  });

  it("README·코드가 없으면 여전히 fatal", () => {
    const assessment = assessDomains("", "", "");
    expect(assessment.all_fatal).toBe(true);
  });

  it("JavaScript 코드도 실행 코드로 인정 (언어 중립)", () => {
    const [plan] = loadExample();
    const readme =
      "# CSV Dashboard\n\n## Install\n\nnpm install\n\n## Run\n\nnpm run dev (upload csv)\n";
    const code =
      "import { parse } from 'csv-parse';\n\n" +
      "export function summarize(rows) {\n  const totals = rows.map(Number);\n  return totals;\n}\n" +
      "const upload = document.querySelector('#csv-upload');\n";
    const assessment = assessDomains(plan, readme, code);
    expect(assessment.domain2_ok).toBe(true);
  });

  it("공공 API 숫자 ID가 있어도 README·코드 정상 인식", () => {
    const [plan] = loadExample();
    const readme =
      "# ReleasePick\n\n" +
      "RSS: detailRssTagService.do?bbsId=MOSFBBS_000000000028\n\n" +
      "## Install\n\npip install -r requirements.txt\n\n" +
      "## Run\n\ncd code\nstreamlit run app.py\n\n" +
      "프로젝트 설명 문단. ".repeat(30);
    const code =
      "import streamlit as st\n\n" +
      "def main():\n    st.title('ReleasePick')\n\n" +
      "if __name__ == '__main__':\n    main()\n";
    const assessment = assessDomains(plan, readme, code);
    expect(assessment.domain3_ok).toBe(true);
    expect(assessment.domain2_ok).toBe(true);
  });
});
