# CodeQL findings — targeted triage (2026-10-14)

Scope: `Giscolab/CryptoKeep`, branch `main`, CodeQL security-extended.
This record documents local changes awaiting a new, independently observed
CodeQL run. It is **not** a declaration that GitHub alerts are closed.

## Changes prepared locally

| Alert | Finding | Mitigation |
|---|---|---|
| #29 | `actions/unpinned-tag` Gitleaks | Replace mutable tag by full verified commit SHA |
| #28 | `actions/unpinned-tag` OSV full-scan | Replace mutable tag by full verified commit SHA |
| #27 | `actions/unpinned-tag` OSV PR-scan | Replace mutable tag by full verified commit SHA |
| #17 | `js/file-system-race` test scanner | Use `readdirSync(..., {withFileTypes:true})` instead of separate path `statSync`, then process regular files |
| #16 | `js/file-system-race` test HTTP server | Open file descriptor first, `fstat` and read from same descriptor; reject paths escaping test root |
| #15 | `js/regex/missing-regexp-anchor` | Replace URL-looking regex on literal consent text with exact hostname substring assertion |
| #18 | `js/file-access-to-http` | Restrict the test helper to local absolute resource paths; review its risk below |

## #18 — local test request: proposed false-positive triage

Affected module: `tests/local-server.spec.js`, method `typeDe`.

The test reads local repository HTML to discover referenced script and CSS
**pathnames**, then sends requests to a temporary HTTP server that is
started by the test and bound to `127.0.0.1`. The URL scheme, host and port
are selected by the test, not by any pathname or external file content.
The test does not send the file *body* in these requests.

As additional defense, `typeDe` now verifies that the supplied value
is an absolute local path composed of expected URL-path characters,
rejects network-path references (`//`), `.`, `..`, and empty components.

Therefore, the reported source-to-outbound-request dataflow does not itself
demonstrate exfiltration to an external host. This is a **proposed false
positive for exfiltration**, not proof the entire local server is safe.
The local server itself has a separate threat surface (including the
Host-header and repository-exposure findings in the Codex report).

Do **not** dismiss alert #18 without review of the next CodeQL run.
If it persists, retain this explanation for an explicit false-positive
triage decision. Do not disable the CodeQL query or suppress the rule.

## Unrelated Codex Security report

The separate offline Codex scan at `bab4c4b` lists 6 medium and 8 low
issues. In particular the 6 medium items concern whole-record concurrency,
cross-tab key identity, re-lock races and plaintext lifetime.
They have **not** been repaired by the seven targeted CodeQL changes.
They require fresh verification against current HEAD and synthetic
multi-tab/asynchronous reproductions before product changes.

All tests must use synthetic entries. No personal vault or secrets.
