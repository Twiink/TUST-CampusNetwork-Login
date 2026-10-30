"""Pure script tests: no build, application startup or Git commit required."""

import itertools
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from validate_commit_message import SCISSORS, validate_message

ROOT = Path(__file__).resolve().parents[2]
ALLOWED_SCOPES = (
    "desktop mobile shared ci release docs chore build test deps repo".split()
)


class MessageTests(unittest.TestCase):
    def test_conventional_messages(self):
        for kind, scope in itertools.product(
            "feat fix docs style refactor perf test chore".split(), ALLOWED_SCOPES
        ):
            with self.subTest(kind=kind, scope=scope):
                validate_message(f"{kind}({scope}): 修复提交校验\n")

    def test_legacy_scope_order(self):
        for first, second in itertools.product(ALLOWED_SCOPES, repeat=2):
            with self.subTest(first=first, second=second):
                validate_message(f"{first}+{second}: 修复范围校验")
        validate_message("ci+docs+desktop: 修复文档")

    def test_real_chinese_in_any_locale(self):
        for subject in ("中文", "𠀀", "豈", "café 界面", "修复 😀"):
            validate_message(f"fix(shared): {subject}")
        for subject in ("café", "😀", "ascii", "　", "é", "カタカナ"):
            with self.subTest(subject=subject), self.assertRaises(ValueError):
                validate_message(f"fix(shared): {subject}")

    def test_bad_syntax_and_unknown_scope(self):
        for header in (
            "",
            "fix: 修复",
            "bug(repo): 修复",
            "feat(ui): 修复",
            "desktop+unknown: 修复",
            "unknown+desktop: 修复",
            "desktop++mobile: 修复",
            "+desktop: 修复",
            "desktop+: 修复",
            "feat(desktop+mobile): 修复",
            "desktop: ",
            "desktop:  修复",
        ):
            with self.subTest(header=header), self.assertRaises(ValueError):
                validate_message(header)

    def test_body_and_trailers(self):
        for suffix in (
            "\n正文",
            "\n\nSigned-off-by: Example",
            "\nCo-Authored-By: Human",
            " Signed-off-by: Example",
            " Co-Authored-By: Human",
        ):
            with self.subTest(suffix=suffix), self.assertRaises(ValueError):
                validate_message("fix(repo): 修复" + suffix)

    def test_editor_comments_and_crlf(self):
        validate_message("fix(repo): 修复\r\n\r\n# comment\r\n")
        validate_message("repo: 修复\n" + SCISSORS + "\nignored diff\n")

    def test_existing_generated_message_exceptions(self):
        for prefix in ("Merge", "Revert", "fixup!", "squash!", "amend!"):
            validate_message(f"{prefix} existing message\n\nExisting Git body")

    def test_real_hook_with_temporary_message(self):
        with tempfile.TemporaryDirectory(prefix="commit message ") as directory:
            path = Path(directory) / "message.txt"
            for message, accepted in (
                ("feat(shared): 四端改为天空主题\n", True),
                ("desktop+mobile: 四端改为天空主题\n", True),
                ("mobile+desktop: 四端改为天空主题\n", True),
                ("ci+docs: 修复文档\n", True),
                ("desktop: café\n", False),
                ("desktop: 😀\n", False),
                ("fix(repo): 修复\n\n正文\n", False),
                ("feat(shared): 修复𠀀字\n", True),
                (
                    "repo: 修复\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n",
                    True,
                ),
                (
                    "repo: 修复\n\nCo-Authored-By: Human <human@example.invalid>\n",
                    False,
                ),
            ):
                with self.subTest(message=message):
                    path.write_text(message, encoding="utf-8")
                    result = subprocess.run(
                        ["sh", str(ROOT / ".githooks/commit-msg"), str(path)],
                        cwd=ROOT,
                        env=dict(os.environ, LC_ALL="C"),
                        capture_output=True,
                        text=True,
                        check=False,
                    )
                    self.assertEqual(result.returncode == 0, accepted, result.stderr)
                    self.assertFalse(path.with_suffix(".txt.bak").exists())
                    if "Claude" in message:
                        self.assertNotIn("Co-Authored-By", path.read_text())


if __name__ == "__main__":
    unittest.main()
