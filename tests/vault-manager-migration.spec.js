import assert from 'node:assert/strict';
import './webcrypto-setup.js';
import { encryptData, decryptData } from '../scripts/core/crypto/aes-gcm.js';
import { deriveMasterKey } from '../scripts/core/crypto/pbkdf2.js';
import { VaultManager } from '../scripts/core/vault/manager.js';
import {
  CURRENT_PBKDF2_ITERATIONS,
  CURRENT_VAULT_FORMAT_VERSION,
  LEGACY_PBKDF2_ITERATIONS,
  bytesToBase64,
  entryAdditionalData
} from '../scripts/core/storage/vault-format.js';

// LOT 9 : l'assertion maison est remplacee par `node:assert/strict`, qui
// s'appelle de la meme facon — assert(valeur, message) — mais apporte en
// plus `equal`, `deepEqual`, `rejects` et un diff lisible en cas d'echec.

class MemoryStorage {
  constructor(record) {
    this.record = structuredClone(record);
  }

  async initializeDB() {}

  async loadVault() {
    return structuredClone(this.record);
  }

  async saveVault(entries, meta) {
    this.record = {
      id: 'current',
      entries: structuredClone(entries),
      meta: structuredClone(meta)
    };
  }
}

try {
  console.log('=== TEST VAULT MIGRATION ===');
  const password = 'MigrationTest123!';
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const legacyKey = await deriveMasterKey(password, salt, {
    iterations: LEGACY_PBKDF2_ITERATIONS
  });
  const validation = await encryptData({ check: 'ok' }, legacyKey);
  const encryptedEntry = await encryptData(
    { title: 'Legacy', username: 'alice', password: 'S3cret!' },
    legacyKey
  );
  const storage = new MemoryStorage({
    id: 'current',
    entries: [{ id: 'legacy-entry', ...encryptedEntry }],
    meta: {
      salt: bytesToBase64(salt),
      created_at: '2026-01-01T00:00:00.000Z',
      last_modified: '2026-01-01T00:00:00.000Z',
      validation
    }
  });
  const manager = new VaultManager({ storage });

  await manager.unlock(password);

  assert(manager.getEntries()[0].password === 'S3cret!', 'Entree historique non dechiffree');
  assert(storage.record.meta.version === CURRENT_VAULT_FORMAT_VERSION, 'Migration de version absente');
  assert(storage.record.meta.iterations === CURRENT_PBKDF2_ITERATIONS, 'Migration KDF absente');

  const migrated = await decryptData(
    storage.record.entries[0],
    manager.masterKey,
    { additionalData: entryAdditionalData('legacy-entry') }
  );
  assert(migrated.username === 'alice', 'Entree migree invalide');

  console.log('Vault migration tests passed.');
} catch (error) {
  console.error('Vault migration tests failed:', error);
  process.exitCode = 1;
}
