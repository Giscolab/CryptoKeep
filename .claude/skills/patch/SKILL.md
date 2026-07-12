---
description: Patch one selected Vault Personal security finding and verify the fix.
---

# Patch Skill

Use this skill to fix one selected finding from triage. Keep the patch narrow.

## Instructions

1. Read `CLAUDE.md`, `THREAT_MODEL.md`, and the relevant finding from `TRIAGE.md`, `TRIAGE.json`, or the user prompt.
2. Confirm the security invariant being restored.
3. Edit the smallest set of files required.
4. Add or update focused tests when the behavior can be tested in Node.
5. Run:
   - `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`
   - `npm test`
   - `npm run test:security`
   - `npm run lint:security`
6. If local Node fails the CSPRNG preflight, stop and report that as a critical local toolchain blocker. Do not work around it with `Math.random()` or a homegrown Web Crypto polyfill.
7. If local Node fails before executing the project for another reason, report that as an environment blocker and describe the unrun verification.
8. Summarize the exact risk fixed and any compatibility impact.

## Guardrails

- Do not use real vault data.
- Do not relax CSP, crypto settings, or storage rules to make tests pass.
- Do not rewrite the app architecture for a narrow finding.
- Do not change PBKDF2 iterations without a migration or compatibility note.
