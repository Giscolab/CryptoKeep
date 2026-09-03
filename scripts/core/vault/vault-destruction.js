/**
 * CryptoKeep - Suppression volontaire des donnees (Lot 8).
 *
 * ETAT AVANT CE LOT
 * `index.html` presentait, dans une carte « Zone critique », un bouton
 * « Supprimer le compte » decrit comme supprimant « definitivement votre
 * compte Vault et toutes les donnees ». Ce bouton n'avait NI identifiant NI
 * gestionnaire : il ne supprimait rien. Son libelle etait de plus inexact —
 * CryptoKeep n'a pas de compte, il a un coffre local et un profil local, qui
 * vivent dans DEUX bases IndexedDB distinctes.
 *
 * CE QUE FAIT CE MODULE
 * Il execute une suppression demandee, verifie ce qu'il a reellement efface,
 * et rend un rapport qui distingue ce qui a ete supprime, ce qui etait deja
 * absent, et ce qui a ECHOUE. Il ne contient aucun code d'interface.
 *
 * CE QU'IL NE FAIT JAMAIS
 * - Il ne se declenche pas tout seul : aucun appel n'est cable a un
 *   evenement, a un chargement de page ou a une minuterie. La fonction refuse
 *   de s'executer sans la phrase de confirmation exacte.
 * - Il ne devine aucune cible. La liste des bases et des cles est declaree,
 *   figee, et verifiee par les tests contre les modules qui les possedent.
 * - Il ne declare jamais un succes sur une operation qui n'a rien examine :
 *   une cible absente est rapportee « absente », pas « supprimee ».
 * - Il ne supprime pas une base dont le vidage a echoue : effacer la base
 *   apres avoir annonce l'echec du vidage rendrait le rapport faux.
 *
 * LIMITE ASSUMEE, HONNETEMENT
 * Effacer IndexedDB et localStorage retire les donnees des surfaces que la
 * page controle. Cela ne garantit RIEN sur :
 * - les copies que l'utilisateur a exportees lui-meme (fichiers `.vault`,
 *   CSV, sauvegardes systeme, synchronisation cloud) ;
 * - les blocs deja liberes sur le disque, que le navigateur ni la page ne
 *   peuvent surecrire ;
 * - la memoire du processus JavaScript, dont l'effacement fiable est hors de
 *   portee du langage.
 * Le rapport dit ce qui a ete efface, pas que la donnee est irrecuperable.
 */

/**
 * Phrase que l'utilisateur doit saisir en toutes lettres.
 *
 * Sans accent et sans ponctuation : une phrase que l'on ne peut pas taper au
 * clavier sans effort deliberé ne protege personne, et une phrase piegeuse
 * pousse au copier-coller, ce qui annule l'intention du garde-fou.
 */
export const DESTRUCTION_PHRASE = 'SUPPRIMER DEFINITIVEMENT';

/** Portees possibles. Le coffre et le profil sont deux choses distinctes. */
export const DESTRUCTION_SCOPES = Object.freeze({
  VAULT: 'vault',
  PROFILE: 'profile',
  ALL: 'all'
});

/**
 * Bases IndexedDB du COFFRE.
 * `VaultDB` / store `vault` / cle `current` : le coffre chiffre lui-meme.
 */
export const VAULT_DATABASES = Object.freeze([
  Object.freeze({ name: 'VaultDB', stores: Object.freeze(['vault']) })
]);

/**
 * Bases IndexedDB du PROFIL.
 * `vault-db` / store `settings` / cle `user-profile` : nom, courriel, langue.
 * Base DIFFERENTE de celle du coffre, malgre la ressemblance des noms.
 */
export const PROFILE_DATABASES = Object.freeze([
  Object.freeze({ name: 'vault-db', stores: Object.freeze(['settings']) })
]);

/** Cles localStorage appartenant au COFFRE : les sauvegardes secondaires. */
export const VAULT_STORAGE_KEYS = Object.freeze([
  'cryptokeep.backup.v1',
  'vaultBackup'
]);

/** Cles localStorage appartenant au PROFIL : preferences et consentements. */
export const PROFILE_STORAGE_KEYS = Object.freeze([
  'cryptokeep.settings.v1',
  'cryptokeep.view-preferences.v1',
  'cryptokeep.hibp.consent.v1',
  'autolock-enabled',
  'autolock-lock-on-hidden',
  'autolock-delay',
  'selectedTheme',
  'cryptokeep.persistence-probe'
]);

/**
 * La phrase saisie correspond-elle exactement a celle attendue ?
 *
 * Seuls les espaces de bordure sont tolerés : ils viennent d'un collage ou
 * d'une correction automatique et ne traduisent aucune hesitation. Tout le
 * reste — casse, accents, espaces internes — doit correspondre. Accepter
 * « supprimer definitivement » en minuscules reviendrait a transformer un
 * garde-fou en formalite.
 *
 * @param {string} value texte saisi
 * @returns {boolean}
 */
export function confirmationMatches(value) {
  if (typeof value !== 'string') return false;
  return value.trim() === DESTRUCTION_PHRASE;
}

/**
 * Cibles associees a une portee.
 *
 * @param {string} scope une valeur de DESTRUCTION_SCOPES
 * @returns {{databases: Array, storageKeys: Array}|null} null si inconnue
 */
export function targetsForScope(scope) {
  if (scope === DESTRUCTION_SCOPES.VAULT) {
    return { databases: [...VAULT_DATABASES], storageKeys: [...VAULT_STORAGE_KEYS] };
  }
  if (scope === DESTRUCTION_SCOPES.PROFILE) {
    return { databases: [...PROFILE_DATABASES], storageKeys: [...PROFILE_STORAGE_KEYS] };
  }
  if (scope === DESTRUCTION_SCOPES.ALL) {
    return {
      databases: [...VAULT_DATABASES, ...PROFILE_DATABASES],
      storageKeys: [...VAULT_STORAGE_KEYS, ...PROFILE_STORAGE_KEYS]
    };
  }
  return null;
}

/**
 * Ce que la portee CONSERVE. Affiche a l'utilisateur avant qu'il confirme.
 *
 * Une fenetre de suppression qui ne dit que ce qu'elle detruit laisse croire
 * qu'elle detruit tout. Ces phrases sont volontairement au meme niveau de
 * visibilite que la liste de ce qui est supprime.
 */
export function survivorsForScope(scope) {
  if (scope === DESTRUCTION_SCOPES.VAULT) {
    return [
      'Le profil local (nom, courriel, langue) est conservé.',
      'Les préférences d\'affichage, le thème et le délai de verrouillage sont conservés.'
    ];
  }
  if (scope === DESTRUCTION_SCOPES.PROFILE) {
    return [
      'Le coffre chiffré est conservé : vos mots de passe restent accessibles.',
      'La sauvegarde secondaire du coffre est conservée.'
    ];
  }
  if (scope === DESTRUCTION_SCOPES.ALL) {
    return [
      'Aucune donnée locale de CryptoKeep n\'est conservée.',
      'Les fichiers que vous avez exportés vous-même ne sont pas concernés : '
      + 'cette page ne peut pas les atteindre.'
    ];
  }
  return [];
}

/** Transforme une requete IndexedDB en promesse. */
function attendreRequete(requete) {
  return new Promise((resolve, reject) => {
    requete.onsuccess = (evenement) => {
      const cible = evenement && evenement.target ? evenement.target : requete;
      resolve(cible.result);
    };
    requete.onerror = (evenement) => {
      const cible = evenement && evenement.target ? evenement.target : requete;
      reject(cible.error || new Error('IndexedDB request failed.'));
    };
  });
}

/**
 * Attend la VALIDATION d'une transaction, pas seulement la requete.
 *
 * Une requete `clear()` peut reussir alors que la transaction est ensuite
 * annulee : rien n'est alors ecrit. C'est precisement le cas « transaction
 * echouee » que ce lot doit traiter, et il ne se voit qu'ici.
 */
function attendreTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(
      transaction.error || new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () => reject(
      transaction.error || new Error('IndexedDB transaction failed.'));
  });
}

/** Nombre d'enregistrements presents dans un store, ou `null` si illisible. */
async function compterStore(db, storeName) {
  const transaction = db.transaction(storeName, 'readonly');
  const store = transaction.objectStore(storeName);
  return attendreRequete(store.count());
}

/**
 * Vide UN store, puis verifie qu'il est reellement vide.
 *
 * @returns {Promise<object>} entree de rapport pour ce store
 */
async function effacerStore(db, dbName, storeName) {
  const entree = {
    kind: 'indexeddb', database: dbName, store: storeName,
    outcome: 'failed', removed: 0, verified: false, reason: null
  };

  let avant = 0;
  try {
    avant = await compterStore(db, storeName);
  } catch (error) {
    // Un store introuvable n'est pas un echec : il n'y a rien a supprimer.
    // Une base ILLISIBLE, en revanche, en est un — et les deux se
    // distinguent par le nom de l'erreur, pas par un `catch` unique.
    entree.reason = error && error.name === 'NotFoundError'
      ? 'store_absent' : 'read_failed';
    entree.outcome = entree.reason === 'store_absent' ? 'absent' : 'failed';
    return entree;
  }

  if (avant === 0) {
    // Rien n'a ete supprime : le rapport ne doit pas dire le contraire.
    entree.outcome = 'absent';
    entree.reason = 'already_empty';
    entree.verified = true;
    return entree;
  }

  try {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).clear();
    await attendreTransaction(transaction);
  } catch (error) {
    // TRANSACTION ECHOUEE. Les donnees sont TOUJOURS LA. On le dit, et on
    // s'interdit toute etape ulterieure sur cette base.
    entree.reason = 'transaction_failed';
    entree.detail = error && error.name ? error.name : 'unknown';
    return entree;
  }

  // Verification : la seule preuve acceptable est une relecture.
  let apres = null;
  try {
    apres = await compterStore(db, storeName);
  } catch {
    entree.outcome = 'unverified';
    entree.reason = 'verification_unreadable';
    return entree;
  }

  if (apres !== 0) {
    entree.outcome = 'failed';
    entree.reason = 'still_present';
    entree.remaining = apres;
    return entree;
  }

  entree.outcome = 'cleared';
  entree.removed = avant;
  entree.verified = true;
  return entree;
}

/**
 * Supprime la base elle-meme, APRES vidage verifie.
 *
 * Etape distincte et volontairement facultative : ce qui protege
 * l'utilisateur, c'est que les enregistrements aient disparu, pas que le nom
 * de la base ait disparu. Une base ouverte ailleurs (un autre onglet) bloque
 * `deleteDatabase` indefiniment ; on borne donc l'attente et on rapporte
 * « bloquee » plutot que d'attendre sans fin ou de mentir.
 */
async function supprimerBase(factory, dbName, delaiMs) {
  const entree = { kind: 'indexeddb-drop', database: dbName, outcome: 'skipped', reason: null };

  if (!factory || typeof factory.deleteBase !== 'function') {
    entree.reason = 'no_factory';
    return entree;
  }

  try {
    const resultat = await factory.deleteBase(dbName, delaiMs);
    entree.outcome = resultat.outcome;
    entree.reason = resultat.reason || null;
  } catch (error) {
    entree.outcome = 'failed';
    entree.reason = error && error.name ? error.name : 'delete_failed';
  }
  return entree;
}

/**
 * Enveloppe `indexedDB.deleteDatabase` dans un contrat testable.
 *
 * @param {object} indexedDbGlobal objet conforme a l'interface IDBFactory
 */
export function createDeleteFactory(indexedDbGlobal) {
  if (!indexedDbGlobal || typeof indexedDbGlobal.deleteDatabase !== 'function') return null;

  return {
    deleteBase(name, delaiMs = 2000) {
      return new Promise((resolve) => {
        let termine = false;
        const finir = (outcome, reason) => {
          if (termine) return;
          termine = true;
          resolve({ outcome, reason: reason || null });
        };

        const requete = indexedDbGlobal.deleteDatabase(name);
        requete.onsuccess = () => finir('dropped');
        requete.onerror = () => finir('failed', 'delete_error');
        requete.onblocked = () => finir('blocked', 'connection_open_elsewhere');

        const minuterie = setTimeout(() => finir('blocked', 'timeout'), delaiMs);
        if (minuterie && typeof minuterie.unref === 'function') minuterie.unref();
      });
    }
  };
}

/** Supprime une cle de stockage, puis verifie qu'elle a disparu. */
function effacerCle(storage, cle) {
  const entree = {
    kind: 'storage', key: cle, outcome: 'failed', verified: false, reason: null
  };

  let avant = null;
  try {
    avant = storage.getItem(cle);
  } catch (error) {
    entree.reason = 'read_failed';
    entree.detail = error && error.name ? error.name : 'unknown';
    return entree;
  }

  if (avant === null || avant === undefined) {
    entree.outcome = 'absent';
    entree.reason = 'already_absent';
    entree.verified = true;
    return entree;
  }

  try {
    storage.removeItem(cle);
  } catch (error) {
    entree.reason = 'remove_failed';
    entree.detail = error && error.name ? error.name : 'unknown';
    return entree;
  }

  let apres = null;
  try {
    apres = storage.getItem(cle);
  } catch {
    entree.outcome = 'unverified';
    entree.reason = 'verification_unreadable';
    return entree;
  }

  if (apres !== null && apres !== undefined) {
    entree.outcome = 'failed';
    entree.reason = 'still_present';
    return entree;
  }

  entree.outcome = 'cleared';
  entree.verified = true;
  return entree;
}

/** Codes de refus. Aucun n'entraine la moindre ecriture. */
export const DESTRUCTION_REFUSALS = Object.freeze({
  UNKNOWN_SCOPE: 'unknown_scope',
  CONFIRMATION_MISMATCH: 'confirmation_mismatch',
  NO_SURFACE: 'no_surface'
});

function rapportDeRefus(scope, reason) {
  return Object.freeze({
    status: 'refused',
    reason,
    scope: scope || null,
    targets: [],
    cleared: 0, absent: 0, failed: 0, removedRecords: 0,
    erasedSomething: false,
    session: null,
    clipboard: null,
    firstUseState: false
  });
}

/**
 * Execute une suppression volontaire.
 *
 * TOUTES les verifications prealables ont lieu AVANT la premiere ecriture :
 * un refus laisse l'etat rigoureusement intact.
 *
 * @param {object} options
 * @param {string} options.scope portee demandee
 * @param {string} options.confirmation phrase saisie par l'utilisateur
 * @param {Array} [options.databases] descripteurs `{name, stores, open}`
 * @param {object} [options.storage] stockage de type localStorage
 * @param {object} [options.deleteFactory] fabrique de `createDeleteFactory`
 * @param {Function} [options.clearSession] purge memoire (injectee)
 * @param {Function} [options.clearClipboard] tentative presse-papiers
 * @param {Function} [options.restoreFirstUse] retour a l'etat initial
 * @returns {Promise<object>} rapport verifiable
 */
export async function destroyVaultData(options = {}) {
  const {
    scope,
    confirmation,
    databases = null,
    storage = null,
    deleteFactory = null,
    clearSession = null,
    clearClipboard = null,
    restoreFirstUse = null,
    dropTimeoutMs = 2000
  } = options;

  // --- 1. Portee connue -------------------------------------------------
  const cibles = targetsForScope(scope);
  if (!cibles) return rapportDeRefus(scope, DESTRUCTION_REFUSALS.UNKNOWN_SCOPE);

  // --- 2. Phrase exacte -------------------------------------------------
  if (!confirmationMatches(confirmation)) {
    return rapportDeRefus(scope, DESTRUCTION_REFUSALS.CONFIRMATION_MISMATCH);
  }

  // --- 3. Au moins une surface reellement atteignable --------------------
  // Sans base ni stockage, la fonction n'effacerait rien du tout. Annoncer
  // « suppression terminee » dans ce cas serait le meme mensonge que le
  // rapport de securite calcule sur zero entree.
  const basesUtiles = Array.isArray(databases)
    ? databases.filter((base) => base && typeof base.open === 'function'
      && cibles.databases.some((cible) => cible.name === base.name))
    : [];
  const stockageUtile = storage && typeof storage.getItem === 'function'
    && typeof storage.removeItem === 'function';

  if (basesUtiles.length === 0 && !stockageUtile) {
    return rapportDeRefus(scope, DESTRUCTION_REFUSALS.NO_SURFACE);
  }

  const rapport = {
    status: 'completed',
    reason: null,
    scope,
    startedAt: new Date().toISOString(),
    targets: [],
    cleared: 0, absent: 0, failed: 0, removedRecords: 0,
    erasedSomething: false,
    session: null,
    clipboard: null,
    firstUseState: false,
    notes: []
  };

  // --- 4. Secrets en memoire, d'abord -----------------------------------
  // La cle maitre et les entrees dechiffrees sont ce qui est le plus expose.
  // Elles partent avant toute operation de stockage, qui peut etre lente.
  if (typeof clearSession === 'function') {
    try {
      rapport.session = await clearSession();
    } catch (error) {
      rapport.session = { error: error && error.name ? error.name : 'clear_session_failed' };
      rapport.notes.push('La purge memoire a echoue ; les surfaces de stockage ont tout de meme ete traitees.');
    }
  }

  // --- 5. Bases IndexedDB -----------------------------------------------
  for (const cible of cibles.databases) {
    const descripteur = basesUtiles.find((base) => base.name === cible.name);
    if (!descripteur) {
      rapport.targets.push({
        kind: 'indexeddb', database: cible.name, store: null,
        outcome: 'skipped', verified: false, reason: 'no_opener'
      });
      rapport.notes.push(`Base « ${cible.name} » non atteignable depuis ce contexte : rien n'a ete tente.`);
      continue;
    }

    let db = null;
    try {
      db = await descripteur.open();
    } catch (error) {
      rapport.targets.push({
        kind: 'indexeddb', database: cible.name, store: null,
        outcome: 'failed', verified: false, reason: 'open_failed',
        detail: error && error.name ? error.name : 'unknown'
      });
      continue;
    }

    const stores = Array.isArray(descripteur.stores) && descripteur.stores.length > 0
      ? descripteur.stores : cible.stores;

    let toutVide = true;
    for (const storeName of stores) {
      const entree = await effacerStore(db, cible.name, storeName);
      rapport.targets.push(entree);
      if (entree.outcome === 'failed' || entree.outcome === 'unverified') toutVide = false;
    }

    // La base n'est supprimee que si TOUS ses stores sont verifies vides.
    // Sinon on la conserve : la donnee qu'on n'a pas su effacer doit rester
    // atteignable par l'utilisateur, et le rapport doit rester exact.
    if (!toutVide) {
      rapport.notes.push(
        `Base « ${cible.name} » conservee : le vidage n'a pas pu etre verifie.`);
      if (typeof db.close === 'function') db.close();
      continue;
    }

    if (typeof db.close === 'function') db.close();
    const suppression = await supprimerBase(deleteFactory, cible.name, dropTimeoutMs);
    rapport.targets.push(suppression);
    if (suppression.outcome === 'blocked') {
      rapport.notes.push(
        `La base « ${cible.name} » est vide et verifiee, mais son nom subsiste : `
        + 'un autre onglet la garde ouverte. Fermez les autres onglets pour la retirer.');
    }
  }

  // --- 6. Cles de stockage ----------------------------------------------
  if (stockageUtile) {
    for (const cle of cibles.storageKeys) {
      rapport.targets.push(effacerCle(storage, cle));
    }
  } else {
    rapport.notes.push('Aucun stockage local atteignable : les cles n\'ont pas ete traitees.');
    for (const cle of cibles.storageKeys) {
      rapport.targets.push({
        kind: 'storage', key: cle, outcome: 'skipped', verified: false, reason: 'no_storage'
      });
    }
  }

  // --- 7. Presse-papiers : tentative, jamais une promesse ---------------
  if (typeof clearClipboard === 'function') {
    try {
      rapport.clipboard = await clearClipboard();
    } catch (error) {
      rapport.clipboard = {
        attempted: true, succeeded: false,
        reason: error && error.name ? error.name : 'clipboard_failed'
      };
    }
  } else {
    rapport.clipboard = { attempted: false, succeeded: false, reason: 'not_available' };
  }

  // --- 8. Comptage ------------------------------------------------------
  for (const entree of rapport.targets) {
    if (entree.outcome === 'cleared') {
      rapport.cleared += 1;
      rapport.removedRecords += Number(entree.removed || 0);
    } else if (entree.outcome === 'absent') {
      rapport.absent += 1;
    } else if (entree.outcome === 'failed' || entree.outcome === 'unverified') {
      rapport.failed += 1;
    }
  }

  rapport.erasedSomething = rapport.cleared > 0;
  rapport.status = rapport.failed > 0 ? 'partial' : 'completed';
  if (rapport.status === 'partial') rapport.reason = 'targets_failed';

  // --- 9. Etat de premiere utilisation ----------------------------------
  // Uniquement si le coffre a REELLEMENT disparu. Reafficher « Creer un mot
  // de passe maitre » alors que le coffre est toujours la ferait croire a une
  // suppression qui n'a pas eu lieu — et pousserait l'utilisateur a creer un
  // coffre par-dessus l'ancien.
  const coffreVise = scope === DESTRUCTION_SCOPES.VAULT || scope === DESTRUCTION_SCOPES.ALL;
  const coffreParti = rapport.targets.some(
    (entree) => entree.kind === 'indexeddb' && entree.database === 'VaultDB'
      && (entree.outcome === 'cleared' || entree.outcome === 'absent') && entree.verified
  ) && !rapport.targets.some(
    (entree) => entree.kind === 'indexeddb' && entree.database === 'VaultDB'
      && (entree.outcome === 'failed' || entree.outcome === 'unverified')
  );

  if (coffreVise && coffreParti && typeof restoreFirstUse === 'function') {
    try {
      rapport.firstUseState = Boolean(await restoreFirstUse());
    } catch {
      rapport.firstUseState = false;
      rapport.notes.push('Le retour a l\'ecran de creation n\'a pas abouti ; rechargez la page.');
    }
  }

  rapport.finishedAt = new Date().toISOString();
  return rapport;
}

export default {
  DESTRUCTION_PHRASE,
  DESTRUCTION_SCOPES,
  DESTRUCTION_REFUSALS,
  confirmationMatches,
  targetsForScope,
  survivorsForScope,
  createDeleteFactory,
  destroyVaultData
};
