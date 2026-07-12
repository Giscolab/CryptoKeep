---
description: Build or update the Vault Personal threat model before scanning or patching.
---

# Threat Model Skill

Use this skill to create, review, or update `THREAT_MODEL.md` for Vault Personal.

## Inputs

Optional arguments may name a directory, feature, file, or security question. If no argument is supplied, update the whole-project model.

## Instructions

1. Read `CLAUDE.md`, `THREAT_MODEL.md`, `README.md`, `package.json`, and the relevant files under `scripts/`.
2. Identify assets, entry points, trust boundaries, attacker capabilities, accepted risks, and out-of-scope cases.
3. Check for security-documentation mismatches. Pay special attention to PBKDF2 iteration counts, KDF migration assumptions, CSPRNG availability, XSS as full compromise, JavaScript zeroization limits, browser extension exposure, clipboard behavior, network behavior, storage guarantees, CSP, Web Workers, lock behavior, and localStorage backup semantics.
4. Update `THREAT_MODEL.md` only when the model is stale or incomplete.
5. Keep the model concrete and tied to files in this repository.
6. Do not inspect real vault files, logs, `.env` files, browser profiles, or generated local exports.

## Output

Summarize:

- what changed in `THREAT_MODEL.md`
- unresolved assumptions
- the next scan target
