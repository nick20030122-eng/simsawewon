# judge-revamp Design Document

> **Summary**: Next.js 풀스택 심사위원 챗봇 — 앙상블 채점 엔진 + 모델 이중화 + 신규 UI 설계
>
> **Project**: 심사위원 챗봇 (공공기관 바이브 코딩 검증 도구)
> **Version**: 2.0 (재구축)
> **Author**: admin@inno-curve.com
> **Date**: 2026-07-23
> **Status**: Approved (Checkpoint 3: C안 선택)
> **Planning Doc**: [judge-revamp.plan.md](../../01-plan/features/judge-revamp.plan.md)

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

### 1.1 Design Goals

- 파이썬 `judge/` 모듈의 검증된 채점 파이프라인을 **동작 동등성**을 유지하며 TypeScript로 이식
- 앙상블 집계·감점 합성·입력 검증을 **LLM 호출과 분리된 순수 함수**로 설계 → 단위 테스트 가능
- 모델 교체가 코드 수정 없이 환경변수로 가능한 구조
- 채점 진행 상태를 실시간으로 보여주는 스트리밍 API

### 1.2 Design Principles

- **동작 이식, 구조 개선**: 프롬프트·루브릭·판정 규칙은 그대로, 코드 구조만 현대화
- **순수 로직 우선**: LLM/네트워크에 닿지 않는 로직은 전부 순수 함수(집계·검증·합성)
- **Graceful degradation**: 나레이션·TTS 실패는 채점 결과에 영향 없음 (기존 fallback 철학 유지)
- **YAGNI**: 이력 DB·인증 등 Out of Scope 항목을 위한 추상화는 만들지 않음

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| Criteria | Option A: Minimal | Option B: Clean | Option C: Pragmatic |
|----------|:-:|:-:|:-:|
| **Approach** | `app/`+`lib/` 평면, 직역 포팅 | 4계층+포트/어댑터+DI | 페이지·순수 도메인·인프라 3구획 |
| **New Files** | ~15 | ~35 | ~22 |
| **Complexity** | Low | High | Medium |
| **Maintainability** | Medium | High | High |
| **Effort** | Low | High | Medium |
| **Risk** | Low (coupled) | Low (clean) | Low (balanced) |

**Selected**: **Option C** — **Rationale**: 앙상블 집계·감점 합성 등 핵심 로직의 테스트 용이성은 확보하되, 단일 LLM 프로바이더(OpenAI)·단일 앱 규모에서 포트/어댑터·DI는 과설계. (사용자 승인 2026-07-23)

### 2.1 Component Diagram

```
┌──────────────────────────── Next.js (단일 앱, Render Node) ────────────────────────────┐
│                                                                                        │
│  app/ (Presentation + API)                                                             │
│  ├─ page.tsx (홈)  ├─ evaluate/page.tsx (채점)  ├─ criteria/page.tsx (기준)              │
│  └─ api/                                                                               │
│     ├─ evaluate/route.ts ──── NDJSON 스트리밍 (진행 단계 + 최종 결과)                       │
│     ├─ narration/route.ts     ├─ tts/route.ts     └─ health/route.ts                   │
│                          │                                                             │
│  src/judge/ (순수 채점 도메인 — LLM 호출 없음)                                              │
│  ├─ types.ts (스키마·결과 타입)      ├─ inputValidator.ts (적격성 판정)                     │
│  ├─ ensemble.ts (중앙값·편차 집계)   ├─ riskBuilder.ts (감점 합성)                         │
│  └─ score.ts (세부→분야→종합 산출)                                                        │
│                          │                                                             │
│  src/lib/ (Infrastructure)                                                             │
│  ├─ openai.ts (클라이언트·모델 설정·폴백)   ├─ github.ts (레포 수집·캐시)                    │
│  ├─ evaluator.ts (오케스트레이터: 검증→앙상블 호출→집계→후기)                                 │
│  ├─ prompts.ts (프롬프트·루브릭 로더)      └─ config.ts (환경변수 파싱)                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
                     │                                    │
              OpenAI API (gpt-5.6-terra ⇄ luna)      GitHub API
```

### 2.2 Data Flow

```
사용자 입력(기획서 + 레포 URL)
  → POST /api/evaluate (NDJSON 스트림 시작)
  → [stage: fetching]  github.ts: README·코드 수집 (기존 규칙: 25파일/120K자/5분 캐시)
  → [stage: validating] inputValidator.ts: 분야별 적격성 판정 (부적격 분야 0점 확정)
  → [stage: scoring]   evaluator.ts: 적격 분야 × N회 앙상블을 전부 병렬 호출
                       (structured output, temperature 미지정 — 다양성은 반복으로 흡수)
  → [stage: aggregating] ensemble.ts: 세부 항목별 중앙값 채택 + 편차(범위) 기록·플래그
  → [stage: reviewing] evaluator.ts: 중앙값 점수 기반 감점 후보 → 후기·최종 한마디 1회 생성
  → [result]           serialize: 점수표 + 편차 + 후기 + evaluation_mode → 스트림 종료
  → (클라이언트) 결과 렌더 → 필요 시 /api/narration → /api/tts 음성 재생
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `app/api/*` | `src/lib/evaluator.ts` | 채점 오케스트레이션 |
| `src/lib/evaluator.ts` | `src/judge/*`, `src/lib/openai.ts`, `src/lib/github.ts` | 순수 로직 + 외부 호출 결합 |
| `src/judge/*` | (없음 — 순수 TS) | 테스트 가능한 핵심 로직 |
| `src/lib/prompts.ts` | `prompts/*.txt`, `specs/README_RUBRIC.md` | 기존 프롬프트 자산 로드 (레포 루트 유지) |

---

## 3. Data Model

### 3.1 Entity Definition

```typescript
// src/judge/types.ts — 필드명은 프롬프트·기존 API와 동일한 snake_case 유지 (회귀 방지)

/** 분야별 세부 점수 (LLM structured output 스키마와 1:1) */
interface PublicSectorScores { pain_point_clarity: number; solution_appropriateness: number; public_feasibility: number; rationale: string; }
interface IntentScores      { requirement_coverage: number; success_criteria_met: number; fidelity_no_bloat: number; rationale: string; }
interface ReadmeScores      { setup_instructions: number; documentation_accuracy: number; maintainability: number; rationale: string; }

/** 앙상블 집계 결과 — 세부 항목 단위 */
interface CriterionResult {
  key: string;              // 예: "pain_point_clarity"
  score: number;            // N회 중앙값 (0~100 정수)
  samples: number[];        // 원본 N개 점수
  range: number;            // max - min
  unstable: boolean;        // range > JUDGE_RANGE_THRESHOLD
}

/** 최종 평가 응답 (serialize.ts 직렬화 결과 — 구 serializer.py 필드 호환 + 앙상블 확장) */
interface EvaluationResponse {
  // 9개 세부 점수 (snake_case flat — 구 API 호환)
  pain_point_clarity: number; /* ... 나머지 8개 항목 동일 패턴 ... */
  strengths: string[];
  risks: string[];                     // 합성 완료된 감점 요인 문자열 (최대 5개)
  final_verdict: string;
  total_score: number;                 // 분야 평균 (소수 1자리)
  public_sector_score: number;
  intent_implementation_score: number;
  readme_quality_score: number;
  review_fallback: boolean;
  evaluation_mode: 'full' | 'partial' | 'full_zero' | 'fatal_zero';
  skip_reasons: { domain1: string[]; domain2: string[]; domain3: string[] };
  domain_skipped: { domain1: boolean; domain2: boolean; domain3: boolean };
  ensemble: { n: number; model: string; fallback_used: boolean; unstable_count: number };
  criteria: Array<CriterionResult & { domain: string; label: string }>;
  repo?: { url: string; branch: string; files: string[] };
}

/** 레포 스냅샷 (파이썬 RepoSnapshot 동등 — 내부 인프라 타입) */
interface RepoSnapshot {
  owner: string; repo: string; branch: string; repo_url: string;
  readme: string; code_bundle: string; files_included: string[];
}

/** 나레이션 구간 (narration.py segments 형식 동등) */
interface NarrationSegment { id: string; label: string; icon: string; text: string; }
```

### 3.2 설정 모델

```typescript
// src/lib/config.ts — 환경변수 → 타입 안전 설정
interface JudgeConfig {
  judgeModel: string;          // JUDGE_MODEL, 기본 "gpt-5"
  fallbackModel: string;       // JUDGE_FALLBACK_MODEL, 기본 "gpt-5.6-luna"
  narrationModel: string;      // NARRATION_MODEL, 기본 "gpt-5.6-luna"
  ttsModel: string;            // TTS_MODEL, 기본 "gpt-4o-mini-tts" (voice: "onyx")
  ensembleN: number;           // JUDGE_ENSEMBLE_N, 기본 3 (1이면 앙상블 비활성)
  rangeThreshold: number;      // JUDGE_RANGE_THRESHOLD, 기본 15 (편차 플래그 기준)
}
```

> 모델 선정 근거(2026-07-23 실측, Checkpoint 5): 예시 세트 분야1 캘리브레이션 비교 결과
> gpt-4o 85 / **gpt-5 59.7** / gpt-5.5 38.3 / gpt-5.6-terra 32.5 — 최신 모델일수록
> 공공 맥락 없는 기획서를 엄격 채점. 기존 기준과 가장 가까운 **gpt-5를 채점 기본 모델**로
> 확정(사용자 결정, 프롬프트 불변). 폴백·나레이션은 gpt-5.6-luna($1.00/$6.00).
> 앙상블 3회 × 3분야 = 최대 9회 채점 호출 + 후기 1회/심사.

### 3.3 Database Schema

해당 없음 (이력 저장은 Out of Scope — DB 미사용).

---

## 4. API Specification

### 4.1 Endpoint List

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/health` | OPENAI_API_KEY 설정 여부 + 모델 설정 반환 | 없음 |
| POST | `/api/evaluate` | 채점 실행 — **NDJSON 스트리밍** (진행 단계 → 최종 결과) | 없음 |
| POST | `/api/narration` | 점수 → 2구간 음성 대본 생성 (실패 시 fallback 대본) | 없음 |
| POST | `/api/tts` | 대본 → OpenAI TTS mp3 (실패 시 501 — 클라이언트는 텍스트만 표시) | 없음 |

### 4.2 Detailed Specification

#### `POST /api/evaluate`

**Request:**
```json
{ "repo_url": "https://github.com/{owner}/{repo}" }
```

> v0.3: 기획서는 레포에서 자동 수집 (PLAN.md·기획서.md·planning.md 등 관례 파일명,
> 얕은 경로 우선). 미발견 시 분야1·2 부적격(0점) + 사유 명시, README 채점은 진행.

**Response (200, `application/x-ndjson` — 줄 단위 JSON):**
```json
{"type":"stage","stage":"fetching","message":"레포 수집 중"}
{"type":"stage","stage":"validating","message":"입력 적격성 검증 중"}
{"type":"stage","stage":"scoring","message":"분야별 앙상블 채점 중 (3회 × 3분야)"}
{"type":"stage","stage":"aggregating","message":"점수 집계 중"}
{"type":"stage","stage":"reviewing","message":"평가 후기 작성 중"}
{"type":"result","data":{ /* EvaluationResult */ }}
```

**Error (스트림 내 또는 즉시):**
```json
{"type":"error","error":{"code":"REPO_FETCH_FAILED","message":"레포를 읽지 못했습니다. URL·공개 여부를 확인해주세요."}}
```

#### `POST /api/narration`

**Request:**
```json
{
  "total_score": 74.2, "public_sector_score": 75,
  "intent_implementation_score": 87.7, "readme_quality_score": 60,
  "final_verdict": "..."
}
```
**Response (200):** `{ "segments": [{ "id": "score", "label": "종합 점수", "icon": "leaderboard", "text": "..." }, { "id": "verdict", ... }], "fallback": false }`
(생성 실패 시에도 200 + fallback 대본 — 구 API 동작 유지)

#### `POST /api/tts`

**Request:** `{ "text": "대본" }`
**Response (200):** `audio/mpeg` 바이너리. 실패 시 `501 { "error": { "code": "TTS_UNAVAILABLE" } }`

**공통 에러 코드:** §6 참조

---

## 5. UI/UX Design

> 디자인 방향: **완전히 새로운 디자인** (사용자 결정). 구현 시 `frontend-design` 스킬을 로드해
> 독자적 비주얼 시스템을 수립한다. 기존 다크 그라디언트·해머 스프라이트는 계승하지 않는다.

### 5.1 Screen Layout

```
/ (홈)                        /evaluate (채점)                    /criteria (기준)
┌──────────────────┐  ┌───────────────────────────┐  ┌──────────────────┐
│ 서비스 소개 히어로   │  │ [입력] 기획서(텍스트/파일)     │  │ 3분야 × 3항목      │
│ 3분야 요약 카드     │  │       레포 URL │ 심사 시작    │  │ 기준 카드 + 점수대  │
│ [채점 시작] CTA    │  │ [진행] 단계 스테퍼(스트림 연동)  │  │ (README_RUBRIC   │
└──────────────────┘  │ [결과] 종합 점수 히어로         │  │  요약 포함)       │
                      │       분야 카드·세부 점수표     │  └──────────────────┘
                      │       편차 플래그·감점·한마디    │
                      │       음성 재생 버튼           │
                      └───────────────────────────┘
```

### 5.2 User Flow

```
홈 → 채점 페이지 → 기획서 입력 + 레포 URL → 심사 시작
  → 진행 스테퍼(수집→검증→채점→집계→후기) → 결과 화면
  → (선택) 음성 브리핑 재생 / 기준 페이지에서 근거 확인
```

### 5.3 Component List

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `PlanInput` | `src/components/evaluate/` | 기획서 텍스트 입력 + .md/.txt 파일 업로드(클라이언트 파싱) |
| `RepoUrlInput` | `src/components/evaluate/` | GitHub URL 입력 + 형식 검증 |
| `ProgressStepper` | `src/components/evaluate/` | NDJSON 스트림 단계 표시 |
| `ScoreHero` | `src/components/result/` | 종합 점수 + evaluation_mode 배지 |
| `DomainCard` | `src/components/result/` | 분야 점수 + rationale |
| `CriteriaTable` | `src/components/result/` | 9개 세부 점수 + 편차(unstable) 플래그 |
| `RiskList` | `src/components/result/` | 감점 요인 최대 5개 |
| `VerdictCard` | `src/components/result/` | 최종 한마디 |
| `AudioBriefing` | `src/components/result/` | 나레이션 요청 → TTS 재생 (실패 시 대본 텍스트) |

### 5.4 Page UI Checklist

#### 홈 (`/`)

- [ ] 히어로: 서비스명·설명·[채점 시작하기] CTA(→ /evaluate)
- [ ] 카드 3개: 공공기관 적합성 / 의도 구현도 / README 품질 요약
- [ ] 네비게이션: 홈 / 채점 / 채점 기준 링크

#### 채점 (`/evaluate`)

- [ ] 입력: 기획서 textarea + 파일 업로드(.md/.txt, 클라이언트에서 텍스트 추출)
- [ ] 입력: 레포 URL 필드(placeholder: `https://github.com/owner/repo`, 형식 오류 인라인 표시)
- [ ] 버튼: 심사 시작(입력 미비 시 disabled), 진행 중 재제출 방지
- [ ] 진행: 5단계 스테퍼(수집→검증→채점→집계→후기), 현재 단계 하이라이트
- [ ] 결과: 종합 점수(큰 숫자) + evaluation_mode 배지(부분 심사/전체 부적격 시 사유 표시)
- [ ] 결과: 분야 카드 3개(점수 + rationale 접기/펼치기)
- [ ] 결과: 세부 점수표 9행(항목명·점수·편차 범위·"판정 불안정" 플래그 아이콘)
- [ ] 결과: 감점 요인 리스트(최대 5개: 항목 라벨 + 사유)
- [ ] 결과: 최종 한마디 카드
- [ ] 결과: 음성 브리핑 재생/정지 버튼(로딩·실패 상태 처리, 실패 시 대본 텍스트 표시)
- [ ] 오류: 레포 수집 실패·rate-limit 안내 배너(GITHUB_TOKEN 안내 문구 유지)

#### 채점 기준 (`/criteria`)

- [ ] 분야 섹션 3개: 각 3개 세부 항목 설명 카드
- [ ] README 루브릭 점수대 요약 표(README_RUBRIC.md 기반)

---

## 6. Error Handling

### 6.1 Error Code Definition

| Code | HTTP/스트림 | Cause | Handling |
|------|------|-------|----------|
| `INVALID_INPUT` | 400 | plan 누락·URL 형식 오류 | 인라인 필드 오류 표시 |
| `REPO_FETCH_FAILED` | stream error | 비공개/삭제 레포, 네트워크 | 배너 + URL 재확인 안내 |
| `RATE_LIMITED` | stream error | GitHub API 한도 | GITHUB_TOKEN 설정 안내 배너 (기존 문구 이식) |
| `LLM_FAILED` | stream error | 주·폴백 모델 모두 실패 | "잠시 후 재시도" 안내 |
| `NARRATION_FAILED` | 200 + fallback | 대본 생성 실패 | fallback 대본 반환 (기존 동작) |
| `TTS_UNAVAILABLE` | 501 | TTS 합성 실패 | 클라이언트는 대본 텍스트만 표시 |
| `MISSING_API_KEY` | 503 | OPENAI_API_KEY 미설정 | 홈·채점 페이지 상단 경고 배너 (health 체크) |

### 6.2 Error Response Format

```json
{ "error": { "code": "ERROR_CODE", "message": "사용자 안내 문구", "details": {} } }
```

---

## 7. Security Considerations

- [ ] API 키는 Route Handler(서버)에서만 사용 — `NEXT_PUBLIC_` 접두사 금지
- [ ] 입력 상한: plan 텍스트 최대 길이 제한(기존 동작 준수), repo_url 형식 화이트리스트(`github.com`만)
- [ ] 프롬프트 인젝션 완화: 기존 입력 적격성 검증(placeholder·오프토픽) 이식 + 사용자 입력은 항상 user 롤로 분리
- [ ] 레포 콘텐츠 크기 상한(120K자) 유지 — 토큰 폭탄 방지
- [ ] TTS 입력 길이 상한(대본 이외 임의 텍스트 남용 방지)

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool | Phase |
|------|--------|------|-------|
| Unit | `src/judge/*` 순수 로직 (검증·집계·감점·점수 산출) | Vitest | Do |
| Unit | `src/lib/github.ts` URL 파싱·파일 우선순위 (fetch mock) | Vitest | Do |
| L1: API Tests | `/api/health`, `/api/evaluate` 스트림, 오류 응답 | curl / Vitest + fetch | Check |
| L3: 회귀 대조 | examples/ 예시 세트 신구 점수 비교 | 수동 실행 스크립트 | Check |

### 8.2 L1: API Test Scenarios

| # | Endpoint | Method | Test Description | Expected |
|---|----------|--------|-----------------|----------|
| 1 | /api/health | GET | 키 설정 시 | 200, `{status:"ok", openai_configured:true, model:"gpt-5", ensemble_n:3}` |
| 2 | /api/evaluate | POST | plan 누락 | 400, `INVALID_INPUT` |
| 3 | /api/evaluate | POST | 잘못된 URL | 400, `INVALID_INPUT` |
| 4 | /api/evaluate | POST | 정상 입력 | NDJSON: stage 5종 → result, 9개 criteria |
| 5 | /api/tts | POST | 긴 텍스트 상한 초과 | 400 |

### 8.3 Unit Test Scenarios (파이썬 테스트 포팅 + 신규)

| # | Module | Case |
|---|--------|------|
| 1 | inputValidator | 무의미 입력·placeholder·오프토픽·공공 API 숫자 ID 오탐 방지(기존 6케이스 이식) |
| 2 | github | URL 파싱·파일 우선순위·README 탐색·rate-limit 메시지(기존 8케이스 이식) |
| 3 | riskBuilder | 70점 미만 필터·금지 사유 거부·최대 5개·skip risk 우선(기존 7케이스 이식) |
| 4 | ensemble | 중앙값(홀/짝수 N)·range 계산·unstable 플래그·N=1 통과(신규) |
| 5 | score | 세부→분야→종합 평균·부적격 0점 반영·evaluation_mode 판정(신규) |

### 8.4 회귀 대조 시나리오 (Check phase)

| # | Scenario | Success Criteria |
|---|----------|-----------------|
| 1 | `examples/01_csv_dashboard` (Pass 예상) 채점 | 기존 파이썬 결과 대비 종합 ±10점 이내, 방향성 일치 |
| 2 | `examples/02_todo_tracker` (Fail 예상) 채점 | 낮은 점수대 유지, 부적격 판정 동일 |
| 3 | 동일 입력 3회 반복 | 종합 점수 표준편차 ≤ 3점 |

### 8.5 Seed Data Requirements

해당 없음 (DB 미사용 — examples/ 픽스처를 테스트 입력으로 사용).

---

## 9. Clean Architecture

### 9.4 This Feature's Layer Assignment (C안 — 3구획)

| Component | 구획 | Location | 규칙 |
|-----------|------|----------|------|
| 페이지·컴포넌트 | Presentation | `app/`, `src/components/` | `src/lib` 호출은 Route Handler 경유(fetch) |
| Route Handlers | Presentation(API) | `app/api/*/route.ts` | `src/lib/evaluator` 등 lib만 호출 |
| 채점 순수 로직 | Domain | `src/judge/` | **외부 import 금지(zod 제외)** — fetch·openai 참조 불가 |
| LLM·GitHub·설정 | Infrastructure | `src/lib/` | `src/judge` 타입·함수 사용 가능 |

---

## 10. Coding Convention Reference

| Item | Convention |
|------|-----------|
| 언어 | TypeScript strict, ESLint(next/core-web-vitals) + Prettier |
| 네이밍 | 컴포넌트 PascalCase, 함수 camelCase, **LLM 스키마·API 응답 필드는 snake_case 유지**(프롬프트 호환) |
| 파일 | 컴포넌트 PascalCase.tsx, 유틸 camelCase.ts, 폴더 kebab-case |
| 스타일링 | Tailwind CSS v4 (신규 디자인 시스템 — frontend-design 스킬로 수립) |
| 상태 관리 | React 내장(useState/useReducer) — 외부 상태 라이브러리 미도입 |
| 검증 | zod (요청 본문·LLM structured output 스키마 겸용) |
| 주석·커밋 | 한국어 (기존 관례 유지) |
| 환경변수 | 서버 전용: `OPENAI_API_KEY`, `GITHUB_TOKEN`, `JUDGE_*`, `NARRATION_MODEL`, `TTS_MODEL` |

---

## 11. Implementation Guide

### 11.1 File Structure

```
심사위원 챗봇/
├── app/
│   ├── layout.tsx, globals.css, page.tsx        # 홈
│   ├── evaluate/page.tsx                        # 채점 (클라이언트 컴포넌트 중심)
│   ├── criteria/page.tsx                        # 기준
│   └── api/
│       ├── health/route.ts
│       ├── evaluate/route.ts                    # NDJSON 스트리밍
│       ├── narration/route.ts
│       └── tts/route.ts
├── src/
│   ├── judge/                                   # 순수 도메인 (Vitest 대상)
│   │   ├── types.ts, schemas.ts (zod)
│   │   ├── inputValidator.ts, ensemble.ts, riskBuilder.ts, score.ts
│   ├── lib/
│   │   ├── config.ts, openai.ts, github.ts, prompts.ts
│   │   ├── evaluator.ts                         # 오케스트레이터
│   │   └── narration.ts, tts.ts
│   └── components/  (evaluate/, result/, ui/)
├── prompts/, specs/, examples/                  # 기존 자산 유지 (경로 불변)
├── tests/  (vitest: judge·github·회귀 대조 스크립트)
├── package.json, tsconfig.json, next.config.ts
└── render.yaml                                  # Node 서비스로 교체
```

### 11.2 Implementation Order

1. [ ] 스캐폴드: create-next-app(TS, Tailwind, App Router) + config·prompts 로더 + health
2. [ ] 도메인 포팅: types/schemas → inputValidator → riskBuilder → score → ensemble (+ Vitest)
3. [ ] 인프라: github.ts(수집·캐시) → openai.ts(폴백) → evaluator.ts(앙상블 오케스트레이션)
4. [ ] API: evaluate 스트리밍 → narration → tts
5. [ ] UI: frontend-design 스킬로 디자인 시스템 수립 → 3페이지 + 결과 컴포넌트
6. [ ] 검증·정리: 회귀 대조 → 구 코드 제거(app.py, api.py, site/, judge/, requirements*) → render.yaml·README 갱신

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | Description | Estimated Turns |
|--------|-----------|-------------|:---------------:|
| 스캐폴드+도메인 포팅 | `module-1` | Next.js 셋업, src/judge 순수 로직 + 단위 테스트 | 30-40 |
| 인프라+API | `module-2` | github/openai/evaluator + Route Handlers | 30-40 |
| UI | `module-3` | 디자인 시스템 + 3페이지 + 결과 화면 | 30-40 |
| 검증+정리 | `module-4` | 회귀 대조, 구 코드 제거, 배포 구성 | 20-30 |

#### Recommended Session Plan

| Session | Phase | Scope |
|---------|-------|-------|
| Session 1 | Do | `--scope module-1,module-2` |
| Session 2 | Do | `--scope module-3,module-4` |
| Session 3 | Check + Report | 전체 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-07-23 | Initial — C안 확정, Render Node 배포, 신규 디자인, GPT-5.6 terra/luna 모델 선정 | admin@inno-curve.com |
| 0.2 | 2026-07-23 | Check 후 동기화 — 채점 기본 모델 gpt-5 확정(캘리브레이션 실측), §3.1 응답 모델·§4.2 narration 계약·§8.2 health 기대값을 실구현 형태로 갱신 | admin@inno-curve.com |
| 0.3 | 2026-07-23 | 기획서 입력란 제거(사용자 결정) — 레포에서 기획서 파일 자동 수집, 미발견 시 분야1·2 부적격. evaluate 요청 `{repo_url}` 단일화, RepoSnapshot에 plan/plan_path 추가 | admin@inno-curve.com |
| 0.4 | 2026-07-23 | 코드 수집 언어 중립화(사용자 결정) — .py 전용에서 js/ts/html/java/go 등 소스 확장자 전반으로 확장, 진입점·매니페스트 우선순위 확대, 락파일·min·d.ts 제외, 코드 검증 키워드·오류 문구 일반화 | admin@inno-curve.com |
