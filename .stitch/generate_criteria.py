import json
import os
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MCP_URL = "https://stitch.googleapis.com/mcp"
PROJECT_ID = "12575605880212775516"


def load_api_key() -> str:
    key = os.getenv("STITCH_API_KEY", "").strip()
    if key:
        return key
    mcp_path = Path.home() / ".cursor" / "mcp.json"
    if mcp_path.exists():
        data = json.loads(mcp_path.read_text(encoding="utf-8"))
        key = data.get("mcpServers", {}).get("stitch", {}).get("headers", {}).get("X-Goog-Api-Key", "")
        if key:
            return key
    raise SystemExit("STITCH_API_KEY not found")


API_KEY = load_api_key()

PROMPT = """Desktop web app "채점 기준" tab page for 심사위원 챗봇. Same design system as main page.

**DESIGN SYSTEM (REQUIRED):**
- Dark mode, gradient background black-navy, blue/rose glows
- Inter/Geist font, Korean labels
- Glass cards, 14px radius, blue border
- INNOCURVE AI logo top-left
- Hero: ⚖️ 심사위원 챗봇
- Tab bar: "채점" | "채점 기준" (active)

**Content — 3 columns of criteria cards:**

Column 1 — 01 공공기관 적합성 (blue accent, source: 기획서)
- 페인포인트 명확성
- 해결 방향 적절성
- 공공 현장 적용 가능성

Column 2 — 02 의도 구현도 (mix accent, source: 기획서 ↔ 실행 코드)
- 핵심 요구사항 구현
- 성공 기준 충족
- 기획 의도 일치

Column 3 — 03 README 품질 (rose accent, source: README)
- 설치 · 실행 안내
- 기획 · 코드 정합성
- 유지보수 · 확장 가이드

Footer note: "3개 분야 · 9개 세부 항목 · 항목당 0–100점"
Desktop 1280px, Tailwind CSS."""


def mcp_call(tool, arguments, req_id=1):
    payload = {"jsonrpc": "2.0", "id": req_id, "method": "tools/call", "params": {"name": tool, "arguments": arguments}}
    req = urllib.request.Request(MCP_URL, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "X-Goog-Api-Key": API_KEY}, method="POST")
    with urllib.request.urlopen(req, timeout=600) as resp:
        return json.loads(resp.read().decode())


def parse_text_result(response):
    content = response.get("result", {}).get("content", [])
    if content:
        return json.loads(content[0].get("text", "{}"))
    return response.get("result", {}).get("structuredContent", {})


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        dest.write_bytes(resp.read())


gen = mcp_call("generate_screen_from_text", {"projectId": PROJECT_ID, "prompt": PROMPT, "deviceType": "DESKTOP", "modelId": "GEMINI_3_1_PRO"}, 11)
gen_data = parse_text_result(gen)
screen_id = None
for comp in gen_data.get("outputComponents") or []:
    for screen in (comp.get("design") or {}).get("screens") or []:
        name = screen.get("name", "")
        if "/screens/" in name:
            screen_id = name.split("/screens/")[-1]
            break
print("criteria screen_id:", screen_id)

screen = mcp_call("get_screen", {"name": f"projects/{PROJECT_ID}/screens/{screen_id}", "projectId": PROJECT_ID, "screenId": screen_id}, 31)
screen_data = parse_text_result(screen)

designs = ROOT / ".stitch" / "designs"
public = ROOT / "site" / "public"
html_url = (screen_data.get("htmlCode") or {}).get("downloadUrl")
shot_url = (screen_data.get("screenshot") or {}).get("downloadUrl")
if html_url:
    download(html_url, designs / "criteria.html")
    download(html_url, public / "criteria.html")
    print("Saved criteria.html")
if shot_url:
    download(f"{shot_url}=w{screen_data.get('width', '1280')}", designs / "criteria.png")
    print("Saved criteria.png")
