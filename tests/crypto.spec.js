import { deriveMasterKey } from '../scripts/core/crypto/pbkdf2.js';
import { encryptData, decryptData } from '../scripts/core/crypto/aes-gcm.js';

(async () => {
  console.log('=== TEST CRYPTO ===');

  const password = 'SuperSecret123!';
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const testData = { msg: 'Confidentiel', level: 5 };

  try {
    const key = await deriveMasterKey(password, salt);
    console.assert(key instanceof CryptoKey, '❌ Clé non générée');

    const encrypted = await encryptData(testData, key);
    console.assert(typeof encrypted.iv === 'string', '❌ IV manquant');
    console.assert(typeof encrypted.ciphertext === 'string', '❌ Chiffrement invalide');

    const decrypted = await decryptData(encrypted, key);
    console.assert(decrypted.msg === testData.msg, '❌ Données incorrectes');
    console.assert(decrypted.level === testData.level, '❌ Données altérées');

    console.log('✅ Tous les tests cryptographiques ont réussi.');
  } catch (err) {
    console.error('❌ Erreur durant les tests crypto :', err);
  }
})();
