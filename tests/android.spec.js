/** Synthetic fixtures only; no filesystem vault is read or written. */
import assert from 'node:assert/strict';
import { assertDesktopRuntime } from '../desktop/contract.mjs';
import { enableDesktopPolicy } from '../scripts/core/runtime-policy.js';
import { buildSyntheticVault, FakeVaultStorage, FakeLocalStorage, makeVaultFile, tamperBase64 } from './helpers/vault-fixtures.js';
import { importVaultFile } from '../scripts/core/storage/vault-import-service.js';
import { VaultManager } from '../scripts/core/vault/manager.js';

try {
const password = 'Android-SYNTHETIC-only-2026!';
const entry = { id: 'synthetic', title: 'Example', username: 'demo@example.invalid', password: 'Synthetic-only!', created_at: '2026-01-01T00:00:00.000Z', last_modified: '2026-01-01T00:00:00.000Z' };
const runtime = { __CRYPTOKEEP_DESKTOP__: { channel: 'test', platform: 'android', expectedOrigin: 'https://tauri.localhost' }, location: { origin: 'https://tauri.localhost' }, isSecureContext: true, crypto, navigator: { locks: { request() {} } }, indexedDB: {}, localStorage: {} };
assert.equal(assertDesktopRuntime(runtime).channel, 'test');
assert.throws(() => assertDesktopRuntime({ ...runtime, isSecureContext: false }));
assert.throws(() => assertDesktopRuntime({ ...runtime, navigator: {} }));
enableDesktopPolicy();
const { record } = await buildSyntheticVault({ password, entries: [entry] });
const storage = new FakeVaultStorage();
const deps = { storage, localStorageRef: new FakeLocalStorage(), requestPassword: async () => password, confirmImport: async () => true };
// A browser File from the Android file picker follows this same service path.
await importVaultFile(new File([JSON.stringify(record)], 'synthetic.vault'), deps);
const manager = new VaultManager({ storage });
await manager.unlock(password);
assert.equal(manager.getEntries()[0].password, entry.password);
assert.equal(manager.masterKey.extractable, false);
manager.clearSession();
assert.equal(manager.masterKey, null);
assert.equal(manager.getEntries().length, 0);
const baseline = structuredClone(storage.record);
const writes = storage.writes;
const tampered = structuredClone(record);
tampered.entries[0].ciphertext = tamperBase64(tampered.entries[0].ciphertext);
for (const [candidate, overrides] of [
  [record, { requestPassword: async () => 'Wrong-synthetic-password!' }],
  [tampered, {}],
  [record, { confirmImport: async () => false }],
  [(await buildSyntheticVault({ password, entries: [entry], formatVersion: 1 })).record, {}]
]) {
  await assert.rejects(() => importVaultFile(makeVaultFile(candidate), { ...deps, ...overrides }));
  assert.deepEqual(storage.record, baseline);
  assert.equal(storage.writes, writes);
}
console.log('PASS Android shared runtime, synthetic File import/unlock, wrong password, tampering, cancellation, legacy refusal; existing record preserved.');

} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
