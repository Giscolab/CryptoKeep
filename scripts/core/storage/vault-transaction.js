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

export class VaultWriteError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'VaultWriteError';
    this.code = code;
    this.details = details;
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
      kdf: meta.kdf,
      iterations: meta.iterations,
      created_at: meta.created_at,
      last_modified: meta.last_modified,
      version: meta.version,
      validation: meta.validation
        ? { iv: meta.validation.iv, ciphertext: meta.validation.ciphertext }
        : undefined
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
 * @returns {Promise<{written: true, verified: true}>}
 */
export async function writeVaultRecordVerified(storage, expectedRecord, snapshot) {
  // --- Etape 1 : ecriture dans une transaction unique -------------------
  try {
    await storage.putVaultRecord(expectedRecord);
  } catch (error) {
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
    return { written: true, verified: true };
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
    await storage.putVaultRecord(snapshot);
  } catch (restoreError) {
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
  VaultWriteError
};
