/**
 * CryptoKeep - Operations d'entree : ajout, modification, suppression (Lot 3).
 *
 * Cette couche NE CREE PAS un second systeme de stockage. Elle valide, prend
 * un verrou d'operation, puis delegue au `VaultManager`, dont les ecritures
 * passent depuis le Lot 2 par `StorageManager.saveVault()` :
 *
 *   nouveau record chiffre -> transaction IndexedDB -> attente de validation
 *   -> relecture -> comparaison canonique -> sauvegarde secondaire versionnee
 *
 * Ce que cette couche ajoute :
 *
 * - VERROU D'OPERATION par identifiant d'entree. Une action utilisateur ne
 *   peut declencher qu'une seule operation, meme si plusieurs evenements la
 *   demandent (le couple `blur` + `click` de l'edition en ligne declenchait
 *   deux sauvegardes complètes, donc deux IV et deux ecritures). Le verrou
 *   n'est pas un `setTimeout` : c'est une promesse partagee, deterministe.
 *
 * - ROLLBACK EN MEMOIRE. Le `VaultManager` ne modifie son etat interne
 *   qu'apres une ecriture reussie ; en cas d'echec, l'entree precedente reste
 *   donc utilisable. Cette couche capture en plus un instantane de l'entree
 *   avant modification pour que l'interface puisse revenir en arriere.
 *
 * - EVENEMENT `vault:entries-changed` apres toute mutation reussie, pour un
 *   rafraichissement centralise des vues.
 *
 * IV et AAD : `VaultManager` appelle `encryptData`, qui tire un IV frais de
 * `crypto.getRandomValues` a CHAQUE appel, et fournit l'AAD du format courant
 * (`vault-entry:<version>:<id>`). Toute modification produit donc un IV neuf
 * et un nouveau ciphertext. Aucun ciphertext n'est jamais reutilise.
 */

import { validateEntryInput, EntryValidationError } from './entry-validation.js';
import { VaultWriteError } from '../storage/vault-transaction.js';

export const ENTRIES_CHANGED_EVENT = 'vault:entries-changed';

export class EntryOperationError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = 'EntryOperationError';
    this.code = code;
    this.field = field;
  }
}

/**
 * Verrous d'operation en cours, indexes par cle.
 * La cle est l'identifiant de l'entree, ou `__create__` pour une creation.
 */
const inFlight = new Map();

export const CREATE_LOCK_KEY = '__create__';

/** Une operation est-elle deja en cours pour cette cle ? */
export function isOperationInFlight(key) {
  return inFlight.has(key);
}

/** Nombre d'operations en cours. Utilise par les tests. */
export function inFlightCount() {
  return inFlight.size;
}

/**
 * Execute `task` sous verrou.
 *
 * Un second appel concurrent pour la MEME cle ne relance pas l'operation :
 * il recoit la promesse deja en cours. Une action utilisateur produit donc
 * exactement une ecriture logique, quel que soit le nombre d'evenements
 * declencheurs.
 */
export async function withEntryLock(key, task) {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => task())().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

function dispatchEntriesChanged(reason, detail = {}) {
  if (typeof document === 'undefined' || typeof document.dispatchEvent !== 'function') return;
  if (typeof CustomEvent !== 'function') return;
  try {
    document.dispatchEvent(new CustomEvent(ENTRIES_CHANGED_EVENT, {
      detail: { reason, ...detail }
    }));
  } catch {
    /* diffusion best-effort */
  }
}

/**
 * Messages d'echec d'ecriture, par code de `VaultWriteError` (Lot 3b).
 *
 * Chacun decrit HONNETEMENT l'etat du coffre persistant. Aucun ne presente
 * un echec comme un succes, et aucun ne contient de donnee de coffre.
 */
const WRITE_FAILURE_MESSAGES = Object.freeze({
  transaction_aborted: "L'enregistrement a ete annule. Le coffre precedent est inchange.",
  verification_failed: "L'enregistrement n'a pas pu etre verifie.",
  restore_failed: "L'enregistrement n'a pas pu etre verifie et le coffre precedent n'a pas pu etre retabli.",
  restore_unverified: "L'enregistrement n'a pas pu etre verifie et le retablissement du coffre precedent n'a pas pu etre confirme."
});

function toOperationError(error) {
  if (error instanceof EntryValidationError) {
    return new EntryOperationError(error.code, error.message, error.field);
  }
  if (error instanceof EntryOperationError) return error;

  // Lot 3b : un echec d'ecriture verifiee n'est plus aplati en un
  // `write_failed` muet. L'appelant doit pouvoir distinguer :
  //   - rien n'a ete ecrit (transaction annulee) ;
  //   - l'ecriture a ete validee mais divergente, et le coffre precedent a
  //     ete restaure PUIS verifie ;
  //   - la restauration elle-meme a echoue ou n'a pas pu etre confirmee.
  // Le message reste generique : ni mot de passe, ni contenu dechiffre, ni
  // detail interne de la base n'y figure.
  if (error instanceof VaultWriteError) {
    const details = error.details || {};
    const known = Object.prototype.hasOwnProperty.call(WRITE_FAILURE_MESSAGES, error.code);
    const message = known
      ? Object.entries(WRITE_FAILURE_MESSAGES).find(([key]) => key === error.code)[1]
      : "L'operation n'a pas pu etre enregistree.";

    const operationError = new EntryOperationError(`write_${error.code}`, message);
    operationError.restored = details.restored === true;
    operationError.verifiedRestore = details.verifiedRestore === true;
    return operationError;
  }

  // Aucun detail interne n'est propage : le message reste generique.
  return new EntryOperationError('write_failed', "L'operation n'a pas pu etre enregistree.");
}

/**
 * Ajoute une entree.
 *
 * Ordre : validation -> verrou -> construction du plaintext -> identifiant
 * neuf -> horodatages -> IV neuf -> AAD -> chiffrement -> ecriture verifiee
 * -> sauvegarde secondaire -> etat en memoire -> evenement.
 *
 * Les trois dernieres etapes sont assurees par `VaultManager.addEntry()`, qui
 * ne met a jour son etat interne qu'apres une ecriture reussie.
 */
export async function createEntry(vaultManager, input, options = {}) {
  const { lockKey = CREATE_LOCK_KEY } = options;

  let payload;
  try {
    payload = validateEntryInput(input);
  } catch (error) {
    throw toOperationError(error);
  }

  return withEntryLock(lockKey, async () => {
    const before = vaultManager.getEntries().length;

    try {
      await vaultManager.addEntry(payload);
    } catch (error) {
      // Rien n'a ete persiste : `saveVault` echoue avant toute mise a jour
      // de l'etat en memoire.
      throw toOperationError(error);
    }

    const after = vaultManager.getEntries();
    const created = after.find((entry) => entry.title === payload.title
      && entry.password === payload.password) || null;

    dispatchEntriesChanged('created', { entryId: created ? created.id : null });
    return { created: true, entryCount: after.length, previousCount: before, entry: created };
  });
}

/**
 * Modifie une entree existante.
 *
 * Idempotence au niveau interaction : plusieurs declencheurs concurrents pour
 * la meme entree partagent le meme verrou, donc la meme unique ecriture.
 * Un seul IV est genere pour une action validee.
 */
export async function updateEntry(vaultManager, entryId, changes, options = {}) {
  if (typeof entryId !== 'string' || entryId.length === 0) {
    throw new EntryOperationError('invalid_id', 'Identifiant d\'entree invalide.');
  }

  let payload;
  try {
    payload = validateEntryInput(changes, { partial: options.partial !== false });
  } catch (error) {
    throw toOperationError(error);
  }

  return withEntryLock(entryId, async () => {
    // Instantane de l'entree AVANT modification, pour que l'appelant puisse
    // retablir un affichage coherent en cas d'echec.
    const previous = vaultManager.getEntries().find((entry) => entry.id === entryId) || null;

    try {
      await vaultManager.updateEntry(entryId, payload);
    } catch (error) {
      // L'ancienne entree reste intacte : `VaultManager.updateEntry` n'ecrit
      // en memoire qu'apres la reussite de `saveVault`.
      const failure = toOperationError(error);
      failure.previousEntry = previous;
      throw failure;
    }

    const updated = vaultManager.getEntries().find((entry) => entry.id === entryId) || null;
    dispatchEntriesChanged('updated', { entryId });
    return { updated: true, entryId, previousEntry: previous, entry: updated };
  });
}

/**
 * Supprime une entree.
 *
 * Le verrou empeche qu'un double clic, ou deux confirmations concurrentes,
 * lancent deux suppressions reelles.
 */
export async function deleteEntry(vaultManager, entryId) {
  if (typeof entryId !== 'string' || entryId.length === 0) {
    throw new EntryOperationError('invalid_id', 'Identifiant d\'entree invalide.');
  }

  return withEntryLock(entryId, async () => {
    const previous = vaultManager.getEntries().find((entry) => entry.id === entryId) || null;
    if (!previous) {
      throw new EntryOperationError('not_found', 'Entree introuvable.');
    }

    try {
      await vaultManager.deleteEntry(entryId);
    } catch (error) {
      const failure = toOperationError(error);
      failure.previousEntry = previous;
      throw failure;
    }

    dispatchEntriesChanged('deleted', { entryId });
    return { deleted: true, entryId, previousEntry: previous };
  });
}

/**
 * Identite NON SENSIBLE d'une entree, destinee a une confirmation.
 *
 * Ne contient jamais le mot de passe ni les notes. Le titre, et le nom
 * d'hote de l'URL lorsqu'il existe, suffisent a identifier l'entree.
 */
export function describeEntryForConfirmation(entry) {
  if (!entry || typeof entry !== 'object') {
    return { title: 'Entree inconnue', host: '', username: '' };
  }

  let host = '';
  if (typeof entry.url === 'string' && entry.url.length > 0) {
    try {
      host = new URL(entry.url).hostname;
    } catch {
      host = '';
    }
  }

  return {
    title: typeof entry.title === 'string' && entry.title.length > 0
      ? entry.title
      : 'Entree sans titre',
    host,
    username: typeof entry.username === 'string' ? entry.username : ''
  };
}

export default {
  createEntry,
  updateEntry,
  deleteEntry,
  withEntryLock,
  isOperationInFlight,
  inFlightCount,
  describeEntryForConfirmation,
  ENTRIES_CHANGED_EVENT,
  EntryOperationError
};
