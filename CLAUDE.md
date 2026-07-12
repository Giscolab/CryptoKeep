# Vault Personal - Claude Code Context

## Project Purpose

Vault Personal is a local-first browser password vault. The primary security promise is that cleartext secrets stay on the user's device and are only held in memory while the vault is unlocked.

## Stack

- Vanilla JavaScript ES modules.
- Web Crypto API for PBKDF2-HMAC-SHA512 and AES-GCM.
- IndexedDB as the primary encrypted vault store.
- `localStorage` only for non-secret preferences and the encrypted backup copy.
- Static HTML/CSS/JS, launched through a local web server.

## Security Invariants

- Browser JavaScript has no strong memory isolation. Any XSS in this origin is a full vault compromise while unlocked because injected script can read decrypted entries and use the derived key.
- Do not claim reliable zeroization for JavaScript strings, CryptoKeys, or objects managed by the garbage collector. Cleanup is best-effort only and must be described that way.
- IndexedDB and localStorage are readable by any script running in the same origin. The app's at-rest confidentiality depends on application-level encryption, not browser storage secrecy.
- Browser extensions with page or DOM access are out of scope as a complete defense target, but they are a real user risk and must not be ignored in documentation.
- Never store master passwords, entry passwords, usernames, URLs, notes, or decrypted vault records in plaintext persistent storage.
- `IndexedDB` vault entries must remain encrypted as `{ id, iv, ciphertext }`.
- `localStorage` must not contain decrypted entries. The existing `vaultBackup` value is base64-encoded JSON and must only contain encrypted entries plus metadata.
- Every AES-GCM encryption must use a fresh 96-bit IV from `crypto.getRandomValues`.
- Authenticated encryption is mandatory. AES-GCM nonces must never be reused with the same key.
- Argon2id is the preferred long-term KDF if introduced through an audited dependency and migration plan. While this project uses PBKDF2, the hash, iteration count, salt length, and metadata must stay explicit and consistent in code, schema, README, and security docs.
- No CSPRNG means no startup and no tests. Never add a `Math.random()` fallback or homegrown crypto polyfill.
- The unlocked `masterKey` and decrypted entries must be cleared when locking, timing out, changing sensitive state, or ending a session.
- UI rendering must avoid `innerHTML` for attacker-controlled vault data. Prefer DOM APIs and `textContent`.
- Network access is disabled by default for HIBP in `scripts/app.js`. If re-enabled, only k-anonymity SHA-1 prefixes may leave the device.
- CSP changes must be reviewed as security changes. Avoid adding broad `unsafe-inline`, `unsafe-eval`, wildcard script sources, or remote dependencies.

## Files To Inspect First

- `scripts/app.js`: app bootstrap, auth flow, vault lifecycle.
- `scripts/core/vault/manager.js`: decrypt/encrypt/update flow and session cleanup.
- `scripts/core/storage/manager.js`: IndexedDB persistence and local encrypted backup.
- `scripts/core/crypto/pbkdf2.js`: master key derivation.
- `scripts/core/crypto/aes-gcm.js`: encryption/decryption helpers.
- `scripts/security/session-lock.js`: lock and cleanup behavior.
- `scripts/security/hibp-service.js`: optional breach check network path.
- `scripts/ui/vault-list/vault-list.js`: rendering/editing decrypted entries.
- `THREAT_MODEL.md`: system trust boundaries and vulnerability classes.

## Standard Checks

Use these before and after security-relevant edits:

```powershell
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
npm test
npm run test:security
npm run lint:security
```

Current local blocker: in this Codex session on Windows, Node v26.4.0 from `C:\Program Files\nodejs\node.exe` crashes on `require('crypto').randomBytes(16)` with `Assertion failed: ncrypto::CSPRNG(nullptr, 0)`. The bundled Codex Node v24.14.0 shows the same failure when crypto randomness is requested. `node -v` alone is not sufficient. Fix Node before treating any test result as meaningful.

## Claude Security Workflow

This project uses project skills in `.claude/skills/` inspired by Anthropic's defending-code reference workflow:

1. `/quickstart` for orientation.
2. `/threat-model` to update `THREAT_MODEL.md`.
3. `/vuln-scan` for static, read-only vulnerability discovery.
4. `/triage` to deduplicate and rank findings.
5. `/patch` to make a small fix and verify it.

Do not run autonomous exploit generation against real vault data. Use synthetic fixtures only.
Claude Code settings and skills are accident guardrails, not a security boundary or sandbox. They do not replace OS/browser isolation or a real audit.

## Work Style

- Keep changes small and reviewable.
- Treat README/security-documentation mismatches as security findings.
- Do not read or print `.env`, `.vault`, generated vault logs, or local exports.
- Do not commit scan outputs containing exploit details without an explicit review.
- Treat these skills as workflow aids. They are not a cryptographic audit or a validation stamp for a password manager.
