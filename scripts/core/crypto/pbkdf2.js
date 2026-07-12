import {
  CURRENT_PBKDF2_ITERATIONS,
  MAX_PBKDF2_ITERATIONS,
  MIN_PBKDF2_ITERATIONS,
  PBKDF2_HASH
} from '../storage/vault-format.js';

function assertIterations(iterations) {
  if (!Number.isInteger(iterations) || iterations < MIN_PBKDF2_ITERATIONS || iterations > MAX_PBKDF2_ITERATIONS) {
    throw new Error(`Invalid PBKDF2 iteration count: ${iterations}`);
  }
}

/**
 * Derives a non-extractable AES-GCM key from a user password.
 */
export async function deriveMasterKey(password, salt, options = {}) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('A master password is required.');
  }

  if (!(salt instanceof Uint8Array)) {
    throw new Error('PBKDF2 requires a Uint8Array salt.');
  }

  const iterations = options.iterations ?? CURRENT_PBKDF2_ITERATIONS;
  assertIterations(iterations);

  const passwordBytes = new TextEncoder().encode(password);
  let keyMaterial;

  try {
    keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBytes,
      'PBKDF2',
      false,
      ['deriveKey']
    );
  } finally {
    passwordBytes.fill(0);
  }

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: PBKDF2_HASH
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  );
}
