/**
 * CryptoKeep - Validation stricte d'un coffre importe (Lot 2).
 *
 * Ce module est PUR : aucun acces au DOM, au stockage ni au reseau. Il ne
 * dechiffre rien. Il repond a une seule question : la structure presentee
 * est-elle exactement l'une des formes documentees ?
 *
 * Principes appliques :
 * - liste EXACTE de proprietes autorisees, par version de format ;
 * - une propriete inattendue provoque un REFUS, jamais une suppression
 *   silencieuse : accepter en nettoyant masquerait une alteration du fichier ;
 * - toute version non explicitement supportee est refusee ;
 * - le format historique v1 peut omettre `version`, `kdf` et `iterations` ;
 * - le format courant v2 doit declarer ses metadonnees ;
 * - AES-GCM (Web Crypto) inclut le tag d'authentification dans `ciphertext` :
 *   aucun champ `authTag` separe n'est exige ni tolere ;
 * - identifiants d'entree non vides, valides et uniques ;
 * - IV uniques dans tout le coffre, bloc de validation compris, compares sur
 *   les octets DECODES et non sur la chaine base64.
 *
 * Toutes les limites proviennent de `import-limits.js`.
 */

import {
  ALLOWED_ENTRY_PROPERTIES,
  ALLOWED_META_PROPERTIES_V1,
  ALLOWED_META_PROPERTIES_V2,
  ALLOWED_RECORD_PROPERTIES,
  ALLOWED_VALIDATION_PROPERTIES,
  AES_GCM_IV_BYTES,
  AES_GCM_TAG_BYTES,
  MAX_ENTRY_CIPHERTEXT_BYTES,
  MAX_ENTRY_ID_LENGTH,
  MAX_TOTAL_CIPHERTEXT_BYTES,
  MAX_VAULT_ENTRIES,
  REQUIRED_META_PROPERTIES_V1,
  REQUIRED_META_PROPERTIES_V2,
  SUPPORTED_FORMAT_VERSIONS
} from './import-limits.js';
import {
  LEGACY_PBKDF2_ITERATIONS,
  MAX_PBKDF2_ITERATIONS,
  MIN_PBKDF2_ITERATIONS,
  PBKDF2_ALGORITHM,
  VAULT_SALT_BYTES
} from './vault-format.js';

/** Erreur de validation d'import. Le message ne contient aucun secret. */
export class VaultImportValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'VaultImportValidationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new VaultImportValidationError(code, message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ownKeys(object) {
  return Object.keys(object);
}

function assertExactProperties(object, allowed, required, label) {
  const keys = ownKeys(object);

  for (const key of keys) {
    if (!allowed.includes(key)) {
      fail('unexpected_property', `${label} contient une propriete inattendue : ${key}`);
    }
  }

  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) {
      fail('missing_property', `${label} ne declare pas la propriete requise : ${key}`);
    }
  }
}

/** Decode une chaine base64 stricte en octets. Aucune tolerance. */
export function decodeBase64Strict(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail('invalid_base64', `${label} doit etre une chaine base64 non vide.`);
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    fail('invalid_base64', `${label} n'est pas du base64 valide.`);
  }

  let binary;
  try {
    binary = atob(value);
  } catch {
    fail('invalid_base64', `${label} n'est pas du base64 valide.`);
  }

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesKey(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalise la version declaree. Toute valeur hors liste est refusee.
 * Le format v1 peut ne pas declarer de version du tout.
 */
export function normalizeImportedVersion(rawVersion) {
  if (rawVersion === undefined) return 1;

  if (rawVersion === 1 || rawVersion === '1' || rawVersion === '1.0.0') return 1;
  if (rawVersion === 2 || rawVersion === '2' || rawVersion === '2.0.0') return 2;

  fail('unsupported_version', 'Version de format de coffre non supportee.');
}

function assertEncryptedBlock(payload, allowedProperties, label, ivRegistry) {
  if (!isPlainObject(payload)) {
    fail('invalid_structure', `${label} est absent ou n'est pas un objet.`);
  }

  assertExactProperties(payload, allowedProperties, ['iv', 'ciphertext'], label);

  const iv = decodeBase64Strict(payload.iv, `${label}.iv`);
  if (iv.length !== AES_GCM_IV_BYTES) {
    fail('invalid_iv', `${label}.iv doit contenir ${AES_GCM_IV_BYTES} octets.`);
  }

  const ciphertext = decodeBase64Strict(payload.ciphertext, `${label}.ciphertext`);
  if (ciphertext.length <= AES_GCM_TAG_BYTES) {
    fail('invalid_ciphertext', `${label}.ciphertext est trop court pour AES-GCM.`);
  }
  if (ciphertext.length > MAX_ENTRY_CIPHERTEXT_BYTES) {
    fail('entry_too_large', `${label}.ciphertext depasse la limite autorisee.`);
  }

  // Comparaison sur les octets decodes : deux chaines base64 differentes
  // peuvent representer le meme IV.
  const key = bytesKey(iv);
  if (ivRegistry.has(key)) {
    fail('duplicate_iv', `IV reutilise dans le coffre importe (${label}).`);
  }
  ivRegistry.set(key, label);

  return { ivBytes: iv.length, ciphertextBytes: ciphertext.length };
}

function assertMetadata(meta, formatVersion) {
  if (!isPlainObject(meta)) {
    fail('invalid_structure', 'meta est absent ou n\'est pas un objet.');
  }

  const allowed = formatVersion === 1 ? ALLOWED_META_PROPERTIES_V1 : ALLOWED_META_PROPERTIES_V2;
  const required = formatVersion === 1 ? REQUIRED_META_PROPERTIES_V1 : REQUIRED_META_PROPERTIES_V2;
  assertExactProperties(meta, allowed, required, 'meta');

  const salt = decodeBase64Strict(meta.salt, 'meta.salt');
  if (salt.length !== VAULT_SALT_BYTES) {
    fail('invalid_salt', `meta.salt doit contenir ${VAULT_SALT_BYTES} octets.`);
  }

  if (Object.prototype.hasOwnProperty.call(meta, 'kdf') && meta.kdf !== PBKDF2_ALGORITHM) {
    fail('unsupported_kdf', 'Algorithme de derivation non supporte.');
  }

  let iterations = LEGACY_PBKDF2_ITERATIONS;
  if (Object.prototype.hasOwnProperty.call(meta, 'iterations')) {
    if (typeof meta.iterations !== 'number' || !Number.isInteger(meta.iterations)) {
      fail('invalid_iterations', 'meta.iterations doit etre un entier.');
    }
    iterations = meta.iterations;
  }

  if (iterations < MIN_PBKDF2_ITERATIONS || iterations > MAX_PBKDF2_ITERATIONS) {
    fail('invalid_iterations', 'Nombre d\'iterations PBKDF2 hors bornes.');
  }

  // Acces litteraux : aucune indexation par variable sur un objet importe.
  if (Object.prototype.hasOwnProperty.call(meta, 'created_at')
    && typeof meta.created_at !== 'string') {
    fail('invalid_structure', 'meta.created_at doit etre une chaine.');
  }
  if (Object.prototype.hasOwnProperty.call(meta, 'last_modified')
    && typeof meta.last_modified !== 'string') {
    fail('invalid_structure', 'meta.last_modified doit etre une chaine.');
  }

  return {
    salt: meta.salt,
    saltBytes: salt,
    kdf: PBKDF2_ALGORITHM,
    iterations,
    formatVersion,
    createdAt: typeof meta.created_at === 'string' ? meta.created_at : '',
    lastModified: typeof meta.last_modified === 'string' ? meta.last_modified : ''
  };
}

/**
 * Valide la structure complete d'un coffre importe.
 *
 * @param {unknown} record objet issu de JSON.parse, considere comme hostile
 * @returns {{metadata: object, entries: Array, normalized: object, stats: object}}
 * @throws {VaultImportValidationError}
 */
export function validateImportedVaultStructure(record) {
  if (!isPlainObject(record)) {
    fail('invalid_structure', 'Le fichier ne contient pas un objet de coffre.');
  }

  assertExactProperties(record, ALLOWED_RECORD_PROPERTIES, ['entries', 'meta'], 'Le coffre');

  if (Object.prototype.hasOwnProperty.call(record, 'id') && record.id !== 'current') {
    fail('invalid_structure', 'L\'identifiant de coffre doit valoir "current".');
  }

  if (!Array.isArray(record.entries)) {
    fail('invalid_structure', 'entries doit etre un tableau.');
  }

  if (record.entries.length > MAX_VAULT_ENTRIES) {
    fail('too_many_entries', `Le coffre depasse ${MAX_VAULT_ENTRIES} entrees.`);
  }

  if (!isPlainObject(record.meta)) {
    fail('invalid_structure', 'meta est absent ou n\'est pas un objet.');
  }

  const formatVersion = normalizeImportedVersion(record.meta.version);
  if (!SUPPORTED_FORMAT_VERSIONS.includes(formatVersion)) {
    fail('unsupported_version', 'Version de format de coffre non supportee.');
  }

  const metadata = assertMetadata(record.meta, formatVersion);

  // Registre d'IV partage entre le bloc de validation et toutes les entrees.
  const ivRegistry = new Map();
  const validationStats = assertEncryptedBlock(
    record.meta.validation,
    ALLOWED_VALIDATION_PROPERTIES,
    'validation',
    ivRegistry
  );

  let totalCiphertextBytes = validationStats.ciphertextBytes;
  const seenIds = new Set();
  const entries = record.entries.map((entry, index) => {
    const label = `entry[${index}]`;

    if (!isPlainObject(entry)) {
      fail('invalid_structure', `${label} n'est pas un objet.`);
    }

    assertExactProperties(entry, ALLOWED_ENTRY_PROPERTIES, ALLOWED_ENTRY_PROPERTIES, label);

    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      fail('invalid_entry_id', `${label}.id est vide ou n'est pas une chaine.`);
    }
    if (entry.id.length > MAX_ENTRY_ID_LENGTH) {
      fail('invalid_entry_id', `${label}.id depasse ${MAX_ENTRY_ID_LENGTH} caracteres.`);
    }
    if (!/^[\w.:@+-]+$/.test(entry.id)) {
      fail('invalid_entry_id', `${label}.id contient des caracteres interdits.`);
    }
    if (seenIds.has(entry.id)) {
      fail('duplicate_entry_id', `Identifiant d'entree duplique : ${label}.`);
    }
    seenIds.add(entry.id);

    const stats = assertEncryptedBlock(entry, ALLOWED_ENTRY_PROPERTIES, label, ivRegistry);
    totalCiphertextBytes += stats.ciphertextBytes;

    if (totalCiphertextBytes > MAX_TOTAL_CIPHERTEXT_BYTES) {
      fail('total_too_large', 'La taille cumulee des donnees chiffrees depasse la limite.');
    }

    return { id: entry.id, iv: entry.iv, ciphertext: entry.ciphertext };
  });

  // Enregistrement normalise : ordre de proprietes stable, rien de superflu.
  const normalizedMeta = {
    salt: metadata.salt,
    kdf: metadata.kdf,
    iterations: metadata.iterations,
    created_at: metadata.createdAt,
    last_modified: metadata.lastModified,
    version: metadata.formatVersion,
    validation: {
      iv: record.meta.validation.iv,
      ciphertext: record.meta.validation.ciphertext
    }
  };

  return {
    metadata,
    entries,
    normalized: { id: 'current', entries, meta: normalizedMeta },
    stats: {
      entryCount: entries.length,
      totalCiphertextBytes,
      distinctIvCount: ivRegistry.size,
      formatVersion
    }
  };
}

export default { validateImportedVaultStructure, normalizeImportedVersion, VaultImportValidationError };
