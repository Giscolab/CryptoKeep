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
import { isPasswordOld } from '../../utils/password-age.js';
import { Vault } from './vault.js';

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

    await this.storage.saveVault([], { ...metadata, validation });
    this._setSession(key, salt, [], CURRENT_VAULT_FORMAT_VERSION);
    return this.getEntries();
  }

  async unlock(password) {
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
      const migrated = await this._migrateToCurrentFormat(password, decryptedEntries, metadata);
      this._setSession(
        migrated.key,
        migrated.salt,
        decryptedEntries,
        CURRENT_VAULT_FORMAT_VERSION
      );
      return this.getEntries();
    }

    if (timestampsChanged) {
      const updatedMeta = {
        ...vaultRecord.meta,
        last_modified: new Date().toISOString()
      };
      const encryptedEntries = await this._encryptEntries(
        decryptedEntries,
        key,
        metadata.formatVersion
      );
      await this.storage.saveVault(encryptedEntries, updatedMeta);
    }

    this._setSession(key, salt, decryptedEntries, metadata.formatVersion);
    return this.getEntries();
  }

  async addEntry(entryData) {
    this._requireUnlocked();

    const { id: ignoredId, ...payload } = entryData || {};
    void ignoredId;

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const entry = {
      ...payload,
      created_at: payload.created_at || nowIso,
      last_modified: nowIso
    };
    const vaultRecord = await this._loadVaultRecord();
    const metadata = parseVaultMetadata(vaultRecord.meta);
    const encrypted = await encryptData(
      entry,
      this.masterKey,
      entryEncryptionOptions(id, metadata.formatVersion)
    );

    vaultRecord.entries.push({ id, ...encrypted });
    vaultRecord.meta.last_modified = nowIso;
    await this.storage.saveVault(vaultRecord.entries, vaultRecord.meta);
    this.vault.addEntry({ ...entry, id });
  }

  async updateEntry(entryId, partialData) {
    this._requireUnlocked();

    const vaultRecord = await this._loadVaultRecord();
    const metadata = parseVaultMetadata(vaultRecord.meta);
    const entryIndex = vaultRecord.entries.findIndex((entry) => entry.id === entryId);
    if (entryIndex === -1) {
      throw new Error('Entry not found.');
    }

    const currentEntry = await decryptData(
      vaultRecord.entries[entryIndex],
      this.masterKey,
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
      this.masterKey,
      entryEncryptionOptions(entryId, metadata.formatVersion)
    );
    vaultRecord.entries[entryIndex] = { id: entryId, ...encrypted };
    vaultRecord.meta.last_modified = new Date().toISOString();
    await this.storage.saveVault(vaultRecord.entries, vaultRecord.meta);
    this.vault.updateEntry(entryId, { ...updatedEntry, id: entryId });
  }

  async deleteEntry(entryId) {
    this._requireUnlocked();

    const vaultRecord = await this._loadVaultRecord();
    const remainingEntries = vaultRecord.entries.filter((entry) => entry.id !== entryId);
    if (remainingEntries.length === vaultRecord.entries.length) {
      throw new Error('Entry not found.');
    }

    vaultRecord.meta.last_modified = new Date().toISOString();
    await this.storage.saveVault(remainingEntries, vaultRecord.meta);
    this.vault.removeEntry(entryId);
  }

  async decryptAllEntries() {
    this._requireUnlocked();

    const vaultRecord = await this._loadVaultRecord();
    const metadata = parseVaultMetadata(vaultRecord.meta);
    const decryptedEntries = await this._decryptEntries(
      vaultRecord.entries,
      this.masterKey,
      metadata.formatVersion
    );

    this._replaceEntries(decryptedEntries);
    return this.getEntries();
  }

  async markEntryAccessed(entryId) {
    this._requireUnlocked();

    const vaultRecord = await this._loadVaultRecord();
    const metadata = parseVaultMetadata(vaultRecord.meta);
    const entryIndex = vaultRecord.entries.findIndex((entry) => entry.id === entryId);
    if (entryIndex === -1) {
      throw new Error('Entry not found.');
    }

    const data = await decryptData(
      vaultRecord.entries[entryIndex],
      this.masterKey,
      entryEncryptionOptions(entryId, metadata.formatVersion)
    );
    data.lastAccessed = Date.now();
    data.accessCount = (data.accessCount || 0) + 1;

    const encrypted = await encryptData(
      data,
      this.masterKey,
      entryEncryptionOptions(entryId, metadata.formatVersion)
    );
    vaultRecord.entries[entryIndex] = { id: entryId, ...encrypted };
    vaultRecord.meta.last_modified = new Date().toISOString();
    await this.storage.saveVault(vaultRecord.entries, vaultRecord.meta);
    this.vault.updateEntry(entryId, { ...data, id: entryId });
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
    await this.initializeStorage();
    const normalizedVault = validateVaultRecord(vaultRecord);
    await this.storage.importFullVault(normalizedVault);
    this.clearSession();
  }

  clearSession() {
    if (this.salt instanceof Uint8Array) {
      this.salt.fill(0);
    }

    this.masterKey = null;
    this.salt = null;
    this.formatVersion = null;
    this.vault.clear();
  }

  async _migrateToCurrentFormat(password, entries, previousMetadata) {
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

    await this.storage.saveVault(encryptedEntries, { ...metadata, validation });
    return { key, salt };
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

    return vaultRecord;
  }

  _setSession(key, salt, entries, formatVersion) {
    this.masterKey = key;
    this.salt = salt;
    this.formatVersion = formatVersion;
    this._replaceEntries(entries);
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
