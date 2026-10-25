/** Export fixtures are synthetic; no real vault or generated export is read. */
import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import { exportVaultFile, VaultExportError } from '../scripts/core/storage/vault-export-service.js';
import { VaultManager } from '../scripts/core/vault/manager.js';
import { parseCsv } from '../scripts/utils/csv-parser.js';
import { buildSyntheticVault, FakeVaultStorage } from './helpers/vault-fixtures.js';

const cases = [];
function test(label, fn) { cases.push({ label, fn }); }
const PASSWORD = 'Synthetic export master phrase 2026!';
const baseEntry = {
  id: 'export-a', title: 'Synthetic site', url: 'https://example.test/login',
  username: 'alice', password: 'Synthetic-secret-2026!',
  created_at: '2026-01-01T00:00:00.000Z', last_modified: '2026-01-02T00:00:00.000Z'
};

async function unlocked(entries = [baseEntry]) {
  const built = await buildSyntheticVault({ password: PASSWORD, entries });
  const storage = new FakeVaultStorage(built.record);
  const manager = new VaultManager({ storage, subscribeVaultChanges: () => () => {} });
  await manager.unlock(PASSWORD);
  return { manager, storage };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

async function countBlobs(action) {
  const OriginalBlob = globalThis.Blob;
  let count = 0;
  globalThis.Blob = class extends OriginalBlob {
    constructor(...args) { super(...args); count += 1; }
  };
  try { await action(() => count); }
  finally { globalThis.Blob = OriginalBlob; }
}

test('CSV emits browser headers and preserves commas, quotes, CR/LF, Unicode and formula-leading secrets', async () => {
  const entries = [
    { ...baseEntry, title: 'Banque, "Été"', username: 'a,"b"', password: '=SUM(1,2)\r\n秘密"x"\n ' },
    { ...baseEntry, id: 'export-b', title: '+Site', url: 'http://second.test/', username: '@user', password: '-secret' },
    { ...baseEntry, id: 'export-c', title: 'Third', url: 'https://third.test/', username: '', password: '@secret' },
    { ...baseEntry, id: 'export-d', title: 'Fourth', url: 'https://fourth.test/', username: '', password: '+secret' }
  ];
  const { manager, storage } = await unlocked(entries);
  const beforeEntries = manager.getEntries();
  const beforeRecord = structuredClone(storage.record);
  let summary;
  const result = await exportVaultFile('csv', {
    vaultManager: manager,
    confirmPlaintext: async (info) => { summary = info; return true; }
  });
  const csv = await result.blob.text();
  assert.equal(csv, 'name,url,username,password\r\n'
    + '"Banque, ""Été""",https://example.test/login,"a,""b""","=SUM(1,2)\r\n秘密""x""\n "\r\n'
    + '+Site,http://second.test/,@user,-secret\r\n'
    + 'Third,https://third.test/,,@secret\r\n'
    + 'Fourth,https://fourth.test/,,+secret\r\n');
  assert.equal(parseCsv(csv).rows[0].values[3], entries[0].password);
  assert.equal(result.blob.type, 'text/csv;charset=utf-8');
  assert.deepEqual(summary, { format: 'csv', exportedCount: 4, skippedCount: 0 });
  assert.deepEqual(manager.getEntries(), beforeEntries);
  assert.deepEqual(storage.record, beforeRecord);
  assert.equal(storage.writes, 0);
  assert.equal(result.format, 'csv');
  assert.match(result.filename, /^vault_\d{4}-\d{2}-\d{2}\.csv$/);
});

test('CSV skips missing or invalid URLs and nonstring/empty passwords with accurate secret-free counts', async () => {
  const entries = [
    { ...baseEntry, username: undefined },
    { ...baseEntry, id: 'missing-url', url: '' },
    { ...baseEntry, id: 'invalid-url', url: 'not a URL' },
    { ...baseEntry, id: 'script-url', url: 'javascript:alert(1)' },
    { ...baseEntry, id: 'ftp-url', url: 'ftp://example.test/' },
    { ...baseEntry, id: 'empty-password', password: '' },
    { ...baseEntry, id: 'number-password', password: 123 },
    { ...baseEntry, id: 'missing-password', password: undefined }
  ];
  const { manager } = await unlocked(entries);
  let summary;
  const result = await exportVaultFile('csv', {
    vaultManager: manager,
    confirmPlaintext: async (info) => { summary = info; return true; }
  });
  assert.equal(await result.blob.text(), 'name,url,username,password\r\n'
    + 'Synthetic site,https://example.test/login,,Synthetic-secret-2026!\r\n');
  assert.deepEqual(summary, { format: 'csv', exportedCount: 1, skippedCount: 7 });
  assert.equal(result.exportedCount, 1);
  assert.equal(result.skippedCount, 7);
});

test('CSV refuses zero importable rows without confirmation or Blob creation', async () => {
  const { manager } = await unlocked([{ ...baseEntry, url: '' }]);
  await countBlobs(async (created) => {
    await expectCode(exportVaultFile('csv', {
      vaultManager: manager,
      confirmPlaintext: async () => { assert.fail('No empty export confirmation'); }
    }), 'no_importable_entries');
    assert.equal(created(), 0);
  });
});

test('JSON preserves complete entry fields in a versioned plaintext envelope without manager/storage material', async () => {
  const entries = [{
    ...baseEntry, notes: 'Notes\n秘密', category: 'Tests', favorite: true,
    lastAccessed: 123456, accessCount: 7, custom: { tags: ['one', 'two'], enabled: false }
  }, { ...baseEntry, id: 'json-no-url', url: '', password: '' }];
  const { manager, storage } = await unlocked(entries);
  const before = manager.getEntries();
  let summary;
  const result = await exportVaultFile('json', {
    vaultManager: manager,
    confirmPlaintext: async (info) => { summary = info; return true; }
  });
  const decoded = JSON.parse(await result.blob.text());
  assert.deepEqual(decoded, { format: 'cryptokeep-plaintext', version: 1, entries: before });
  assert.deepEqual(Object.keys(decoded).sort(), ['entries', 'format', 'version']);
  assert.deepEqual(summary, { format: 'json', exportedCount: 2, skippedCount: 0 });
  assert.deepEqual(manager.getEntries(), before);
  assert.equal(storage.writes, 0);
  assert.equal(result.blob.type, 'application/json');
  assert.match(result.filename, /^vault_\d{4}-\d{2}-\d{2}\.json$/);
});

test('VAULT preserves the existing encrypted schema without a plaintext confirmation', async () => {
  const { manager, storage } = await unlocked();
  const before = structuredClone(storage.record);
  const result = await exportVaultFile('vault', {
    vaultManager: manager,
    confirmPlaintext: async () => { assert.fail('Encrypted export needs no plaintext consent'); }
  });
  assert.deepEqual(JSON.parse(await result.blob.text()), before);
  assert.equal(result.blob.type, 'application/json');
  assert.equal(result.format, 'vault');
  assert.equal(result.exportedCount, 1);
  assert.equal(result.skippedCount, 0);
  assert.match(result.filename, /^vault_\d{4}-\d{2}-\d{2}\.vault$/);
  assert.equal((await result.blob.text()).includes(baseEntry.password), false);
  assert.equal(storage.writes, 0);
});

for (const format of ['csv', 'json']) {
  test(`${format} requires a confirmation callback and accepts only the boolean true`, async () => {
    const { manager } = await unlocked();
    await countBlobs(async (created) => {
      await expectCode(exportVaultFile(format, { vaultManager: manager }), 'confirmation_required');
      for (const answer of [false, undefined, null, 'true', 1, {}]) {
        await expectCode(exportVaultFile(format, {
          vaultManager: manager, confirmPlaintext: async () => answer
        }), 'export_cancelled');
      }
      assert.equal(created(), 0);
    });
  });

  test(`${format} creates no Blob while confirmation is pending and snapshots data before consent`, async () => {
    const { manager } = await unlocked();
    const started = deferred();
    const release = deferred();
    await countBlobs(async (created) => {
      const pending = exportVaultFile(format, {
        vaultManager: manager,
        confirmPlaintext: async () => { started.resolve(); return release.promise; }
      });
      await started.promise;
      assert.equal(created(), 0);
      manager.vault.entries[0].password = 'Changed-after-preview';
      release.resolve(true);
      const result = await pending;
      const text = await result.blob.text();
      assert.ok(text.includes(baseEntry.password));
      assert.equal(text.includes('Changed-after-preview'), false);
      assert.equal(created(), 1);
    });
  });

  test(`${format} blocks a lock while confirmation is pending`, async () => {
    const { manager } = await unlocked();
    const started = deferred();
    const release = deferred();
    await countBlobs(async (created) => {
      const pending = exportVaultFile(format, {
        vaultManager: manager,
        confirmPlaintext: async () => { started.resolve(); return release.promise; }
      });
      await started.promise;
      manager.clearSession();
      release.resolve(true);
      await expectCode(pending, 'session_changed');
      assert.equal(created(), 0);
    });
  });

  test(`${format} blocks lock/unlock ABA during confirmation, even when consent is denied`, async () => {
    const { manager } = await unlocked();
    const started = deferred();
    const release = deferred();
    const pending = exportVaultFile(format, {
      vaultManager: manager,
      confirmPlaintext: async () => { started.resolve(); return release.promise; }
    });
    await started.promise;
    manager.clearSession();
    await manager.unlock(PASSWORD);
    release.resolve(false);
    await expectCode(pending, 'session_changed');
  });
}

test('all allowed formats reject a locked vault', async () => {
  const manager = new VaultManager({ storage: new FakeVaultStorage() });
  await countBlobs(async (created) => {
    for (const format of ['vault', 'csv', 'json']) {
      await expectCode(exportVaultFile(format, {
        vaultManager: manager, confirmPlaintext: async () => true
      }), 'vault_locked');
    }
    assert.equal(created(), 0);
  });
});

test('unsupported formats fail before touching manager data or creating a Blob', async () => {
  await countBlobs(async (created) => {
    for (const format of ['xml', 'CSV', '.vault', '', null, undefined, '__proto__']) {
      await assert.rejects(exportVaultFile(format, {}), (error) =>
        error instanceof VaultExportError && error.code === 'unsupported_format');
    }
    assert.equal(created(), 0);
  });
});

test('VAULT rejects an export whose storage read finishes after lock/unlock', async () => {
  const { manager, storage } = await unlocked();
  const started = deferred();
  const release = deferred();
  const originalLoad = storage.loadVault.bind(storage);
  storage.loadVault = async () => {
    storage.loadVault = originalLoad;
    started.resolve();
    await release.promise;
    return originalLoad();
  };
  await countBlobs(async (created) => {
    const pending = exportVaultFile('vault', { vaultManager: manager });
    await started.promise;
    manager.clearSession();
    await manager.unlock(PASSWORD);
    release.resolve();
    await expectCode(pending, 'session_changed');
    assert.equal(created(), 0);
  });
});

test('VAULT rejects a different vault identity returned by storage', async () => {
  const { manager, storage } = await unlocked();
  const replacement = await buildSyntheticVault({ password: 'Other synthetic master phrase', entries: [] });
  storage.record = replacement.record;
  await countBlobs(async (created) => {
    await expectCode(exportVaultFile('vault', { vaultManager: manager }), 'stale_session');
    assert.equal(created(), 0);
  });
});

for (const format of ['csv', 'json']) {
  test(`${format} rejects a silent authoritative replacement before taking a plaintext snapshot`, async () => {
    const { manager, storage } = await unlocked();
    const replacement = await buildSyntheticVault({ password: 'Other synthetic master phrase', entries: [] });
    storage.record = replacement.record;
    await countBlobs(async (created) => {
      await expectCode(exportVaultFile(format, {
        vaultManager: manager,
        confirmPlaintext: async () => { assert.fail('Stale entries must never reach confirmation'); }
      }), 'session_changed');
      assert.equal(manager.masterKey, null);
      assert.deepEqual(manager.getEntries(), []);
      assert.equal(created(), 0);
    });
  });

  test(`${format} rejects a silent authoritative replacement during plaintext confirmation`, async () => {
    const { manager, storage } = await unlocked();
    const replacement = await buildSyntheticVault({ password: 'Other synthetic master phrase', entries: [] });
    await countBlobs(async (created) => {
      await expectCode(exportVaultFile(format, {
        vaultManager: manager,
        confirmPlaintext: async () => { storage.record = replacement.record; return true; }
      }), 'session_changed');
      assert.equal(manager.masterKey, null);
      assert.deepEqual(manager.getEntries(), []);
      assert.equal(created(), 0);
    });
  });

  test(`${format} rejects same-vault fingerprint changes during plaintext confirmation`, async () => {
    const { manager, storage } = await unlocked();
    await countBlobs(async (created) => {
      await expectCode(exportVaultFile(format, {
        vaultManager: manager,
        confirmPlaintext: async () => {
          storage.record.meta.last_modified = '2026-01-03T00:00:00.000Z';
          return true;
        }
      }), 'session_changed');
      assert.equal(manager.masterKey, null);
      assert.deepEqual(manager.getEntries(), []);
      assert.equal(created(), 0);
    });
  });
}

test('dependency failures produce generic errors without secrets', async () => {
  const secret = 'Never expose this synthetic secret';
  for (const [format, deps] of [
    ['vault', {}],
    ['json', { confirmPlaintext: async () => { throw new Error(secret); } }]
  ]) {
    const { manager, storage } = await unlocked();
    if (format === 'vault') storage.loadVault = async () => { throw new Error(secret); };
    await assert.rejects(exportVaultFile(format, { vaultManager: manager, ...deps }), (error) => {
      assert.ok(error instanceof VaultExportError);
      assert.equal(error.code, 'export_failed');
      assert.equal(String(error).includes(secret), false);
      assert.equal(JSON.stringify(error).includes(secret), false);
      return true;
    });
  }
});

console.log('=== TEST VAULT EXPORT SERVICE ===');
let failures = 0;
for (const { label, fn } of cases) {
  try { await fn(); console.log(`  ok   ${label}`); }
  catch (error) {
    failures += 1;
    console.error(`  FAIL ${label}`);
    console.error(error?.stack || error);
  }
}
if (failures > 0) process.exitCode = 1;
else console.log(`Vault export service tests passed (${cases.length} scenarios).`);
