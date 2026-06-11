"""GitHub 공개 레포에서 README·소스 코드 수집."""

from __future__ import annotations

import base64
import json
import os
import re
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

API_BASE = "https://api.github.com"
RAW_BASE = "https://raw.githubusercontent.com"

MAX_README_CHARS = 80_000
MAX_CODE_CHARS = 120_000
MAX_FILES = 25
MAX_FILE_CHARS = 40_000
REQUEST_TIMEOUT = 30

SKIP_DIR_PARTS = {
    ".git",
    ".github",
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    "dist",
    "build",
    ".eggs",
    "site-packages",
}

PRIORITY_FILENAMES = (
    "app.py",
    "main.py",
    "streamlit_app.py",
    "requirements.txt",
    "pyproject.toml",
    "setup.py",
    "Pipfile",
    "environment.yml",
)

README_NAMES = (
    "readme.md",
    "readme.markdown",
    "readme.txt",
    "readme",
)


class RepoFetchError(Exception):
    """레포 수집 실패 — 사용자에게 그대로 표시."""


@dataclass
class RepoSnapshot:
    owner: str
    repo: str
    branch: str
    repo_url: str
    readme: str
    code_bundle: str
    files_included: list[str]


def parse_github_url(url: str) -> tuple[str, str, str | None]:
    """GitHub 레포 URL → (owner, repo, branch|None)."""
    cleaned = url.strip()
    if not cleaned:
        raise RepoFetchError("GitHub 레포 URL을 입력해 주세요.")

    if not re.match(r"^https?://", cleaned, re.IGNORECASE):
        cleaned = f"https://{cleaned}"

    parsed = urlparse(cleaned)
    host = (parsed.hostname or "").lower().removeprefix("www.")
    if host != "github.com":
        raise RepoFetchError(
            "지원하는 주소는 GitHub 공개 레포(https://github.com/사용자/레포)입니다."
        )

    parts = [p for p in parsed.path.strip("/").split("/") if p]
    if len(parts) < 2:
        raise RepoFetchError(
            "레포 URL 형식이 올바르지 않습니다. 예: https://github.com/사용자/프로젝트"
        )

    owner, repo = parts[0], parts[1]
    if repo.endswith(".git"):
        repo = repo[:-4]

    branch: str | None = None
    if len(parts) >= 4 and parts[2] == "tree":
        branch = parts[3]

    if not re.fullmatch(r"[A-Za-z0-9_.-]+", owner) or not re.fullmatch(
        r"[A-Za-z0-9_.-]+", repo
    ):
        raise RepoFetchError("GitHub 사용자명 또는 레포 이름이 올바르지 않습니다.")

    return owner, repo, branch


def _api_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "innocurve-judge-bot",
    }
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _api_get(path: str) -> dict | list:
    url = f"{API_BASE}{path}"
    req = Request(url, headers=_api_headers())
    try:
        with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        if exc.code == 404:
            raise RepoFetchError(
                "레포를 찾을 수 없습니다. URL이 맞는지, **공개(public)** 레포인지 확인해 주세요."
            ) from exc
        if exc.code == 403:
            raise RepoFetchError(
                "GitHub API 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요."
            ) from exc
        raise RepoFetchError(f"GitHub API 오류 (HTTP {exc.code})") from exc
    except URLError as exc:
        raise RepoFetchError(
            "GitHub에 연결할 수 없습니다. 네트워크 연결을 확인해 주세요."
        ) from exc


def _fetch_default_branch(owner: str, repo: str) -> str:
    meta = _api_get(f"/repos/{owner}/{repo}")
    branch = meta.get("default_branch")
    if not branch:
        raise RepoFetchError("레포의 기본 브랜치를 확인할 수 없습니다.")
    return str(branch)


def _decode_content(data: dict) -> str:
    content = data.get("content", "")
    if data.get("encoding") == "base64" and content:
        raw = base64.b64decode(content)
        return raw.decode("utf-8", errors="replace")
    return str(content)


def _fetch_readme(owner: str, repo: str, branch: str) -> str:
    try:
        payload = _api_get(f"/repos/{owner}/{repo}/readme?ref={branch}")
        text = _decode_content(payload).strip()
        if text:
            return text[:MAX_README_CHARS]
    except RepoFetchError:
        pass

    tree = _api_get(f"/repos/{owner}/{repo}/git/trees/{branch}?recursive=1")
    entries = tree.get("tree", [])
    readme_path = None
    for item in entries:
        if item.get("type") != "blob":
            continue
        path = str(item.get("path", ""))
        if path.rsplit("/", 1)[-1].lower() in README_NAMES:
            readme_path = path
            break

    if not readme_path:
        raise RepoFetchError(
            "레포에서 README를 찾을 수 없습니다. README.md를 추가해 주세요."
        )

    text = _fetch_raw_file(owner, repo, branch, readme_path).strip()
    if not text:
        raise RepoFetchError("README 파일을 읽을 수 없습니다.")
    return text[:MAX_README_CHARS]


def _fetch_raw_file(owner: str, repo: str, branch: str, path: str) -> str:
    url = f"{RAW_BASE}/{owner}/{repo}/{branch}/{path}"
    req = Request(url, headers={"User-Agent": "innocurve-judge-bot"})
    try:
        with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except HTTPError as exc:
        if exc.code == 404:
            return ""
        raise RepoFetchError(f"파일을 읽을 수 없습니다: {path}") from exc
    except URLError as exc:
        raise RepoFetchError("GitHub에서 파일을 가져오지 못했습니다.") from exc


def _should_skip_path(path: str) -> bool:
    parts = path.replace("\\", "/").split("/")
    return any(part in SKIP_DIR_PARTS for part in parts)


def _file_priority(path: str) -> tuple[int, int, str]:
    name = path.rsplit("/", 1)[-1]
    depth = path.count("/")
    try:
        prio = PRIORITY_FILENAMES.index(name)
    except ValueError:
        prio = len(PRIORITY_FILENAMES)
    return (prio, depth, path.lower())


def _select_repo_files(tree_entries: list[dict]) -> list[str]:
    candidates: list[str] = []
    for item in tree_entries:
        if item.get("type") != "blob":
            continue
        path = str(item.get("path", ""))
        if _should_skip_path(path):
            continue
        lower = path.lower()
        if lower.endswith(".py") or lower.rsplit("/", 1)[-1] in PRIORITY_FILENAMES:
            candidates.append(path)

    candidates.sort(key=_file_priority)
    return candidates[:MAX_FILES]


def _build_code_bundle(
    owner: str, repo: str, branch: str, paths: list[str]
) -> tuple[str, list[str]]:
    included: list[str] = []
    chunks: list[str] = [
        f"# Repository: {owner}/{repo} @ {branch}",
        "# 아래는 심사용으로 수집한 레포 파일입니다.",
        "",
    ]
    total = 0

    for path in paths:
        if total >= MAX_CODE_CHARS:
            break
        content = _fetch_raw_file(owner, repo, branch, path).strip()
        if not content:
            continue
        if len(content) > MAX_FILE_CHARS:
            content = content[:MAX_FILE_CHARS] + "\n# ... (파일이 길어 일부만 포함)\n"

        block = f"\n=== {path} ===\n{content}\n"
        if total + len(block) > MAX_CODE_CHARS:
            remain = MAX_CODE_CHARS - total
            if remain < 200:
                break
            block = block[:remain] + "\n# ... (전체 코드 용량 제한으로 생략)\n"

        chunks.append(block)
        included.append(path)
        total += len(block)

    bundle = "\n".join(chunks).strip()
    return bundle, included


def fetch_github_repo(url: str) -> RepoSnapshot:
    """공개 GitHub 레포에서 README와 핵심 소스를 수집."""
    owner, repo, branch_hint = parse_github_url(url)
    branch = branch_hint or _fetch_default_branch(owner, repo)

    readme = _fetch_readme(owner, repo, branch)

    tree = _api_get(f"/repos/{owner}/{repo}/git/trees/{branch}?recursive=1")
    selected = _select_repo_files(tree.get("tree", []))
    code_bundle, included = _build_code_bundle(owner, repo, branch, selected)

    if not code_bundle or not re.search(
        r"\b(import|def |class |streamlit|st\.)", code_bundle, re.IGNORECASE
    ):
        raise RepoFetchError(
            "레포에서 Python 실행 코드(.py)를 찾을 수 없습니다. "
            "app.py 등 Streamlit 진입점이 포함된 공개 레포인지 확인해 주세요."
        )

    canonical_url = f"https://github.com/{owner}/{repo}"
    return RepoSnapshot(
        owner=owner,
        repo=repo,
        branch=branch,
        repo_url=canonical_url,
        readme=readme,
        code_bundle=code_bundle,
        files_included=included,
    )
