export const LEGACY_VAULT_FORMAT_VERSION = 1;
export const CURRENT_VAULT_FORMAT_VERSION = 2;
export const PBKDF2_ALGORITHM = 'PBKDF2-HMAC-SHA512';
export const PBKDF2_HASH = 'SHA-512';
export const LEGACY_PBKDF2_ITERATIONS = 150000;
export const CURRENT_PBKDF2_ITERATIONS = 220000;
export const MIN_PBKDF2_ITERATIONS = 100000;
export const MAX_PBKDF2_ITERATIONS = 1000000;
export const VAULT_SALT_BYTES = 16;

const AES_GCM_IV_BYTES = 12;
const AES_GCM_TAG_BYTES = 16;
const MAX_VAULT_ENTRIES = 5000;
const MAX_CIPHERTEXT_BYTES = 1024 * 1024;

function fail(message) {
  throw new Error(`Invalid vault format: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function normalizeFormatVersion(version) {
  if (version === undefined || version === null || version === '' || version === '1.0.0' || version === '1' || version === 1) {
    return LEGACY_VAULT_FORMAT_VERSION;
  }

  if (version === '2.0.0' || version === '2' || version === 2) {
    return CURRENT_VAULT_FORMAT_VERSION;
  }

  fail('unsupported version');
}

export function bytesToBase64(bytes) {
  let binary = '';
  const view = new Uint8Array(bytes);

  for (let offset = 0; offset < view.length; offset += 0x8000) {
    binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
  }

  return btoa(binary);
}

export function base64ToBytes(value, fieldName = 'base64 value') {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${fieldName} must be a non-empty base64 string`);
  }

  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    fail(`${fieldName} is not valid base64`);
  }
}

function assertPbkdf2Iterations(iterations) {
  if (!Number.isInteger(iterations) || iterations < MIN_PBKDF2_ITERATIONS || iterations > MAX_PBKDF2_ITERATIONS) {
    fail(`PBKDF2 iterations must be between ${MIN_PBKDF2_ITERATIONS} and ${MAX_PBKDF2_ITERATIONS}`);
  }
}

function assertSalt(salt) {
  const saltBytes = base64ToBytes(salt, 'salt');
  if (saltBytes.length !== VAULT_SALT_BYTES) {
    fail(`salt must contain ${VAULT_SALT_BYTES} bytes`);
  }
}

function assertEncryptedPayload(payload, label) {
  if (!isRecord(payload)) {
    fail(`${label} is missing`);
  }

  const iv = base64ToBytes(payload.iv, `${label}.iv`);
  const ciphertext = base64ToBytes(payload.ciphertext, `${label}.ciphertext`);

  if (iv.length !== AES_GCM_IV_BYTES) {
    fail(`${label}.iv must contain ${AES_GCM_IV_BYTES} bytes`);
  }

  if (ciphertext.length < AES_GCM_TAG_BYTES || ciphertext.length > MAX_CIPHERTEXT_BYTES) {
    fail(`${label}.ciphertext has an invalid length`);
  }
}

function copyEncryptedPayload(payload) {
  return {
    iv: payload.iv,
    ciphertext: payload.ciphertext
  };
}

export function parseVaultMetadata(metadata) {
  if (!isRecord(metadata)) {
    fail('metadata is missing');
  }

  assertSalt(metadata.salt);

  const formatVersion = normalizeFormatVersion(metadata.version);
  const hasKdf = hasOwn(metadata, 'kdf');
  const hasIterations = hasOwn(metadata, 'iterations');

  if (formatVersion === CURRENT_VAULT_FORMAT_VERSION && (!hasKdf || !hasIterations)) {
    fail('current vaults must declare KDF metadata');
  }

  if (hasKdf && metadata.kdf !== PBKDF2_ALGORITHM) {
    fail('unsupported KDF');
  }

  const iterations = hasIterations ? Number(metadata.iterations) : LEGACY_PBKDF2_ITERATIONS;
  assertPbkdf2Iterations(iterations);

  return {
    salt: metadata.salt,
    kdf: PBKDF2_ALGORITHM,
    iterations,
    formatVersion,
    createdAt: typeof metadata.created_at === 'string' ? metadata.created_at : '',
    lastModified: typeof metadata.last_modified === 'string' ? metadata.last_modified : ''
  };
}

export function createVaultMetadata(salt, options = {}) {
  assertSalt(salt);

  const now = options.now || new Date().toISOString();
  return {
    salt,
    kdf: PBKDF2_ALGORITHM,
    iterations: CURRENT_PBKDF2_ITERATIONS,
    created_at: options.createdAt || now,
    last_modified: options.lastModified || now,
    version: CURRENT_VAULT_FORMAT_VERSION
  };
}

export function metadataNeedsMigration(metadata) {
  return metadata.formatVersion !== CURRENT_VAULT_FORMAT_VERSION
    || metadata.kdf !== PBKDF2_ALGORITHM
    || metadata.iterations !== CURRENT_PBKDF2_ITERATIONS;
}

export function entryAdditionalData(entryId, formatVersion = CURRENT_VAULT_FORMAT_VERSION) {
  if (typeof entryId !== 'string' || entryId.length === 0 || entryId.length > 128) {
    fail('entry id is invalid');
  }

  return `vault-entry:${formatVersion}:${entryId}`;
}

export function validationAdditionalData(formatVersion = CURRENT_VAULT_FORMAT_VERSION) {
  return `vault-validation:${formatVersion}`;
}

export function validateVaultRecord(record) {
  if (!isRecord(record)) {
    fail('vault must be an object');
  }

  if (!Array.isArray(record.entries) || record.entries.length > MAX_VAULT_ENTRIES) {
    fail('entries must be a bounded array');
  }

  const metadata = parseVaultMetadata(record.meta);
  assertEncryptedPayload(record.meta.validation, 'validation');

  const entries = record.entries.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id.length === 0 || entry.id.length > 128) {
      fail(`entry ${index} has an invalid id`);
    }

    assertEncryptedPayload(entry, `entry ${index}`);
    return {
      id: entry.id,
      ...copyEncryptedPayload(entry)
    };
  });

  return {
    id: 'current',
    entries,
    meta: {
      salt: metadata.salt,
      kdf: metadata.kdf,
      iterations: metadata.iterations,
      created_at: metadata.createdAt,
      last_modified: metadata.lastModified,
      version: metadata.formatVersion,
      validation: copyEncryptedPayload(record.meta.validation)
    }
  };
}
