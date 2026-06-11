"""정적 UI(site/public) + 채점 API 서버."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from openai import OpenAI

from judge.evaluator import EvaluationError, run_evaluation
from judge.repo_fetcher import RepoFetchError, fetch_github_repo
from judge.narration import build_fallback_narration_segments, generate_voice_narration
from judge.serializer import evaluation_to_response
from judge.tts import synthesize_speech_async

load_dotenv()

ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "site" / "public"
MODEL = "gpt-4o"
MAX_FIELD_CHARS = 150_000
OPENAI_TIMEOUT_SEC = 120.0

logger = logging.getLogger(__name__)

app = FastAPI(title="심사위원 챗봇 API")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _request: object, exc: RequestValidationError
) -> JSONResponse:
    logger.warning("요청 검증 실패: %s", exc.errors())
    return JSONResponse(
        status_code=422,
        content={
            "detail": "요청 형식이 올바르지 않습니다. 기획서와 GitHub 레포 URL을 확인해 주세요."
        },
    )


class EvaluateRequest(BaseModel):
    plan: str = Field(min_length=1, max_length=MAX_FIELD_CHARS)
    repo_url: str = Field(min_length=8, max_length=500)


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4096)


class NarrationRequest(BaseModel):
    total_score: float
    public_sector_score: float
    intent_implementation_score: float
    readme_quality_score: float
    strengths: list[str] = Field(min_length=1)
    risks: list[str] = Field(min_length=1)
    final_verdict: str = Field(min_length=1)


def _openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key or api_key.startswith("sk-your"):
        raise HTTPException(
            status_code=400,
            detail="OpenAI API 키가 설정되지 않았습니다. .env 파일을 확인해 주세요.",
        )
    return OpenAI(api_key=api_key, timeout=OPENAI_TIMEOUT_SEC)


@app.get("/api/health")
def health() -> dict[str, str]:
    key = os.getenv("OPENAI_API_KEY", "")
    configured = bool(key and not key.startswith("sk-your"))
    return {"status": "ok", "openai_configured": str(configured).lower()}


@app.post("/api/evaluate")
def evaluate(body: EvaluateRequest) -> dict:
    try:
        _openai_client()
        snapshot = fetch_github_repo(body.repo_url)
        logger.info(
            "레포 수집 완료: %s/%s @ %s (%d files)",
            snapshot.owner,
            snapshot.repo,
            snapshot.branch,
            len(snapshot.files_included),
        )
        output = run_evaluation(
            body.plan,
            snapshot.readme,
            snapshot.code_bundle,
            api_key=os.getenv("OPENAI_API_KEY", ""),
            model=MODEL,
        )
        response = evaluation_to_response(
            output.result,
            assessment=output.assessment,
            review_fallback=output.review_fallback,
        )
        response["repo"] = {
            "url": snapshot.repo_url,
            "branch": snapshot.branch,
            "files": snapshot.files_included,
        }
        return response
    except RepoFetchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except EvaluationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"예상치 못한 오류가 발생했습니다: {exc}",
        ) from exc


@app.post("/api/narration")
def generate_narration(body: NarrationRequest) -> dict:
    """채점 결과로 TTS용 자연스러운 4구간 대본 생성."""
    payload = body.model_dump()
    try:
        client = _openai_client()
        segments = generate_voice_narration(payload, client=client, model=MODEL)
        return {"segments": segments, "fallback": False}
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("음성 대본 생성 실패, fallback 사용: %s", exc)
        return {
            "segments": build_fallback_narration_segments(payload),
            "fallback": True,
        }


@app.post("/api/tts")
async def text_to_speech(body: TtsRequest) -> Response:
    """한국어 Neural TTS (edge-tts) — 심사위원 음성 평가용."""
    text = body.text.strip()
    try:
        audio = await synthesize_speech_async(text)
        return Response(content=audio, media_type="audio/mpeg")
    except HTTPException:
        raise
    except Exception as edge_exc:
        try:
            client = _openai_client()
            audio = client.audio.speech.create(
                model="tts-1-hd",
                voice="nova",
                input=text,
                speed=1.34,
                response_format="mp3",
            )
            return Response(content=audio.content, media_type="audio/mpeg")
        except HTTPException:
            raise
        except Exception as openai_exc:
            raise HTTPException(
                status_code=500,
                detail=(
                    f"음성 생성에 실패했습니다. "
                    f"(edge-tts: {edge_exc}; OpenAI: {openai_exc})"
                ),
            ) from openai_exc


app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="static")
