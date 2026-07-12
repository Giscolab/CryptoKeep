import { validateNewMasterPassword } from '../scripts/security/master-password-policy.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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
