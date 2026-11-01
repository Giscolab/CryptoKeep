/** All storage and files below are synthetic. No personal directory is read. */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { stageDesktop, PROJECT_ROOT } from '../scripts/desktop/prepare.mjs';
import { DESKTOP_CSP, assertDesktopRuntime } from '../desktop/contract.mjs';
import { getRuntimePolicy, enableDesktopPolicy } from '../scripts/core/runtime-policy.js';
import { VaultManager } from '../scripts/core/vault/manager.js';
import { buildSyntheticVault, FakeVaultStorage, FakeLocalStorage, makeVaultFile } from './helpers/vault-fixtures.js';
import { importVaultFile } from '../scripts/core/storage/vault-import-service.js';
import { assertImportableFile } from '../scripts/core/storage/vault-import-service.js';
import { MAX_VAULT_FILE_BYTES } from '../scripts/core/storage/import-limits.js';
import { getHibpConsent, isPasswordPwned } from '../scripts/security/hibp-service.js';

const cases = [];
const test = (label, fn) => cases.push({ label, fn });
const password = 'Desktop-SYNTHETIC-only-2026!';
const dates = { created_at: '2026-01-01T00:00:00.000Z', last_modified: '2026-01-01T00:00:00.000Z' };

test('the 10 MiB boundary remains unchanged and is checked before file contents', () => {
  assert.equal(MAX_VAULT_FILE_BYTES, 10 * 1024 * 1024);
  assert.equal(assertImportableFile({ name: 'synthetic.vault', size: MAX_VAULT_FILE_BYTES }), true);
  assert.throws(() => assertImportableFile({ name: 'synthetic.vault', size: MAX_VAULT_FILE_BYTES + 1 }), (error) => error.code === 'file_too_large');
});

function fixture(root) {
  const assets = ['index.html', 'scripts/app.js', 'scripts/ui/security-report-init.js'];
  mkdirSync(join(root, 'desktop'), { recursive: true });
  mkdirSync(join(root, 'scripts/ui'), { recursive: true });
  writeFileSync(join(root, 'desktop/assets.json'), JSON.stringify(assets));
  writeFileSync(join(root, 'index.html'), '<meta http-equiv="Content-Security-Policy" content="old"><script type="module" src="scripts/app.js?v=1" crossorigin="anonymous"></script><script type="module" src="scripts/ui/security-report-init.js"></script>');
  writeFileSync(join(root, 'scripts/app.js'), 'export const synthetic = true;');
  writeFileSync(join(root, 'scripts/ui/security-report-init.js'), 'export const synthetic = true;');
}

test('staging excludes unlisted vaults, logs, hidden files and dependencies', () => {
  const root = mkdtempSync(join(tmpdir(), 'cryptokeep-stage-test-'));
  try {
    fixture(root);
    for (const path of ['vault_private.vault', '.env', 'private.log']) writeFileSync(join(root, path), 'synthetic-only');
    const result = stageDesktop({ root });
    assert.equal(result.count, 3);
    assert.deepEqual(readdirSync(result.output).sort(), ['desktop-manifest.json', 'index.html', 'scripts']);
    const html = readFileSync(join(result.output, 'index.html'), 'utf8');
    assert.ok(html.includes(DESKTOP_CSP));
    assert.ok(html.includes('desktop/bootstrap.js'));
    assert.ok(!html.includes('scripts/app.js'));
    assert.deepEqual(stageDesktop({ root }), result);
    writeFileSync(join(result.output, 'unexpected.vault'), 'synthetic-only');
    assert.throws(() => stageDesktop({ root }), /Unexpected staging/);
    assert.equal(readFileSync(join(result.output, 'unexpected.vault'), 'utf8'), 'synthetic-only');
    assert.throws(() => stageDesktop({ root, output: root }), /Output must/);
    writeFileSync(join(root, 'desktop/assets.json'), '["../outside.js"]');
    assert.throws(() => stageDesktop({ root }), /Unsafe asset/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('manually edited staged assets are preserved and cause a refusal', () => {
  const root = mkdtempSync(join(tmpdir(), 'cryptokeep-stage-edited-'));
  try {
    fixture(root);
    const { output } = stageDesktop({ root });
    writeFileSync(join(output, 'index.html'), 'synthetic manual edit');
    assert.throws(() => stageDesktop({ root }), /Locally edited/);
    assert.equal(readFileSync(join(output, 'index.html'), 'utf8'), 'synthetic manual edit');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('staging refuses source and destination symlinks without reading their content', () => {
  const root = mkdtempSync(join(tmpdir(), 'cryptokeep-stage-links-'));
  try {
    fixture(root);
    mkdirSync(join(root, 'outside'));
    writeFileSync(join(root, 'outside/app.js'), 'synthetic-only');
    // Directory junctions also work on Windows without Developer Mode.
    symlinkSync(join(root, 'outside'), join(root, 'scripts/link'), 'junction');
    writeFileSync(join(root, 'desktop/assets.json'), '["scripts/link/app.js"]');
    assert.throws(() => stageDesktop({ root }), /Symlink/);
    fixture(root);
    mkdirSync(join(root, 'dist'));
    symlinkSync(join(root, 'desktop'), join(root, 'dist/desktop'), 'junction');
    assert.throws(() => stageDesktop({ root }), /Symlink/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the real inventory preserves crypto sources byte for byte and has no private file types', () => {
  const root = mkdtempSync(join(tmpdir(), 'cryptokeep-inventory-test-'));
  try {
  const inventory = JSON.parse(readFileSync(join(PROJECT_ROOT, 'desktop/assets.json')));
  for (const asset of [...inventory, 'desktop/assets.json']) {
    mkdirSync(dirname(join(root, asset)), { recursive: true });
    copyFileSync(join(PROJECT_ROOT, asset), join(root, asset));
  }
  const { output, count } = stageDesktop({ root });
  assert.ok(count > 80);
  const manifest = JSON.parse(readFileSync(join(output, 'desktop-manifest.json')));
  for (const name of Object.keys(manifest.files)) {
    assert.ok(!/(?:^|\/)(?:node_modules|\.git|logs|reports|docs)(?:\/|$)|\.(?:vault|log|env|py|bat|ps1)$/.test(name));
  }
  for (const name of ['aes-gcm.js', 'pbkdf2.js', 'runtime.js']) {
    const asset = 'scripts/core/crypto/' + name;
    assert.deepEqual(readFileSync(join(output, asset)), readFileSync(join(PROJECT_ROOT, asset)));
  }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('desktop profiles and configuration have no bundle, updater or remote content', () => {
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json'));
  assert.equal(config.identifier, 'fr.giscolab.cryptokeep');
  assert.equal(config.bundle.active, false);
  assert.equal(config.bundle.createUpdaterArtifacts, false);
  assert.equal(config.build.devUrl, undefined);
  assert.equal(config.app.security.csp, DESKTOP_CSP);
  assert.deepEqual(config.app.security.capabilities, []);
  assert.equal(config.app.withGlobalTauri, false);
  assert.ok(!/unsafe-|pwnedpasswords|https:\/\/(?!ipc\.localhost)/.test(DESKTOP_CSP));
  for (const kind of ['dev', 'test']) {
    const override = JSON.parse(readFileSync(`src-tauri/tauri.${kind}.conf.json`));
    assert.equal(override.identifier, 'fr.giscolab.cryptokeep.' + kind);
    assert.equal(override.app.windows[0].useHttpsScheme, true);
    assert.equal(override.app.windows[0].create, false);
    assert.equal(override.app.windows[0].incognito, false);
  }
});

test('preflight refuses wrong origins, production, and missing Web Locks', () => {
  const runtime = { __CRYPTOKEEP_DESKTOP__: { channel: 'development', expectedOrigin: 'https://tauri.localhost' }, location: { origin: 'https://tauri.localhost' }, isSecureContext: true, crypto, navigator: { locks: { request() {} } }, indexedDB: {}, localStorage: {} };
  assert.equal(assertDesktopRuntime(runtime).channel, 'development');
  assert.throws(() => assertDesktopRuntime({ ...runtime, location: { origin: 'https://example.invalid' } }), /Origine/);
  assert.throws(() => assertDesktopRuntime({ ...runtime, navigator: {} }), /Web Crypto/);
  assert.throws(() => assertDesktopRuntime({ ...runtime, __CRYPTOKEEP_DESKTOP__: { channel: 'production' } }), /profil/);
});

test('desktop refuses migration and legacy imports without any storage write; web default is preserved', async () => {
  assert.equal(getRuntimePolicy().automaticMigrations, true);
  const entries = [{ id: 'synthetic', title: 'Synthetic', username: 'test', password: 'Synthetic-only!', ...dates }];
  const current = await buildSyntheticVault({ password, entries });
  const legacy = await buildSyntheticVault({ password, entries, formatVersion: 1 });
  const missingDates = await buildSyntheticVault({ password, entries: [{ id: 'synthetic', title: 'Synthetic', password: 'Synthetic-only!' }] });
  enableDesktopPolicy();
  for (const record of [legacy.record, missingDates.record]) {
    const storage = new FakeVaultStorage(record);
    const manager = new VaultManager({ storage });
    await assert.rejects(() => manager.unlock(password), (error) => error.code === 'migration_required');
    assert.equal(storage.writes, 0);
    assert.deepEqual(storage.record, record);
    assert.equal(manager.masterKey, null);
    const destination = new FakeVaultStorage(current.record);
    await assert.rejects(() => importVaultFile(makeVaultFile(record), { storage: destination, localStorageRef: new FakeLocalStorage(), requestPassword: async () => password, confirmImport: async () => true }), (error) => error.code === 'migration_required');
    assert.equal(destination.writes, 0);
    assert.deepEqual(destination.record, current.record);
  }
  const storage = new FakeVaultStorage(current.record);
  const manager = new VaultManager({ storage });
  await manager.unlock(password);
  assert.equal(manager.masterKey.extractable, false);
  assert.equal(manager.getEntries().length, 1);
  assert.equal(storage.writes, 0);
  manager.clearSession();
});

test('desktop never requests HIBP, including a previously consented profile', async () => {
  const store = { getItem() { throw new Error('Consent storage must not be read'); } };
  assert.equal(getHibpConsent({ storage: store }).reason, 'desktop_offline');
  const result = await isPasswordPwned('Synthetic-only!', { storage: store, fetch: () => { throw new Error('No network allowed'); } });
  assert.equal(result.checked, false);
});

let failures = 0;
for (const { label, fn } of cases) {
  try { await fn(); console.log('PASS desktop:', label); }
  catch (error) { failures++; console.error('FAIL desktop:', label, error); }
}
if (failures) process.exitCode = 1;
else console.log(`Desktop contract tests passed (${cases.length} scenarios).`);
