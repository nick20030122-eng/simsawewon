"""GitHub URL 파싱·파일 선택 테스트."""

from __future__ import annotations

import pytest

from judge.repo_fetcher import (
    RepoFetchError,
    _file_priority,
    _find_readme_path,
    _rate_limit_message,
    _select_repo_files,
    parse_github_url,
)


def test_parse_github_url_basic() -> None:
    owner, repo, branch = parse_github_url("https://github.com/octocat/Hello-World")
    assert owner == "octocat"
    assert repo == "Hello-World"
    assert branch is None


def test_parse_github_url_with_branch() -> None:
    owner, repo, branch = parse_github_url(
        "https://github.com/octocat/Hello-World/tree/develop"
    )
    assert owner == "octocat"
    assert repo == "Hello-World"
    assert branch == "develop"


def test_parse_github_url_without_scheme() -> None:
    owner, repo, _ = parse_github_url("github.com/foo/bar")
    assert owner == "foo"
    assert repo == "bar"


def test_parse_github_url_invalid_host() -> None:
    with pytest.raises(RepoFetchError):
        parse_github_url("https://gitlab.com/foo/bar")


def test_select_repo_files_prioritizes_app_py() -> None:
    tree = [
        {"type": "blob", "path": "utils/helper.py"},
        {"type": "blob", "path": "app.py"},
        {"type": "blob", "path": "requirements.txt"},
        {"type": "blob", "path": "node_modules/x.py"},
    ]
    selected = _select_repo_files(tree)
    assert selected[0] == "app.py"
    assert "requirements.txt" in selected
    assert "node_modules/x.py" not in selected


def test_file_priority_root_before_nested() -> None:
    assert _file_priority("app.py") < _file_priority("src/app.py")


def test_find_readme_path() -> None:
    tree = [
        {"type": "blob", "path": "docs/guide.md"},
        {"type": "blob", "path": "README.md"},
    ]
    assert _find_readme_path(tree) == "README.md"


def test_rate_limit_message_without_token() -> None:
    msg = _rate_limit_message()
    assert "GITHUB_TOKEN" in msg
    assert "60" in msg
