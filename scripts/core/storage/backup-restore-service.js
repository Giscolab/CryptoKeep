/**
 * CryptoKeep - Restauration CONTROLEE d'une sauvegarde secondaire (Lot 2).
 *
 * Regle centrale : plus AUCUNE restauration automatique au demarrage.
 *
 * L'ancien comportement (`StorageManager.restoreFromLocalBackup()` appele
 * depuis app.js au chargement) est conserve dans son fichier mais n'est plus
 * declenche seul. Il pouvait ecraser un coffre principal par une sauvegarde
 * secondaire arbitrairement ancienne, sans que l'utilisateur le sache.
 *
 * Le flux impose ici :
 *   1. detecter la sauvegarde secondaire ;
 *   2. valider son enveloppe ET son record chiffre ;
 *   3. informer l'utilisateur ;
 *   4. obtenir une confirmation explicite ;
 *   5. demander le mot de passe du coffre sauvegarde ;
 *   6. verifier le bloc de validation et dechiffrer TOUTES les entrees ;
 *   7. ecrire dans UNE transaction IndexedDB ;
 *   8. relire et verifier le record restaure.
 *
 * Un coffre principal structurellement valide est TOUJOURS prioritaire : une
 * sauvegarde ne l'ecrase jamais automatiquement. Le remplacer exige l'action
 * manuelle distincte `restoreBackupDeliberately`, avec confirmation renforcee
 * et la meme verification cryptographique complete qu'un import `.vault`.
 *
 * Aucune restauration n'est declenchee apres une ecriture : il n'existe pas
 * de boucle de restauration possible.
 */

import { readLocalBackup, compareBackupFreshness } from './local-backup.js';
import { validateImportedVaultStructure } from './vault-import-validator.js';
import { verifyAndDecryptVault } from './vault-crypto-verify.js';
import {
  canonicalize,
  createEncryptedSnapshot,
  writeVaultRecordVerified
} from './vault-transaction.js';

export class BackupRestoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BackupRestoreError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Le coffre principal est-il structurellement exploitable ?
 * Un record present mais invalide n'est pas considere comme prioritaire.
 */
export function isUsablePrimaryVault(record) {
  if (!record) return false;
  try {
    validateImportedVaultStructure(record);
    return true;
  } catch {
    return false;
  }
}

/**
 * Etape 1 a 3 : inspecte la situation et decrit ce qui peut etre propose.
 * N'ECRIT RIEN et ne demande rien.
 *
 * @returns {Promise<object>} diagnostic destine a l'interface
 */
export async function inspectRestoreSituation(deps = {}) {
  const { storage, localStorageRef } = deps;

  // LOT 3C : une lecture qui ECHOUE n'est pas un coffre absent. Confondre
  // les deux amenerait ce diagnostic a proposer une restauration par-dessus
  // un coffre parfaitement valide mais momentanement illisible.
  let primary = null;
  let primaryUnreadable = false;
  try {
    primary = storage ? await storage.loadVault() : null;
  } catch {
    primary = null;
    primaryUnreadable = true;
  }

  const primaryUsable = isUsablePrimaryVault(primary);

  let envelope = null;
  let backupError = null;
  try {
    envelope = readLocalBackup({ storage: localStorageRef });
  } catch (error) {
    backupError = error.code || 'corrupt';
  }

  if (!envelope) {
    return {
      primaryUsable,
      primaryUnreadable,
      backupAvailable: false,
      backupError,
      offerRestore: false,
      reason: backupError ? 'backup_invalid' : 'no_backup'
    };
  }

  const freshness = compareBackupFreshness(envelope, primary);

  return {
    primaryUsable,
    primaryUnreadable,
    backupAvailable: true,
    backupError: null,
    backupCreatedAt: envelope.backupCreatedAt,
    backupEntryCount: envelope.entryCount,
    backupFormatVersion: envelope.vaultFormatVersion,
    // Une proposition automatique n'a lieu que si le coffre principal est
    // absent ou inexploitable. LOT 3C : un coffre ILLISIBLE n'entre dans
    // aucune de ces deux categories. Son etat est inconnu, donc rien ne peut
    // etre propose par-dessus.
    offerRestore: !primaryUsable && !primaryUnreadable,
    stale: freshness.stale,
    freshnessNote: freshness.note,
    reason: primaryUnreadable
      ? 'primary_vault_unreadable'
      : (primaryUsable ? 'primary_vault_has_priority' : 'primary_missing_or_invalid')
  };
}

async function performRestore(envelope, deps, options) {
  const {
    storage,
    requestPassword,
    derive,
    decrypt
  } = deps;

  // --- 2. l'enveloppe et son record ont deja ete valides a la lecture ---
  const validated = validateImportedVaultStructure(envelope.record);

  // === Lot 2 partie 2 : empreinte de l'etat AVANT le dialogue ===========
  // Le dialogue utilisateur peut durer plusieurs secondes. Pendant ce temps,
  // un coffre principal peut apparaitre (creation dans un autre onglet,
  // import termine, restauration concurrente). L'etat observe maintenant
  // sera compare a l'etat reel juste avant l'ecriture.
  // LOT 3C : si cette lecture echoue, l'etat de reference est INCONNU. La
  // comparaison faite juste avant l'ecriture comparerait alors deux `null`
  // issus d'erreurs et conclurait a tort que « rien n'a change ».
  let primaryBefore = null;
  try {
    primaryBefore = await storage.loadVault();
  } catch (error) {
    throw new BackupRestoreError(
      'primary_vault_unreadable',
      'Le coffre principal n\'a pas pu etre lu. Restauration abandonnee, rien n\'a ete ecrit.',
      { wrote: false, cause: error && error.name ? error.name : 'unknown' }
    );
  }
  const primaryBeforeCanonical = canonicalize(primaryBefore ?? null);
  const primaryWasUsable = isUsablePrimaryVault(primaryBefore);

  // --- 4. confirmation explicite OBLIGATOIRE ---------------------------
  // L'absence de callback ne vaut jamais consentement implicite.
  if (typeof options.confirm !== 'function') {
    throw new BackupRestoreError(
      'confirmation_required',
      'Une confirmation explicite est requise pour restaurer une sauvegarde.'
    );
  }

  {
    const accepted = await options.confirm({
      entryCount: envelope.entryCount,
      backupCreatedAt: envelope.backupCreatedAt,
      formatVersion: envelope.vaultFormatVersion,
      stale: options.stale === true,
      deliberate: options.deliberate === true,
      warning: options.deliberate
        ? 'Cette action remplacera un coffre principal valide par une sauvegarde secondaire.'
        : 'Le coffre principal est absent ou inexploitable.'
    });
    if (!accepted) {
      throw new BackupRestoreError('cancelled', 'Restauration annulee par l\'utilisateur.');
    }
  }

  // --- 5. mot de passe --------------------------------------------------
  let password = null;
  try {
    password = await requestPassword({
      title: 'Mot de passe du coffre sauvegarde',
      description: `Sauvegarde du ${envelope.backupCreatedAt}, ${envelope.entryCount} entree(s).`
    });

    if (!password) {
      throw new BackupRestoreError('cancelled', 'Restauration annulee : aucun mot de passe fourni.');
    }

    // --- 6. verification cryptographique complete ----------------------
    try {
      await verifyAndDecryptVault(validated.normalized, validated.metadata, password, { derive, decrypt });
    } catch (error) {
      throw new BackupRestoreError(
        error.code === 'crypto_failure' ? 'crypto_failure' : (error.code || 'invalid_plaintext'),
        error.message
      );
    }

    // === Lot 2 partie 2 : GARDE ANTI-COURSE, juste avant l'ecriture ======
    // La decision ne repose jamais sur l'etat observe au debut du dialogue.
    // IndexedDB est relu MAINTENANT, immediatement avant d'ecrire.
    //
    // Cette defense vit dans le service metier, pas dans l'interface : meme
    // si app.js comporte une erreur de synchronisation, l'ecrasement est
    // impossible.
    // LOT 3C : meme regle qu'a l'empreinte initiale. Un echec de lecture
    // juste avant l'ecriture rend l'instantane impossible : ecrire ici
    // detruirait un coffre dont l'etat n'a pas pu etre constate.
    let currentRecord = null;
    try {
      currentRecord = await storage.loadVault();
    } catch (error) {
      throw new BackupRestoreError(
        'primary_vault_unreadable',
        'Le coffre principal n\'a pas pu etre relu avant l\'ecriture. Restauration abandonnee, rien n\'a ete ecrit.',
        { wrote: false, cause: error && error.name ? error.name : 'unknown' }
      );
    }

    if (!primaryWasUsable && isUsablePrimaryVault(currentRecord)) {
      // Un coffre principal valide est apparu pendant l'attente utilisateur.
      // Il est prioritaire : la restauration est abandonnee sans ecriture.
      throw new BackupRestoreError(
        'primary_vault_has_priority',
        'Un coffre principal valide est apparu pendant la confirmation. Restauration abandonnee, le coffre est conserve.',
        { appearedDuringDialog: true, wrote: false }
      );
    }

    if (canonicalize(currentRecord ?? null) !== primaryBeforeCanonical) {
      // L'etat du stockage principal a change depuis le debut du dialogue,
      // sans etre passe de « inexploitable » a « valide ». On refuse quand
      // meme : la decision de l'utilisateur portait sur un autre etat.
      throw new BackupRestoreError(
        'primary_vault_changed',
        'Le stockage principal a change pendant la confirmation. Restauration abandonnee.',
        { changedDuringDialog: true, wrote: false }
      );
    }

    // --- 7 et 8. ecriture atomique puis verification -------------------
    const snapshot = createEncryptedSnapshot(currentRecord);

    await writeVaultRecordVerified(storage, validated.normalized, snapshot);

    return {
      restored: true,
      entryCount: validated.stats.entryCount,
      formatVersion: validated.stats.formatVersion,
      backupCreatedAt: envelope.backupCreatedAt
    };
  } finally {
    // Le mot de passe n'est plus reference par ce module. Les chaines
    // JavaScript ne peuvent pas etre effacees de la memoire de facon fiable.
    password = null;
    if (typeof deps.onCleanup === 'function') {
      try {
        deps.onCleanup();
      } catch {
        /* nettoyage best-effort */
      }
    }
  }
}

/**
 * Restauration proposee lorsque le coffre principal est absent ou invalide.
 * Refuse d'agir si un coffre principal exploitable existe.
 */
export async function restoreBackupWhenPrimaryMissing(deps = {}) {
  const situation = await inspectRestoreSituation(deps);

  // LOT 3C : « illisible » n'est pas « manquant ». Cette fonction ne se
  // declenche que lorsque le coffre principal est reellement absent ou
  // invalide ; un coffre dont l'etat n'a pas pu etre constate ne remplit pas
  // cette condition et ne doit jamais etre ecrase.
  if (situation.primaryUnreadable) {
    throw new BackupRestoreError(
      'primary_vault_unreadable',
      'Le coffre principal n\'a pas pu etre lu. Restauration abandonnee, rien n\'a ete ecrit.',
      { wrote: false }
    );
  }

  if (!situation.backupAvailable) {
    throw new BackupRestoreError(
      situation.backupError ? 'backup_invalid' : 'no_backup',
      situation.backupError
        ? 'La sauvegarde secondaire est illisible ou corrompue.'
        : 'Aucune sauvegarde secondaire disponible.'
    );
  }

  if (situation.primaryUsable) {
    // Priorite absolue au coffre principal.
    throw new BackupRestoreError(
      'primary_vault_has_priority',
      'Un coffre principal valide existe deja. Une sauvegarde ne peut pas l\'ecraser automatiquement.'
    );
  }

  const envelope = readLocalBackup({ storage: deps.localStorageRef });
  return performRestore(envelope, deps, {
    confirm: deps.confirmRestore,
    stale: situation.stale,
    deliberate: false
  });
}

/**
 * Restauration VOLONTAIRE d'une sauvegarde, y compris obsolete, alors qu'un
 * coffre principal valide existe. Action manuelle distincte, confirmation
 * renforcee, meme verification cryptographique complete qu'un import.
 */
export async function restoreBackupDeliberately(deps = {}) {
  const situation = await inspectRestoreSituation(deps);

  // LOT 3C : sans cette garde, un coffre illisible ressortait sous le code
  // `no_backup`, message faux et trompeur pour l'utilisateur.
  if (situation.primaryUnreadable) {
    throw new BackupRestoreError(
      'primary_vault_unreadable',
      'Le coffre principal n\'a pas pu etre lu. Restauration abandonnee, rien n\'a ete ecrit.',
      { wrote: false }
    );
  }

  if (!situation.backupAvailable) {
    throw new BackupRestoreError(
      situation.backupError ? 'backup_invalid' : 'no_backup',
      situation.backupError
        ? 'La sauvegarde secondaire est illisible ou corrompue.'
        : 'Aucune sauvegarde secondaire disponible.'
    );
  }

  if (typeof deps.confirmDeliberate !== 'function') {
    throw new BackupRestoreError(
      'no_confirmation',
      'La restauration volontaire exige une confirmation renforcee.'
    );
  }

  const envelope = readLocalBackup({ storage: deps.localStorageRef });
  return performRestore(envelope, deps, {
    confirm: deps.confirmDeliberate,
    stale: situation.stale,
    deliberate: true
  });
}

export default {
  inspectRestoreSituation,
  restoreBackupWhenPrimaryMissing,
  restoreBackupDeliberately,
  isUsablePrimaryVault,
  BackupRestoreError
};
