---
description: Deduplicate and prioritize Vault Personal security findings.
---

# Triage Skill

Use this skill after `/vuln-scan` or when reviewing existing findings.

## Inputs

Accept a findings file, directory, pasted list, or no argument. If no argument is supplied, look for `VULN-FINDINGS.json`, `VULN-FINDINGS.md`, and `reports/`.

## Instructions

1. Read `CLAUDE.md` and `THREAT_MODEL.md`.
2. Load the supplied findings.
3. Remove duplicates and merge variants that share the same root cause.
4. Re-score severity against the local-first password-vault threat model.
5. Separate true vulnerabilities from documentation mismatches, hardening tasks, and false positives.
6. Prefer fixes that reduce plaintext lifetime, prevent XSS, preserve encryption compatibility, or tighten CSP without breaking the app.
7. If writing output, create `TRIAGE.md` and `TRIAGE.json`.

## Output Format

For each retained finding include:

- id
- severity
- status: verified, likely, needs-repro, false-positive, or hardening
- affected files
- root cause
- exploitability notes
- recommended fix
- verification commands or manual steps
