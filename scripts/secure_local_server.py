#!/usr/bin/env python3
"""Local static server with browser security headers for CryptoKeep."""

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


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
