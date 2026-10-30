#!/usr/bin/env python3
"""Validate NetMate commit subjects without depending on the active AI client."""

import re
import sys
import unicodedata
from pathlib import Path

SCOPES = frozenset(
    "desktop mobile shared ci release docs chore build test deps repo".split()
)
CONVENTIONAL = re.compile(
    r"(?:feat|fix|docs|style|refactor|perf|test|chore)\(([a-z]+)\): (\S.*)"
)
LEGACY = re.compile(r"([a-z]+(?:\+[a-z]+)*): (\S.*)")
SPECIAL = re.compile(r"(?:Merge|Revert|fixup!|squash!|amend!) .+")
SCISSORS = "# ------------------------ >8 ------------------------"


def validate_message(message: str) -> None:
    """Keep legacy scopes while accepting the global type(scope) convention."""
    lines = message.replace("\r\n", "\n").split("\n")
    header = lines[0]
    # Preserve the repository's existing Git-generated message exception.
    if SPECIAL.fullmatch(header):
        return
    match = CONVENTIONAL.fullmatch(header) or LEGACY.fullmatch(header)
    if not match:
        raise ValueError(
            "提交信息格式不正确；推荐 <type>(<scope>): 中文主题，"
            "例如 fix(shared): 修复自动重连。兼容旧式 scope(+scope): 中文主题。"
        )
    if not set(match[1].split("+")) <= SCOPES:
        raise ValueError("提交范围不正确；scope 可取 " + " / ".join(sorted(SCOPES)))
    if not any(
        unicodedata.name(character, "").startswith(
            ("CJK UNIFIED IDEOGRAPH-", "CJK COMPATIBILITY IDEOGRAPH-")
        )
        for character in match[2]
    ):
        raise ValueError("提交主题必须包含中文汉字；café、重音字母和 emoji 不算中文。")
    if re.search(r"(?:co-authored-by|signed-off-by):", header, re.IGNORECASE):
        raise ValueError("提交信息不能包含尾签。")
    for line in lines[1:]:
        if line == SCISSORS:
            break
        if line.strip() and not line.startswith("#"):
            raise ValueError("提交信息只能有一行，不能包含正文或尾签。")


def main() -> int:
    try:
        validate_message(Path(sys.argv[1]).read_text(encoding="utf-8"))
    except (IndexError, OSError, ValueError) as error:
        print(f"提交信息校验失败：{error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
