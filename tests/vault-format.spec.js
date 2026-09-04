import assert from 'node:assert/strict';
import './webcrypto-setup.js';
import { encryptData } from '../scripts/core/crypto/aes-gcm.js';
import { deriveMasterKey } from '../scripts/core/crypto/pbkdf2.js';
import {
  CURRENT_PBKDF2_ITERATIONS,
  CURRENT_VAULT_FORMAT_VERSION,
  LEGACY_PBKDF2_ITERATIONS,
  bytesToBase64,
  createVaultMetadata,
  entryAdditionalData,
  parseVaultMetadata,
  validateVaultRecord,
  validationAdditionalData
} from '../scripts/core/storage/vault-format.js';

// LOT 9 : l'assertion maison est remplacee par `node:assert/strict`, qui
// s'appelle de la meme facon — assert(valeur, message) — mais apporte en
// plus `equal`, `deepEqual`, `rejects` et un diff lisible en cas d'echec.

function expectThrow(action, message) {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(message);
}

try {
  console.log('=== TEST VAULT FORMAT ===');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltBase64 = bytesToBase64(salt);
  const metadata = createVaultMetadata(saltBase64);
  const parsedCurrent = parseVaultMetadata(metadata);

  assert(parsedCurrent.formatVersion === CURRENT_VAULT_FORMAT_VERSION, 'Version courante invalide');
  assert(parsedCurrent.iterations === CURRENT_PBKDF2_ITERATIONS, 'Iterations courantes invalides');

  const parsedLegacy = parseVaultMetadata({ salt: saltBase64 });
  assert(parsedLegacy.formatVersion === 1, 'Format historique non reconnu');
  assert(parsedLegacy.iterations === LEGACY_PBKDF2_ITERATIONS, 'Iterations historiques invalides');

  expectThrow(
    () => parseVaultMetadata({ salt: saltBase64, version: 2 }),
    'Un coffre v2 sans metadonnees KDF doit etre refuse.'
  );

  const key = await deriveMasterKey('FormatTest123!', salt);
  const validation = await encryptData(
    { check: 'ok' },
    key,
    { additionalData: validationAdditionalData(CURRENT_VAULT_FORMAT_VERSION) }
  );
  const entry = await encryptData(
    { title: 'Example', password: 'S3cret!' },
    key,
    { additionalData: entryAdditionalData('entry-1', CURRENT_VAULT_FORMAT_VERSION) }
  );
  const vault = validateVaultRecord({
    entries: [{ id: 'entry-1', ...entry }],
    meta: { ...metadata, validation }
  });

  assert(vault.entries.length === 1, 'Le coffre valide doit conserver son entree');
  assert(vault.meta.version === CURRENT_VAULT_FORMAT_VERSION, 'Version valide perdue');
  console.log('Vault format tests passed.');
} catch (error) {
  console.error('Vault format tests failed:', error);
  process.exitCode = 1;
}
