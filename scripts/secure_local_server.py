#!/usr/bin/env python3
"""Local static server with browser security headers for CryptoKeep."""

from __future__ import annotations

import argparse
import re
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


CONTENT_SECURITY_POLICY = "; ".join(
    (
        "default-src 'none'",
        "script-src 'self'",
        "style-src 'self'",
        "font-src 'self'",
        "img-src 'self' data:",
        "connect-src 'self' https://api.pwnedpasswords.com",
        "manifest-src 'self'",
        "worker-src 'self'",
        "frame-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "object-src 'none'",
        "frame-ancestors 'none'",
    )
)


class SecureStaticHandler(SimpleHTTPRequestHandler):
    """Sert le depot avec des en-tetes de securite et des types MIME fiables.

    DEFAUT CORRIGE. `SimpleHTTPRequestHandler` consulte `extensions_map`, puis
    les types MIME du systeme. Sous Windows, `mimetypes` lit le REGISTRE : si
    une entree `.js` y est associee a `text/plain` — ce que font certains
    antivirus et de vieux logiciels — le serveur annonce `text/plain` pour tous
    les scripts.

    Combine a l'en-tete `X-Content-Type-Options: nosniff` que ce serveur envoie
    volontairement, le navigateur REFUSE alors d'executer ces fichiers :

        Refused to execute script from '.../theme-loader.js' because its MIME
        type ('text/plain') is not executable

    L'application ne demarre plus du tout. La table ci-dessous rend le type
    DETERMINISTE, quelle que soit la configuration de la machine. Elle ne
    retire aucun type connu de Python : elle les complete.

    Les types listes sont ceux que l'application sert reellement. Chacun serait
    refuse par `nosniff` s'il etait annonce en `text/plain` :
      - .js / .mjs : les modules ne se chargent pas, l'application est morte ;
      - .css       : la feuille de style est ignoree, interface non stylee ;
      - .json / .webmanifest : le manifeste est rejete ;
      - .svg       : les icones vectorielles ne s'affichent pas ;
      - .html      : la page s'afficherait comme du texte brut ;
      - .png / .ico: les images et le favicon ne s'affichent pas.

    Aucun autre type n'est force : un fichier que l'application ne sert pas au
    navigateur — `.py`, `.bat`, `.md` — garde le comportement par defaut.
    """

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".ico": "image/x-icon",
        ".woff2": "font/woff2",
    }

    # Only the static app bundle is reachable. Never serve Git metadata,
    # private logs, exports or any other material under the repository root.
    _SCRIPT_EXTENSIONS = frozenset({".js", ".mjs", ".json"})
    _PUBLIC_EXTENSIONS = frozenset({
        ".css", ".js", ".mjs", ".json", ".svg", ".png", ".jpg", ".jpeg",
        ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".webmanifest"
    })

    # Strict filename component whitelist used to validate each path segment
    # before it's combined with the repository root. This prevents path
    # traversal and rejects characters that could lead to ambiguous paths.
    _VALID_COMPONENT = re.compile(r"^[A-Za-z0-9._-]+$")

    def list_directory(self, path):
        self.send_error(HTTPStatus.FORBIDDEN, "Directory listing disabled")
        return None

    @staticmethod
    def _select_existing_child(directory: Path, name: str) -> Path | None:
        """Return a filesystem-provided child whose name exactly matches.

        The HTTP component is used only for equality. It is never combined
        with the repository root to form a path expression. This keeps the
        request outside the filesystem trust boundary while preserving the
        case-sensitive application asset names on every platform.
        """
        try:
            for child in directory.iterdir():
                if child.name == name:
                    return child
        except OSError:
            return None
        return None

    def translate_path(self, path):
        """Give the standard transfer code only the already-approved target."""
        del path
        target = getattr(self, "_approved_target", None)
        if target is None:
            raise RuntimeError("No approved application asset")
        return str(target)

    def send_head(self):
        # The server is a loopback-only vault: reject rebinding hostnames.
        port = self.server.server_port
        allowed_hosts = {
            "127.0.0.1", "localhost",
            f"127.0.0.1:{port}", f"localhost:{port}"
        }
        if self.headers.get("Host", "") not in allowed_hosts:
            self.send_error(HTTPStatus.MISDIRECTED_REQUEST, "Unexpected Host")
            return None

        try:
            path = unquote(urlsplit(self.path).path, errors="strict")
        except (UnicodeError, ValueError):
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid request path")
            return None

        if path == "/":
            path = "/index.html"

        # Fail closed on traversal, dotfiles, double-decoding and Windows
        # alternate streams. This also rejects path-less directory requests.
        if not path.startswith("/") or path.startswith("//"):
            self.send_error(HTTPStatus.FORBIDDEN, "Invalid path")
            return None
        components = path[1:].split("/")

        # Validate each path component aggressively using a whitelist of
        # allowed characters. Reject empty or hidden components.
        for item in components:
            if not item or item.startswith(".") or not self._VALID_COMPONENT.match(item):
                self.send_error(HTTPStatus.FORBIDDEN, "Forbidden path")
                return None

        filename = components[-1]
        extension = f".{filename.rsplit('.', 1)[1].lower()}" if "." in filename else ""
        allowed = (
            (len(components) == 1 and components[0] in {"index.html", "404.html"})
            or (len(components) > 1 and components[0] == "scripts"
                and extension in self._SCRIPT_EXTENSIONS)
            or (len(components) > 1 and components[0] == "public"
                and extension in self._PUBLIC_EXTENSIONS)
        )
        if not allowed:
            self.send_error(HTTPStatus.FORBIDDEN, "Not an application asset")
            return None

        root = Path(self.directory).resolve()
        candidate = root
        for item in components:
            selected = self._select_existing_child(candidate, item)
            if selected is None:
                self.send_error(HTTPStatus.NOT_FOUND, "Application asset not found")
                return None

            # The selected Path comes from directory iteration, not from path
            # composition with the HTTP request. Refuse symlinks before using
            # it as the parent for the next component.
            try:
                if selected.is_symlink():
                    self.send_error(HTTPStatus.FORBIDDEN, "Symlinks are not served")
                    return None
            except OSError:
                self.send_error(HTTPStatus.FORBIDDEN, "Forbidden path")
                return None
            candidate = selected
        try:
            target = candidate.resolve(strict=True)
        except (OSError, RuntimeError):
            self.send_error(HTTPStatus.FORBIDDEN, "Invalid application asset")
            return None
        if not target.is_relative_to(root) or not target.is_file():
            self.send_error(HTTPStatus.FORBIDDEN, "Invalid application asset")
            return None

        # Keep the standard MIME, conditional-request and transfer behavior,
        # but make it open the exact target selected above. `self.path` is not
        # translated a second time after validation.
        self._approved_target = target
        try:
            return super().send_head()
        finally:
            self._approved_target = None

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Content-Security-Policy", CONTENT_SECURITY_POLICY)
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Permissions-Policy", "clipboard-read=(self), clipboard-write=(self)")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve Vault Personal locally with security headers.")
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--directory", default=".")
    args = parser.parse_args()

    handler = partial(SecureStaticHandler, directory=args.directory)
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        print(f"Serving Vault Personal on http://{args.bind}:{args.port}/")
        server.serve_forever()


if __name__ == "__main__":
    main()
