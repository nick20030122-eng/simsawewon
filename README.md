# AI 심사위원

공공기관 바이브 코딩 검증용 Next.js 풀스택 앱입니다.
**공개 GitHub 레포 URL**만 입력하면 레포에서 기획서(`PLAN.md`·`기획서.md`)·README·코드를
수집해 3대 분야 9개 항목 점수표와 평가 후기(심사 결과서)를 발급합니다.
레포에 기획서 파일이 없으면 공공기관 적합성·의도 구현도 분야는 부적격(0점) 처리됩니다.

## 3대 심사 분야

| 분야 | 평가 대상 |
|------|-----------|
| 공공기관 적합성 | 기획서 — 페인포인트·해결 방향·현장 적용 가능성 |
| 의도 구현도 | 기획서 ↔ 실행 코드 |
| README 품질 | README (규칙: `specs/README_RUBRIC.md`) |

## 채점 방식 (v2.0)

- **앙상블 채점**: 분야별로 N회(기본 3) 병렬 채점 후 세부 항목별 **중앙값**을 최종 점수로 기록합니다.
  반복 간 편차가 큰 항목에는 **판정 불안정** 표식이 붙습니다.
- **모델 이중화**: 채점 모델이 실패하면 폴백 모델로 자동 전환합니다.
- **부적격 분야 0점**: 무의미한 입력·주제 불일치 제출물은 해당 분야만 0점 처리하고 사유를 명시합니다.
- **Pass/Fail 없음** — 점수만 제공합니다.

## 사전 준비

- Node.js 22+
- OpenAI API 키

## 설치 및 실행

```powershell
cd "c:\Users\menta\Desktop\심사위원 챗봇"
npm install
copy .env.example .env
# .env에 OPENAI_API_KEY 설정
npm run dev        # 개발 서버 (http://localhost:3000)
npm run build && npm run start   # 프로덕션
npm test           # 단위 테스트 (Vitest)
```

## 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `OPENAI_API_KEY` | (필수) | 채점·후기·나레이션·TTS 호출 |
| `GITHUB_TOKEN` | (선택) | GitHub API 한도 완화 (공개 레포 읽기용) |
| `JUDGE_MODEL` | `gpt-5` | 채점 모델 |
| `JUDGE_FALLBACK_MODEL` | `gpt-5.6-luna` | 채점 실패 시 폴백 모델 |
| `NARRATION_MODEL` | `gpt-5.6-luna` | 음성 대본 생성 모델 |
| `TTS_MODEL` | `gpt-4o-mini-tts` | 음성 합성 모델 |
| `JUDGE_ENSEMBLE_N` | `3` | 앙상블 반복 수 (1이면 비활성) |
| `JUDGE_RANGE_THRESHOLD` | `15` | 판정 불안정 플래그 편차 기준 |

## 프로젝트 구조

```
심사위원 챗봇/
├── app/                    # Next.js 페이지(홈·채점·기준) + API Route Handlers
│   └── api/                #   /api/health, /api/evaluate(NDJSON 스트림), /api/narration, /api/tts
├── src/judge/              # 순수 채점 도메인 — 입력 검증·앙상블 집계·감점 합성·점수 산출
├── src/lib/                # 인프라 — OpenAI(폴백)·GitHub 수집·오케스트레이터·설정
├── src/components/         # UI 컴포넌트 (심사 접수·심사 결과서)
├── prompts/                # 분야별 심사 프롬프트
├── specs/README_RUBRIC.md  # README 평가 규칙
├── tests/ts/               # Vitest 단위 테스트
└── examples/               # 채점 예시 세트 (Pass/Fail 예상)
```

## API

- `POST /api/evaluate` — `{ repo_url }` 입력, **NDJSON 스트림**으로 진행 단계
  (수집→검증→채점→집계→후기)와 최종 결과를 반환합니다. 기획서는 레포에서 자동 수집.
- `POST /api/narration` — 점수 요약을 음성 대본 2구간으로 변환합니다.
- `POST /api/tts` — 대본을 mp3로 합성합니다 (실패 시 501, 화면에는 대본 텍스트 표시).
- `GET /api/health` — 키 설정 여부·모델 구성을 반환합니다.

## 배포

`render.yaml` (Render Node 서비스) — 환경변수 `OPENAI_API_KEY`, `GITHUB_TOKEN`을
대시보드에서 등록하세요.

## 예시 데이터

| 세트 | 기획서 | README | 코드 |
|------|--------|--------|------|
| Pass 예상 | `examples/01_csv_dashboard/PLAN.md` | `examples/01_csv_dashboard/README.md` | `examples/01_csv_dashboard/app.py` |
| Fail 예상 | `examples/02_todo_tracker/PLAN.md` | `examples/02_todo_tracker/README.md` | `examples/02_todo_tracker/app.py` |
