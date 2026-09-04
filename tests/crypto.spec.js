import './webcrypto-setup.js';
import { encryptData, decryptData } from '../scripts/core/crypto/aes-gcm.js';
import { deriveMasterKey } from '../scripts/core/crypto/pbkdf2.js';
import {
  CURRENT_PBKDF2_ITERATIONS,
  entryAdditionalData
} from '../scripts/core/storage/vault-format.js';
import { assertSecureWebCrypto } from '../scripts/core/crypto/runtime.js';
import assert from 'node:assert/strict';

// LOT 9 : l'assertion maison est remplacee par `node:assert/strict`, qui
// s'appelle de la meme facon — assert(valeur, message) — mais apporte en
// plus `equal`, `deepEqual`, `rejects` et un diff lisible en cas d'echec.

async function expectRejection(action, message) {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(message);
}

try {
  console.log('=== TEST CRYPTO ===');
  assertSecureWebCrypto();

  const password = 'SuperSecret123!';
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const testData = { msg: 'Confidentiel', level: 5 };
  const entryId = 'entry-crypto-test';
  const additionalData = entryAdditionalData(entryId);
  const key = await deriveMasterKey(password, salt, {
    iterations: CURRENT_PBKDF2_ITERATIONS
  });

  assert(key.type === 'secret', 'Cle non generee');
  assert(key.extractable === false, 'La cle maitre ne doit pas etre extractible');

  const encrypted = await encryptData(testData, key, { additionalData });
  assert(typeof encrypted.iv === 'string', 'IV manquant');
  assert(typeof encrypted.ciphertext === 'string', 'Chiffrement invalide');

  const decrypted = await decryptData(encrypted, key, { additionalData });
  assert(decrypted.msg === testData.msg, 'Donnees incorrectes');
  assert(decrypted.level === testData.level, 'Donnees alterees');

  await expectRejection(
    () => decryptData(encrypted, key, { additionalData: entryAdditionalData('different-entry') }),
    'L AAD doit empecher la permutation des entrees.'
  );

  console.log('Crypto tests passed.');
} catch (error) {
  console.error('Crypto tests failed:', error);
  process.exitCode = 1;
}
