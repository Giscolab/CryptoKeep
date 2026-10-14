/**
 * Coverage-guided, structure-aware Jazzer.js target for the active v2 vault
 * record validator. Accepts ONLY synthetic input bytes; no filesystem access.
 *
 * Invalid vault structures are expected and ignored. Any other thrown error,
 * such as TypeError, RangeError, or an invariant violation, is a finding.
 */
import { validateVaultRecord } from '../../scripts/core/storage/vault-format.js';

export function fuzz(data) {
  const bytes = Buffer.from(data);
  const byte = (index) => bytes.length ? bytes[index % bytes.length] : 0;
  const payload = (offset, length) =>
    Buffer.from(Array.from({ length }, (_, index) => byte(offset + index))).toString('base64');

  const mode = byte(0) % 11;
  const entryId = bytes.subarray(0, Math.min(bytes.length, 80)).toString('hex').slice(0, 128) || 'synthetic-id';
  const record = {
    id: 'current',
    entries: [{ id: entryId, iv: payload(3, 12), ciphertext: payload(7, 16 + (byte(2) % 40)) }],
    meta: {
      salt: payload(1, 16),
      kdf: 'PBKDF2-HMAC-SHA512',
      iterations: 220000,
      version: 2,
      validation: { iv: payload(4, 12), ciphertext: payload(8, 16 + (byte(3) % 40)) }
    }
  };

  switch (mode) {
    case 1: record.meta.salt = payload(0, byte(1) % 32); break;
    case 2: record.meta.version = byte(1); break;
    case 3: record.meta.iterations = byte(1); break;
    case 4: record.meta.kdf = bytes.toString('utf8'); break;
    case 5: record.entries[0].iv = payload(1, byte(1) % 28); break;
    case 6: record.entries[0].ciphertext = payload(2, byte(2) % 32); break;
    case 7: record.entries[0].id = ''; break;
    case 8: record.entries = 'incorrect-array'; break;
    case 9: record.meta.validation = null; break;
    case 10: record.meta = null; break;
    default: break;
  }

  try {
    const parsed = validateVaultRecord(record);
    if (parsed.id !== 'current' || !Array.isArray(parsed.entries)
        || parsed.meta.iterations < 100000 || parsed.meta.iterations > 1000000) {
      throw new Error('Security invariant violated in valid parsed vault');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid vault format:')) return;
    throw error;
  }
}
