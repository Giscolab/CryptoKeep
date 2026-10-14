/**
 * CryptoKeep - Ecriture atomique verifiee du coffre (Lot 2).
 *
 * Sert a la fois a l'import `.vault` et a l'import CSV. Le contrat est :
 *
 *   1. un INSTANTANE exclusivement chiffre du coffre courant est conserve en
 *      memoire (aucun secret dechiffre n'y figure) ;
 *   2. le nouveau record est ecrit sous l'identifiant principal dans UNE
 *      transaction IndexedDB ;
 *   3. si la transaction est annulee, l'ancien record est intact par
 *      construction : aucune restauration n'est tentee, elle serait inutile
 *      et pourrait au contraire ecraser des donnees saines ;
 *   4. si la transaction est validee, le record est RELU et compare a
 *      l'attendu par serialisation canonique (cles triees). Une comparaison
 *      de taille ne suffit pas et n'est pas utilisee ;
 *   5. en cas de divergence apres ecriture validee, l'instantane chiffre est
 *      restaure dans une NOUVELLE transaction, puis cette restauration est
 *      elle-meme relue et verifiee ;
 *   6. aucune restauration n'est declenchee automatiquement apres une
 *      restauration : il n'existe pas de boucle possible.
 */

import { publishVaultChange } from './vault-sync.js';

export class VaultWriteError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'VaultWriteError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Conflit optimiste detecte DANS la transaction IndexedDB.
 *
 * Ce type est produit par StorageManager.putVaultRecord lorsque le record
 * courant ne correspond plus au predecesseur attendu. Il ne contient aucune
 * donnee de coffre et signifie qu'aucune ecriture n'a ete effectuee.
 */
export class VaultWriteConflictError extends Error {
  constructor(message = 'Le coffre a change pendant l\'operation.') {
    super(message);
    this.name = 'VaultWriteConflictError';
    this.code = 'write_conflict';
    this.details = { written: false, restored: false, restoreNeeded: false };
  }
}

/**
 * Refus explicite plutot qu'une fausse exclusion mutuelle entre onglets.
 * Le repli en memoire reste utile aux tests et aux outils hors navigateur,
 * mais deux pages ne partagent pas cette file et ne doivent jamais la prendre
 * pour un verrou inter-contexte.
 */
export class VaultWriteLockUnavailableError extends Error {
  constructor() {
    super('Ce navigateur ne fournit pas le verrou inter-onglets requis pour modifier le coffre.');
    this.name = 'VaultWriteLockUnavailableError';
    this.code = 'vault_write_lock_unavailable';
  }
}

export const VAULT_WRITE_LOCK_NAME = 'cryptokeep-vault-write-v1';
let fallbackWriteTail = Promise.resolve();

/**
 * Serialise une publication complete du coffre et de sa sauvegarde.
 *
 * `navigator.locks` fournit l'exclusion inter-onglets. Dans un vrai contexte
 * navigateur son absence fait echouer l'ecriture de facon fermee : la file
 * locale ci-dessous ne couvre qu'un contexte JavaScript et ne serait donc pas
 * une garantie honnete. Elle reste reservee aux tests et outils Node, tandis
 * que le CAS IndexedDB protege en plus le record principal dans tous les cas.
 */
export async function withVaultWriteLock(task, options = {}) {
  if (typeof task !== 'function') throw new TypeError('vault_write_task_required');
  const lockManager = options.lockManager
    || (typeof navigator !== 'undefined' && navigator ? navigator.locks : null);

  if (lockManager && typeof lockManager.request === 'function') {
    return lockManager.request(
      options.name || VAULT_WRITE_LOCK_NAME,
      { mode: 'exclusive' },
      () => task()
    );
  }

  const isBrowserRealm = typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && !globalThis.process?.versions?.node;
  if (isBrowserRealm) throw new VaultWriteLockUnavailableError();

  const previous = fallbackWriteTail;
  let release;
  fallbackWriteTail = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

/**
 * Serialisation canonique : cles triees a tous les niveaux.
 * Deux records equivalents produisent exactement la meme chaine.
 */
export function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value === undefined ? null : value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  const parts = keys.map((key) => {
    const own = Object.getOwnPropertyDescriptor(value, key);
    return `${JSON.stringify(key)}:${canonicalize(own ? own.value : undefined)}`;
  });
  return `{${parts.join(',')}}`;
}

/** Compare deux records par serialisation canonique. */
export function recordsAreIdentical(left, right) {
  return canonicalize(left) === canonicalize(right);
}

/**
 * Instantane du coffre courant, exclusivement chiffre.
 *
 * Aucun titre, identifiant de connexion, URL, note ni mot de passe dechiffre
 * n'entre ici : seules les structures `{ id, iv, ciphertext }` et les
 * metadonnees non secretes sont copiees.
 */
export function createEncryptedSnapshot(record) {
  if (!record || typeof record !== 'object') return null;

  const meta = record.meta || {};
  return {
    id: 'current',
    entries: Array.isArray(record.entries)
      ? record.entries.map((entry) => ({
        id: entry.id,
        iv: entry.iv,
        ciphertext: entry.ciphertext
      }))
      : [],
    meta: {
      salt: meta.salt,
      ...(meta.kdf !== undefined ? { kdf: meta.kdf } : {}),
      ...(meta.iterations !== undefined ? { iterations: meta.iterations } : {}),
      created_at: meta.created_at,
      last_modified: meta.last_modified,
      version: meta.version,
      ...(meta.validation
        ? { validation: { iv: meta.validation.iv, ciphertext: meta.validation.ciphertext } }
        : {})
    }
  };
}

/**
 * Ecrit un record puis verifie l'ecriture. Restaure l'instantane si, et
 * seulement si, l'ecriture a ete VALIDEE mais que la relecture diverge.
 *
 * @param {object} storage doit exposer putVaultRecord(record) et loadVault()
 * @param {object} expectedRecord record normalise a ecrire
 * @param {object|null} snapshot instantane chiffre du coffre precedent
 * @param {{assertBeforeWrite?: Function}} [options] garde synchrone evaluee
 *        au dernier moment dans la transaction quand le stockage le permet
 * @returns {Promise<{written: true, verified: true}>}
 */
export async function writeVaultRecordVerified(storage, expectedRecord, snapshot, options = {}) {
  // --- Etape 1 : ecriture dans une transaction unique -------------------
  try {
    // Le predecesseur est compare et le nouveau record est ecrit dans la
    // MEME transaction readwrite. Deux auteurs partis du meme instantane ne
    // peuvent donc plus valider tous les deux un remplacement complet.
    if (typeof options.assertBeforeWrite === 'function') options.assertBeforeWrite();
    await storage.putVaultRecord(expectedRecord, {
      expectedCurrent: snapshot,
      assertBeforeWrite: options.assertBeforeWrite
    });
  } catch (error) {
    if (error && error.name === 'VaultSessionError') throw error;
    if (error instanceof VaultWriteError && error.code === 'snapshot_unavailable') {
      throw error;
    }

    if (error && error.code === 'write_conflict') {
      throw new VaultWriteError(
        'write_conflict',
        'Le coffre a change pendant l\'operation. Aucune modification obsolete n\'a ete ecrite.',
        { written: false, restored: false, restoreNeeded: false }
      );
    }

    // Transaction annulee ou echouee : rien n'a ete ecrit, l'ancien record
    // est intact. Toute tentative de "restauration" serait une ecriture
    // supplementaire non justifiee.
    throw new VaultWriteError(
      'transaction_aborted',
      'La transaction d\'ecriture a ete annulee. Le coffre existant est inchange.',
      { cause: error && error.name ? error.name : 'unknown', restored: false, restoreNeeded: false }
    );
  }

  // --- Etape 2 : relecture et comparaison canonique ---------------------
  let reread = null;
  let rereadFailed = false;
  try {
    reread = await storage.loadVault();
  } catch {
    rereadFailed = true;
  }

  if (!rereadFailed && recordsAreIdentical(reread, expectedRecord)) {
    // Les autres onglets abandonnent immediatement leur cle et leurs
    // plaintexts. Le message de synchronisation ne contient aucune donnee du
    // coffre et n'est pas delivre au contexte emetteur.
    const sync = publishVaultChange();
    return { written: true, verified: true, sync };
  }

  // --- Etape 3 : ecriture validee mais divergente -> restauration -------
  if (!snapshot) {
    throw new VaultWriteError(
      'verification_failed',
      'La verification apres ecriture a echoue et aucun instantane n\'est disponible.',
      { restored: false, restoreNeeded: true }
    );
  }

  try {
    // La restauration est elle aussi conditionnelle : elle n'est permise que
    // si notre candidat est encore le record courant. Un auteur plus recent
    // ne doit jamais etre ecrase par un rollback tardif.
    await storage.putVaultRecord(snapshot, { expectedCurrent: expectedRecord });
  } catch (restoreError) {
    if (restoreError && restoreError.code === 'write_conflict') {
      // Notre ecriture a bien ete validee, puis un successeur a ete publie.
      // La divergence n'est pas une corruption de notre transaction et il
      // serait dangereux de restaurer l'ancien record par-dessus.
      return { written: true, verified: true, superseded: true };
    }

    throw new VaultWriteError(
      'restore_failed',
      'La verification apres ecriture a echoue et la restauration a echoue.',
      { restored: false, restoreNeeded: true, cause: restoreError && restoreError.name }
    );
  }

  // --- Etape 4 : verification de la restauration elle-meme --------------
  // Aucune nouvelle restauration n'est declenchee ici : la chaine s'arrete.
  let restoredRecord = null;
  try {
    restoredRecord = await storage.loadVault();
  } catch {
    throw new VaultWriteError(
      'restore_unverified',
      'La restauration a ete ecrite mais n\'a pas pu etre relue.',
      { restored: true, verifiedRestore: false }
    );
  }

  if (!recordsAreIdentical(restoredRecord, snapshot)) {
    throw new VaultWriteError(
      'restore_unverified',
      'La restauration a ete ecrite mais ne correspond pas a l\'instantane.',
      { restored: true, verifiedRestore: false }
    );
  }

  throw new VaultWriteError(
    'verification_failed',
    'La verification apres ecriture a echoue. Le coffre precedent a ete restaure et verifie.',
    { restored: true, verifiedRestore: true }
  );
}

export default {
  writeVaultRecordVerified,
  createEncryptedSnapshot,
  canonicalize,
  recordsAreIdentical,
  withVaultWriteLock,
  VAULT_WRITE_LOCK_NAME,
  VaultWriteError,
  VaultWriteConflictError,
  VaultWriteLockUnavailableError
};
