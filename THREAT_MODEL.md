# CryptoKeep Threat Model

Last updated: 2026-09-01 (Lot 2)

## System Summary

CryptoKeep is a static browser application for storing password vault entries locally. It derives an AES-GCM key from a user-provided master password, encrypts vault entries in the browser, stores encrypted records in IndexedDB, and keeps a redundant encrypted backup in localStorage.

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
- Local development safeguards are operator guardrails only. They are not a sandbox boundary for secrets or exploit execution.
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
- Windows launchers `start_vault_local.bat` and `start_vault_secure.bat`, and the
  PowerShell server lifecycle helpers `scripts/start_secure_server.ps1` and
  `scripts/stop_secure_server.ps1`.
- Browser profile directory used to launch the vault. An ephemeral profile
  destroys the vault; a shared personal profile widens extension exposure.

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
- Partial-write states: an import or restore that fails midway and leaves
  only part of the data persisted, or that destroys a valid vault while
  replacing it.
- Automatic restoration paths that can silently overwrite a newer primary
  vault with an older secondary copy.
- CSP regressions that allow broader script execution than needed.
- Remote dependency or CDN supply-chain risks.
- Network leakage of passwords, full hashes, decrypted entries, metadata, or vault contents.
- Documentation claims that materially overstate implemented security behavior.
- Launch configurations that destroy the vault, such as opening the app in a
  private/incognito browser profile while the app depends on IndexedDB and
  `localStorage`. This is an availability and data-loss class, not confidentiality.
- Launcher process management that terminates third-party processes it does not
  own, for example killing any Python process listening on the configured port.

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
- Node-based security tests require a working cryptographic random-number generator. A failure in `crypto.randomBytes` must be treated as a critical local toolchain blocker rather than a normal test failure. The current Linux validation baseline passes under Node.js v22.23.2.

- Lot 1 (2026-09-01): both launchers now open a dedicated persistent browser
  profile under `%LOCALAPPDATA%\CryptoKeep\browser-profile`. No launcher passes
  `--incognito`. The local server remains plain HTTP on the loopback interface;
  no TLS is implemented and no documentation may claim otherwise.
- Lot 1: the local server is stopped only by recorded PID plus matching start
  time plus matching command line. Termination by port occupancy is removed.
- Lot 1: the master password field is cleared, reset to `type="password"` and its
  reveal checkbox unchecked in a `finally` block, on success and on failure.
  This reduces the exposure window. It is NOT memory zeroization: the underlying
  JavaScript string cannot be erased and this limit stays out of scope.
- Lot 1: manual logout is implemented in `scripts/security/logout.js` and clears
  the key, salt, decrypted entries, rendered secrets, open modals and navigation
  state. It never deletes the encrypted vault.
- Lot 1: automatic locking is implemented in
  `scripts/security/autolock-controller.js`, honours the enable setting and the
  chosen delay, keeps exactly one timer, and arms only after authentication.
  The historical `AutoLock` class is preserved and still covered by tests.
- Lot 1: `scripts/security/storage-persistence.js` reports `unknown` until a real
  restart has been observed. It must never report a positive persistence result
  without analysed data.
- Node test status (2026-09-01): the suite was executed successfully on Node
  v22.23.2 in the Linux workspace mounted on this project folder, with the CSPRNG
  preflight passing. The Windows-host Node CSPRNG crash recorded earlier remains
  unverified on that host and must still be resolved before trusting results run
  there.

- Lot 2 (import): the current vault is never replaced before full structural
  AND cryptographic validation of the imported file, plus explicit user
  confirmation. Unexpected properties are REFUSED, never silently stripped.
  Entry ids and AES-GCM IVs must be unique across the whole imported vault,
  validation block included, compared on DECODED bytes.
- Lot 2: no separate `authTag` field is required or accepted. With AES-GCM
  through Web Crypto the authentication tag is part of `ciphertext`.
- Lot 2: wrong password, wrong AAD and tampered data must remain
  indistinguishable to the user. A single generic message covers all three.
- Lot 2: post-write verification uses canonical serialisation of the whole
  record. A size comparison is explicitly insufficient. Restoration is
  attempted only when the write COMMITTED but the re-read diverges; an
  aborted transaction leaves the previous record intact by construction and
  triggers no further write.
- Lot 2 (backup): `localStorage` is a secondary copy only, updated after the
  IndexedDB write has been verified. Neither JSON nor base64 provides any
  encryption; the envelope is safe only because its content is already
  AES-GCM encrypted. No decrypted field may ever be persisted there.
- Lot 2: automatic restore at startup is REMOVED. A structurally valid
  primary vault always wins; a backup can only replace it through a distinct
  manual action with reinforced confirmation and the same full cryptographic
  verification as a `.vault` import. Backup timestamps are an indication, not
  an authenticated proof.
- Lot 2 (CSV): input is decoded with `TextDecoder(utf-8, {fatal:true})`.
  Rows are added with fresh `crypto.randomUUID()` identifiers and never
  overwrite existing entries. Encryption of all rows happens in memory before
  any transaction, so no partial import can be persisted.
- Lot 2: `prompt()` is not used anywhere. Passwords are collected in a
  dedicated dialog with a real `type="password"` field cleared in a `finally`.

## Acceptance Criteria For Security Fixes

- Existing tests pass, including `npm test` and `npm run test:security`.
- A CSPRNG preflight passes before tests: `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`.
- No plaintext vault secrets are added to persistent storage, logs, exports, fixtures, or docs.
- New DOM rendering of vault data uses DOM APIs or explicit sanitization.
- Crypto changes include a migration or compatibility plan for existing vault metadata.
- AES-GCM v2 entries authenticate their entry identifier and format version as additional authenticated data.
- Any network feature documents exactly what leaves the device and is disabled or consented by default.
