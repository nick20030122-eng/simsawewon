from pydantic import BaseModel, Field, field_validator


class PublicSectorScores(BaseModel):
    pain_point_clarity: int = Field(ge=0, le=100)
    solution_appropriateness: int = Field(ge=0, le=100)
    public_feasibility: int = Field(ge=0, le=100)


class IntentScores(BaseModel):
    requirement_coverage: int = Field(ge=0, le=100)
    success_criteria_met: int = Field(ge=0, le=100)
    fidelity_no_bloat: int = Field(ge=0, le=100)


class ReadmeScores(BaseModel):
    setup_instructions: int = Field(ge=0, le=100)
    documentation_accuracy: int = Field(ge=0, le=100)
    maintainability: int = Field(ge=0, le=100)


class RiskReasonItem(BaseModel):
    """채점 기준 세부 항목에 대응하는 감점 사유."""

    criterion_key: str = Field(
        description=(
            "감점 후보에 명시된 키만 사용 "
            "(pain_point_clarity, solution_appropriateness, public_feasibility, "
            "requirement_coverage, success_criteria_met, fidelity_no_bloat, "
            "setup_instructions, documentation_accuracy, maintainability)"
        )
    )
    reason: str = Field(
        min_length=8,
        max_length=180,
        description="해당 세부 항목의 감점 사유 1문장 (제출 자료 근거)",
    )


class ReviewSummary(BaseModel):
    strengths: list[str] = Field(min_length=1)
    risk_reasons: list[RiskReasonItem] = Field(
        default_factory=list,
        description="감점 후보에 해당하는 항목만. 후보가 없으면 빈 배열.",
    )
    final_verdict: str = Field(min_length=30, max_length=450)

    @field_validator("strengths")
    @classmethod
    def strip_items(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value if item.strip()]
        if not cleaned:
            raise ValueError("목록에는 최소 하나의 항목이 필요합니다.")
        return cleaned

    @field_validator("final_verdict")
    @classmethod
    def strip_verdict(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("최종 한마디는 비어 있을 수 없습니다.")
        if len(cleaned) > 450:
            cleaned = cleaned[:447].rstrip() + "..."
        return cleaned
