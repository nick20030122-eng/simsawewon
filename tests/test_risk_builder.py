"""감점 요인 생성 로직 테스트."""

from judge.domain_models import IntentScores, PublicSectorScores, ReadmeScores
from judge.input_validator import DomainAssessment
from judge.risk_builder import (
    NO_SIGNIFICANT_RISKS,
    collect_risk_candidates,
    compose_risks,
    format_risk,
    sanitize_reason,
    RiskCandidate,
)


def _scores(
    *,
    pain: int = 80,
    solution: int = 80,
    feasibility: int = 80,
    req: int = 80,
    success: int = 80,
    fidelity: int = 80,
    setup: int = 80,
    doc: int = 80,
    maintain: int = 80,
) -> tuple[PublicSectorScores, IntentScores, ReadmeScores]:
    return (
        PublicSectorScores(
            pain_point_clarity=pain,
            solution_appropriateness=solution,
            public_feasibility=feasibility,
        ),
        IntentScores(
            requirement_coverage=req,
            success_criteria_met=success,
            fidelity_no_bloat=fidelity,
        ),
        ReadmeScores(
            setup_instructions=setup,
            documentation_accuracy=doc,
            maintainability=maintain,
        ),
    )


def test_collect_only_low_scores():
    public, intent, readme = _scores(pain=55, req=40, setup=85)
    assessment = DomainAssessment()
    candidates = collect_risk_candidates(public, intent, readme, assessment)

    keys = {item.key for item in candidates}
    assert keys == {"pain_point_clarity", "requirement_coverage"}
    assert candidates[0].score == 40


def test_compose_uses_criterion_format():
    candidate = RiskCandidate(
        key="requirement_coverage",
        domain="의도 구현도",
        label="핵심 요구사항 구현",
        score=42,
    )
    line = format_risk(
        candidate,
        "기획서의 CSV 업로드 기능이 코드에 없습니다.",
    )
    assert line.startswith("[의도 구현도] 핵심 요구사항 구현(42점):")
    assert "CSV 업로드" in line


def test_compose_rejects_off_topic_llm_reason():
    candidate = RiskCandidate(
        key="setup_instructions",
        domain="README 품질",
        label="설치·실행 안내",
        score=60,
    )
    line = format_risk(candidate, "변수명이 일관되지 않아 가독성이 떨어집니다.")
    assert "변수명" not in line
    assert "설치·실행" in line


def test_compose_no_candidates_returns_neutral_message():
    public, intent, readme = _scores()
    assessment = DomainAssessment()
    candidates = collect_risk_candidates(public, intent, readme, assessment)
    risks = compose_risks(candidates, {}, [])

    assert risks == [NO_SIGNIFICANT_RISKS]


def test_compose_includes_skip_risks_first():
    public, intent, readme = _scores(req=50)
    assessment = DomainAssessment()
    candidates = collect_risk_candidates(public, intent, readme, assessment)
    skip = ["[README 0점] README가 비어 있습니다."]
    risks = compose_risks(candidates, {}, skip)

    assert risks[0] == skip[0]
    assert any("핵심 요구사항 구현" in item for item in risks)


def test_sanitize_reason_strips_forbidden_topics():
    assert sanitize_reason("GitHub URL 제출 방식이 불편합니다.") == ""
