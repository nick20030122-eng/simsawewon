# judge-revamp Planning Document

> **Summary**: 심사위원 챗봇을 Next.js 풀스택 앱으로 전면 재구축하고, 앙상블 채점·모델 이중화로 채점 엔진을 고도화한다.
>
> **Project**: 심사위원 챗봇 (공공기관 바이브 코딩 검증 도구)
> **Version**: 2.0 (재구축)
> **Author**: admin@inno-curve.com
> **Date**: 2026-07-23
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 프론트가 Streamlit·Stitch 정적 사이트 두 갈래로 나뉘어 유지보수가 어렵고, gpt-4o 단일 1회 호출 채점이라 점수 재현성(편차)과 모델 노후화 문제가 있다. |
| **Solution** | Next.js(App Router, TypeScript) 단일 풀스택 앱으로 전면 재작성. 채점은 분야별 N회 병렬 앙상블 + 중앙값 산출, 모델은 설정 기반 최신 모델 + 폴백 이중화. |
| **Function/UX Effect** | 단일 코드베이스·단일 배포, 채점 진행 상태가 보이는 개선된 UI, 점수 편차 감소로 심사 신뢰도 향상. |
| **Core Value** | "같은 제출물엔 같은 점수" — 재현성 있는 채점과 현대적인 심사 경험. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 이원화된 프론트(유지보수 부담)와 단일 호출 채점(점수 편차·gpt-4o 고정)의 한계 해소 |
| **WHO** | 공공기관 바이브 코딩 과제 심사위원·운영자(제출물: 기획서 + 공개 GitHub 레포) |
| **RISK** | TS 재작성 과정의 채점 회귀(기존 파이썬 대비 점수·판정 달라짐), 앙상블로 인한 API 비용/지연 증가 |
| **SUCCESS** | 동일 입력 3회 반복 시 종합 점수 표준편차 ≤ 3점, 기존 파이썬 채점 대비 예시 세트 점수 괴리 ≤ 10점, 단일 Next.js 앱으로 전체 기능 동작 |
| **SCOPE** | ① 채점 엔진 TS 포팅+앙상블 ② Next.js UI(홈/채점/기준) ③ 나레이션·TTS ④ 구 코드 제거 |

---

## 1. Overview

### 1.1 Purpose

기존 FastAPI + 정적 사이트 + Streamlit 3중 구조를 Next.js 풀스택 단일 앱으로 통합하고, 채점 엔진을 앙상블 방식으로 고도화하여 점수 재현성과 유지보수성을 동시에 확보한다.

### 1.2 Background

- 현재 배포본은 FastAPI(`api.py`)가 Stitch 생성 정적 사이트(`site/public`)를 서빙하고, 별도로 Streamlit(`app.py`)이 개발용으로 존재 — 로직은 공유하지만 UI가 이원화됨.
- 채점은 gpt-4o 고정 · 분야별 1회 호출(temperature=0)이라 모델 업그레이드가 막혀 있고, 실행마다 점수가 흔들리는 편차 문제가 있음.
- 사용자 결정(2026-07-23): Next.js 풀스택 전환, 앙상블+모델 이중화 우선, Streamlit·정적 사이트 모두 제거.

### 1.3 Related Documents

- 기존 기획: `specs/PLAN.md` (초기 버전 — 현 구현과 상이, 참고용)
- README 채점 규칙: `specs/README_RUBRIC.md` (유지·재사용)
- 분야별 프롬프트: `prompts/*.txt` (TS 앱으로 이관)

---

## 2. Scope

### 2.1 In Scope

- [ ] Next.js(App Router, TypeScript) 앱 신설 — 홈 / 채점 / 채점 기준 페이지
- [ ] 채점 엔진 TypeScript 포팅: 입력 적격성 검증, GitHub 레포 수집, 분야별 structured-output 채점, 감점 요인 합성, 후기 생성, 응답 직렬화
- [ ] **앙상블 채점**: 분야별 N회(기본 3) 병렬 호출 → 세부 항목별 중앙값 채택, 편차 임계 초과 항목 플래그 표시
- [ ] **모델 설정화·이중화**: 채점/후기/나레이션 모델을 설정으로 분리, 최신 모델 기본 + 실패 시 폴백 모델
- [ ] 나레이션 대본 생성 + TTS(OpenAI TTS로 대체 — edge-tts는 Python 전용)
- [ ] UI/UX 개선: 채점 진행 단계 표시, 결과 화면(점수표·편차 표시·최종 한마디) 재설계
- [ ] 기존 자산 정리: `app.py`, `api.py`, `site/`, `judge/`(파이썬), Streamlit 의존성 제거
- [ ] 핵심 로직 단위 테스트 포팅(입력 검증·레포 수집·감점 합성) + 앙상블 집계 테스트

### 2.2 Out of Scope

- 심사 이력 저장/DB, 로그인·권한 (차기 사이클)
- 다중 레포 일괄 심사, PDF 리포트 출력
- 채점 루브릭 자체의 내용 변경(9개 항목 체계·README_RUBRIC 기준은 유지)
- 비공개 레포 지원(OAuth)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | Next.js App Router 기반 홈·채점·기준 3개 페이지 제공 | High | Pending |
| FR-02 | GitHub 공개 레포 URL만 입력받아 채점 실행 — 기획서는 레포 내 파일(PLAN.md·기획서.md 등)에서 자동 수집, 미발견 시 분야1·2 부적격 처리 (2026-07-23 변경: 별도 기획서 입력란 제거) | High | Pending |
| FR-03 | GitHub API로 README·우선순위 코드 파일 수집(기존 규칙: 최대 25개/120K자, 캐시, GITHUB_TOKEN, rate-limit 안내 유지). 2026-07-23 확장: Python 전용 → 언어 중립(js/ts/html/java/go 등 소스 확장자 + 진입점·매니페스트 우선, 락파일·min 제외) | High | Pending |
| FR-04 | 입력 적격성 사전 검증(무의미 입력·placeholder·오프토픽·주제 정합성) — 부적격 분야만 0점 처리 로직 동등 이식 | High | Pending |
| FR-05 | 3대 분야 × 3세부 항목 채점을 structured output으로 수행, 분야별 프롬프트·README_RUBRIC 주입 방식 유지 | High | Pending |
| FR-06 | 분야별 N회(기본 3, 설정 가능) 병렬 앙상블 → 세부 항목 중앙값 채택, 항목별 편차(범위) 기록 | High | Pending |
| FR-07 | 편차 임계값(설정) 초과 항목은 결과 화면에 "판정 불안정" 플래그 표시 | Medium | Pending |
| FR-08 | 모델 설정 파일/환경변수로 채점·후기·나레이션 모델 지정, 기본값은 최신 안정 모델, 호출 실패 시 폴백 모델 자동 전환 | High | Pending |
| FR-09 | 감점 요인 합성(70점 미만 후보, 금지 사유 필터, 최대 5개)과 후기·최종 한마디 생성 동등 이식 | High | Pending |
| FR-10 | 나레이션 대본 생성 + OpenAI TTS 음성 재생(실패 시 텍스트만 표시하는 graceful degradation) | Medium | Pending |
| FR-11 | 채점 진행 상태 UI(수집 → 검증 → 분야별 채점 → 후기 생성 단계 표시) | Medium | Pending |
| FR-12 | 기존 `app.py`·`api.py`·`site/`·`judge/` 및 Python 의존성 제거, README·배포 구성 갱신 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 재현성 | 동일 입력 3회 반복 시 종합 점수 표준편차 ≤ 3점 | 예시 세트(examples/)로 반복 측정 |
| 성능 | 앙상블 3회에도 전체 채점 소요 ≤ 기존 대비 1.5배 (병렬 호출) | 로컬 측정 |
| 비용 | 1회 심사당 LLM 호출 수 상한 명시(앙상블 N 설정으로 제어 가능) | 코드 리뷰 + 호출 카운트 로그 |
| 보안 | API 키는 서버 사이드 전용(Route Handler), 클라이언트 노출 금지 | 코드 리뷰 |
| 회귀 안전성 | 예시 세트(Pass/Fail 예상) 채점 결과가 기존 파이썬 구현과 방향성 일치 | 신구 대조 스냅샷 비교 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-12 구현 완료
- [ ] `examples/01_csv_dashboard`(Pass 예상)·`02_todo_tracker`(Fail 예상) 채점이 기대 방향과 일치
- [ ] 동일 입력 반복 채점 표준편차 ≤ 3점 확인
- [ ] 단위 테스트(입력 검증·레포 수집·감점 합성·앙상블 집계) 통과
- [ ] 구 코드 제거 후 단일 `next build` + 로컬 실행으로 전 기능 동작
- [ ] README·배포 구성(render.yaml 또는 Vercel) 갱신

### 4.2 Quality Criteria

- [ ] TypeScript strict 모드, lint 에러 0
- [ ] 빌드 성공
- [ ] 핵심 순수 로직(검증·집계·감점) 테스트 커버리지 확보

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| TS 재작성 중 채점 회귀(파이썬 대비 점수·판정 변화) | High | Medium | 프롬프트·루브릭은 그대로 이관, 예시 세트로 신구 대조 스냅샷 비교, 순수 로직은 1:1 포팅 후 단위 테스트 |
| 앙상블로 API 비용·지연 N배 증가 | Medium | High | 분야×회차 전체 병렬화, N 설정화(기본 3), 편차 낮으면 N 축소 옵션 |
| 최신 모델의 structured output 스키마 미지원/거동 차이 | Medium | Medium | 폴백 모델 자동 전환(FR-08), 설계 단계에서 모델별 지원 현황 확인 |
| edge-tts 대체(OpenAI TTS)로 음성 톤 변화·비용 발생 | Low | High | 나레이션은 부가 기능 — 실패 시 텍스트 폴백, 음성 옵션 설정화 |
| Vercel 서버리스 함수 타임아웃(앙상블 채점 장시간) | Medium | Medium | 배포 대상 결정 시 함수 타임아웃 확인(설계 단계), 필요 시 Render Node 서비스 유지 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `api.py` (FastAPI) | API 서버 | 제거 — Next.js Route Handler로 대체 |
| `judge/` 파이썬 모듈 전체 | 채점 로직 | 제거 — TypeScript로 재작성 |
| `app.py` (Streamlit) | 개발용 UI | 제거 |
| `site/public` 정적 사이트 | 배포용 UI | 제거 — Next.js 페이지로 대체 |
| `prompts/*.txt`, `specs/README_RUBRIC.md` | 프롬프트/루브릭 | 유지 — Next.js 앱에서 로드 경로만 변경 |
| `tests/` (pytest) | 테스트 | TS 테스트로 포팅 후 제거 |
| `render.yaml`, `requirements*.txt` | 배포/의존성 | Node 기반으로 교체 또는 Vercel 전환 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `/api/evaluate` | POST | `site/public/assets/evaluate.js` → fetch | Breaking — 신규 UI와 함께 교체되므로 실사용 영향 없음 |
| `/api/narration`, `/api/tts` | POST | `evaluate.js` 오디오 prefetch | Breaking — 동일하게 신규 UI로 대체 |
| `judge/*` | import | `app.py`, `api.py`, `scripts/meta_eval.py`, `tests/` | Breaking — meta_eval 스크립트는 구 구현 제거 시 함께 정리(회귀 대조 완료 후) |
| Render 배포 | 기동 | `render.yaml` → `uvicorn api:app` | Breaking — 배포 구성 교체 필요 |

### 6.3 Verification

- [ ] 신규 UI가 구 UI의 전체 사용자 플로우(입력 → 채점 → 결과 → 음성)를 커버함을 확인
- [ ] 구 코드 제거는 신규 앱 검증(회귀 대조 포함) 완료 후 마지막 단계에서 수행
- [ ] 배포 전환 시 환경변수(OPENAI_API_KEY, GITHUB_TOKEN) 이전 확인

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Selected |
|-------|:--------:|
| Starter | ☐ |
| **Dynamic** | ☑ |
| Enterprise | ☐ |

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Framework | Next.js / React / Vue | Next.js (App Router) | 사용자 결정 — 풀스택 단일 앱 |
| 언어 | TypeScript / JavaScript | TypeScript (strict) | 채점 스키마 안전성 |
| State Management | Context / Zustand / Redux | 설계 단계 결정 (경량 우선) | 페이지 수 적음 — 과설계 방지 |
| API Client | fetch / axios / react-query | fetch (Route Handler 호출) | 의존성 최소화 |
| Styling | Tailwind / CSS Modules | 설계 단계 결정 | 기존 다크 톤 디자인 계승 여부 포함 |
| Testing | Vitest / Jest / Playwright | Vitest (단위) | 순수 로직 테스트 포팅 |
| LLM SDK | openai (Node) | openai 공식 Node SDK | structured output 지원 |
| Backend | Next.js Route Handlers | Route Handlers | 풀스택 통합 — 별도 서버 없음 |
| 배포 | Vercel / Render(Node) | 설계 단계 결정 | 서버리스 타임아웃 vs 기존 Render 유지 비교 |

### 7.3 Clean Architecture Approach

```
Selected Level: Dynamic

Folder Structure Preview (설계 단계에서 확정):
  app/                    # 페이지 + Route Handlers
  src/judge/              # 채점 엔진 (파이썬 judge/ 대응 순수 로직)
  src/lib/                # openai 클라이언트, github fetch, 설정
  prompts/, specs/        # 기존 프롬프트·루브릭 유지
```

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [ ] CLAUDE.md 컨벤션 없음 (파이썬 프로젝트였음)
- [x] 기존 코드 컨벤션: 한국어 주석·커밋 메시지, 모듈 단위 분리
- [ ] ESLint/Prettier/tsconfig — 신규 생성 필요

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| Naming | 파이썬 snake_case | TS camelCase, 채점 필드명은 API 호환 위해 snake_case 유지 여부 결정 | High |
| Folder structure | 없음 | §7.3 구조 확정 | High |
| Error handling | 파이썬 fallback 패턴 | Route Handler 에러 응답 규약 정의 | Medium |
| Environment variables | .env (OPENAI_API_KEY, GITHUB_TOKEN) | 동일 키 유지 + 모델 설정 변수 추가 | Medium |

### 8.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `OPENAI_API_KEY` | 채점·후기·TTS 호출 | Server | 기존 유지 |
| `GITHUB_TOKEN` | 레포 수집 rate-limit 완화 | Server | 기존 유지 |
| `JUDGE_MODEL` | 채점 모델 지정 | Server | ☐ |
| `JUDGE_FALLBACK_MODEL` | 폴백 모델 | Server | ☐ |
| `JUDGE_ENSEMBLE_N` | 앙상블 반복 수(기본 3) | Server | ☐ |

---

## 9. Next Steps

1. [ ] 설계 문서 작성 (`/pdca design judge-revamp`) — 아키텍처 3안 비교, 폴더 구조·API 계약·앙상블 집계 규칙·모델 선정 확정
2. [ ] 구현 (`/pdca do judge-revamp`)
3. [ ] Gap 분석 + 신구 채점 대조 (`/pdca analyze judge-revamp`)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-07-23 | Initial draft — 방향 확정(풀스택 전환·앙상블·이중화·구 UI 제거) 반영 | admin@inno-curve.com |
