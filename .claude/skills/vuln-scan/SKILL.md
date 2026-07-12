---
description: Run a static, read-only vulnerability scan scoped to Vault Personal.
---

# Vulnerability Scan Skill

Use this skill for static vulnerability discovery in Vault Personal. This is a read-only source review workflow unless the user explicitly asks to save findings.

## Scope

Focus on browser-side password-manager risks:

- plaintext secret persistence
- XSS and DOM injection, treated as full compromise while unlocked
- insecure use of `innerHTML`
- weak or inconsistent crypto parameters
- AES-GCM IV reuse, unauthenticated encryption, or malformed ciphertext handling
- CSPRNG failures or insecure randomness fallbacks
- lock/session cleanup failures
- clipboard leakage
- import/export parsing bugs
- CSP regressions and remote dependency risks
- HIBP/network leakage
- documentation/security-claim mismatches

## Instructions

1. Read `CLAUDE.md` and `THREAT_MODEL.md`.
2. Inspect the relevant files, normally starting with:
   - `scripts/app.js`
   - `scripts/core/vault/manager.js`
   - `scripts/core/storage/manager.js`
   - `scripts/core/crypto/pbkdf2.js`
   - `scripts/core/crypto/aes-gcm.js`
   - `scripts/security/session-lock.js`
   - `scripts/security/hibp-service.js`
   - `scripts/ui/vault-list/vault-list.js`
   - `index.html`
3. Use `rg` for focused searches. Do not read denied local secret files.
4. Run or request the CSPRNG preflight before trusting test results:
   - `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`
5. Treat a finding as useful only if it names:
   - the affected file and line
   - the violated threat-model assumption
   - the exploit path or failure mode
   - realistic severity
   - a candidate fix
   - a verification strategy
5. If writing results, create `VULN-FINDINGS.md` and `VULN-FINDINGS.json`. Do not include real secrets.

## Severity Guidance

- Critical: CSPRNG failure, insecure randomness fallback, plaintext password persistence, key disclosure, remote code execution/XSS exposing vault secrets, full vault exfiltration.
- High: lock bypass, import/export path exposing decrypted entries, CSP regression enabling script injection, crypto misuse affecting confidentiality.
- Medium: metadata leakage, weak defaults, missing consent for network checks, documentation mismatch that could mislead users.
- Low: hardening, maintainability, non-exploitable defensive gaps.
