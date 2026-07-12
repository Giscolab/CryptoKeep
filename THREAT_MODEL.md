# Vault Personal Threat Model

Last updated: 2026-07-12

## System Summary

Vault Personal is a static browser application for storing password vault entries locally. It derives an AES-GCM key from a user-provided master password, encrypts vault entries in the browser, stores encrypted records in IndexedDB, and keeps a redundant encrypted backup in localStorage.

## Assets

- Master password entered by the user.
- Derived AES-GCM master key.
- Decrypted vault entries in memory.
- Encrypted vault records in IndexedDB.
- Encrypted backup record in localStorage.
- Vault metadata, including salt, KDF algorithm, iteration count, creation time, and version.
- Clipboard contents after copy actions.

## Trust Boundaries

- Trusted: application source loaded from the local project or a trusted static deployment.
- Trusted only while unlocked: browser memory containing the derived key and decrypted entries.
- Untrusted: vault entry fields such as title, username, URL, category, tags, notes, and passwords when rendered in the DOM.
- Untrusted: imported vault files, CSV input, browser extensions, copied clipboard content, local logs, generated exports, and remote resources.
- Browser storage is not a confidentiality boundary. IndexedDB and localStorage are readable by any script executing in this origin.
- Claude Code settings are operator guardrails only. They are not a sandbox boundary for secrets or exploit execution.
- Conditionally trusted: HIBP k-anonymity endpoint if enabled. Only SHA-1 prefixes may be sent.

## Entry Points

- Master password form in `index.html` and `scripts/app.js`.
- Add/edit/delete vault entry flows.
- Import/export and backup/restore flows.
- IndexedDB and localStorage load paths.
- Clipboard copy actions.
- Security dashboard and audit tools.
- Theme/settings persistence in localStorage.
- Optional HIBP password breach checks.
- Third-party remote assets currently referenced by `index.html`.

## In Scope Vulnerability Classes

- Plaintext persistence of secrets in IndexedDB, localStorage, logs, exports, or tests.
- XSS or DOM injection through rendered vault entry fields. In a browser JavaScript vault, XSS while unlocked is total compromise of decrypted entries and usable key material.
- Exposure of sensitive objects or decrypted vault data through the global `window` scope. This is a first-class vulnerability distinct from XSS: XSS is one execution vector, while a global reference amplifies any same-origin script or browser-extension access into direct vault access.
- Weak or inconsistent cryptographic parameters.
- AES-GCM IV reuse or malformed ciphertext handling.
- Any unauthenticated encryption path or nonce reuse with the same key.
- Missing authentication checks before decrypting, rendering, exporting, or editing entries.
- Session-lock bypasses, incomplete memory cleanup, and clipboard cleanup failures.
- Import parsing bugs that can corrupt vault state or inject UI content.
- CSP regressions that allow broader script execution than needed.
- Remote dependency or CDN supply-chain risks.
- Network leakage of passwords, full hashes, decrypted entries, metadata, or vault contents.
- Documentation claims that materially overstate implemented security behavior.

## Out Of Scope For This Project

- Recovery after losing the master password.
- Protection against a fully compromised browser, OS, kernel, or malicious extension with page access.
- Reliable zeroization of JavaScript strings, CryptoKeys, or garbage-collected objects. The app can clear references and DOM fields, but cannot guarantee memory erasure.
- Protection against shoulder surfing while the vault is intentionally unlocked.
- Server-side compromise, unless a future hosted or sync component is added.
- Autonomous exploit execution against real personal vault data.

## Current Security Assumptions To Verify

- New coffres use PBKDF2-HMAC-SHA512 with 220000 iterations, an explicit KDF identifier, and a versioned metadata record. Historical v1 coffres use 150000 iterations only for a successful unlock, then migrate to v2 with a new salt and key.
- Argon2id would be the preferred long-term password-hashing/KDF direction if an audited implementation and migration plan are added. Until then, PBKDF2 parameters must remain explicit, high enough for current clients, and consistent across code and docs.
- `index.html` uses a strict local-only CSP fallback. `scripts/secure_local_server.py` sends the production-equivalent CSP header and frame protection for local use; any deployment must send equivalent HTTP headers.
- Sensitive vault objects are module-scoped. UI code imports the singleton `VaultManager` and must not expose it or decrypted entries on `window`.
- HIBP is offline by default in `scripts/security/hibp-service.js`; enabling it must remain an explicit local opt-in.
- `scripts/core/storage/manager.js` saves an encrypted backup to localStorage. The backup is base64-encoded, not additionally protected beyond the encrypted entries it contains.
- Clipboard exposure remains a real local risk. The app schedules a conditional cleanup after 30 seconds and will not overwrite clipboard content that has changed; browsers can deny clipboard reads, so cleanup remains best effort.
- Node-based tests could not be executed in the current Codex runtime because Node crashes on `require('crypto').randomBytes(16)` with `Assertion failed: ncrypto::CSPRNG(nullptr, 0)`. Treat this as a critical local toolchain blocker, not a normal test failure.

## Acceptance Criteria For Security Fixes

- Existing tests pass, including `npm test` and `npm run test:security`.
- A CSPRNG preflight passes before tests: `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`.
- No plaintext vault secrets are added to persistent storage, logs, exports, fixtures, or docs.
- New DOM rendering of vault data uses DOM APIs or explicit sanitization.
- Crypto changes include a migration or compatibility plan for existing vault metadata.
- AES-GCM v2 entries authenticate their entry identifier and format version as additional authenticated data.
- Any network feature documents exactly what leaves the device and is disabled or consented by default.
