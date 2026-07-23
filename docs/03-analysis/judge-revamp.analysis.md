# judge-revamp Analysis Report

> **Analysis Type**: Gap Analysis + 회귀 대조 (Check)
>
> **Project**: 심사위원 챗봇
> **Version**: 2.0
> **Analyst**: admin@inno-curve.com
> **Date**: 2026-07-23
> **Design Doc**: [judge-revamp.design.md](../02-design/features/judge-revamp.design.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 이원화된 프론트(유지보수 부담)와 단일 호출 채점(점수 편차·gpt-4o 고정)의 한계 해소 |
| **WHO** | 공공기관 바이브 코딩 과제 심사위원·운영자 |
| **RISK** | TS 재작성 채점 회귀, 앙상블 비용/지연 증가 |
| **SUCCESS** | 반복 표준편차 ≤ 3점, 신구 괴리 ≤ 10점, 단일 Next.js 앱 전체 동작 |
| **SCOPE** | ① 엔진 TS 포팅+앙상블 ② UI 3페이지 ③ 나레이션·TTS ④ 구 코드 제거 |

---

## Success Criteria Status

| # | Criteria (from Plan) | Status | Evidence |
|---|---------------------|:------:|----------|
| SC-1 | 동일 입력 반복 시 종합 점수 표준편차 ≤ 3점 | ✅ | gpt-5.6-terra 3회 std 1.04 / gpt-5 2회 std 2.65 (`scripts/regression_*.json`) |
| SC-2 | 예시 세트 신구 점수 괴리 ≤ 10점 | ✅ | Pass 88.9→83.4 (5.6점), Fail 48.3→50.6 (2.3점) — gpt-5 기준 |
| SC-3 | 예시 세트 채점 방향성 일치 (Pass 높음/Fail 낮음) | ✅ | 위 표 — 방향 유지 |
| SC-4 | 단위 테스트 통과 | ✅ | Vitest 5파일 33케이스 전부 통과 |
| SC-5 | 구 코드 제거 후 단일 next build로 전 기능 동작 | ✅ | 제거 후 build 성공, health/400/페이지 3종 스모크 통과 |
| SC-6 | README·배포 구성 갱신 | ✅ | README.md v2.0, render.yaml Node 서비스 |

**Success Rate**: 6/6 criteria met

### Decision Record Verification

| Source | Decision | Followed? | Deviation |
|--------|----------|:---------:|-----------|
| [Plan] | Next.js 풀스택 전환·구 UI 전부 제거 | ✅ | — |
| [Design] | C안(실용 균형) 3구획 구조 | ✅ | serialize.ts 등 정당한 파일 추가 |
| [Design] | 채점 모델 gpt-5.6-terra | ⚠️ 변경 | Checkpoint 5에서 **gpt-5로 교체**(캘리브레이션 실측 기반, 사용자 승인). 설계 v0.2에 반영 |
| [Design] | 앙상블 N=3 중앙값 + 편차 플래그 | ✅ | — |
| [Design] | Render Node 배포·신규 디자인(공문서 컨셉) | ✅ | — |

---

## 1. Gap Analysis 결과 (gap-detector, static)

| 축 | Rate |
|----|:----:|
| Structural Match | 100% |
| Functional Depth | 95% |
| API Contract (3-way) | 82% → 설계 v0.2 동기화로 해소 |
| **Overall (0.2S + 0.4F + 0.4C)** | **91%** ✅ (임계 90%) |

- Critical 0 / Important 2 / Minor 3 — 전부 "설계 문서 표류"(런타임 파괴 계약 0건)
- Important 2건(narration 계약, 결과 모델 표류)은 설계 문서를 실구현 형태로 갱신해 해소 (design v0.2)
- Minor: health 응답 필드(§8.2 정정 완료), RepoSnapshot 내부 타입, rationale 축소(후속 사이클 후보)

## 2. 회귀 대조 (Design §8.4)

기존 파이썬 엔진(gpt-4o, 1회)과 새 TS 엔진(앙상블 3회 중앙값)을 동일 예시로 비교:

| 예시 | gpt-4o(구) | gpt-5.6-terra(신) | gpt-5(신, 최종) |
|------|:---:|:---:|:---:|
| 01_csv_dashboard (Pass 예상) | 88.9 | 70.7 | **83.4** |
| 02_todo_tracker (Fail 예상) | 48.3 | 36.2 | **50.6** |

**분야1(공공기관 적합성) 캘리브레이션 실측** — 예시 01 기준:
gpt-4o 85 / gpt-5 59.7 / gpt-5.5 38.3 / gpt-5.6-terra 32.5.
최신 모델일수록 공공 맥락 없는 기획서를 엄격 채점 → 기존 기준에 가장 근접한 gpt-5를
채점 기본 모델로 확정(프롬프트 불변). 상세: `scripts/model_calibration.json`.

## 3. 남은 관찰 사항 (후속 사이클 후보)

1. **분야1 점수대 앵커**: gpt-5도 예시 01 분야1 회차 편차(53~67)가 큼 — 프롬프트에
   점수대 기준표를 넣으면 모델 교체 내성이 생김 (이번 사이클에서는 사용자 결정으로 보류)
2. **rationale 노출**: 분야별 채점 근거 텍스트를 결과서에 표시 (`representativeSampleIndex` 활용)
3. **구식 문서 정리**: `설명/`(Streamlit 기준 사용법)·`assets/`·`.stitch/`·`github-upload/`는
   구 스택 잔재 가능성 — 사용자 확인 후 정리 권장
4. 실 레포 URL 대상 E2E(스트리밍 전 구간) 테스트는 로컬 스모크로 대체됨 — 배포 후 1회 검증 권장

## 4. Act 반영 사항 (2026-07-23, Check 이후)

**FR-02 변경 — 기획서 입력란 제거 (사용자 결정)**: 기획서를 레포에서 자동 수집하는
방식으로 전환. `findPlanPath`(PLAN.md·기획서.md 등 관례 파일명, 얕은 경로 우선)로 탐색,
미발견 시 분야1·2만 부적격 처리(README 채점은 진행). E2E 재검증:

| 시나리오 | 결과 |
|----------|------|
| 기획서 없는 레포 (streamlit-example) | partial 모드, 분야1·2 부적격 + 사유 표시, README 33.3점 정상 채점 ✅ |
| 기획서 있는 레포 (simsawewon, specs/PLAN.md) | full 모드, plan_path 자동 발견, 3분야 채점 (66.7점) ✅ |
| 단위 테스트 | 39/39 통과 (기획서 미발견·탐색 우선순위 케이스 6개 추가) ✅ |

**FR-03 확장 — 코드 수집 언어 중립화 (사용자 결정)**: `.py` 전용 수집이 Python 아닌
제출물을 "실행 코드 없음"으로 거부하던 문제 해소. 소스 확장자 전반(js/ts/html/java/go 등)
+ 진입점·매니페스트 우선순위 확대, 락파일·min·d.ts 제외, 검증 키워드·오류 문구 일반화.
프롬프트는 원래 언어 중립이라 캘리브레이션 영향 없음. E2E: HTML/JS 전용 레포
(mdn/beginner-html-site-scripted) 수집·채점 정상 (index.html, main.js, style.css).
단위 테스트 41/41.

## 5. 결론

Match Rate 91% (≥90%) + Success Criteria 6/6 충족 + Act 변경분 E2E 재검증 완료
→ **Report 단계 진행 가능**.
