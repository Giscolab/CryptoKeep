/**
 * CryptoKeep - Sauvegarde secondaire versionnee dans localStorage (Lot 2).
 *
 * ETAT HISTORIQUE CONSTATE
 * Deux formats incompatibles partageaient la meme cle `vaultBackup` :
 *   - `backupToLocal()` (scripts/core/storage/backup.js) ecrivait un objet
 *     JSON direct ;
 *   - `StorageManager.saveToLocalBackup()` ecrivait le meme JSON encode en
 *     base64.
 * Les deux fichiers sont CONSERVES. Ce module ajoute une troisieme couche,
 * versionnee, et sait migrer les deux formats precedents.
 *
 * HONNETETE SUR LE CHIFFREMENT
 * Ni le JSON ni le base64 n'apportent le moindre chiffrement. Le base64 est
 * un encodage, rien de plus. La confidentialite de cette sauvegarde repose
 * EXCLUSIVEMENT sur le fait que son contenu est deja chiffre par AES-GCM.
 * C'est pourquoi ce module refuse d'ecrire quoi que ce soit qui ne soit pas
 * un record de coffre chiffre et valide.
 *
 * ROLE
 * IndexedDB reste la source principale. localStorage n'est qu'une sauvegarde
 * secondaire, mise a jour uniquement APRES verification de l'ecriture
 * principale, et jamais restauree automatiquement.
 */

import { validateImportedVaultStructure } from './vault-import-validator.js';
import { canonicalize } from './vault-transaction.js';

/** Cle versionnee de la nouvelle enveloppe. */
export const BACKUP_KEY_V1 = 'cryptokeep.backup.v1';

/** Cle historique partagee par les deux formats precedents. */
export const LEGACY_BACKUP_KEY = 'vaultBackup';

/**
 * Version de l'ENVELOPPE de sauvegarde. Volontairement distincte de
 * `meta.version`, qui decrit le format cryptographique du coffre. Les deux
 * evoluent independamment.
 */
export const BACKUP_ENVELOPE_VERSION = 1;

export class LocalBackupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LocalBackupError';
    this.code = code;
  }
}

function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

function isQuotaError(error) {
  if (!error) return false;
  return error.name === 'QuotaExceededError'
    || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || error.code === 22
    || error.code === 1014;
}

/**
 * Construit l'enveloppe versionnee.
 *
 * Elle ne contient que : la version d'enveloppe, un horodatage de creation de
 * la SAUVEGARDE, le record chiffre normalise, et des informations non
 * sensibles servant a la valider et a la migrer (nombre d'entrees, version de
 * format du coffre, date de derniere modification du coffre).
 */
export function buildBackupEnvelope(vaultRecord, options = {}) {
  const validated = validateImportedVaultStructure(vaultRecord);
  const now = options.now || new Date().toISOString();

  return {
    envelopeVersion: BACKUP_ENVELOPE_VERSION,
    backupCreatedAt: now,
    vaultFormatVersion: validated.stats.formatVersion,
    entryCount: validated.stats.entryCount,
    vaultLastModified: validated.normalized.meta.last_modified || '',
    record: validated.normalized
  };
}

/** Valide une enveloppe relue. Renvoie l'enveloppe normalisee. */
export function parseBackupEnvelope(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LocalBackupError('corrupt', 'La sauvegarde secondaire est illisible.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new LocalBackupError('corrupt', 'La sauvegarde secondaire est illisible.');
  }

  if (parsed.envelopeVersion !== BACKUP_ENVELOPE_VERSION) {
    throw new LocalBackupError('unsupported_envelope', 'Version d\'enveloppe de sauvegarde non supportee.');
  }

  if (typeof parsed.backupCreatedAt !== 'string' || parsed.backupCreatedAt.length === 0) {
    throw new LocalBackupError('corrupt', 'La sauvegarde secondaire n\'a pas d\'horodatage.');
  }

  // Le record est revalide integralement : une sauvegarde est une donnee
  // hostile au meme titre qu'un fichier importe.
  const validated = validateImportedVaultStructure(parsed.record);

  return {
    envelopeVersion: parsed.envelopeVersion,
    backupCreatedAt: parsed.backupCreatedAt,
    vaultFormatVersion: validated.stats.formatVersion,
    entryCount: validated.stats.entryCount,
    vaultLastModified: validated.normalized.meta.last_modified || '',
    record: validated.normalized
  };
}

/**
 * Ecrit la sauvegarde secondaire. A n'appeler QU'APRES verification de
 * l'ecriture IndexedDB principale.
 *
 * @returns {{written: boolean, quotaExceeded: boolean, message: string}}
 */
export function writeLocalBackup(vaultRecord, options = {}) {
  const storage = resolveStorage(options.storage);
  if (!storage) {
    return { written: false, quotaExceeded: false, message: 'Stockage local indisponible.' };
  }

  let payload;
  try {
    payload = JSON.stringify(buildBackupEnvelope(vaultRecord, options));
  } catch (error) {
    return {
      written: false,
      quotaExceeded: false,
      message: `Sauvegarde secondaire refusee : ${error.code || 'structure invalide'}.`
    };
  }

  try {
    storage.setItem(BACKUP_KEY_V1, payload);
    return { written: true, quotaExceeded: false, message: 'Sauvegarde secondaire mise a jour.' };
  } catch (error) {
    // Un echec de sauvegarde secondaire n'invalide JAMAIS le coffre principal
    // deja ecrit et verifie dans IndexedDB. L'utilisateur doit en revanche
    // etre averti : sa redondance n'existe plus.
    if (isQuotaError(error)) {
      return {
        written: false,
        quotaExceeded: true,
        message: 'Quota du stockage local depasse : la sauvegarde secondaire n\'a pas ete mise a jour. Le coffre principal reste intact.'
      };
    }
    return {
      written: false,
      quotaExceeded: false,
      message: 'La sauvegarde secondaire n\'a pas pu etre ecrite. Le coffre principal reste intact.'
    };
  }
}

/** Relit et valide la sauvegarde secondaire versionnee. */
export function readLocalBackup(options = {}) {
  const storage = resolveStorage(options.storage);
  if (!storage) return null;

  const raw = storage.getItem(BACKUP_KEY_V1);
  if (!raw) return null;

  return parseBackupEnvelope(raw);
}

/**
 * Efface la sauvegarde secondaire versionnee.
 *
 * Lot 2 : cette fonction est implementee et testee, mais volontairement NON
 * raccordee au bouton de suppression du coffre. Le flux complet de suppression
 * appartient au Lot 8.
 *
 * @param {{storage?: object, includeLegacy?: boolean}} options
 */
export function clearLocalBackup(options = {}) {
  const storage = resolveStorage(options.storage);
  const report = { cleared: false, legacyCleared: false };
  if (!storage) return report;

  try {
    if (storage.getItem(BACKUP_KEY_V1) !== null) {
      storage.removeItem(BACKUP_KEY_V1);
      report.cleared = true;
    }
  } catch {
    /* effacement best-effort */
  }

  if (options.includeLegacy) {
    try {
      if (storage.getItem(LEGACY_BACKUP_KEY) !== null) {
        storage.removeItem(LEGACY_BACKUP_KEY);
        report.legacyCleared = true;
      }
    } catch {
      /* effacement best-effort */
    }
  }

  return report;
}

/**
 * Lit une sauvegarde historique sous `vaultBackup`, quel que soit son format.
 *
 * 1. tentative de lecture comme JSON direct (`backupToLocal`) ;
 * 2. a defaut, decodage base64 puis parsing JSON
 *    (`StorageManager.saveToLocalBackup`).
 *
 * Le base64 n'est JAMAIS considere comme un chiffrement : il n'est qu'un
 * encodage de transport.
 *
 * @returns {{format: 'json'|'base64', record: object}|null}
 */
export function readLegacyBackup(options = {}) {
  const storage = resolveStorage(options.storage);
  if (!storage) return null;

  const raw = storage.getItem(LEGACY_BACKUP_KEY);
  if (!raw) return null;

  let parsed = null;
  let format = null;

  try {
    parsed = JSON.parse(raw);
    format = 'json';
  } catch {
    let decoded;
    try {
      decoded = atob(raw);
    } catch {
      throw new LocalBackupError('corrupt', 'La sauvegarde historique est illisible.');
    }
    try {
      parsed = JSON.parse(decoded);
      format = 'base64';
    } catch {
      throw new LocalBackupError('corrupt', 'La sauvegarde historique est illisible.');
    }
  }

  // Validation stricte de la structure historique avant tout usage.
  const validated = validateImportedVaultStructure(parsed);
  return { format, record: validated.normalized };
}

/**
 * Migre une sauvegarde historique vers l'enveloppe versionnee.
 *
 * L'ancienne valeur est conservee jusqu'a ce que TOUTES les etapes aient
 * reussi : ecriture de la nouvelle enveloppe, relecture, verification par
 * serialisation canonique. Elle n'est supprimee qu'ensuite.
 *
 * La verification cryptographique du bloc de validation et le dechiffrement
 * de toutes les entrees sont delegues a `verifyRecord`, fourni par
 * l'appelant : ce module ne connait ni le mot de passe ni les cles.
 *
 * @param {{storage?: object, verifyRecord?: (record: object) => Promise<void>, now?: string}} options
 */
export async function migrateLegacyBackup(options = {}) {
  const storage = resolveStorage(options.storage);
  if (!storage) return { migrated: false, reason: 'no_storage' };

  const legacyRaw = storage.getItem(LEGACY_BACKUP_KEY);
  if (!legacyRaw) return { migrated: false, reason: 'no_legacy_backup' };

  let legacy;
  try {
    legacy = readLegacyBackup({ storage });
  } catch (error) {
    return { migrated: false, reason: 'invalid_legacy', code: error.code, legacyPreserved: true };
  }

  if (!legacy) return { migrated: false, reason: 'no_legacy_backup' };

  if (typeof options.verifyRecord === 'function') {
    try {
      await options.verifyRecord(legacy.record);
    } catch (error) {
      // Verification cryptographique impossible : on ne migre pas, et
      // surtout on ne supprime pas l'ancienne valeur.
      return {
        migrated: false,
        reason: 'verification_failed',
        code: error && error.code ? error.code : 'unknown',
        legacyPreserved: true
      };
    }
  }

  const envelope = buildBackupEnvelope(legacy.record, { now: options.now });
  try {
    storage.setItem(BACKUP_KEY_V1, JSON.stringify(envelope));
  } catch (error) {
    return {
      migrated: false,
      reason: isQuotaError(error) ? 'quota_exceeded' : 'write_failed',
      legacyPreserved: true
    };
  }

  // Relecture et verification avant toute suppression.
  let reread;
  try {
    reread = parseBackupEnvelope(storage.getItem(BACKUP_KEY_V1));
  } catch {
    return { migrated: false, reason: 'reread_failed', legacyPreserved: true };
  }

  if (canonicalize(reread.record) !== canonicalize(envelope.record)) {
    return { migrated: false, reason: 'verification_mismatch', legacyPreserved: true };
  }

  // Toutes les etapes ont reussi : l'ancienne cle peut disparaitre.
  try {
    storage.removeItem(LEGACY_BACKUP_KEY);
  } catch {
    return { migrated: true, sourceFormat: legacy.format, legacyPreserved: true };
  }

  return { migrated: true, sourceFormat: legacy.format, legacyPreserved: false };
}

/**
 * Compare l'age de la sauvegarde secondaire avec celui du coffre principal.
 *
 * Les horodatages sont une INDICATION, pas une preuve : ils proviennent de
 * l'horloge locale, ne sont pas authentifies et peuvent etre manipules. Ce
 * resultat sert uniquement a avertir l'utilisateur.
 */
export function compareBackupFreshness(envelope, currentRecord) {
  const backupTime = Date.parse(envelope?.vaultLastModified || envelope?.backupCreatedAt || '');
  const currentTime = Date.parse(currentRecord?.meta?.last_modified || '');

  if (!Number.isFinite(backupTime) || !Number.isFinite(currentTime)) {
    return { comparable: false, stale: false, note: 'Horodatages incomparables.' };
  }

  return {
    comparable: true,
    stale: backupTime < currentTime,
    note: 'Indication seulement : les horodatages ne sont pas authentifies.'
  };
}

export default {
  BACKUP_KEY_V1,
  LEGACY_BACKUP_KEY,
  BACKUP_ENVELOPE_VERSION,
  buildBackupEnvelope,
  parseBackupEnvelope,
  writeLocalBackup,
  readLocalBackup,
  clearLocalBackup,
  readLegacyBackup,
  migrateLegacyBackup,
  compareBackupFreshness,
  LocalBackupError
};
