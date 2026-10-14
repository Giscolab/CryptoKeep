import { encryptData, decryptData } from '../crypto/aes-gcm.js';
import { deriveMasterKey } from '../crypto/pbkdf2.js';
import { StorageManager } from '../storage/manager.js';
import {
  CURRENT_PBKDF2_ITERATIONS,
  CURRENT_VAULT_FORMAT_VERSION,
  VAULT_SALT_BYTES,
  base64ToBytes,
  bytesToBase64,
  createVaultMetadata,
  entryAdditionalData,
  metadataNeedsMigration,
  parseVaultMetadata,
  validateVaultRecord,
  validationAdditionalData
} from '../storage/vault-format.js';
import { migrateEntryTimestamps, touchEntryModified } from '../storage/migrations/entry-timestamps.js';
import {
  canonicalize,
  createEncryptedSnapshot,
  recordsAreIdentical
} from '../storage/vault-transaction.js';
import { isPasswordOld } from '../../utils/password-age.js';
import { Vault } from './vault.js';
import { subscribeVaultChanges } from '../storage/vault-sync.js';

export class VaultSessionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'VaultSessionError';
    this.code = code;
    this.details = details;
  }
}

function vaultSessionIdentity(vaultRecord) {
  if (!vaultRecord || !vaultRecord.meta) return null;
  const metadata = parseVaultMetadata(vaultRecord.meta);
  return canonicalize({
    salt: metadata.salt,
    kdf: metadata.kdf,
    iterations: metadata.iterations,
    version: metadata.formatVersion,
    validation: vaultRecord.meta.validation
  });
}

function entryEncryptionOptions(entryId, formatVersion) {
  if (formatVersion < CURRENT_VAULT_FORMAT_VERSION) {
    return {};
  }

  return { additionalData: entryAdditionalData(entryId, formatVersion) };
}

function validationEncryptionOptions(formatVersion) {
  if (formatVersion < CURRENT_VAULT_FORMAT_VERSION) {
    return {};
  }

  return { additionalData: validationAdditionalData(formatVersion) };
}

export class VaultManager {
  constructor(options = {}) {
    this.storage = options.storage || new StorageManager();
    this.vault = new Vault();
    this.masterKey = null;
    this.salt = null;
    this.formatVersion = null;
    this.isFirstTime = false;
    this.sessionIdentity = null;
    this.sessionRecordFingerprint = null;
    this.sessionEpoch = 0;
    this.mutationTail = Promise.resolve();
    this.unsubscribeVaultChanges = null;
    const subscribe = options.subscribeVaultChanges
      || (typeof window !== 'undefined' ? subscribeVaultChanges : null);
    if (typeof subscribe === 'function') {
      this.unsubscribeVaultChanges = subscribe((message) => {
        this._handleExternalVaultChange(message);
      });
    }
  }

  _handleExternalVaultChange(message = {}) {
    if (!this.masterKey) return false;
    this.clearSession();
    if (typeof document !== 'undefined'
      && typeof document.dispatchEvent === 'function'
      && typeof CustomEvent === 'function') {
      try {
        document.dispatchEvent(new CustomEvent('vault:external-change', {
          detail: { nonce: message.nonce || null }
        }));
      } catch {
        /* purge memoire deja effectuee */
      }
    }
    return true;
  }

  /**
   * Verifie le record autoritatif au retour au premier plan. Ce filet couvre
   * notamment le cas rare ou localStorage ET BroadcastChannel ont refuse le
   * signal inter-onglets. La verification attend les mutations locales deja
   * en file pour ne pas confondre notre propre ecriture avec un remplacement.
   */
  async reconcileSessionWithStorage() {
    if (!this.masterKey || !this.sessionIdentity) {
      return { checked: false, invalidated: false };
    }

    const session = this.captureSessionGuard();
    return this._runMutation(session, async () => {
      let current;
      try {
        current = await this._loadVaultRecord();
      } catch {
        if (this.isSessionGuardCurrent(session)) {
          this._handleExternalVaultChange({ reason: 'storage_unreadable' });
        }
        return { checked: true, invalidated: true, reason: 'storage_unreadable' };
      }

      this.assertSessionCurrent(session);
      if (canonicalize(current) !== this.sessionRecordFingerprint) {
        this._handleExternalVaultChange({ reason: 'record_changed' });
        return { checked: true, invalidated: true, reason: 'record_changed' };
      }
      return { checked: true, invalidated: false };
    });
  }

  async initializeStorage() {
    await this.storage.initializeDB();
  }

  async hasVault() {
    await this.initializeStorage();
    return Boolean(await this.storage.loadVault());
  }

  /**
   * Facade publique de la couche de compatibilite.
   *
   * Lot 2 partie 2b : ne restaure plus rien par elle-meme. Sans les rappels
   * `requestPassword` et `confirmRestore`, elle renvoie le refus explicite
   * `secure_restore_required` et n'ecrit rien. Avec eux, elle delegue au
   * service securise, qui exige confirmation, mot de passe et verification
   * cryptographique complete.
   *
   * @param {{requestPassword?: Function, confirmRestore?: Function}} [options]
   * @returns {Promise<{restored: boolean, reason?: string}>}
   */
  async restoreFromLocalBackup(options = {}) {
    await this.initializeStorage();
    return this.storage.restoreFromLocalBackup(options);
  }

  async initialize(password) {
    if (await this.hasVault()) {
      return this.unlock(password);
    }

    return this.createVault(password);
  }

  async createVault(password) {
    const lifecycleEpoch = this.sessionEpoch;
    await this.initializeStorage();
    if (await this.storage.loadVault()) {
      throw new Error('A vault already exists.');
    }

    const salt = crypto.getRandomValues(new Uint8Array(VAULT_SALT_BYTES));
    const key = await deriveMasterKey(password, salt, {
      iterations: CURRENT_PBKDF2_ITERATIONS
    });
    const metadata = createVaultMetadata(bytesToBase64(salt));
    const validation = await encryptData(
      { check: 'ok' },
      key,
      validationEncryptionOptions(CURRENT_VAULT_FORMAT_VERSION)
    );

    const record = validateVaultRecord({
      id: 'current',
      entries: [],
      meta: { ...metadata, validation }
    });
    await this.storage.saveVault(record.entries, record.meta, { expectedCurrent: null });
    await this._installUnlockedSession(
      key,
      salt,
      [],
      CURRENT_VAULT_FORMAT_VERSION,
      record,
      lifecycleEpoch
    );
    return this.getEntries();
  }

  async unlock(password) {
    const lifecycleEpoch = this.sessionEpoch;
    const vaultRecord = await this._loadVaultRecord();
    const metadata = parseVaultMetadata(vaultRecord.meta);
    const salt = base64ToBytes(metadata.salt, 'salt');
    const key = await deriveMasterKey(password, salt, {
      iterations: metadata.iterations
    });

    const validation = await decryptData(
      vaultRecord.meta.validation,
      key,
      validationEncryptionOptions(metadata.formatVersion)
    );

    if (!validation || validation.check !== 'ok') {
      throw new Error('Vault validation failed.');
    }

    const decryptedEntries = await this._decryptEntries(
      vaultRecord.entries,
      key,
      metadata.formatVersion
    );
    const timestampsChanged = migrateEntryTimestamps(decryptedEntries, vaultRecord.meta);

    if (metadataNeedsMigration(metadata)) {
      const migrated = await this._migrateToCurrentFormat(
        password,
        decryptedEntries,
        metadata,
        vaultRecord
      );
      await this._installUnlockedSession(
        migrated.key,
        migrated.salt,
        decryptedEntries,
        CURRENT_VAULT_FORMAT_VERSION,
        migrated.record,
        lifecycleEpoch
      );
      return this.getEntries();
    }

    let sessionRecord = vaultRecord;
    if (timestampsChanged) {
      const expectedCurrent = validateVaultRecord(createEncryptedSnapshot(vaultRecord));
      const updatedMeta = {
        ...vaultRecord.meta,
        last_modified: new Date().toISOString()
      };
      const encryptedEntries = await this._encryptEntries(
        decryptedEntries,
        key,
        metadata.formatVersion
      );
      sessionRecord = validateVaultRecord({
        id: 'current',
        entries: encryptedEntries,
        meta: updatedMeta
      });
      await this.storage.saveVault(encryptedEntries, updatedMeta, { expectedCurrent });
    }

    await this._installUnlockedSession(
      key,
      salt,
      decryptedEntries,
      metadata.formatVersion,
      sessionRecord,
      lifecycleEpoch
    );
    return this.getEntries();
  }

  async addEntry(entryData) {
    const session = this.captureSessionGuard();
    return this._runMutation(session, async () => {
      const { id: ignoredId, ...payload } = entryData || {};
      void ignoredId;

      const id = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const entry = {
        ...payload,
        created_at: payload.created_at || nowIso,
        last_modified: nowIso
      };
      const vaultRecord = await this._loadVaultRecordForSession(session);
      const expectedCurrent = validateVaultRecord(createEncryptedSnapshot(vaultRecord));
      const metadata = parseVaultMetadata(vaultRecord.meta);
      const encrypted = await encryptData(
        entry,
        session.key,
        entryEncryptionOptions(id, metadata.formatVersion)
      );

      vaultRecord.entries.push({ id, ...encrypted });
      vaultRecord.meta.last_modified = nowIso;
      await this._saveVaultForSession(vaultRecord, expectedCurrent, session);
      await this._refreshSessionEntries(session, { written: true });
    });
  }

  async updateEntry(entryId, partialData) {
    const session = this.captureSessionGuard();
    return this._runMutation(session, async () => {
      const vaultRecord = await this._loadVaultRecordForSession(session);
      const expectedCurrent = validateVaultRecord(createEncryptedSnapshot(vaultRecord));
      const metadata = parseVaultMetadata(vaultRecord.meta);
      const entryIndex = vaultRecord.entries.findIndex((entry) => entry.id === entryId);
      if (entryIndex === -1) {
        throw new Error('Entry not found.');
      }

      const currentEntry = await decryptData(
        vaultRecord.entries[entryIndex],
        session.key,
        entryEncryptionOptions(entryId, metadata.formatVersion)
      );
      const { id: ignoredId, ...safePartialData } = partialData || {};
      void ignoredId;

      const updatedEntry = {
        ...currentEntry,
        ...safePartialData,
        last_modified: new Date().toISOString()
      };
      touchEntryModified(updatedEntry);

      const encrypted = await encryptData(
        updatedEntry,
        session.key,
        entryEncryptionOptions(entryId, metadata.formatVersion)
      );
      vaultRecord.entries[entryIndex] = { id: entryId, ...encrypted };
      vaultRecord.meta.last_modified = new Date().toISOString();
      await this._saveVaultForSession(vaultRecord, expectedCurrent, session);
      await this._refreshSessionEntries(session, { written: true });
    });
  }

  async deleteEntry(entryId) {
    const session = this.captureSessionGuard();
    return this._runMutation(session, async () => {
      const vaultRecord = await this._loadVaultRecordForSession(session);
      const expectedCurrent = validateVaultRecord(createEncryptedSnapshot(vaultRecord));
      const remainingEntries = vaultRecord.entries.filter((entry) => entry.id !== entryId);
      if (remainingEntries.length === vaultRecord.entries.length) {
        throw new Error('Entry not found.');
      }

      vaultRecord.meta.last_modified = new Date().toISOString();
      const nextRecord = { ...vaultRecord, entries: remainingEntries };
      await this._saveVaultForSession(nextRecord, expectedCurrent, session);
      await this._refreshSessionEntries(session, { written: true });
    });
  }

  async decryptAllEntries() {
    const session = this.captureSessionGuard();
    await this._refreshSessionEntries(session);
    return this.getEntries();
  }

  async markEntryAccessed(entryId) {
    const session = this.captureSessionGuard();
    return this._runMutation(session, async () => {
      const vaultRecord = await this._loadVaultRecordForSession(session);
      const expectedCurrent = validateVaultRecord(createEncryptedSnapshot(vaultRecord));
      const metadata = parseVaultMetadata(vaultRecord.meta);
      const entryIndex = vaultRecord.entries.findIndex((entry) => entry.id === entryId);
      if (entryIndex === -1) {
        throw new Error('Entry not found.');
      }

      const data = await decryptData(
        vaultRecord.entries[entryIndex],
        session.key,
        entryEncryptionOptions(entryId, metadata.formatVersion)
      );
      data.lastAccessed = Date.now();
      data.accessCount = (data.accessCount || 0) + 1;

      const encrypted = await encryptData(
        data,
        session.key,
        entryEncryptionOptions(entryId, metadata.formatVersion)
      );
      vaultRecord.entries[entryIndex] = { id: entryId, ...encrypted };
      vaultRecord.meta.last_modified = new Date().toISOString();
      await this._saveVaultForSession(vaultRecord, expectedCurrent, session);
      await this._refreshSessionEntries(session, { written: true });
    });
  }

  async getPasswordStats() {
    const entries = this.vault.getAllEntries();
    const stats = { total: entries.length, reused: 0, weak: 0, old: 0 };
    const seen = new Set();

    for (const entry of entries) {
      const password = String(entry.password || '');
      if (seen.has(password)) {
        stats.reused += 1;
      } else {
        seen.add(password);
      }

      if (password.length < 10 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
        stats.weak += 1;
      }

      if (isPasswordOld(entry, 365)) {
        stats.old += 1;
      }
    }

    const score = stats.total > 0
      ? Math.max(0, Math.round(100 * (stats.total - stats.weak - stats.reused) / stats.total))
      : 0;

    return { ...stats, score };
  }

  getEntries() {
    return this.vault.getAllEntries();
  }

  async exportVaultRecord() {
    const vaultRecord = await this._loadVaultRecord();
    return structuredClone(vaultRecord);
  }

  async importVaultRecord(vaultRecord) {
    const lifecycleEpoch = this.sessionEpoch;
    const sessionGuard = this.masterKey && this.sessionIdentity
      ? this.captureSessionGuard()
      : null;
    const assertImportLifecycle = (record = null) => {
      if (sessionGuard) {
        this.assertSessionCurrent(sessionGuard, record);
        return;
      }
      if (this.sessionEpoch !== lifecycleEpoch) {
        throw new VaultSessionError(
          'session_changed',
          'La session a change pendant l\'import.',
          { written: false }
        );
      }
    };
    await this.initializeStorage();
    const normalizedVault = validateVaultRecord(vaultRecord);
    const current = await this.storage.loadVault();
    const result = await this.storage.saveVault(
      normalizedVault.entries,
      normalizedVault.meta,
      {
        expectedCurrent: current,
        assertBeforeWrite: () => assertImportLifecycle(current)
      }
    );
    if (result && result.primarySuperseded === true) {
      return { imported: false, superseded: true };
    }
    if ((sessionGuard && this.isSessionGuardCurrent(sessionGuard))
      || (!sessionGuard && this.sessionEpoch === lifecycleEpoch)) {
      this.clearSession();
    }
    return { imported: true, superseded: false };
  }

  clearSession() {
    if (this.salt instanceof Uint8Array) {
      this.salt.fill(0);
    }

    this.masterKey = null;
    this.salt = null;
    this.formatVersion = null;
    this.sessionIdentity = null;
    this.sessionRecordFingerprint = null;
    this.vault.clear();
    this.sessionEpoch += 1;
  }

  async _migrateToCurrentFormat(password, entries, previousMetadata, previousRecord) {
    const salt = crypto.getRandomValues(new Uint8Array(VAULT_SALT_BYTES));
    const key = await deriveMasterKey(password, salt, {
      iterations: CURRENT_PBKDF2_ITERATIONS
    });
    const now = new Date().toISOString();
    const metadata = createVaultMetadata(bytesToBase64(salt), {
      createdAt: previousMetadata.createdAt || now,
      lastModified: now
    });
    const encryptedEntries = await this._encryptEntries(
      entries,
      key,
      CURRENT_VAULT_FORMAT_VERSION
    );
    const validation = await encryptData(
      { check: 'ok' },
      key,
      validationEncryptionOptions(CURRENT_VAULT_FORMAT_VERSION)
    );

    const record = validateVaultRecord({
      id: 'current',
      entries: encryptedEntries,
      meta: { ...metadata, validation }
    });
    const expectedCurrent = validateVaultRecord(createEncryptedSnapshot(previousRecord));
    await this.storage.saveVault(record.entries, record.meta, { expectedCurrent });
    return { key, salt, record };
  }

  async _decryptEntries(entries, key, formatVersion) {
    const decryptedEntries = [];

    for (const entry of entries) {
      const data = await decryptData(
        entry,
        key,
        entryEncryptionOptions(entry.id, formatVersion)
      );
      decryptedEntries.push({ ...data, id: entry.id });
    }

    return decryptedEntries;
  }

  async _encryptEntries(entries, key, formatVersion) {
    const encryptedEntries = [];

    for (const entry of entries) {
      const { id, ...payload } = entry;
      const encrypted = await encryptData(
        payload,
        key,
        entryEncryptionOptions(id, formatVersion)
      );
      encryptedEntries.push({ id, ...encrypted });
    }

    return encryptedEntries;
  }

  async _loadVaultRecord() {
    await this.initializeStorage();
    const vaultRecord = await this.storage.loadVault();
    if (!vaultRecord) {
      throw new Error('No vault exists.');
    }

    return validateVaultRecord(vaultRecord);
  }

  async _installUnlockedSession(key, salt, entries, formatVersion, expectedRecord, expectedEpoch) {
    let latestRecord;
    let sessionEntries = entries;

    try {
      // Ferme la fenetre entre la premiere lecture et l'installation de la
      // session : PBKDF2 et le dechiffrement peuvent laisser le temps a un
      // autre onglet de remplacer integralement le coffre.
      latestRecord = await this._loadVaultRecord();
      if (vaultSessionIdentity(latestRecord) !== vaultSessionIdentity(expectedRecord)) {
        throw new VaultSessionError(
          'stale_session',
          'Le coffre a ete remplace pendant le deverrouillage. Reessayez.',
          { written: false }
        );
      }

      const latestMetadata = parseVaultMetadata(latestRecord.meta);
      if (!recordsAreIdentical(latestRecord, expectedRecord)) {
        sessionEntries = await this._decryptEntries(
          latestRecord.entries,
          key,
          latestMetadata.formatVersion
        );
      }

      this._setSession(
        key,
        salt,
        sessionEntries,
        latestMetadata.formatVersion || formatVersion,
        latestRecord,
        expectedEpoch
      );
    } catch (error) {
      if (salt instanceof Uint8Array) salt.fill(0);
      if (Array.isArray(sessionEntries) && sessionEntries !== entries) sessionEntries.length = 0;
      if (Array.isArray(entries)) entries.length = 0;
      throw error;
    }

    // Vault.addEntry copie les objets : les tableaux temporaires peuvent etre
    // liberes aussitot la session installee.
    if (Array.isArray(sessionEntries) && sessionEntries !== entries) sessionEntries.length = 0;
    if (Array.isArray(entries)) entries.length = 0;
  }

  async _loadVaultRecordForSession(session) {
    const vaultRecord = await this._loadVaultRecord();
    this.assertSessionCurrent(session, vaultRecord);
    return vaultRecord;
  }

  async _saveVaultForSession(vaultRecord, expectedCurrent, session) {
    this.assertSessionCurrent(session, expectedCurrent);

    try {
      await this.storage.saveVault(
        vaultRecord.entries,
        vaultRecord.meta,
        { expectedCurrent }
      );
    } catch (error) {
      if (error && error.code === 'write_conflict') {
        // Un conflit portant sur un coffre remplace par une autre identite
        // invalide immediatement la session. Un conflit de meme identite reste
        // un refus sans perte et peut etre retente par l'utilisateur.
        const latest = await this._loadVaultRecord();
        this.assertSessionCurrent(session, latest);
      }
      throw error;
    }

    this.assertSessionCurrent(session, null, { written: true });
  }

  async _refreshSessionEntries(session, details = {}) {
    const vaultRecord = await this._loadVaultRecordForSession(session);
    const metadata = parseVaultMetadata(vaultRecord.meta);
    let decryptedEntries;

    try {
      decryptedEntries = await this._decryptEntries(
        vaultRecord.entries,
        session.key,
        metadata.formatVersion
      );
    } catch {
      this.clearSession();
      throw new VaultSessionError(
        'session_record_unreadable',
        'La session ne correspond plus au coffre actuel. Reconnectez-vous.',
        { written: details.written === true }
      );
    }

    this.assertSessionCurrent(session, vaultRecord, details);
    this._replaceEntries(decryptedEntries);
    this.sessionRecordFingerprint = canonicalize(vaultRecord);
    decryptedEntries.length = 0;
  }

  captureSessionGuard() {
    if (!this.masterKey || !this.sessionIdentity) {
      throw new VaultSessionError(
        'vault_locked',
        'Le coffre est verrouille.',
        { written: false }
      );
    }

    return Object.freeze({
      epoch: this.sessionEpoch,
      key: this.masterKey,
      identity: this.sessionIdentity
    });
  }

  isSessionGuardCurrent(session) {
    return Boolean(
      session
      && this.masterKey
      && this.masterKey === session.key
      && this.sessionEpoch === session.epoch
      && this.sessionIdentity === session.identity
    );
  }

  assertSessionCurrent(session, vaultRecord = null, details = {}) {
    if (!this.isSessionGuardCurrent(session)) {
      throw new VaultSessionError(
        'session_changed',
        'La session a ete verrouillee ou remplacee. Reconnectez-vous.',
        { written: details.written === true }
      );
    }

    if (vaultRecord && vaultSessionIdentity(vaultRecord) !== session.identity) {
      this.clearSession();
      throw new VaultSessionError(
        'stale_session',
        'Le coffre a ete remplace dans un autre contexte. Reconnectez-vous.',
        { written: details.written === true }
      );
    }

    return true;
  }

  _setSession(key, salt, entries, formatVersion, vaultRecord, expectedEpoch = null) {
    if (expectedEpoch !== null && this.sessionEpoch !== expectedEpoch) {
      if (salt instanceof Uint8Array) salt.fill(0);
      throw new VaultSessionError(
        'session_changed',
        'La session a ete verrouillee pendant l\'operation.',
        { written: true }
      );
    }

    const identity = vaultSessionIdentity(vaultRecord);
    if (this.salt instanceof Uint8Array && this.salt !== salt) {
      this.salt.fill(0);
    }
    this.masterKey = key;
    this.salt = salt;
    this.formatVersion = formatVersion;
    this.sessionIdentity = identity;
    this.sessionRecordFingerprint = canonicalize(vaultRecord);
    this.sessionEpoch += 1;
    this._replaceEntries(entries);
  }

  _runMutation(session, task) {
    const previous = this.mutationTail;
    let release;
    this.mutationTail = new Promise((resolve) => { release = resolve; });

    return (async () => {
      await previous;
      try {
        // Le garde est capture au moment ou l'appel est demande, pas lorsque
        // il atteint enfin la tete de file. Une operation issue d'une ancienne
        // session ne peut donc pas "sauter" un verrouillage puis s'appliquer
        // a une session rouverte entre-temps.
        this.assertSessionCurrent(session);
        return await task();
      } finally {
        release();
      }
    })();
  }

  _replaceEntries(entries) {
    this.vault.clear();
    entries.forEach((entry) => this.vault.addEntry(entry));
  }

  _requireUnlocked() {
    if (!this.masterKey) {
      throw new Error('Vault is locked.');
    }
  }
}

export const vaultManager = new VaultManager();
