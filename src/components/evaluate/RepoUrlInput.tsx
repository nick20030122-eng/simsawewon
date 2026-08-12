"use client";

interface RepoUrlInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

const URL_PATTERN = /^(https?:\/\/)?(www\.)?github\.com\/[\w.-]+\/[\w.-]+/i;

export function isValidRepoUrl(value: string): boolean {
  return URL_PATTERN.test(value.trim());
}

export function RepoUrlInput({ value, onChange, disabled }: RepoUrlInputProps) {
  const showError = value.trim().length > 0 && !isValidRepoUrl(value);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="repo-url" className="text-sm font-bold">
        GitHub 공개 레포 주소
      </label>
      <input
        id="repo-url"
        type="url"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="https://github.com/사용자명/레포이름"
        // 조작 가능한 요소이므로 구획선(line)보다 진한 테두리로 경계를 확보한다
        className="w-full border border-line-strong bg-sheet px-4 py-3 font-mono text-sm placeholder:text-ink-soft focus:border-ink disabled:opacity-60"
        aria-invalid={showError}
        aria-describedby={showError ? "repo-url-error repo-url-hint" : "repo-url-hint"}
      />
      {showError && (
        <p id="repo-url-error" role="alert" className="text-xs text-seal">
          github.com/사용자명/레포이름 형식의 공개 레포 주소를 입력해 주세요.
        </p>
      )}
      <p id="repo-url-hint" className="text-xs text-ink-soft">
        레포에서 기획서와 소스 코드를 자동으로 수집합니다(언어 무관). 비공개 레포는
        읽을 수 없습니다.
      </p>
    </div>
  );
}
