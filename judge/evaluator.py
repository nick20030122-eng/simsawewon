from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from openai import APIError, OpenAI
from pydantic import ValidationError

from judge.domain_models import (
    IntentScores,
    PublicSectorScores,
    ReadmeScores,
    ReviewSummary,
)
from judge.input_validator import DomainAssessment, assess_domains
from judge.models import EvaluationResult

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
SPECS_DIR = Path(__file__).resolve().parent.parent / "specs"
DEFAULT_MODEL = "gpt-4o"
OPENAI_TIMEOUT_SEC = 120.0
MAX_FINAL_VERDICT_CHARS = 450

_STRENGTH_FILTER_DOMAIN1 = re.compile(
    r"공공|기획서|페인|현장|정책|행정|기관|적합성",
    re.IGNORECASE,
)
_STRENGTH_FILTER_DOMAIN2 = re.compile(
    r"구현|코드|요구사항|기능\s*\d|실행\s*코드|app\.py",
    re.IGNORECASE,
)
_STRENGTH_FILTER_DOMAIN3 = re.compile(
    r"readme|문서|설치|실행\s*안내|가이드|requirements",
    re.IGNORECASE,
)


class EvaluationError(Exception):
    """평가 과정에서 발생한 사용자 대면 오류."""


@dataclass
class EvaluationOutput:
    result: EvaluationResult
    assessment: DomainAssessment
    review_fallback: bool = False


def _load_prompt(filename: str, *, readme_rubric: str = "") -> str:
    path = PROMPTS_DIR / filename
    if not path.exists():
        raise EvaluationError(f"프롬프트 파일을 찾을 수 없습니다: {path}")
    text = path.read_text(encoding="utf-8")
    return text.replace("{readme_rubric}", readme_rubric)


def _load_readme_rubric() -> str:
    path = SPECS_DIR / "README_RUBRIC.md"
    if not path.exists():
        raise EvaluationError(f"README 평가 규칙 파일을 찾을 수 없습니다: {path}")
    return path.read_text(encoding="utf-8")


def _truncate_verdict(text: str, *, max_chars: int = MAX_FINAL_VERDICT_CHARS) -> str:
    cleaned = text.strip()
    if len(cleaned) <= max_chars:
        return cleaned
    return cleaned[: max_chars - 3].rstrip() + "..."


def _call_domain(client: OpenAI, model: str, system: str, user: str, schema: type):
    response = client.responses.parse(
        model=model,
        input=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        text_format=schema,
        temperature=0,
    )
    parsed = response.output_parsed
    if parsed is None:
        raise EvaluationError("평가 결과를 파싱하지 못했습니다.")
    return schema.model_validate(parsed)


def build_zero_evaluation(issues: list[str]) -> EvaluationResult:
    unique_issues = list(dict.fromkeys(issues))[:5]
    return EvaluationResult(
        pain_point_clarity=0,
        solution_appropriateness=0,
        public_feasibility=0,
        requirement_coverage=0,
        success_criteria_met=0,
        fidelity_no_bloat=0,
        setup_instructions=0,
        documentation_accuracy=0,
        maintainability=0,
        strengths=["제출된 자료만으로는 심사할 수 있는 내용이 확인되지 않았습니다."],
        risks=unique_issues if unique_issues else ["실제 기획서, README, 실행 코드를 제출해 주세요."],
        final_verdict=(
            "이번 제출은 심사 기준을 충족하지 않아 모든 항목 0점으로 처리했습니다. "
            "기획서·README·app.py를 서로 연관되게 준비해 주시면 정확한 평가가 가능합니다. "
            "다음 제출을 기대하겠습니다."
        ),
    )


def _zero_public() -> PublicSectorScores:
    return PublicSectorScores(
        pain_point_clarity=0,
        solution_appropriateness=0,
        public_feasibility=0,
    )


def _zero_intent() -> IntentScores:
    return IntentScores(
        requirement_coverage=0,
        success_criteria_met=0,
        fidelity_no_bloat=0,
    )


def _zero_readme() -> ReadmeScores:
    return ReadmeScores(
        setup_instructions=0,
        documentation_accuracy=0,
        maintainability=0,
    )


def validate_inputs(plan_text: str, readme_text: str, code_text: str) -> None:
    if not plan_text.strip():
        raise EvaluationError("기획서를 입력해 주세요.")
    if not readme_text.strip():
        raise EvaluationError("README 파일을 입력해 주세요.")
    if not code_text.strip():
        raise EvaluationError("실행 코드(app.py)를 입력해 주세요.")


def _skip_risk_items(assessment: DomainAssessment) -> list[str]:
    risks: list[str] = []
    for label, reasons in (
        ("[기획서 0점]", assessment.domain1_reasons),
        ("[의도구현 0점]", assessment.domain2_reasons),
        ("[README 0점]", assessment.domain3_reasons),
    ):
        if reasons:
            risks.extend(f"{label} {reason}" for reason in reasons[:2])
    return risks


def _merge_risks(skip_risks: list[str], llm_risks: list[str]) -> list[str]:
    merged = list(skip_risks)
    for item in llm_risks:
        if item not in merged:
            merged.append(item)
    return merged[:5] if merged else llm_risks[:5]


def _filter_strengths(strengths: list[str], assessment: DomainAssessment) -> list[str]:
    filters: list[re.Pattern[str]] = []
    if not assessment.domain1_ok:
        filters.append(_STRENGTH_FILTER_DOMAIN1)
    if not assessment.domain2_ok:
        filters.append(_STRENGTH_FILTER_DOMAIN2)
    if not assessment.domain3_ok:
        filters.append(_STRENGTH_FILTER_DOMAIN3)

    if not filters:
        return strengths

    filtered = [
        item
        for item in strengths
        if not any(pattern.search(item) for pattern in filters)
    ]

    if filtered:
        return filtered

    if assessment.domain2_ok:
        return ["의도 구현 및 실행 코드 측면에서 참고할 만한 요소가 있습니다."]
    if assessment.domain3_ok:
        return ["README 문서화 측면에서 참고할 만한 내용이 있습니다."]
    if assessment.domain1_ok:
        return ["기획서 방향성 측면에서 참고할 만한 내용이 있습니다."]
    return ["세부 점수표를 참고해 주세요."]


def _fallback_review(
    assessment: DomainAssessment,
    public: PublicSectorScores,
    intent: IntentScores,
    readme_scores: ReadmeScores,
) -> ReviewSummary:
    strengths: list[str] = []
    if assessment.domain1_ok and public.public_feasibility > 0:
        strengths.append("기획서의 문제 정의와 해결 방향이 일정 부분 확인되었습니다.")
    if assessment.domain2_ok and intent.requirement_coverage > 0:
        strengths.append("핵심 요구사항이 코드에 반영된 부분이 있습니다.")
    if assessment.domain3_ok and readme_scores.setup_instructions > 0:
        strengths.append("README에 설치·실행 안내가 포함되어 있습니다.")

    risks = _skip_risk_items(assessment)
    if not risks:
        risks = ["자동 총평 생성에 실패하여 세부 점수를 중심으로 검토해 주세요."]

    verdict = (
        "자동 총평 생성에 일시적인 문제가 있었지만, 분야별·세부 점수는 정상적으로 산출되었습니다. "
        "점수표와 감점 요인을 함께 참고해 주시면 좋겠습니다. "
        "다음 제출도 기대하겠습니다."
    )
    return ReviewSummary(
        strengths=strengths or ["세부 점수표를 참고해 주세요."],
        risks=risks[:5],
        final_verdict=verdict,
    )


def _fetch_review(
    client: OpenAI,
    model: str,
    *,
    plan: str,
    readme: str,
    code: str,
    scores_snapshot: dict,
    assessment: DomainAssessment,
    public: PublicSectorScores,
    intent: IntentScores,
    readme_scores: ReadmeScores,
) -> tuple[ReviewSummary, bool]:
    user_content = (
        f"## 기획서\n{plan}\n\n## README\n{readme}\n\n## 실행 코드\n{code}\n\n"
        f"## 산출 점수\n{scores_snapshot}\n\n"
        "## 중요\n"
        "- domain1_skipped가 true이면 공공기관 적합성 관련 칭찬을 strengths에 넣지 마세요.\n"
        "- domain2_skipped가 true이면 의도 구현·코드 칭찬을 strengths에 넣지 마세요.\n"
        "- domain3_skipped가 true이면 README 칭찬을 strengths에 넣지 마세요.\n"
        "- final_verdict는 3문장 이내, 450자 이하로 작성하세요."
    )
    try:
        review = _call_domain(
            client,
            model,
            _load_prompt("review_summary.txt"),
            user_content,
            ReviewSummary,
        )
        review = ReviewSummary(
            strengths=review.strengths,
            risks=review.risks,
            final_verdict=_truncate_verdict(review.final_verdict),
        )
        return review, False
    except ValidationError:
        return (
            _fallback_review(assessment, public, intent, readme_scores),
            True,
        )


def run_evaluation(
    plan_text: str,
    readme_text: str,
    code_text: str,
    *,
    api_key: str,
    model: str = DEFAULT_MODEL,
) -> EvaluationOutput:
    validate_inputs(plan_text, readme_text, code_text)

    assessment = assess_domains(plan_text, readme_text, code_text)
    if assessment.all_fatal:
        return EvaluationOutput(
            result=build_zero_evaluation(assessment.fatal_reasons),
            assessment=assessment,
        )

    normalized_key = api_key.strip()
    if not normalized_key or normalized_key.startswith("sk-your"):
        raise EvaluationError(
            "OPENAI_API_KEY가 설정되지 않았습니다. .env 파일을 확인해 주세요."
        )

    client = OpenAI(api_key=normalized_key, timeout=OPENAI_TIMEOUT_SEC)
    readme_rubric = _load_readme_rubric()
    plan = plan_text.strip()
    readme = readme_text.strip()
    code = code_text.strip()

    try:
        if assessment.domain1_ok:
            public = _call_domain(
                client,
                model,
                _load_prompt("domain1_public.txt"),
                f"## 기획서\n{plan}",
                PublicSectorScores,
            )
        else:
            public = _zero_public()

        if assessment.domain2_ok:
            intent = _call_domain(
                client,
                model,
                _load_prompt("domain2_intent.txt"),
                f"## 기획서\n{plan}\n\n## 실행 코드\n{code}",
                IntentScores,
            )
        else:
            intent = _zero_intent()

        if assessment.domain3_ok:
            readme_scores = _call_domain(
                client,
                model,
                _load_prompt("domain3_readme.txt", readme_rubric=readme_rubric),
                f"## README\n{readme}\n\n## 기획서\n{plan}\n\n## 실행 코드\n{code}",
                ReadmeScores,
            )
        else:
            readme_scores = _zero_readme()

        scores_snapshot = {
            "공공기관 적합성": public.model_dump(),
            "의도 구현도": intent.model_dump(),
            "README 품질": readme_scores.model_dump(),
            "domain1_skipped": not assessment.domain1_ok,
            "domain2_skipped": not assessment.domain2_ok,
            "domain3_skipped": not assessment.domain3_ok,
            "skip_reasons": {
                "domain1": assessment.domain1_reasons,
                "domain2": assessment.domain2_reasons,
                "domain3": assessment.domain3_reasons,
            },
        }

        review, review_fallback = _fetch_review(
            client,
            model,
            plan=plan,
            readme=readme,
            code=code,
            scores_snapshot=scores_snapshot,
            assessment=assessment,
            public=public,
            intent=intent,
            readme_scores=readme_scores,
        )
    except APIError as exc:
        raise EvaluationError(f"OpenAI API 오류: {exc}") from exc
    except ValidationError as exc:
        raise EvaluationError(f"평가 결과 형식이 올바르지 않습니다: {exc}") from exc

    skip_risks = _skip_risk_items(assessment)
    unique_risks = _merge_risks(skip_risks, list(review.risks))
    strengths = _filter_strengths(list(review.strengths), assessment)

    result = EvaluationResult(
        pain_point_clarity=public.pain_point_clarity,
        solution_appropriateness=public.solution_appropriateness,
        public_feasibility=public.public_feasibility,
        requirement_coverage=intent.requirement_coverage,
        success_criteria_met=intent.success_criteria_met,
        fidelity_no_bloat=intent.fidelity_no_bloat,
        setup_instructions=readme_scores.setup_instructions,
        documentation_accuracy=readme_scores.documentation_accuracy,
        maintainability=readme_scores.maintainability,
        strengths=strengths,
        risks=unique_risks if unique_risks else review.risks,
        final_verdict=_truncate_verdict(review.final_verdict),
    )
    return EvaluationOutput(
        result=result,
        assessment=assessment,
        review_fallback=review_fallback,
    )
