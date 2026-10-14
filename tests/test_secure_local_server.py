"""Test the real Python server against only temporary, synthetic assets."""
from functools import partial
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
import tempfile
import threading
import unittest
import importlib.util
import re

SERVER_FILE = Path(__file__).resolve().parent.parent / "scripts" / "secure_local_server.py"
spec = importlib.util.spec_from_file_location("cryptokeep_local_server", SERVER_FILE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SecureServerBoundary(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="cryptokeep-http-fixture-")
        root = Path(self.tmp.name)
        for folder in ("scripts", "public", "logs", "reports", ".git"):
            (root / folder).mkdir()
        files = {
            "index.html": "<title>synthetic-index</title>",
            "scripts/app.js": "export const marker = 1;",
            "public/main.css": "body { color: black; }",
            "logs/private.log": "synthetic-secret-must-not-leak",
            "reports/report.html": "synthetic-secret-must-not-leak",
            ".env": "synthetic-secret-must-not-leak",
            ".git/config": "synthetic-secret-must-not-leak"
        }
        for path, value in files.items():
            (root / path).write_text(value, encoding="utf-8")
        handler = partial(module.SecureStaticHandler, directory=str(root))
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=5)
        self.tmp.cleanup()

    def request(self, path, host=None):
        conn = HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        conn.request("GET", path, headers={
            "Host": host if host is not None else f"127.0.0.1:{self.server.server_port}"
        })
        response = conn.getresponse()
        code = response.status
        headers = dict(response.getheaders())
        body = response.read().decode("utf-8", errors="replace")
        conn.close()
        return code, headers, body

    def test_only_application_assets_are_served(self):
        for path in ("/", "/index.html", "/scripts/app.js", "/public/main.css"):
            status, headers, body = self.request(path)
            self.assertEqual(status, 200, path)
            self.assertIn("frame-ancestors 'none'", headers.get("Content-Security-Policy", ""))
            self.assertTrue(body, path)

        for path in (
            "/.git/config", "/.env", "/logs/private.log", "/reports/report.html",
            "/scripts/", "/public/", "/%2eenv",
            "/scripts/%2e%2e/logs/private.log", "/../logs/private.log"
        ):
            status, _, body = self.request(path)
            self.assertIn(status, (403, 404), path)
            self.assertNotIn("synthetic-secret-must-not-leak", body)

    def test_real_index_asset_references_are_served(self):
        # Only public runtime assets are requested: no user profile or vault.
        root = SERVER_FILE.parent.parent
        content = (root / "index.html").read_text(encoding="utf-8")
        paths = set(re.findall(r'(?:src|href)="((?:scripts|public)/[^"?]+)', content))
        self.assertGreater(len(paths), 3)
        handler = partial(module.SecureStaticHandler, directory=str(root))
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            for asset in sorted(paths):
                conn = HTTPConnection("127.0.0.1", server.server_port, timeout=3)
                conn.request("GET", f"/{asset}")
                response = conn.getresponse()
                status = response.status
                response.read()
                conn.close()
                self.assertEqual(status, 200, asset)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)

    def test_reject_non_loopback_host(self):
        for host in ("attacker.test", "127.0.0.1.attacker.test", "localhost.evil.test"):
            status, _, body = self.request("/index.html", host=host)
            self.assertIn(status, (400, 403, 421), host)
            self.assertNotIn("synthetic-index", body)


if __name__ == "__main__":
    unittest.main()
