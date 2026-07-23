// Design Ref: §2.2 [stage: fetching] — GitHub 공개 레포 수집. judge/repo_fetcher.py 동등 이식
// (수집 규칙: 최대 25파일/120K자, 5분 캐시, GITHUB_TOKEN, rate-limit 안내)
import { RepoFetchError, type RepoSnapshot } from "@/judge/types";

const API_BASE = "https://api.github.com";
const RAW_BASE = "https://raw.githubusercontent.com";

const MAX_README_CHARS = 80_000;
const MAX_CODE_CHARS = 120_000;
const MAX_FILES = 25;
const MAX_FILE_CHARS = 40_000;
const REQUEST_TIMEOUT_MS = 30_000;
const API_CACHE_TTL_MS = 300_000;

const SKIP_DIR_PARTS = new Set([
  ".git", ".github", ".venv", "venv", "node_modules", "__pycache__",
  "dist", "build", ".eggs", "site-packages",
]);

// 진입점·매니페스트 우선 수집 (언어 불문)
const PRIORITY_FILENAMES = [
  "app.py", "main.py", "streamlit_app.py", "index.html", "app.js", "main.js",
  "server.js", "index.js", "app.ts", "main.ts", "index.ts", "package.json",
  "requirements.txt", "pyproject.toml", "setup.py", "Pipfile", "environment.yml",
] as const;

// 소스로 인정하는 확장자 (언어 중립)
const SOURCE_EXTENSIONS = new Set([
  ".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".html", ".css",
  ".java", ".kt", ".go", ".rs", ".rb", ".php", ".c", ".cpp", ".h", ".cs",
  ".swift", ".sql", ".sh", ".vue", ".svelte",
]);

// 소스처럼 보이지만 심사 가치가 없는 파일
const EXCLUDED_FILENAMES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
]);

function isSourceCandidate(lowerPath: string): boolean {
  const name = lowerPath.split("/").pop() ?? lowerPath;
  if (EXCLUDED_FILENAMES.has(name)) return false;
  if (name.endsWith(".min.js") || name.endsWith(".min.css") || name.endsWith(".d.ts")) {
    return false;
  }
  if ((PRIORITY_FILENAMES as readonly string[]).includes(name)) return true;
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return SOURCE_EXTENSIONS.has(name.slice(dot));
}

const README_NAMES = new Set(["readme.md", "readme.markdown", "readme.txt", "readme"]);

// 기획서 파일 자동 탐색 — 관례적 파일명 우선순위
const PLAN_FILENAMES = ["plan.md", "기획서.md", "planning.md", "plan.txt", "기획서.txt"];
const MAX_PLAN_CHARS = 80_000;

interface TreeEntry {
  type?: string;
  path?: string;
}

const apiCache = new Map<string, { at: number; payload: unknown }>();

function hasGithubToken(): boolean {
  return Boolean(process.env.GITHUB_TOKEN?.trim());
}

function apiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "innocurve-judge-bot",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function rateLimitMessage(): string {
  if (hasGithubToken()) {
    return "GitHub API 요청 한도에 도달했습니다. 5~10분 후 다시 시도해 주세요.";
  }
  return (
    "GitHub API 요청 한도에 도달했습니다. " +
    "토큰 없이는 클라우드 서버(Render 등)에서 **시간당 약 60회**만 허용되며, " +
    "여러 이용자가 같은 서버를 쓰면 금방 한도에 걸릴 수 있습니다. " +
    "5~10분 후 다시 시도하거나, 운영자에게 Render 환경변수 `GITHUB_TOKEN` 등록을 요청해 주세요. " +
    "(공개 레포 읽기용 토큰, 필수는 아니지만 한도가 크게 늘어납니다.)"
  );
}

export function parseGithubUrl(url: string): {
  owner: string;
  repo: string;
  branch: string | null;
} {
  let cleaned = url.trim();
  if (!cleaned) throw new RepoFetchError("GitHub 레포 URL을 입력해 주세요.");

  if (!/^https?:\/\//i.test(cleaned)) cleaned = `https://${cleaned}`;

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new RepoFetchError(
      "레포 URL 형식이 올바르지 않습니다. 예: https://github.com/사용자/프로젝트",
    );
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "github.com") {
    throw new RepoFetchError(
      "지원하는 주소는 GitHub 공개 레포(https://github.com/사용자/레포)입니다.",
    );
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new RepoFetchError(
      "레포 URL 형식이 올바르지 않습니다. 예: https://github.com/사용자/프로젝트",
    );
  }

  const owner = parts[0];
  let repo = parts[1];
  if (repo.endsWith(".git")) repo = repo.slice(0, -4);

  let branch: string | null = null;
  // 브랜치명에 슬래시 포함 가능 (예: tree/release/v2)
  if (parts.length >= 4 && parts[2] === "tree") branch = parts.slice(3).join("/");

  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new RepoFetchError("GitHub 사용자명 또는 레포 이름이 올바르지 않습니다.");
  }

  return { owner, repo, branch };
}

async function fetchWithTimeout(url: string, headers: Record<string, string>) {
  try {
    return await fetch(url, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new RepoFetchError("GitHub에 연결할 수 없습니다. 네트워크 연결을 확인해 주세요.");
  }
}

async function apiGet(apiPath: string): Promise<unknown> {
  const now = Date.now();
  const cached = apiCache.get(apiPath);
  if (cached && now - cached.at < API_CACHE_TTL_MS) return cached.payload;

  const resp = await fetchWithTimeout(`${API_BASE}${apiPath}`, apiHeaders());

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    if (resp.status === 404) {
      throw new RepoFetchError(
        "레포를 찾을 수 없습니다. URL이 맞는지, **공개(public)** 레포인지 확인해 주세요.",
      );
    }
    const rateLimited =
      resp.headers.get("X-RateLimit-Remaining") === "0" ||
      /rate limit|api rate limit exceeded/i.test(body);
    if (resp.status === 403 && rateLimited) {
      throw new RepoFetchError(rateLimitMessage());
    }
    if (resp.status === 403) {
      throw new RepoFetchError(
        "GitHub에서 이 레포에 접근할 수 없습니다. " +
          "비공개 레포이거나 권한이 없습니다. **공개(public)** 레포 URL인지 확인해 주세요.",
      );
    }
    throw new RepoFetchError(`GitHub API 오류 (HTTP ${resp.status})`);
  }

  const payload: unknown = await resp.json();
  apiCache.set(apiPath, { at: now, payload });
  return payload;
}

async function fetchDefaultBranch(owner: string, repo: string): Promise<string> {
  const meta = (await apiGet(`/repos/${owner}/${repo}`)) as { default_branch?: string };
  if (!meta.default_branch) {
    throw new RepoFetchError("레포의 기본 브랜치를 확인할 수 없습니다.");
  }
  return meta.default_branch;
}

async function fetchRawFile(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
): Promise<string> {
  const url = `${RAW_BASE}/${owner}/${repo}/${branch}/${filePath}`;
  const resp = await fetchWithTimeout(url, { "User-Agent": "innocurve-judge-bot" });
  if (resp.status === 404) return "";
  if (!resp.ok) throw new RepoFetchError(`파일을 읽을 수 없습니다: ${filePath}`);
  return resp.text();
}

export function findReadmePath(entries: TreeEntry[]): string | null {
  for (const item of entries) {
    if (item.type !== "blob") continue;
    const p = String(item.path ?? "");
    const name = p.split("/").pop()?.toLowerCase() ?? "";
    if (README_NAMES.has(name)) return p;
  }
  return null;
}

/** 레포 내 기획서 파일 경로 탐색 — 우선순위 파일명 > 얕은 경로 > 사전순. 없으면 null */
export function findPlanPath(entries: TreeEntry[]): string | null {
  const candidates: string[] = [];
  for (const item of entries) {
    if (item.type !== "blob") continue;
    const p = String(item.path ?? "");
    if (shouldSkipPath(p)) continue;
    const name = p.split("/").pop()?.toLowerCase() ?? "";
    if (README_NAMES.has(name)) continue;
    const isNamed = PLAN_FILENAMES.includes(name);
    const mentionsPlan = /기획서/.test(name) && /\.(md|txt)$/.test(name);
    if (isNamed || mentionsPlan) candidates.push(p);
  }
  candidates.sort((a, b) => {
    const nameA = a.split("/").pop()?.toLowerCase() ?? "";
    const nameB = b.split("/").pop()?.toLowerCase() ?? "";
    const prioA = PLAN_FILENAMES.indexOf(nameA);
    const prioB = PLAN_FILENAMES.indexOf(nameB);
    const rankA = prioA === -1 ? PLAN_FILENAMES.length : prioA;
    const rankB = prioB === -1 ? PLAN_FILENAMES.length : prioB;
    if (rankA !== rankB) return rankA - rankB;
    const depthA = (a.match(/\//g) ?? []).length;
    const depthB = (b.match(/\//g) ?? []).length;
    if (depthA !== depthB) return depthA - depthB;
    return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
  });
  return candidates[0] ?? null;
}

async function fetchReadme(
  owner: string,
  repo: string,
  branch: string,
  entries: TreeEntry[],
): Promise<string> {
  // raw 우선, API /readme는 최후 수단 (API 호출 1회 절약)
  const readmePath = findReadmePath(entries);
  if (readmePath) {
    const text = (await fetchRawFile(owner, repo, branch, readmePath)).trim();
    if (text) return text.slice(0, MAX_README_CHARS);
  }

  for (const guess of ["README.md", "readme.md", "Readme.md"]) {
    const text = (await fetchRawFile(owner, repo, branch, guess)).trim();
    if (text) return text.slice(0, MAX_README_CHARS);
  }

  try {
    const payload = (await apiGet(`/repos/${owner}/${repo}/readme?ref=${branch}`)) as {
      content?: string;
      encoding?: string;
    };
    if (payload.encoding === "base64" && payload.content) {
      const text = Buffer.from(payload.content, "base64").toString("utf-8").trim();
      if (text) return text.slice(0, MAX_README_CHARS);
    }
  } catch (error) {
    if (!(error instanceof RepoFetchError)) throw error;
  }

  throw new RepoFetchError("레포에서 README를 찾을 수 없습니다. README.md를 추가해 주세요.");
}

function shouldSkipPath(filePath: string): boolean {
  return filePath
    .replaceAll("\\", "/")
    .split("/")
    .some((part) => SKIP_DIR_PARTS.has(part));
}

export function filePriority(filePath: string): [number, number, string] {
  const name = filePath.split("/").pop() ?? filePath;
  const depth = (filePath.match(/\//g) ?? []).length;
  const index = (PRIORITY_FILENAMES as readonly string[]).indexOf(name);
  const prio = index === -1 ? PRIORITY_FILENAMES.length : index;
  return [prio, depth, filePath.toLowerCase()];
}

export function selectRepoFiles(entries: TreeEntry[]): string[] {
  const candidates: string[] = [];
  for (const item of entries) {
    if (item.type !== "blob") continue;
    const p = String(item.path ?? "");
    if (shouldSkipPath(p)) continue;
    if (isSourceCandidate(p.toLowerCase())) candidates.push(p);
  }
  candidates.sort((a, b) => {
    const [pa, da, sa] = filePriority(a);
    const [pb, db, sb] = filePriority(b);
    if (pa !== pb) return pa - pb;
    if (da !== db) return da - db;
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
  return candidates.slice(0, MAX_FILES);
}

async function buildCodeBundle(
  owner: string,
  repo: string,
  branch: string,
  paths: string[],
): Promise<{ bundle: string; included: string[] }> {
  const included: string[] = [];
  const chunks: string[] = [
    `# Repository: ${owner}/${repo} @ ${branch}`,
    "# 아래는 심사용으로 수집한 레포 파일입니다.",
    "",
  ];
  let total = 0;

  for (const filePath of paths) {
    if (total >= MAX_CODE_CHARS) break;
    let content = (await fetchRawFile(owner, repo, branch, filePath)).trim();
    if (!content) continue;
    if (content.length > MAX_FILE_CHARS) {
      content = content.slice(0, MAX_FILE_CHARS) + "\n# ... (파일이 길어 일부만 포함)\n";
    }

    let block = `\n=== ${filePath} ===\n${content}\n`;
    if (total + block.length > MAX_CODE_CHARS) {
      const remain = MAX_CODE_CHARS - total;
      if (remain < 200) break;
      block = block.slice(0, remain) + "\n# ... (전체 코드 용량 제한으로 생략)\n";
    }

    chunks.push(block);
    included.push(filePath);
    total += block.length;
  }

  return { bundle: chunks.join("\n").trim(), included };
}

/** 공개 GitHub 레포에서 README와 핵심 소스를 수집 */
export async function fetchGithubRepo(url: string): Promise<RepoSnapshot> {
  const { owner, repo, branch: branchHint } = parseGithubUrl(url);
  const branch = branchHint ?? (await fetchDefaultBranch(owner, repo));

  const tree = (await apiGet(
    `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
  )) as { tree?: TreeEntry[] };
  const entries = tree.tree ?? [];

  const readme = await fetchReadme(owner, repo, branch, entries);

  // 기획서 자동 수집 — 없으면 분야1·2 부적격 처리 (evaluator에서 판정)
  const planPath = findPlanPath(entries);
  let plan = "";
  if (planPath) {
    plan = (await fetchRawFile(owner, repo, branch, planPath)).trim().slice(0, MAX_PLAN_CHARS);
  }

  const selected = selectRepoFiles(entries);
  const { bundle, included } = await buildCodeBundle(owner, repo, branch, selected);

  const hasCodeSignal =
    /\b(import|def |class |function|const |let |var |return|export|require|package |fn |func |public |void )\b|=>|<html|<!doctype|<script|<div/i.test(
      bundle,
    );
  if (!bundle || included.length === 0 || !hasCodeSignal) {
    throw new RepoFetchError(
      "레포에서 실행 코드(소스 파일)를 찾을 수 없습니다. " +
        "앱 진입점(app.py, index.html, main.js 등)이 포함된 공개 레포인지 확인해 주세요.",
    );
  }

  return {
    owner,
    repo,
    branch,
    repo_url: `https://github.com/${owner}/${repo}`,
    readme,
    plan,
    plan_path: planPath,
    code_bundle: bundle,
    files_included: included,
  };
}
