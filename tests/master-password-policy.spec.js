import { validateNewMasterPassword } from '../scripts/security/master-password-policy.js';
import assert from 'node:assert/strict';

// LOT 9 : l'assertion maison est remplacee par `node:assert/strict`, qui
// s'appelle de la meme facon — assert(valeur, message) — mais apporte en
// plus `equal`, `deepEqual`, `rejects` et un diff lisible en cas d'echec.

try {
  console.log('=== TEST MASTER PASSWORD POLICY ===');

  assert(!validateNewMasterPassword('short').valid, 'Un mot de passe court doit etre refuse');
  assert(!validateNewMasterPassword('aaaaaaaaaaaa').valid, 'Une repetition triviale doit etre refusee');
  assert(
    validateNewMasterPassword('correct-horse-battery-staple').valid,
    'Une phrase de passe longue doit etre acceptee sans regle de composition arbitraire'
  );

  console.log('Master password policy tests passed.');
} catch (error) {
  console.error('Master password policy tests failed:', error);
  process.exitCode = 1;
}
