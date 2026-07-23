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
        placeholder="https://github.com/owner/repo"
        className="w-full border border-line bg-sheet px-4 py-3 font-mono text-sm placeholder:text-line-strong focus:border-ink disabled:opacity-60"
        aria-invalid={showError}
      />
      {showError ? (
        <p className="text-xs text-seal">
          github.com/사용자/레포 형식의 공개 레포 주소를 입력해 주세요.
        </p>
      ) : (
        <p className="text-xs text-ink-soft">
          레포에서 기획서·README·소스 코드를 자동으로 수집합니다(언어 무관). 비공개
          레포는 읽을 수 없습니다.
        </p>
      )}
    </div>
  );
}
