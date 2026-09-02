/**
 * CryptoKeep - Migration verifiee de la sauvegarde historique (Lot 2, partie 2).
 *
 * DEFAUT CORRIGE
 * `migrateLegacyBackup()` etait appelable sans verificateur cryptographique.
 * Une ancienne sauvegarde `vaultBackup` seulement bien FORMEE pouvait alors
 * etre promue en enveloppe `cryptokeep.backup.v1` presentee comme validee,
 * puis l'originale supprimee — alors que son contenu etait indechiffrable.
 * Reproduction : ciphertext altere, `migrated: true`, `legacyExists: false`.
 *
 * CE MODULE fournit la verification manquante. Il ne duplique aucune logique
 * cryptographique : il assemble les composants deja ecrits au Lot 2.
 *
 * Ordre impose :
 *   1. detecter `vaultBackup` ;
 *   2. detecter son format historique (JSON direct ou base64 + JSON) ;
 *   3. validation structurelle stricte ;
 *   4. l'ancienne valeur reste intacte pendant tout le processus ;
 *   5. demander le mot de passe du coffre historique ;
 *   6. deriver la cle selon les metadonnees DE CE COFFRE ;
 *   7. verifier le bloc de validation ;
 *   8. dechiffrer et authentifier TOUTES les entrees ;
 *   9. valider les plaintexts ;
 *  10. seulement ensuite, ecrire `cryptokeep.backup.v1` ;
 *  11. relire et comparer par serialisation canonique ;
 *  12. supprimer `vaultBackup` uniquement apres reussite de tout ce qui precede ;
 *  13. au moindre echec, conserver integralement l'ancienne sauvegarde.
 *
 * Ce module n'ecrit JAMAIS dans IndexedDB. Une migration de sauvegarde ne
 * touche pas au coffre principal.
 */

import { LEGACY_BACKUP_KEY, migrateLegacyBackup, readLegacyBackup } from './local-backup.js';
import { validateImportedVaultStructure } from './vault-import-validator.js';
import { verifyAndDecryptVault } from './vault-crypto-verify.js';

export class LegacyMigrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LegacyMigrationError';
    this.code = code;
  }
}

/**
 * Une sauvegarde historique est-elle presente ?
 * N'ECRIT RIEN et ne demande rien.
 */
export function hasLegacyBackup(options = {}) {
  const storage = options.storage
    ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!storage) return false;
  try {
    return storage.getItem(LEGACY_BACKUP_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Inspecte la sauvegarde historique sans rien modifier.
 *
 * @returns {{present: boolean, format?: string, entryCount?: number,
 *            formatVersion?: number, structurallyValid: boolean, error?: string}}
 */
export function inspectLegacyBackup(options = {}) {
  const storage = options.storage
    ?? (typeof localStorage !== 'undefined' ? localStorage : null);

  if (!hasLegacyBackup({ storage })) {
    return { present: false, structurallyValid: false };
  }

  try {
    const legacy = readLegacyBackup({ storage });
    const validated = validateImportedVaultStructure(legacy.record);
    return {
      present: true,
      structurallyValid: true,
      format: legacy.format,
      entryCount: validated.stats.entryCount,
      formatVersion: validated.stats.formatVersion
    };
  } catch (error) {
    return {
      present: true,
      structurallyValid: false,
      error: error && error.code ? error.code : 'corrupt'
    };
  }
}

/**
 * Migre la sauvegarde historique APRES verification cryptographique complete.
 *
 * @param {object} deps
 *   - storage       : localStorage (ou equivalent synthetique)
 *   - requestPassword : dialogue securise, obligatoire
 *   - derive/decrypt : injections de test facultatives
 * @returns {Promise<object>} rapport verifiable
 */
export async function migrateLegacyBackupVerified(deps = {}) {
  const {
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    requestPassword,
    derive,
    decrypt,
    now
  } = deps;

  if (!storage) {
    return { migrated: false, reason: 'no_storage', legacyPreserved: true };
  }

  // --- 1 a 3. detection, format, validation structurelle ----------------
  const inspection = inspectLegacyBackup({ storage });
  if (!inspection.present) {
    return { migrated: false, reason: 'no_legacy_backup', legacyPreserved: false };
  }
  if (!inspection.structurallyValid) {
    // --- 4 et 13. l'ancienne valeur reste intacte -----------------------
    return {
      migrated: false,
      reason: 'invalid_legacy',
      code: inspection.error,
      legacyPreserved: true
    };
  }

  if (typeof requestPassword !== 'function') {
    return { migrated: false, reason: 'verification_required', legacyPreserved: true };
  }

  // --- 5. mot de passe du coffre historique -----------------------------
  let password = null;
  try {
    password = await requestPassword({
      title: 'Mot de passe de la sauvegarde historique',
      description: `Sauvegarde ${inspection.format}, ${inspection.entryCount} entree(s), format v${inspection.formatVersion}.`
    });
  } catch {
    return { migrated: false, reason: 'password_unavailable', legacyPreserved: true };
  }

  if (!password) {
    return { migrated: false, reason: 'cancelled', legacyPreserved: true };
  }

  try {
    // --- 6 a 12. la verification est passee a migrateLegacyBackup, qui
    // n'ecrit et ne supprime QUE si elle a reussi. Les etapes 10 a 12
    // (ecriture, relecture, comparaison canonique, suppression) sont deja
    // implementees et testees dans local-backup.js : rien n'est duplique.
    const report = await migrateLegacyBackup({
      storage,
      now,
      verifyRecord: async (record) => {
        const validated = validateImportedVaultStructure(record);
        // Bloc de validation, puis TOUTES les entrees, puis plaintext.
        await verifyAndDecryptVault(
          validated.normalized,
          validated.metadata,
          password,
          { derive, decrypt }
        );
      }
    });

    return { ...report, sourceFormat: report.sourceFormat || inspection.format };
  } finally {
    // Le mot de passe n'est plus reference par ce module. Les chaines
    // JavaScript ne peuvent pas etre effacees de la memoire de facon fiable.
    password = null;
  }
}

export default {
  migrateLegacyBackupVerified,
  inspectLegacyBackup,
  hasLegacyBackup,
  LegacyMigrationError
};
