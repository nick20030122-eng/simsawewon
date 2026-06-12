"""입력 검증기 단위 테스트."""

from __future__ import annotations

from pathlib import Path

from judge.input_validator import assess_domains

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples" / "01_csv_dashboard"


def _load_example() -> tuple[str, str, str]:
    plan = (EXAMPLE / "PLAN.md").read_text(encoding="utf-8")
    readme = (EXAMPLE / "README.md").read_text(encoding="utf-8")
    code = (EXAMPLE / "app.py").read_text(encoding="utf-8")
    return plan, readme, code


def test_pass_example_all_domains_ok() -> None:
    assessment = assess_domains(*_load_example())
    assert assessment.all_fatal is False
    assert assessment.domain1_ok is True
    assert assessment.domain2_ok is True
    assert assessment.domain3_ok is True


def test_csv_code_matches_plan_without_literal_csv_in_plan() -> None:
    plan, readme, code = _load_example()
    plan_without_csv = plan.replace("csv", "데이터 파일")
    assessment = assess_domains(plan_without_csv, readme, code)
    assert assessment.domain2_ok is True


def test_english_readme_keywords_accepted() -> None:
    plan, _, code = _load_example()
    readme = "# App\n\n## Install\n\npip install -r requirements.txt\n\n## Run\n\nstreamlit run app.py\n"
    assessment = assess_domains(plan, readme, code)
    assert assessment.domain3_ok is True


def test_placeholder_is_fatal() -> None:
    assessment = assess_domains("테스트", "테스트", "테스트")
    assert assessment.all_fatal is True


def test_long_readme_with_numeric_ids_not_garbage() -> None:
    """공공 API ID(000000000028 등)가 있어도 README·코드는 정상 인식."""
    plan, _, _ = _load_example()
    readme = (
        "# ReleasePick\n\n"
        "RSS: detailRssTagService.do?bbsId=MOSFBBS_000000000028\n\n"
        "## Install\n\npip install -r requirements.txt\n\n"
        "## Run\n\ncd code\nstreamlit run app.py\n\n"
        + ("프로젝트 설명 문단. " * 30)
    )
    code = (
        "import streamlit as st\n\n"
        "def main():\n    st.title('ReleasePick')\n\n"
        "if __name__ == '__main__':\n    main()\n"
    )
    assessment = assess_domains(plan, readme, code)
    assert assessment.domain3_ok is True
    assert assessment.domain2_ok is True
