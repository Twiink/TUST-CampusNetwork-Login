#!/usr/bin/env python3
"""Enforce the global commit-message convention in the project Git hook."""

import re
import sys
import unicodedata
from pathlib import Path

HEADER = re.compile(
    r"(?:feat|fix|docs|style|refactor|perf|test|chore)\([A-Za-z0-9_-]+\): (\S.*)"
)
SPECIAL = re.compile(r"(?:Merge|Revert|fixup!|squash!|amend!) .+")


def validate_message(message: str) -> str:
    """Match the global policy, including its Unicode and special-header rules."""
    text = message.rstrip("\r\n")
    if not text or "\n" in text or "\r" in text:
        raise ValueError("提交信息只能有一行，不能包含正文或尾签。")
    if re.search(r"(?:co-authored-by|signed-off-by):", text, re.IGNORECASE):
        raise ValueError("提交信息不能包含自动署名或尾签。")
    if SPECIAL.fullmatch(text):
        return text
    match = HEADER.fullmatch(text)
    if not match:
        raise ValueError(
            "格式须为 <type>(<scope>): 中文主题；scope 必填且只含英文字母、数字、_、-。"
        )
    if not any(
        unicodedata.name(character, "").startswith(
            ("CJK UNIFIED IDEOGRAPH-", "CJK COMPATIBILITY IDEOGRAPH-")
        )
        for character in match[1]
    ):
        raise ValueError("提交主题必须包含中文汉字；café、重音字母和 emoji 不算中文。")
    return text


def main() -> int:
    try:
        validate_message(Path(sys.argv[1]).read_text(encoding="utf-8"))
    except (IndexError, OSError, ValueError) as error:
        print(f"提交信息校验失败：{error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
