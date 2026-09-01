/**
 * CryptoKeep - Limites d'import centralisees (Lot 2).
 *
 * Toute donnee importee est traitee comme hostile. Ce module est la source
 * UNIQUE des bornes appliquees a l'import `.vault` et a l'import CSV. Aucune
 * limite ne doit etre redefinie ailleurs : elle doit etre importee d'ici.
 *
 * Chaque constante est couverte par les tests de `tests/vault-import-*.spec.js`
 * et `tests/csv-*.spec.js`.
 */

// ---------------------------------------------------------------- fichiers

/** Taille maximale d'un fichier `.vault`, verifiee AVANT tout parsing. */
export const MAX_VAULT_FILE_BYTES = 10 * 1024 * 1024; // 10 Mio

/** Taille maximale d'un fichier CSV, verifiee AVANT tout parsing. */
export const MAX_CSV_FILE_BYTES = 10 * 1024 * 1024; // 10 Mio

// ----------------------------------------------------------------- charge

/** Nombre maximal d'entrees dans un coffre importe. */
export const MAX_VAULT_ENTRIES = 5000;

/** Nombre maximal de lignes de donnees acceptees dans un CSV. */
export const MAX_CSV_ROWS = 5000;

/** Taille maximale d'un ciphertext base64 d'une entree, en octets decodes. */
export const MAX_ENTRY_CIPHERTEXT_BYTES = 1024 * 1024; // 1 Mio

/** Taille cumulee maximale de tous les ciphertexts d'un coffre importe. */
export const MAX_TOTAL_CIPHERTEXT_BYTES = 32 * 1024 * 1024; // 32 Mio

// ------------------------------------------------- champs apres dechiffrement

/** Taille maximale, en unites de code UTF-16, d'un champ texte dechiffre. */
export const MAX_FIELD_LENGTH = 4096;

/** Taille maximale d'un champ notes, plus permissif que les autres. */
export const MAX_NOTES_LENGTH = 16384;

/** Nombre maximal de proprietes sur une entree dechiffree. */
export const MAX_ENTRY_PROPERTIES = 40;

/** Nombre maximal d'etiquettes sur une entree. */
export const MAX_ENTRY_TAGS = 32;

/** Taille maximale, en octets UTF-8, d'une entree dechiffree serialisee. */
export const MAX_ENTRY_TOTAL_BYTES = 64 * 1024; // 64 Kio

/** Taille cumulee maximale de toutes les entrees dechiffrees d'un import. */
export const MAX_TOTAL_PLAINTEXT_BYTES = 16 * 1024 * 1024; // 16 Mio

// ------------------------------------------------- formes exactes acceptees

/** Proprietes autorisees a la racine d'un fichier `.vault`. */
export const ALLOWED_RECORD_PROPERTIES = Object.freeze(['id', 'entries', 'meta']);

/** Proprietes autorisees dans `meta` pour le format historique v1. */
export const ALLOWED_META_PROPERTIES_V1 = Object.freeze([
  'salt', 'validation', 'created_at', 'last_modified', 'version', 'kdf', 'iterations'
]);

/** Proprietes exigees dans `meta` pour le format historique v1. */
export const REQUIRED_META_PROPERTIES_V1 = Object.freeze(['salt', 'validation']);

/** Proprietes autorisees dans `meta` pour le format courant v2. */
export const ALLOWED_META_PROPERTIES_V2 = Object.freeze([
  'salt', 'validation', 'created_at', 'last_modified', 'version', 'kdf', 'iterations'
]);

/** Proprietes exigees dans `meta` pour le format courant v2. */
export const REQUIRED_META_PROPERTIES_V2 = Object.freeze([
  'salt', 'validation', 'version', 'kdf', 'iterations'
]);

/**
 * Proprietes exactes d'une entree chiffree.
 *
 * AES-GCM via Web Crypto place le tag d'authentification A L'INTERIEUR du
 * ciphertext. Aucun champ `authTag` separe n'existe et aucun ne doit etre
 * exige ni accepte.
 */
export const ALLOWED_ENTRY_PROPERTIES = Object.freeze(['id', 'iv', 'ciphertext']);

/** Proprietes exactes du bloc de validation. */
export const ALLOWED_VALIDATION_PROPERTIES = Object.freeze(['iv', 'ciphertext']);

/** Versions de format explicitement supportees a l'import. */
export const SUPPORTED_FORMAT_VERSIONS = Object.freeze([1, 2]);

// ------------------------------------------------------------------ divers

/** Longueur maximale d'un identifiant d'entree. */
export const MAX_ENTRY_ID_LENGTH = 128;

/** Nombre d'octets d'un IV AES-GCM. */
export const AES_GCM_IV_BYTES = 12;

/** Nombre d'octets du tag d'authentification AES-GCM, inclus dans ciphertext. */
export const AES_GCM_TAG_BYTES = 16;

export default {
  MAX_VAULT_FILE_BYTES,
  MAX_CSV_FILE_BYTES,
  MAX_VAULT_ENTRIES,
  MAX_CSV_ROWS,
  MAX_ENTRY_CIPHERTEXT_BYTES,
  MAX_TOTAL_CIPHERTEXT_BYTES,
  MAX_FIELD_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_ENTRY_PROPERTIES,
  MAX_ENTRY_TAGS,
  MAX_ENTRY_TOTAL_BYTES,
  MAX_TOTAL_PLAINTEXT_BYTES,
  MAX_ENTRY_ID_LENGTH,
  AES_GCM_IV_BYTES,
  AES_GCM_TAG_BYTES
};
