"""Synthetic log-report security tests. Never touch real application logs."""
import base64
import hashlib
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


class LogReportSecurity(unittest.TestCase):
    def test_generated_report_is_offline_and_has_hashed_style_policy(self):
        with tempfile.TemporaryDirectory(prefix="cryptokeep-log-test-") as directory:
            folder = Path(directory)
            shutil.copy2(ROOT / "export_log.py", folder / "export_log.py")
            (folder / "vault_local.log").write_text(
                "[2026-10-14] Synthetic information only\n", encoding="utf-8"
            )
            result = subprocess.run(
                [sys.executable, str(folder / "export_log.py")],
                cwd=str(folder), capture_output=True, text=True, timeout=10
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            html = (folder / "export-log.html").read_text(encoding="utf-8")
            self.assertNotIn("fonts.googleapis.com", html)
            self.assertNotRegex(html, r'<(?:link|script|img)[^>]+(?:src|href)="https?://')
            self.assertIn('http-equiv="Content-Security-Policy"', html)
            self.assertIn("connect-src 'none'", html)
            style = re.search(r"<style>(.*?)</style>", html, re.S)
            self.assertIsNotNone(style)
            hash_value = base64.b64encode(
                hashlib.sha256(style.group(1).encode("utf-8")).digest()
            ).decode("ascii")
            self.assertIn(f"style-src 'sha256-{hash_value}'", html)
            self.assertIn("Synthetic information only", html)


if __name__ == "__main__":
    unittest.main()
