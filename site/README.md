# Stitch UI — 심사위원 챗봇

Google Stitch로 생성한 프론트엔드 UI입니다.

## 파일

| 경로 | 설명 |
|------|------|
| `site/public/index.html` | 채점 메인 (업로드 3칸) |
| `site/public/criteria.html` | 채점 기준 |
| `.stitch/designs/*.png` | Stitch 스크린샷 |
| `.stitch/metadata.json` | Stitch 프로젝트 ID |

**Stitch 프로젝트:** `12575605880212775516`

## 로컬 미리보기

**채점 기능(파일 업로드 + 심사)** 을 쓰려면 FastAPI 서버를 실행하세요.  
정적 HTML만 보려면 `http.server`도 가능하지만, 심사 시작 버튼은 API 서버가 필요합니다.

```powershell
cd "c:\Users\menta\Desktop\심사위원 챗봇"
.\.venv\Scripts\pip.exe install -r requirements-dev.txt
.\.venv\Scripts\uvicorn.exe api:app --host 127.0.0.1 --port 8080
```

브라우저: http://localhost:8080/index.html  
채점: http://localhost:8080/evaluate.html  
채점 기준: http://localhost:8080/criteria.html

`.env`에 `OPENAI_API_KEY`가 설정되어 있어야 심사가 실행됩니다.

서버를 끄려면 터미널에서 `Ctrl+C`.

## 백엔드

- `api.py` — 정적 UI 서빙 + `POST /api/evaluate` (기존 `judge/` 모듈 사용)
- Streamlit `app.py`는 개발/테스트용으로 병행 가능
