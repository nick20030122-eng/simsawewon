from judge.input_validator import DomainAssessment
from judge.models import DOMAIN_LABELS, EvaluationResult


def _evaluation_mode(assessment: DomainAssessment, result: EvaluationResult) -> str:
    if assessment.all_fatal:
        return "fatal_zero"
    if (
        not assessment.domain1_ok
        or not assessment.domain2_ok
        or not assessment.domain3_ok
    ):
        return "partial"
    if result.total_score == 0:
        return "full_zero"
    return "full"


def evaluation_to_response(
    result: EvaluationResult,
    *,
    assessment: DomainAssessment | None = None,
    review_fallback: bool = False,
) -> dict:
    """EvaluationResult를 프론트엔드 JSON 응답으로 직렬화."""
    payload = {
        **result.model_dump(),
        "total_score": result.total_score,
        "public_sector_score": result.public_sector_score,
        "intent_implementation_score": result.intent_implementation_score,
        "readme_quality_score": result.readme_quality_score,
        "domain_labels": DOMAIN_LABELS,
        "domain_summary_rows": result.domain_summary_rows(),
        "detail_score_rows": result.detail_score_rows(),
        "review_fallback": review_fallback,
    }
    if assessment is not None:
        payload["evaluation_mode"] = _evaluation_mode(assessment, result)
        payload["skip_reasons"] = {
            "domain1": assessment.domain1_reasons,
            "domain2": assessment.domain2_reasons,
            "domain3": assessment.domain3_reasons,
        }
        payload["domain_skipped"] = {
            "domain1": not assessment.domain1_ok,
            "domain2": not assessment.domain2_ok,
            "domain3": not assessment.domain3_ok,
        }
    return payload
