import json
import os
import time
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
    raise SystemExit("STITCH_API_KEY not found. Set env or configure stitch in ~/.cursor/mcp.json")


API_KEY = load_api_key()

PROMPT = """Desktop web app UI for "심사위원 챗봇" (AI Judge Chatbot for vibe-coding verification).

**DESIGN SYSTEM (REQUIRED):**
- Dark mode only
- Background: diagonal gradient black-navy with subtle blue (top-left) and rose (bottom-right) radial glows
- Font: Inter or Geist, Korean-friendly
- Cards: glassmorphism, 14px radius, thin blue border rgba(90,130,210,0.18)
- Primary button: blue gradient, full width
- Accent colors: blue #5eb3ff (public sector), cyan (README), rose #ff6b7a (code)
- Hero title gradient text: blue → lavender → rose
- Professional Korean public-sector SaaS aesthetic
- INNOCURVE AI logo text top-left

**Page Structure:**
1. Top-left: INNOCURVE AI logo
2. Center hero: title "⚖️ 심사위원 챗봇", subtitle "공공기관 적합성 · 의도 구현도 · README 품질 — 3대 분야 심사"
3. Tab bar: "채점" (active) | "채점 기준"
4. Caption: "README와 실행 코드(app.py)는 동일한 프로젝트를 설명하도록 맞춰 제출해 주시면 보다 정확한 심사가 가능합니다. 세 분야는 각각 독립적으로 평가됩니다."
5. Three upload cards in a row:
   - 📋 기획서 (요구사항 · 성공 기준) — file upload + textarea
   - 📄 README (설치 · 실행 · 구조) — file upload + textarea
   - ⚙️ 실행 코드 (app.py) — file upload + textarea
6. Full-width primary button: "심사 시작"
7. Empty results placeholder section below

Use Korean labels throughout. Tailwind CSS. Desktop 1280px."""


def mcp_call(tool: str, arguments: dict, req_id: int = 1) -> dict:
    payload = {
        "jsonrpc": "2.0",
        "id": req_id,
        "method": "tools/call",
        "params": {"name": tool, "arguments": arguments},
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        MCP_URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "X-Goog-Api-Key": API_KEY,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        body = resp.read().decode("utf-8")
    return json.loads(body)


def parse_text_result(response: dict) -> dict:
    content = response.get("result", {}).get("content", [])
    if not content:
        return response.get("result", {}).get("structuredContent", {})
    text = content[0].get("text", "{}")
    return json.loads(text)


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        dest.write_bytes(resp.read())


def main() -> None:
    print("Generating screen (may take a few minutes)...")
    gen = mcp_call(
        "generate_screen_from_text",
        {
            "projectId": PROJECT_ID,
            "prompt": PROMPT,
            "deviceType": "DESKTOP",
            "modelId": "GEMINI_3_1_PRO",
        },
        req_id=10,
    )
    gen_data = parse_text_result(gen)
    print("generate response keys:", list(gen_data.keys()) if isinstance(gen_data, dict) else gen_data)

    screen_id = None
    output = gen_data.get("outputComponents") or []
    for comp in output:
        design = comp.get("design") or {}
        for screen in design.get("screens") or []:
            name = screen.get("name", "")
            if "/screens/" in name:
                screen_id = name.split("/screens/")[-1]
                break
            if screen.get("id"):
                screen_id = screen["id"]
        if screen_id:
            break

    if not screen_id:
        print("Polling get_project for screen...")
        for _ in range(12):
            time.sleep(15)
            proj = mcp_call("get_project", {"name": f"projects/{PROJECT_ID}"}, req_id=20)
            proj_data = parse_text_result(proj)
            for inst in proj_data.get("screenInstances") or []:
                src = inst.get("sourceScreen") or ""
                if "/screens/" in src:
                    screen_id = src.split("/screens/")[-1]
                    break
            if screen_id:
                break

    if not screen_id:
        (ROOT / ".stitch" / "generate-response.json").write_text(
            json.dumps(gen_data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        raise SystemExit("Could not find screen id; saved generate-response.json")

    print("screen_id:", screen_id)
    screen = mcp_call(
        "get_screen",
        {
            "name": f"projects/{PROJECT_ID}/screens/{screen_id}",
            "projectId": PROJECT_ID,
            "screenId": screen_id,
        },
        req_id=30,
    )
    screen_data = parse_text_result(screen)

    meta = {
        "projectId": PROJECT_ID,
        "screenId": screen_id,
        "title": screen_data.get("title"),
        "width": screen_data.get("width"),
        "height": screen_data.get("height"),
    }
    (ROOT / ".stitch" / "metadata.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    designs = ROOT / ".stitch" / "designs"
    designs.mkdir(parents=True, exist_ok=True)
    public = ROOT / "site" / "public"
    public.mkdir(parents=True, exist_ok=True)

    html_url = (screen_data.get("htmlCode") or {}).get("downloadUrl")
    shot_url = (screen_data.get("screenshot") or {}).get("downloadUrl")
    width = screen_data.get("width") or "1280"

    if html_url:
        download(html_url, designs / "index.html")
        download(html_url, public / "index.html")
        print("Saved HTML to site/public/index.html")

    if shot_url:
        if "=w" not in shot_url:
            shot_url = f"{shot_url}=w{width}"
        download(shot_url, designs / "index.png")
        print("Saved screenshot to .stitch/designs/index.png")

    print("DONE")


if __name__ == "__main__":
    main()
