import { estimatePasswordEntropyBits } from '../ui/password-meter/password-meter.js';

export const MIN_MASTER_PASSWORD_LENGTH = 12;
export const MIN_MASTER_PASSWORD_ENTROPY_BITS = 50;

export function validateNewMasterPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return { valid: false, message: 'Le mot de passe maitre est requis.' };
  }

  if (password.length < MIN_MASTER_PASSWORD_LENGTH) {
    return {
      valid: false,
      message: `Le mot de passe maitre doit contenir au moins ${MIN_MASTER_PASSWORD_LENGTH} caracteres.`
    };
  }

  if (/^(.)\1+$/.test(password)) {
    return {
      valid: false,
      message: 'Le mot de passe maitre ne doit pas etre une repetition triviale.'
    };
  }

  const entropyBits = estimatePasswordEntropyBits(password);
  if (entropyBits < MIN_MASTER_PASSWORD_ENTROPY_BITS) {
    return {
      valid: false,
      message: 'Le mot de passe maitre est trop previsible. Utilisez une phrase de passe plus longue.'
    };
  }

  return { valid: true, entropyBits };
}
