/**
 * Synthetic-only security properties for the actual active CryptoKeep modules.
 * No live browser profile, vault, backup or real password is ever accessed.
 */
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import fc from 'fast-check';

globalThis.crypto ??= webcrypto;

import { deriveMasterKey } from '../../scripts/core/crypto/pbkdf2.js';
import { encryptData, decryptData } from '../../scripts/core/crypto/aes-gcm.js';
import {
  CURRENT_VAULT_FORMAT_VERSION,
  base64ToBytes,
  bytesToBase64,
  createVaultMetadata,
  entryAdditionalData,
  parseVaultMetadata,
  validateVaultRecord,
  validationAdditionalData
} from '../../scripts/core/storage/vault-format.js';

const SEED = 20261014;
const NUM_RUNS = 100;

async function main() {
  const salt = Uint8Array.from({ length: 16 }, (_, index) => index);
  const key = await deriveMasterKey('Kryptokeep-SYNTHETIC-CI-passphrase!', salt);
  const metadata = createVaultMetadata(bytesToBase64(salt));
  const validation = await encryptData(
    { check: 'ok' },
    key,
    { additionalData: validationAdditionalData(CURRENT_VAULT_FORMAT_VERSION) }
  );

  fc.assert(
    fc.property(fc.uint8Array({ minLength: 1, maxLength: 300 }), (bytes) => {
      assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
    }),
    { seed: SEED, numRuns: NUM_RUNS * 3 }
  );

  fc.assert(
    fc.property(
      fc.oneof(
        fc.integer({ min: 0, max: 99_999 }),
        fc.integer({ min: 1_000_001, max: 2_000_000 })
      ),
      (iterations) => {
        assert.throws(
          () => parseVaultMetadata({ ...metadata, iterations }),
          /Invalid vault format:/
        );
      }
    ),
    { seed: SEED, numRuns: NUM_RUNS }
  );

  await fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 64 }),
      fc.string({ maxLength: 160 }),
      async (id, title) => {
        const data = { title, username: 'synthetic-user', password: 'synthetic-entry-only' };
        const aad = entryAdditionalData(id, CURRENT_VAULT_FORMAT_VERSION);
        const encrypted = await encryptData(data, key, { additionalData: aad });
        const record = validateVaultRecord({
          id: 'current',
          entries: [{ id, ...encrypted }],
          meta: { ...metadata, validation }
        });

        assert.equal(record.entries.length, 1);
        assert.deepEqual(await decryptData(record.entries[0], key, { additionalData: aad }), data);

        // Bound identity is authenticated in v2.
        await assert.rejects(
          decryptData(record.entries[0], key, {
            additionalData: entryAdditionalData(id + '-changed', CURRENT_VAULT_FORMAT_VERSION)
          })
        );

        // GCM must reject even a single altered byte of ciphertext/tag.
        const flipped = base64ToBytes(encrypted.ciphertext);
        flipped[0] ^= 1;
        await assert.rejects(
          decryptData({ ...encrypted, ciphertext: bytesToBase64(flipped) }, key, { additionalData: aad })
        );
      }
    ),
    { seed: SEED, numRuns: NUM_RUNS }
  );

  console.log('PASS synthetic vault properties; seed:', SEED, 'runs per property:', NUM_RUNS);
}

main().catch((error) => {
  console.error('FAIL synthetic vault properties:', error);
  process.exitCode = 1;
});
