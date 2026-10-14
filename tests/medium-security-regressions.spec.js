/**
 * Regressions des six constats moyens valides sur le code courant.
 *
 * Fixtures exclusivement synthetiques : aucun fichier utilisateur, aucun
 * export de coffre et aucune donnee persistante reelle ne sont lus.
 */
import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import { encryptData } from '../scripts/core/crypto/aes-gcm.js';
import { StorageManager } from '../scripts/core/storage/manager.js';
import {
  canonicalize,
  createEncryptedSnapshot,
  recordsAreIdentical,
  VaultWriteConflictError,
  writeVaultRecordVerified
} from '../scripts/core/storage/vault-transaction.js';
import { entryAdditionalData, validateVaultRecord } from '../scripts/core/storage/vault-format.js';
import { VaultManager } from '../scripts/core/vault/manager.js';
import { changeMasterPassword } from '../scripts/core/vault/master-password-change.js';
import {
  closeReuseResolver,
  getReuseResolverStateSummary,
  openReuseResolver
} from '../scripts/ui/reuse-resolver-modal.js';
import {
  getActiveSecureDialogCount,
  requestPasswordDialog
} from '../scripts/ui/secure-dialogs.js';
import { lockVaultSession } from '../scripts/security/session-lock.js';
import {
  analyzeReuse,
  clearReuseAnalysis,
  getReuseGroups
} from '../scripts/security/password-reuse.js';
import {
  clearHibpCache,
  getHibpCacheSize,
  isPasswordPwned,
  setHibpConsent
} from '../scripts/security/hibp-service.js';
import {
  clearAuditReport,
  getLastAuditReport,
  runAndRenderAudit
} from '../scripts/ui/audit-report-view.js';
import { FakeIDBDatabase } from './helpers/fake-indexeddb.js';
import { loadIndexHtmlDocument } from './helpers/app-dom.js';
import { FakeLocalStorage, buildSyntheticVault } from './helpers/vault-fixtures.js';

const cases = [];
function test(label, fn) { cases.push({ label, fn }); }

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function installStorage(record) {
  const db = new FakeIDBDatabase(record);
  const storage = new StorageManager();
  storage.db = db;
  storage.initializeDB = async () => { storage.db = db; };
  return { db, storage };
}

function makeCasRecordStorage(record) {
  return {
    record: structuredClone(record),
    loads: 0,
    gateLoadNumber: null,
    gatedLoadStarted: null,
    gatedLoadRelease: null,
    async initializeDB() {},
    async loadVault() {
      this.loads += 1;
      if (this.gateLoadNumber === this.loads) {
        this.gateLoadNumber = null;
        this.gatedLoadStarted?.resolve();
        await this.gatedLoadRelease?.promise;
      }
      return structuredClone(this.record);
    },
    async putVaultRecord(next, options = {}) {
      if (Object.prototype.hasOwnProperty.call(options, 'expectedCurrent')
        && !recordsAreIdentical(this.record, options.expectedCurrent)) {
        throw new VaultWriteConflictError();
      }
      if (typeof options.assertBeforeWrite === 'function') options.assertBeforeWrite();
      this.record = structuredClone(next);
      return structuredClone(this.record);
    }
  };
}

test('M1 - un seul auteur parti du meme predecesseur peut valider', async () => {
  const password = 'Phrase synthetique CAS 2026 !';
  const built = await buildSyntheticVault({ password, entries: [] });
  const { db, storage } = installStorage(built.record);
  const snapshot = validateVaultRecord(createEncryptedSnapshot(built.record));

  const firstEncrypted = await encryptData(
    { title: 'Premier', username: 'a', password: 'Secret-A-2026!' },
    built.key,
    { additionalData: entryAdditionalData('cas-a', 2) }
  );
  const secondEncrypted = await encryptData(
    { title: 'Second', username: 'b', password: 'Secret-B-2026!' },
    built.key,
    { additionalData: entryAdditionalData('cas-b', 2) }
  );
  const first = validateVaultRecord({
    ...structuredClone(built.record),
    entries: [{ id: 'cas-a', ...firstEncrypted }],
    meta: { ...built.record.meta, last_modified: '2026-10-14T20:00:00.000Z' }
  });
  const second = validateVaultRecord({
    ...structuredClone(built.record),
    entries: [{ id: 'cas-b', ...secondEncrypted }],
    meta: { ...built.record.meta, last_modified: '2026-10-14T20:00:01.000Z' }
  });

  const results = await Promise.allSettled([
    writeVaultRecordVerified(storage, first, snapshot),
    writeVaultRecordVerified(storage, second, snapshot)
  ]);
  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');

  assert.equal(fulfilled.length, 1, 'Un seul remplacement doit etre valide');
  assert.equal(rejected.length, 1, 'Le remplacement obsolete doit etre refuse');
  assert.equal(rejected[0].reason.code, 'write_conflict');
  const persisted = db.peek();
  assert.ok(recordsAreIdentical(persisted, first) || recordsAreIdentical(persisted, second));
});

test('M2 - un rollback tardif ne remplace jamais un successeur', async () => {
  const password = 'Phrase synthetique rollback 2026 !';
  const built = await buildSyntheticVault({ password, entries: [] });
  const snapshot = validateVaultRecord(createEncryptedSnapshot(built.record));
  const candidate = validateVaultRecord({
    ...structuredClone(built.record),
    meta: { ...built.record.meta, last_modified: '2026-10-14T20:10:00.000Z' }
  });
  const successor = validateVaultRecord({
    ...structuredClone(built.record),
    meta: { ...built.record.meta, last_modified: '2026-10-14T20:11:00.000Z' }
  });

  const storage = {
    record: structuredClone(snapshot),
    injectSuccessor: false,
    async putVaultRecord(record, options = {}) {
      if (Object.prototype.hasOwnProperty.call(options, 'expectedCurrent')
        && !recordsAreIdentical(this.record, options.expectedCurrent)) {
        throw new VaultWriteConflictError();
      }
      this.record = structuredClone(record);
      if (recordsAreIdentical(record, candidate)) this.injectSuccessor = true;
    },
    async loadVault() {
      if (this.injectSuccessor) {
        this.injectSuccessor = false;
        this.record = structuredClone(successor);
      }
      return structuredClone(this.record);
    }
  };

  const report = await writeVaultRecordVerified(storage, candidate, snapshot);
  assert.equal(report.superseded, true);
  assert.equal(canonicalize(storage.record), canonicalize(successor));
});

test('M3 - une session obsolete ne peut pas melanger une ancienne cle', async () => {
  const oldPassword = 'Phrase synthetique ancienne 2026 !';
  const newPassword = 'Phrase synthetique nouvelle 2026 !';
  const original = await buildSyntheticVault({
    password: oldPassword,
    entries: [{
      id: 'original',
      title: 'Original',
      username: 'alice',
      password: 'Entree-Originale-2026!',
      created_at: '2026-10-14T18:00:00.000Z',
      last_modified: '2026-10-14T18:00:00.000Z'
    }]
  });
  const replacement = await buildSyntheticVault({
    password: newPassword,
    entries: [{
      id: 'replacement',
      title: 'Remplacement',
      username: 'bob',
      password: 'Entree-Remplacement-2026!',
      created_at: '2026-10-14T19:00:00.000Z',
      last_modified: '2026-10-14T19:00:00.000Z'
    }]
  });
  const { storage } = installStorage(original.record);
  const replacingTab = new VaultManager({ storage });
  const staleTab = new VaultManager({ storage });
  await replacingTab.unlock(oldPassword);
  await staleTab.unlock(oldPassword);

  await replacingTab.importVaultRecord(replacement.record);
  await assert.rejects(
    staleTab.addEntry({ title: 'Interdit', username: 'x', password: 'Ancienne-Cle-2026!' }),
    (error) => error?.code === 'stale_session'
  );
  assert.equal(staleTab.masterKey, null);
  assert.deepEqual(staleTab.getEntries(), []);

  const verifier = new VaultManager({ storage });
  const entries = await verifier.unlock(newPassword);
  assert.deepEqual(entries.map((entry) => entry.id), ['replacement']);
});

test('M3b - un signal inter-onglets purge immediatement cle et plaintexts', async () => {
  const password = 'Phrase synthetique signal inter onglets 2026 !';
  const built = await buildSyntheticVault({
    password,
    entries: [{
      id: 'cross-tab',
      title: 'Inter onglets',
      password: 'Cross-Tab-2026!',
      created_at: '2026-10-14T18:00:00.000Z',
      last_modified: '2026-10-14T18:00:00.000Z'
    }]
  });
  let externalChange = null;
  const storage = {
    record: structuredClone(built.record),
    async initializeDB() {},
    async loadVault() { return structuredClone(this.record); }
  };
  const manager = new VaultManager({
    storage,
    subscribeVaultChanges: (listener) => {
      externalChange = listener;
      return () => {};
    }
  });
  await manager.unlock(password);
  assert.equal(manager.getEntries().length, 1);
  assert.equal(typeof externalChange, 'function');

  externalChange({ nonce: 'fixture-externe' });
  assert.equal(manager.masterKey, null);
  assert.deepEqual(manager.getEntries(), []);
  assert.equal(manager.sessionIdentity, null);
});

test('M3c - le retour au premier plan detecte un signal inter-onglets manque', async () => {
  const password = 'Phrase synthetique reconciliation 2026 !';
  const built = await buildSyntheticVault({
    password,
    entries: [{
      id: 'reconcile',
      title: 'Reconciliation',
      password: 'Reconciliation-2026!',
      created_at: '2026-10-14T18:00:00.000Z',
      last_modified: '2026-10-14T18:00:00.000Z'
    }]
  });
  const storage = {
    record: structuredClone(built.record),
    async initializeDB() {},
    async loadVault() { return structuredClone(this.record); }
  };
  const manager = new VaultManager({ storage, subscribeVaultChanges: () => () => {} });
  await manager.unlock(password);

  const stable = await manager.reconcileSessionWithStorage();
  assert.equal(stable.invalidated, false, 'Un record identique ne doit pas fermer la session');

  storage.record.meta.last_modified = '2026-10-14T21:00:00.000Z';
  const changed = await manager.reconcileSessionWithStorage();
  assert.equal(changed.invalidated, true);
  assert.equal(changed.reason, 'record_changed');
  assert.equal(manager.masterKey, null);
  assert.deepEqual(manager.getEntries(), []);
});

test('M4 - verrouiller pendant un ajout ne repeuple jamais le plaintext', async () => {
  const password = 'Phrase synthetique ajout 2026 !';
  const built = await buildSyntheticVault({ password, entries: [] });
  const started = deferred();
  const release = deferred();
  const storage = {
    record: structuredClone(built.record),
    delayNextSave: false,
    async initializeDB() {},
    async loadVault() { return structuredClone(this.record); },
    async saveVault(entries, meta, options = {}) {
      if (this.delayNextSave) {
        this.delayNextSave = false;
        started.resolve();
        await release.promise;
      }
      if (Object.prototype.hasOwnProperty.call(options, 'expectedCurrent')
        && !recordsAreIdentical(this.record, options.expectedCurrent)) {
        const error = new Error('conflict');
        error.code = 'write_conflict';
        throw error;
      }
      this.record = validateVaultRecord({ id: 'current', entries, meta });
      return { written: true };
    }
  };
  const manager = new VaultManager({ storage });
  await manager.unlock(password);
  storage.delayNextSave = true;

  const pending = manager.addEntry({
    title: 'Ajout en vol',
    username: 'fixture',
    password: 'Secret-Ajout-2026!'
  });
  await started.promise;
  manager.clearSession();
  release.resolve();

  await assert.rejects(pending, (error) => {
    assert.equal(error.name, 'VaultSessionError');
    assert.equal(error.details.written, true);
    return true;
  });
  assert.equal(manager.masterKey, null);
  assert.deepEqual(manager.getEntries(), []);
});

test('M4b - une mutation en file ne saute pas vers une session rouverte', async () => {
  const password = 'Phrase synthetique file 2026 !';
  const built = await buildSyntheticVault({ password, entries: [] });
  const started = deferred();
  const release = deferred();
  const storage = {
    record: structuredClone(built.record),
    delayNextSave: false,
    async initializeDB() {},
    async loadVault() { return structuredClone(this.record); },
    async saveVault(entries, meta, options = {}) {
      if (this.delayNextSave) {
        this.delayNextSave = false;
        started.resolve();
        await release.promise;
      }
      if (Object.prototype.hasOwnProperty.call(options, 'expectedCurrent')
        && !recordsAreIdentical(this.record, options.expectedCurrent)) {
        const error = new Error('conflict');
        error.code = 'write_conflict';
        throw error;
      }
      this.record = validateVaultRecord({ id: 'current', entries, meta });
      return { written: true };
    }
  };
  const manager = new VaultManager({ storage });
  await manager.unlock(password);
  storage.delayNextSave = true;

  const first = manager.addEntry({ title: 'Premier', password: 'Secret-Premier-2026!' });
  await started.promise;
  const queued = manager.addEntry({ title: 'Ancienne session', password: 'Secret-File-2026!' });

  manager.clearSession();
  await manager.unlock(password);
  release.resolve();

  await assert.rejects(first, (error) => (
    error?.code === 'session_changed' && error.details?.written === true
  ));
  await assert.rejects(queued, (error) => (
    error?.code === 'session_changed' && error.details?.written === false
  ));
  assert.notEqual(manager.masterKey, null, 'La session explicitement rouverte reste active');
  assert.deepEqual(manager.getEntries(), [], 'Aucune ancienne continuation ne repeuple la session');

  const verifier = new VaultManager({ storage });
  const persisted = await verifier.unlock(password);
  assert.deepEqual(persisted.map((entry) => entry.title), ['Premier']);
});

test('M5 - un changement de mot de passe termine reste verrouille', async () => {
  const oldPassword = 'Phrase synthetique maitre ancienne 2026 !';
  const newPassword = 'Phrase synthetique maitre nouvelle 2026 !';
  const built = await buildSyntheticVault({ password: oldPassword, entries: [] });
  const started = deferred();
  const release = deferred();
  const storage = {
    record: structuredClone(built.record),
    gateNextPut: false,
    async initializeDB() {},
    async loadVault() { return structuredClone(this.record); },
    async putVaultRecord(record, options = {}) {
      if (this.gateNextPut) {
        this.gateNextPut = false;
        started.resolve();
        await release.promise;
      }
      if (Object.prototype.hasOwnProperty.call(options, 'expectedCurrent')
        && !recordsAreIdentical(this.record, options.expectedCurrent)) {
        throw new VaultWriteConflictError();
      }
      this.record = structuredClone(record);
    }
  };
  const manager = new VaultManager({ storage });
  await manager.unlock(oldPassword);
  storage.gateNextPut = true;
  const pending = changeMasterPassword(manager, {
    currentPassword: oldPassword,
    newPassword,
    confirmPassword: newPassword
  }, { localStorageRef: new FakeLocalStorage() });

  await started.promise;
  manager.clearSession();
  release.resolve();
  const report = await pending;

  assert.equal(report.changed, true);
  assert.equal(report.session.locked, true);
  assert.equal(report.session.renewed, false);
  assert.equal(report.session.reason, 'session_changed');
  assert.equal(manager.masterKey, null);
  assert.deepEqual(manager.getEntries(), []);

  const verifier = new VaultManager({ storage });
  await verifier.unlock(newPassword);
  assert.notEqual(verifier.masterKey, null);
});

test('M5b - une ancienne relance de session ne verrouille pas la session rouverte', async () => {
  const oldPassword = 'Phrase synthetique renouvellement ancienne 2026 !';
  const newPassword = 'Phrase synthetique renouvellement nouvelle 2026 !';
  const built = await buildSyntheticVault({
    password: oldPassword,
    entries: [{
      id: 'renewal-entry',
      title: 'Renouvellement',
      password: 'Entree-Renouvellement-2026!',
      created_at: '2026-10-14T18:00:00.000Z',
      last_modified: '2026-10-14T18:00:00.000Z'
    }]
  });
  const storage = makeCasRecordStorage(built.record);
  const manager = new VaultManager({ storage });
  await manager.unlock(oldPassword);

  const renewalStarted = deferred();
  const releaseRenewal = deferred();
  storage.gatedLoadStarted = renewalStarted;
  storage.gatedLoadRelease = releaseRenewal;
  storage.gateLoadNumber = storage.loads + 5;

  const pending = changeMasterPassword(manager, {
    currentPassword: oldPassword,
    newPassword,
    confirmPassword: newPassword
  }, { localStorageRef: new FakeLocalStorage() });

  await renewalStarted.promise;
  manager.clearSession();
  await manager.unlock(newPassword);
  releaseRenewal.resolve();
  const report = await pending;

  assert.equal(report.changed, true);
  assert.equal(report.session.reason, 'session_changed');
  assert.equal(report.session.locked, false);
  assert.notEqual(manager.masterKey, null, 'La nouvelle session doit rester active');
  assert.deepEqual(manager.getEntries().map((entry) => entry.id), ['renewal-entry']);
});

test('M5c - lockAfterChange ne ferme pas une session ouverte plus tard', async () => {
  const oldPassword = 'Phrase synthetique lockAfter ancienne 2026 !';
  const newPassword = 'Phrase synthetique lockAfter nouvelle 2026 !';
  const built = await buildSyntheticVault({ password: oldPassword, entries: [] });
  const storage = makeCasRecordStorage(built.record);
  const manager = new VaultManager({ storage });
  await manager.unlock(oldPassword);

  const persistenceDone = deferred();
  const releaseLock = deferred();
  const lockManager = {
    async request(_name, _options, task) {
      const result = await task();
      persistenceDone.resolve();
      await releaseLock.promise;
      return result;
    }
  };

  const pending = changeMasterPassword(manager, {
    currentPassword: oldPassword,
    newPassword,
    confirmPassword: newPassword
  }, {
    localStorageRef: new FakeLocalStorage(),
    lockAfterChange: true,
    lockManager
  });

  await persistenceDone.promise;
  manager.clearSession();
  await manager.unlock(newPassword);
  releaseLock.resolve();
  const report = await pending;

  assert.equal(report.changed, true);
  assert.equal(report.session.reason, 'session_changed');
  assert.equal(report.session.locked, false);
  assert.notEqual(manager.masterKey, null);
});

test('M6 - verrouillage purge tous les champs sensibles omis', async () => {
  const doc = loadIndexHtmlDocument();
  const ids = [
    'entry-title', 'entry-username', 'password', 'website', 'entry-notes',
    'entry-tags', 'currentPassword', 'newPassword', 'confirmPassword',
    'searchInput', 'dashboardSearchInput'
  ];
  ids.forEach((id) => {
    const field = doc.getElementById(id);
    assert.ok(field, `Champ ${id} absent du vrai index.html`);
    field.value = `secret-${id}`;
    if (id.includes('Password') || id === 'password') field.type = 'text';
  });
  const category = doc.getElementById('category');
  category.value = 'banking';
  category.selectedIndex = 1;

  const previousDocument = globalThis.document;
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.document = doc;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  };

  const manager = {
    masterKey: { synthetic: true },
    entries: [{ id: 'secret' }],
    clearSession() { this.masterKey = null; this.entries = []; },
    getEntries() { return this.entries.slice(); }
  };
  try {
    const pendingPassword = requestPasswordDialog({
      doc,
      title: 'Fixture de verrouillage',
      description: 'Dialogue synthetique uniquement.'
    });
    const secureInput = doc.getElementById('secure-dialog-password');
    assert.ok(secureInput, 'Le champ dynamique du dialogue securise doit exister');
    secureInput.value = 'Secret-Dialogue-2026!';
    secureInput.type = 'text';
    assert.equal(getActiveSecureDialogCount(), 1);

    await lockVaultSession(manager, { notify: false });
    assert.equal(await pendingPassword, null, 'Le dialogue en attente doit etre annule');
    ids.forEach((id) => assert.equal(doc.getElementById(id).value, '', `${id} doit etre vide`));
    ['password', 'currentPassword', 'newPassword', 'confirmPassword']
      .forEach((id) => assert.equal(doc.getElementById(id).type, 'password'));
    assert.equal(category.value, '');
    assert.equal(category.selectedIndex, 0);
    assert.equal(secureInput.value, '', 'La valeur du dialogue retire doit etre purgee');
    assert.equal(secureInput.type, 'password');
    assert.equal(getActiveSecureDialogCount(), 0);
    assert.equal(doc.getElementById('secure-dialog-password'), null);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
});

test('M7 - le resolveur libere entrees, mots de passe et callback', async () => {
  const doc = loadIndexHtmlDocument();
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.document = doc;
  globalThis.window = { alert() {} };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  };

  const group = {
    entries: [
      { id: 'r1', title: 'Alpha', username: 'alice', url: 'https://alpha.example.test' },
      { id: 'r2', title: 'Beta', username: 'bob', url: 'https://beta.example.test' }
    ]
  };
  const entries = [
    { ...group.entries[0], password: 'Reuse-Secret-2026!' },
    { ...group.entries[1], password: 'Reuse-Secret-2026!' }
  ];
  let saves = 0;

  try {
    openReuseResolver(group, entries, async () => { saves += 1; });
    const modal = doc.getElementById('reuse-resolver-modal');
    const generate = modal.querySelector('[data-action="generate"]');
    generate.click();
    assert.equal(getReuseResolverStateSummary().entryCount, 2);
    assert.equal(getReuseResolverStateSummary().generatedPasswordCount, 2);
    assert.equal(Object.prototype.hasOwnProperty.call(group, '_generatedPasswords'), false);

    const staleConfirm = modal.querySelector('[data-action="confirm"]');
    closeReuseResolver();
    assert.deepEqual(getReuseResolverStateSummary(), {
      modalRetained: false,
      groupRetained: false,
      entryCount: 0,
      generatedPasswordCount: 0,
      completedCount: 0,
      callbackRetained: false
    });
    assert.equal(modal.querySelector('#new-password-input').value, '');
    staleConfirm.click();
    await Promise.resolve();
    assert.equal(saves, 0, 'Un ecouteur detache ne doit plus invoquer l ancien callback');
  } finally {
    closeReuseResolver();
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
});

test('M7b - une sauvegarde du resolveur fermee ne touche pas la nouvelle instance', async () => {
  const doc = loadIndexHtmlDocument();
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.document = doc;
  globalThis.window = { alert() {} };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  };

  const saveStarted = deferred();
  const releaseSave = deferred();
  const callbackFinished = deferred();
  const oldGroup = { entries: [{ id: 'same-id', title: 'Ancien compte' }] };
  const oldEntries = [{ id: 'same-id', title: 'Ancien compte', password: 'Ancien-Secret-2026!' }];
  const newGroup = { entries: [{ id: 'same-id', title: 'Nouveau compte' }] };
  const newEntries = [{ id: 'same-id', title: 'Nouveau compte', password: 'Nouveau-Secret-2026!' }];

  try {
    openReuseResolver(oldGroup, oldEntries, async () => {
      saveStarted.resolve();
      await releaseSave.promise;
      callbackFinished.resolve();
    });
    const oldModal = doc.getElementById('reuse-resolver-modal');
    oldModal.querySelector('[data-action="manual"]').click();
    oldModal.querySelector('#new-password-input').value = 'Remplacement-2026!';
    oldModal.querySelector('[data-action="confirm"]').click();
    await saveStarted.promise;

    closeReuseResolver();
    openReuseResolver(newGroup, newEntries, async () => {});
    releaseSave.resolve();
    await callbackFinished.promise;
    await Promise.resolve();

    assert.equal(newEntries[0].password, 'Nouveau-Secret-2026!',
      'L ancienne continuation ne doit pas modifier les entrees de la nouvelle instance');
    assert.equal(getReuseResolverStateSummary().completedCount, 0,
      'La progression de la nouvelle instance doit rester intacte');
  } finally {
    closeReuseResolver();
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
});

test('M8 - verrouiller invalide reutilisation, HIBP et rapport en vol', async () => {
  const reuseStarted = deferred();
  const releaseReuse = deferred();
  let firstDigest = true;
  const pendingReuse = analyzeReuse([
    { id: 'a', title: 'A', password: 'Secret-Reutilise-2026!' },
    { id: 'b', title: 'B', password: 'Secret-Reutilise-2026!' }
  ], {
    digest: async () => {
      if (firstDigest) {
        firstDigest = false;
        reuseStarted.resolve();
        await releaseReuse.promise;
      }
      return 'digest-synthetique';
    }
  });
  await reuseStarted.promise;
  clearReuseAnalysis();
  releaseReuse.resolve();
  assert.deepEqual(await pendingReuse, []);
  assert.deepEqual(getReuseGroups(), [], 'Aucun groupe ne doit reapparaitre apres le lock');

  const consentStorage = new FakeLocalStorage();
  setHibpConsent(true, {
    storage: consentStorage,
    now: '2026-10-14T20:00:00.000Z'
  });
  clearHibpCache();
  const fetchStarted = deferred();
  const releaseFetch = deferred();
  const pendingHibp = isPasswordPwned('Secret-HIBP-Synthetique-2026!', {
    storage: consentStorage,
    fetchImpl: async () => {
      fetchStarted.resolve();
      await releaseFetch.promise;
      return { ok: true, text: async () => '' };
    }
  });
  await fetchStarted.promise;
  clearHibpCache();
  releaseFetch.resolve();
  const hibpResult = await pendingHibp;
  assert.equal(hibpResult.checked, false);
  assert.equal(hibpResult.reason, 'aborted');
  assert.equal(getHibpCacheSize(), 0, 'Une reponse tardive ne doit pas repeupler le cache');

  const doc = loadIndexHtmlDocument();
  const previousDocument = globalThis.document;
  globalThis.document = doc;
  const auditStarted = deferred();
  const releaseAudit = deferred();
  const guard = Object.freeze({ epoch: 1 });
  let sessionActive = true;
  const manager = {
    masterKey: { synthetic: true },
    getEntries: () => [{ id: 'audit-a', title: 'Audit', password: 'Audit-Secret-2026!' }],
    captureSessionGuard: () => guard,
    isSessionGuardCurrent: (candidate) => sessionActive && candidate === guard
  };
  try {
    clearAuditReport({ doc });
    const pendingAudit = runAndRenderAudit({
      doc,
      vaultManager: manager,
      runAudit: async () => {
        auditStarted.resolve();
        await releaseAudit.promise;
        return { status: 'completed', generatedAt: '2026-10-14T20:00:00.000Z' };
      }
    });
    await auditStarted.promise;
    sessionActive = false;
    manager.masterKey = null;
    clearAuditReport({ doc });
    releaseAudit.resolve();
    const auditResult = await pendingAudit;
    assert.equal(auditResult.status, 'not_run');
    assert.equal(getLastAuditReport().status, 'not_run',
      'Le rapport termine apres verrouillage ne doit pas etre publie');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

console.log('=== TEST MEDIUM SECURITY REGRESSIONS ===');
let failures = 0;
for (const { label, fn } of cases) {
  try {
    await fn();
    console.log(`  ok   ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`  ECHEC ${label}`);
    console.error(`        ${error?.stack || error}`);
  }
}

if (failures > 0) {
  console.error(`Medium security regression tests failed: ${failures} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Medium security regression tests passed (${cases.length} scenarios).`);
}
