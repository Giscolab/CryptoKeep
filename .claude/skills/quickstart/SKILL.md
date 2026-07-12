---
description: Orient Claude on Vault Personal and run the first safe security workflow steps.
---

# Quickstart For Vault Personal

Use this skill when the user asks to configure Claude, start a security pass, or understand how to apply the defending-code workflow to this repository.

## Instructions

1. Read `CLAUDE.md`, `THREAT_MODEL.md`, `package.json`, and `README.md`.
2. Explain that this repository is a browser JavaScript password vault, so the Anthropic reference repo's interactive skill workflow applies directly, while its Docker/gVisor ASAN harness needs a custom JavaScript/browser port before autonomous execution.
3. Show the next recommended commands:
   - `/threat-model`
   - `/vuln-scan`
   - `/triage VULN-FINDINGS.json`
   - `/patch TRIAGE.json`
4. Remind the user not to use real vault data and not to expose `.env`, `*.vault`, logs, or local exports.
5. If the user wants action, start with `/threat-model` or `/vuln-scan` and keep the plan short.
