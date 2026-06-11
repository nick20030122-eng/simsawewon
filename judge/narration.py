"""음성 평가용 자연스러운 대본 생성."""

from __future__ import annotations

import json
from pathlib import Path

from openai import OpenAI
from pydantic import BaseModel, Field, ValidationError

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


class VoiceNarration(BaseModel):
    score_intro: str = Field(min_length=20, max_length=800)
    verdict_part: str = Field(min_length=15, max_length=800)


def _load_prompt(filename: str) -> str:
    path = PROMPTS_DIR / filename
    return path.read_text(encoding="utf-8")


def narration_to_segments(narration: VoiceNarration) -> list[dict[str, str]]:
    return [
        {
            "id": "score",
            "label": "종합 점수",
            "icon": "leaderboard",
            "text": narration.score_intro.strip(),
        },
        {
            "id": "verdict",
            "label": "최종 평가",
            "icon": "gavel",
            "text": narration.verdict_part.strip(),
        },
    ]


def build_fallback_narration_segments(evaluation: dict) -> list[dict[str, str]]:
    """LLM 대본 생성 실패 시 사용하는 기본 2구간 대본."""

    return [
        {
            "id": "score",
            "label": "종합 점수",
            "icon": "leaderboard",
            "text": (
                "안녕하세요, AI 심사위원입니다. "
                f"종합 점수는 {evaluation.get('total_score')}점이고, "
                f"공공기관 적합성 {evaluation.get('public_sector_score')}점, "
                f"의도 구현도 {evaluation.get('intent_implementation_score')}점, "
                f"README 품질 {evaluation.get('readme_quality_score')}점입니다."
            ),
        },
        {
            "id": "verdict",
            "label": "최종 평가",
            "icon": "gavel",
            "text": (
                "마지막으로 드리는 말씀입니다. "
                f"{(evaluation.get('final_verdict') or '').strip()} "
                "오늘도 수고 많으셨습니다."
            ),
        },
    ]


def generate_voice_narration(evaluation: dict, *, client: OpenAI, model: str) -> list[dict[str, str]]:
    """채점 결과 JSON으로부터 TTS용 2구간 대본을 생성."""
    payload = {
        "total_score": evaluation.get("total_score"),
        "public_sector_score": evaluation.get("public_sector_score"),
        "intent_implementation_score": evaluation.get("intent_implementation_score"),
        "readme_quality_score": evaluation.get("readme_quality_score"),
        "final_verdict": evaluation.get("final_verdict", ""),
    }
    user_content = (
        "아래 채점 결과를 바탕으로 음성 대본 2구간을 작성하세요.\n\n"
        f"```json\n{json.dumps(payload, ensure_ascii=False, indent=2)}\n```"
    )

    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = client.responses.parse(
                model=model,
                input=[
                    {"role": "system", "content": _load_prompt("voice_narration.txt")},
                    {"role": "user", "content": user_content},
                ],
                text_format=VoiceNarration,
                temperature=0,
            )
            parsed = response.output_parsed
            if parsed is None:
                raise ValueError("음성 대본을 생성하지 못했습니다.")
            narration = VoiceNarration.model_validate(parsed)
            return narration_to_segments(narration)
        except (ValidationError, ValueError) as exc:
            last_error = exc
            if attempt == 0:
                user_content += "\n\n각 구간은 짧고 자연스러운 구어체로 다시 작성하세요."
                continue
            raise ValueError("음성 대본 형식 검증에 실패했습니다.") from last_error

    raise ValueError("음성 대본을 생성하지 못했습니다.")
