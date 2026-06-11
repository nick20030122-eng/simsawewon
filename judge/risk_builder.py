"""채점 기준(9개 세부 항목)에 맞춘 감점 요인 생성."""

from __future__ import annotations

from dataclasses import dataclass

from judge.domain_models import IntentScores, PublicSectorScores, ReadmeScores
from judge.input_validator import DomainAssessment

LOW_SCORE_THRESHOLD = 70
NO_SIGNIFICANT_RISKS = (
    "9개 세부 항목이 모두 70점 이상으로, 채점 기준상 뚜렷한 감점 요인은 없습니다."
)

CRITERION_META: dict[str, tuple[str, str]] = {
    "pain_point_clarity": ("공공기관 적합성", "페인포인트 명확성"),
    "solution_appropriateness": ("공공기관 적합성", "해결 방향 적절성"),
    "public_feasibility": ("공공기관 적합성", "공공 현장 적용 가능성"),
    "requirement_coverage": ("의도 구현도", "핵심 요구사항 구현"),
    "success_criteria_met": ("의도 구현도", "성공 기준 충족"),
    "fidelity_no_bloat": ("의도 구현도", "기획 의도 일치"),
    "setup_instructions": ("README 품질", "설치·실행 안내"),
    "documentation_accuracy": ("README 품질", "기획·코드 정합성"),
    "maintainability": ("README 품질", "유지보수·확장 가이드"),
}

# 점수대별 기본 감점 사유 (채점 기준 문서와 정합)
_DEFAULT_REASONS: dict[str, tuple[tuple[int, int, str], ...]] = {
    "pain_point_clarity": (
        (0, 49, "기획서에 공공 현장·업무의 문제가 구체적으로 드러나지 않습니다."),
        (50, 69, "페인포인트가 추상적이거나 공공 서비스 맥락이 약합니다."),
    ),
    "solution_appropriateness": (
        (0, 49, "제시된 해결 방향이 기획된 문제를 실질적으로 줄이지 못합니다."),
        (50, 69, "해결 방향이 공공 서비스 맥락(투명성·접근성·업무 연속성)에 부분적으로만 부합합니다."),
    ),
    "public_feasibility": (
        (0, 49, "보안·개인정보·예산·조직·레거시 환경 등 현장 적용 전제가 거의 드러나지 않습니다."),
        (50, 69, "현장 공무원·실무자가 실제로 쓰기 어려운 전제나 누락이 있습니다."),
    ),
    "requirement_coverage": (
        (0, 49, "기획서의 핵심 기능이 실행 코드에 거의 반영되지 않았습니다."),
        (50, 69, "기획서 핵심 요구사항 중 일부가 코드에서 누락되었습니다."),
    ),
    "success_criteria_met": (
        (0, 49, "기획서의 성공 기준·UI·예외 처리 요구가 코드에서 충족되지 않았습니다."),
        (50, 69, "성공 기준·UI·예외 처리 중 일부가 기획과 다르게 구현되었습니다."),
    ),
    "fidelity_no_bloat": (
        (0, 49, "기획 핵심 의도가 왜곡되었거나 기획과 무관한 기능이 과도합니다."),
        (50, 69, "기획 핵심과 코드 구현 사이에 일부 불일치가 있습니다."),
    ),
    "setup_instructions": (
        (0, 49, "README에 재현 가능한 설치·실행 안내가 없거나 오류 가능성이 큽니다."),
        (50, 69, "설치·실행 단계가 불충분하거나 일부 전제가 암묵적입니다."),
    ),
    "documentation_accuracy": (
        (0, 49, "README 설명이 기획서·실행 코드와 현저히 다릅니다."),
        (50, 69, "README와 기획서·코드 사이에 눈에 띄는 불일치가 있습니다."),
    ),
    "maintainability": (
        (0, 49, "프로젝트 구조·핵심 파일 역할·확장 가이드가 README에 거의 없습니다."),
        (50, 69, "구조 설명은 있으나 유지보수·확장 안내가 부족합니다."),
    ),
}

_FORBIDDEN_RISK_PATTERNS = (
    "변수명",
    "네이밍",
    "pep8",
    "pep 8",
    "코딩 스타일",
    "들여쓰기",
    "주석",
    "타입 힌트",
    "리팩토링",
    "성능 최적화",
    "디버깅",
    "print(",
    "로그를",
    "깃허브",
    "github url",
    "레포지토리 url",
    "파일 업로드",
    "세 파일",
    "3개 파일",
)


@dataclass(frozen=True)
class RiskCandidate:
    key: str
    domain: str
    label: str
    score: int


def default_reason(criterion_key: str, score: int) -> str:
    bands = _DEFAULT_REASONS.get(criterion_key, ())
    for low, high, text in bands:
        if low <= score <= high:
            return text
    return "채점 기준 대비 보완이 필요한 부분이 있습니다."


def sanitize_reason(reason: str) -> str:
    cleaned = reason.strip().rstrip(".")
    if not cleaned:
        return ""
    lower = cleaned.lower()
    for token in _FORBIDDEN_RISK_PATTERNS:
        if token in lower:
            return ""
    if len(cleaned) > 180:
        cleaned = cleaned[:177].rstrip() + "..."
    return cleaned + "."


def format_risk(candidate: RiskCandidate, reason: str) -> str:
    body = sanitize_reason(reason) or default_reason(candidate.key, candidate.score)
    return f"[{candidate.domain}] {candidate.label}({candidate.score}점): {body}"


def collect_risk_candidates(
    public: PublicSectorScores,
    intent: IntentScores,
    readme_scores: ReadmeScores,
    assessment: DomainAssessment,
    *,
    threshold: int = LOW_SCORE_THRESHOLD,
) -> list[RiskCandidate]:
    score_map: dict[str, int] = {}

    if assessment.domain1_ok:
        score_map.update(public.model_dump())
    if assessment.domain2_ok:
        score_map.update(intent.model_dump())
    if assessment.domain3_ok:
        score_map.update(readme_scores.model_dump())

    candidates: list[RiskCandidate] = []
    for key, score in score_map.items():
        if score >= threshold:
            continue
        domain, label = CRITERION_META[key]
        candidates.append(RiskCandidate(key=key, domain=domain, label=label, score=score))

    candidates.sort(key=lambda item: item.score)
    return candidates


def compose_risks(
    candidates: list[RiskCandidate],
    llm_reasons: dict[str, str],
    skip_risks: list[str],
) -> list[str]:
    """입력 검증 0점 사유 + 저점 항목만 감점 요인으로 합칩니다."""
    merged: list[str] = list(skip_risks)

    for candidate in candidates:
        if len(merged) >= 5:
            break
        raw = llm_reasons.get(candidate.key, "")
        line = format_risk(candidate, raw)
        if line not in merged:
            merged.append(line)

    if not merged:
        return [NO_SIGNIFICANT_RISKS]
    return merged[:5]


def candidates_for_prompt(candidates: list[RiskCandidate]) -> str:
    if not candidates:
        return (
            "감점 후보 없음 — 9개 세부 항목이 모두 70점 이상입니다. "
            "risk_reasons는 빈 배열 []로 두세요."
        )
    lines = [
        "아래 항목만 감점 요인(risk_reasons)으로 작성하세요. 목록에 없는 항목은 금지합니다.",
        "",
    ]
    for item in candidates:
        lines.append(
            f"- criterion_key: {item.key} | [{item.domain}] {item.label} | 점수: {item.score}"
        )
    return "\n".join(lines)
