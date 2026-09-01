/**
 * Fixtures SYNTHETIQUES pour les tests du Lot 2.
 *
 * Aucun coffre reel, aucun fichier .vault de l'utilisateur, aucun secret
 * personnel n'est lu. Tout est fabrique a la demande.
 */

import { encryptData } from '../../scripts/core/crypto/aes-gcm.js';
import { deriveMasterKey } from '../../scripts/core/crypto/pbkdf2.js';
import {
  CURRENT_PBKDF2_ITERATIONS,
  CURRENT_VAULT_FORMAT_VERSION,
  LEGACY_PBKDF2_ITERATIONS,
  PBKDF2_ALGORITHM,
  bytesToBase64,
  entryAdditionalData,
  validationAdditionalData
} from '../../scripts/core/storage/vault-format.js';

/** Stockage IndexedDB synthetique, avec transaction interruptible. */
export class FakeVaultStorage {
  constructor(record = null) {
    this.record = record ? structuredClone(record) : null;
    this.writes = 0;
    this.abortNextWrites = 0;
    this.corruptNextRead = false;
    // Corrompt la PREMIERE relecture qui suit une ecriture reussie. Sert a
    // simuler une divergence post-ecriture sans perturber la lecture faite
    // pour construire l'instantane.
    this.corruptReadAfterWrite = false;
    this._corruptPending = false;
    this.failNextRead = false;
    this.history = [];
  }

  async initializeDB() {}

  async loadVault() {
    if (this.failNextRead) {
      this.failNextRead = false;
      throw new Error('lecture IndexedDB impossible');
    }
    if ((this.corruptNextRead || this._corruptPending) && this.record) {
      this.corruptNextRead = false;
      this._corruptPending = false;
      const altered = structuredClone(this.record);
      if (altered.entries.length > 0) {
        altered.entries[0].id = `${altered.entries[0].id}-divergent`;
      } else {
        altered.meta.last_modified = 'divergent';
      }
      return altered;
    }
    return this.record ? structuredClone(this.record) : null;
  }

  async putVaultRecord(record) {
    if (this.abortNextWrites > 0) {
      this.abortNextWrites -= 1;
      // La transaction est annulee : rien n'est ecrit, l'ancien record reste.
      const error = new Error('IndexedDB transaction aborted.');
      error.name = 'AbortError';
      throw error;
    }
    if (this.corruptReadAfterWrite) {
      this.corruptReadAfterWrite = false;
      this._corruptPending = true;
    }
    this.writes += 1;
    this.record = structuredClone(record);
    this.history.push(structuredClone(record));
    return this.record;
  }
}

/** localStorage synthetique, avec simulation de quota. */
export class FakeLocalStorage {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
    this.quotaExceeded = false;
  }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) {
    if (this.quotaExceeded) {
      const error = new Error('quota');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.map.set(key, String(value));
  }
  removeItem(key) { this.map.delete(key); }
  get size() { return this.map.size; }
}

/**
 * Construit un coffre chiffre synthetique.
 *
 * @param {{password: string, entries: Array, formatVersion?: number}} options
 */
export async function buildSyntheticVault(options) {
  const {
    password,
    entries,
    formatVersion = CURRENT_VAULT_FORMAT_VERSION,
    createdAt = '2026-01-01T00:00:00.000Z',
    lastModified = '2026-01-02T00:00:00.000Z'
  } = options;

  const iterations = formatVersion === CURRENT_VAULT_FORMAT_VERSION
    ? CURRENT_PBKDF2_ITERATIONS
    : LEGACY_PBKDF2_ITERATIONS;

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveMasterKey(password, salt, { iterations });

  const validationOptions = formatVersion === CURRENT_VAULT_FORMAT_VERSION
    ? { additionalData: validationAdditionalData(formatVersion) }
    : {};
  const validation = await encryptData({ check: 'ok' }, key, validationOptions);

  const encryptedEntries = [];
  for (const entry of entries) {
    const { id, ...payload } = entry;
    const entryOptions = formatVersion === CURRENT_VAULT_FORMAT_VERSION
      ? { additionalData: entryAdditionalData(id, formatVersion) }
      : {};
    const encrypted = await encryptData(payload, key, entryOptions);
    encryptedEntries.push({ id, ...encrypted });
  }

  const meta = formatVersion === CURRENT_VAULT_FORMAT_VERSION
    ? {
      salt: bytesToBase64(salt),
      kdf: PBKDF2_ALGORITHM,
      iterations,
      created_at: createdAt,
      last_modified: lastModified,
      version: CURRENT_VAULT_FORMAT_VERSION,
      validation
    }
    : {
      // Format historique v1 : ni version, ni kdf, ni iterations declares.
      salt: bytesToBase64(salt),
      created_at: createdAt,
      last_modified: lastModified,
      validation
    };

  return { record: { id: 'current', entries: encryptedEntries, meta }, key, salt };
}

/** Fichier `.vault` synthetique compatible avec l'API File utilisee. */
export function makeVaultFile(record, options = {}) {
  const { name = 'coffre-synthetique.vault', bom = false, rawText = null } = options;
  const text = rawText !== null ? rawText : (bom ? '﻿' : '') + JSON.stringify(record);
  const size = options.size ?? new TextEncoder().encode(text).length;

  return {
    name,
    size,
    async text() { return text; }
  };
}

/** Corrompt un base64 en modifiant un caractere, sans changer la longueur. */
export function tamperBase64(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const index = Math.min(3, value.length - 1);
  const current = value.charAt(index);
  const replacement = alphabet.charAt((alphabet.indexOf(current) + 1) % 64);
  return value.slice(0, index) + replacement + value.slice(index + 1);
}

export default {
  FakeVaultStorage,
  FakeLocalStorage,
  buildSyntheticVault,
  makeVaultFile,
  tamperBase64
};
