// 기존 tests/test_repo_fetcher.py 케이스 동등 이식
import { afterEach, describe, expect, it } from "vitest";
import {
  filePriority,
  findPlanPath,
  findReadmePath,
  parseGithubUrl,
  rateLimitMessage,
  selectRepoFiles,
} from "@/lib/github";
import { RepoFetchError } from "@/judge/types";

const originalToken = process.env.GITHUB_TOKEN;

afterEach(() => {
  if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = originalToken;
});

describe("parseGithubUrl", () => {
  it("기본 URL 파싱", () => {
    const { owner, repo, branch } = parseGithubUrl("https://github.com/octocat/Hello-World");
    expect(owner).toBe("octocat");
    expect(repo).toBe("Hello-World");
    expect(branch).toBeNull();
  });

  it("tree 경로에서 브랜치 추출", () => {
    const { owner, repo, branch } = parseGithubUrl(
      "https://github.com/octocat/Hello-World/tree/develop",
    );
    expect(owner).toBe("octocat");
    expect(repo).toBe("Hello-World");
    expect(branch).toBe("develop");
  });

  it("슬래시 포함 브랜치명 보존 (tree/release/v2)", () => {
    const { branch } = parseGithubUrl(
      "https://github.com/octocat/Hello-World/tree/release/v2",
    );
    expect(branch).toBe("release/v2");
  });

  it("스킴 없는 URL 허용", () => {
    const { owner, repo } = parseGithubUrl("github.com/foo/bar");
    expect(owner).toBe("foo");
    expect(repo).toBe("bar");
  });

  it("github.com 외 호스트 거부", () => {
    expect(() => parseGithubUrl("https://gitlab.com/foo/bar")).toThrow(RepoFetchError);
  });
});

describe("파일 선택", () => {
  it("app.py 우선, node_modules 제외", () => {
    const tree = [
      { type: "blob", path: "utils/helper.py" },
      { type: "blob", path: "app.py" },
      { type: "blob", path: "requirements.txt" },
      { type: "blob", path: "node_modules/x.py" },
    ];
    const selected = selectRepoFiles(tree);
    expect(selected[0]).toBe("app.py");
    expect(selected).toContain("requirements.txt");
    expect(selected).not.toContain("node_modules/x.py");
  });

  it("언어 중립 — js/ts/html 소스 수집, 락파일·min·d.ts 제외", () => {
    const tree = [
      { type: "blob", path: "src/App.tsx" },
      { type: "blob", path: "index.html" },
      { type: "blob", path: "server.js" },
      { type: "blob", path: "package.json" },
      { type: "blob", path: "package-lock.json" },
      { type: "blob", path: "assets/vendor.min.js" },
      { type: "blob", path: "types/global.d.ts" },
    ];
    const selected = selectRepoFiles(tree);
    expect(selected).toContain("src/App.tsx");
    expect(selected).toContain("index.html");
    expect(selected).toContain("server.js");
    expect(selected).toContain("package.json");
    expect(selected).not.toContain("package-lock.json");
    expect(selected).not.toContain("assets/vendor.min.js");
    expect(selected).not.toContain("types/global.d.ts");
  });

  it("루트 파일이 하위 경로보다 우선", () => {
    const [pa, da] = filePriority("app.py");
    const [pb, db] = filePriority("src/app.py");
    expect(pa <= pb && da < db).toBe(true);
  });

  it("README 경로 탐색", () => {
    const tree = [
      { type: "blob", path: "docs/guide.md" },
      { type: "blob", path: "README.md" },
    ];
    expect(findReadmePath(tree)).toBe("README.md");
  });
});

describe("findPlanPath — 기획서 자동 탐색", () => {
  it("PLAN.md 우선, README 제외", () => {
    const tree = [
      { type: "blob", path: "README.md" },
      { type: "blob", path: "docs/기획서.md" },
      { type: "blob", path: "specs/PLAN.md" },
    ];
    expect(findPlanPath(tree)).toBe("specs/PLAN.md");
  });

  it("얕은 경로 우선", () => {
    const tree = [
      { type: "blob", path: "docs/deep/plan.md" },
      { type: "blob", path: "PLAN.md" },
    ];
    expect(findPlanPath(tree)).toBe("PLAN.md");
  });

  it("기획서 포함 파일명 인정 (예: 최종_기획서.md)", () => {
    const tree = [{ type: "blob", path: "docs/최종_기획서.md" }];
    expect(findPlanPath(tree)).toBe("docs/최종_기획서.md");
  });

  it("없으면 null, node_modules 제외", () => {
    expect(findPlanPath([{ type: "blob", path: "app.py" }])).toBeNull();
    expect(findPlanPath([{ type: "blob", path: "node_modules/plan.md" }])).toBeNull();
  });
});

describe("rate limit 안내", () => {
  it("토큰 미설정 시 GITHUB_TOKEN 안내 포함", () => {
    delete process.env.GITHUB_TOKEN;
    const msg = rateLimitMessage();
    expect(msg).toContain("GITHUB_TOKEN");
    expect(msg).toContain("60");
  });
});
