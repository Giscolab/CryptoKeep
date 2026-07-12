# Claude Security Workflow For Vault Personal

This project uses Claude Code project skills in `.claude/skills/` to mirror the useful part of Anthropic's defending-code reference workflow:

- threat model
- static vulnerability scan
- triage
- patch
- verification

The autonomous Docker/gVisor C/C++ harness from the reference repo is not installed here because Vault Personal is a browser JavaScript app. For this codebase, the first useful layer is read-only source review plus targeted tests and manual browser verification.

Claude Code settings and project skills are guardrails against accidental reads, writes, and unsafe commands. They are not a sandbox or a substitute for a cryptographic audit.

## Setup

From the repository root:

```powershell
claude
```

Then run:

```text
/quickstart
/threat-model
/vuln-scan
/triage VULN-FINDINGS.json
/patch TRIAGE.json
```

The skills are project-scoped, so they live with the repository and should be available after Claude Code trusts the workspace.

## Recommended First Pass

1. Run `/quickstart`.
2. Run `/threat-model` and update `THREAT_MODEL.md`.
3. Run `/vuln-scan` with no arguments for a whole-project static scan.
4. Review `VULN-FINDINGS.md` manually before applying patches.
5. Run `/triage VULN-FINDINGS.json`.
6. Patch only one high-impact finding at a time with `/patch`.

## Do Not Use Real Vault Data

Use synthetic fixtures only. Do not ask an agent to read or print:

- `.env` files
- `*.vault` files
- `vault_*.log`
- `logs/`
- `export-log*.html`
- browser profile data
- real clipboard content

## Verification Commands

```powershell
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
npm test
npm run test:security
npm run lint:security
```

If Node fails the CSPRNG preflight, stop and fix the local Node runtime first. Do not add a `Math.random()` fallback or a homegrown Web Crypto polyfill. In this Codex session, Node crashed during CSPRNG initialization before tests could run.
