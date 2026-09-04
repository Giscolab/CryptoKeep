/**
 * CryptoKeep - Verification de la persistance du stockage local (Lot 1).
 *
 * Objectif : detecter avant tout usage du coffre les situations ou le
 * navigateur refuse IndexedDB, ou bien l'accepte mais dans un profil ephemere
 * (navigation privee, profil temporaire). Dans ces situations le coffre est
 * perdu a la fermeture du navigateur.
 *
 * Limites assumees et documentees :
 * - Aucune API navigateur ne repond de facon fiable a la question
 *   "mes donnees survivront-elles a la fermeture ?". Ce module observe des
 *   indices, il ne fournit pas de garantie.
 * - Tant qu'aucun redemarrage n'a ete observe, le statut reste `unknown`.
 *   Aucun resultat positif n'est affiche sans donnee analysee.
 * - `navigator.storage.persisted()` renseigne sur l'eviction sous pression
 *   disque, pas sur le mode de navigation. Il est rapporte a titre indicatif.
 *
 * Ce module ne lit ni n'ecrit aucun secret. Le marqueur ecrit est un
 * identifiant aleatoire non secret et un horodatage.
 */

export const PERSISTENCE_MARKER_KEY = 'cryptokeep.persistence-probe';
export const PROBE_DB_NAME = 'cryptokeep-persistence-probe';
export const PROBE_STORE_NAME = 'probe';
export const PROBE_TIMEOUT_MS = 4000;

/** Statuts possibles. Aucun statut positif n'est emis sans observation. */
export const PERSISTENCE_STATUS = Object.freeze({
  UNAVAILABLE: 'unavailable',
  BLOCKED: 'blocked',
  PROBE_FAILED: 'probe_failed',
  UNKNOWN: 'unknown',
  SURVIVED: 'survived'
});

/**
 * Erreur provenant REELLEMENT d'IndexedDB.
 *
 * LOT 9 - DEFAUT CORRIGE. Toute exception levee pendant la sonde etait
 * traduite en « le navigateur refuse d'ecrire dans IndexedDB », y compris
 * une panne de la sonde elle-meme. La sonde annoncait donc un refus qu'elle
 * n'avait pas observe, et conseillait de relancer avec le lanceur que
 * l'utilisateur venait precisement d'utiliser.
 *
 * Les rejets d'origine IndexedDB portent desormais ce type ; tout le reste
 * est classe `probe_failed` et ne conclut RIEN sur le stockage.
 */
class ProbeIndexedDbError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'ProbeIndexedDbError';
    this.cause = cause || null;
  }
}

/** Une exception vient-elle d'IndexedDB, ou de la sonde ? */
function vientDIndexedDb(error) {
  if (!error) return false;
  if (error instanceof ProbeIndexedDbError) return true;
  // `DOMException` couvre les refus reels du navigateur (mode prive, quota,
  // stockage desactive). Elle n'est pas definie hors navigateur.
  return typeof DOMException !== 'undefined' && error instanceof DOMException;
}

/**
 * Minuteurs utilisables meme detaches de leur objet d'origine.
 *
 * LOT 9 - CAUSE RACINE DU DEFAUT. `timers = { setTimeout, clearTimeout }`
 * capturait les fonctions natives SANS leur receveur. En navigateur,
 * `timers.setTimeout(...)` s'appelle alors avec `this === timers` et Chrome
 * leve « Illegal invocation ». La sonde echouait donc a CHAQUE demarrage,
 * et affichait une alerte rouge sur un coffre parfaitement enregistre.
 *
 * Sous Node, `setTimeout` n'est pas liee a un receveur natif : les tests
 * unitaires passaient, et seul un chargement en navigateur revelait le
 * defaut.
 */
function timersParDefaut() {
  return {
    setTimeout: (fn, delay) => setTimeout(fn, delay),
    clearTimeout: (handle) => clearTimeout(handle)
  };
}

function nowIso(clock) {
  return new Date(clock()).toISOString();
}

function randomMarkerId(cryptoRef) {
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }

  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    const bytes = cryptoRef.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Invariant projet : pas de repli Math.random pour une valeur d'identite.
  throw new Error('CSPRNG indisponible : impossible de generer un marqueur.');
}

function withTimeout(promise, timeoutMs, timers) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  return new Promise((resolve, reject) => {
    const handle = timers.setTimeout(() => {
      reject(new Error('Delai depasse pour la sonde IndexedDB.'));
    }, timeoutMs);

    promise.then(
      (value) => {
        timers.clearTimeout(handle);
        resolve(value);
      },
      (error) => {
        timers.clearTimeout(handle);
        reject(error);
      }
    );
  });
}

function openProbeDatabase(indexedDBRef) {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDBRef.open(PROBE_DB_NAME, 1);
    } catch (error) {
      reject(new ProbeIndexedDbError('Ouverture IndexedDB refusee.', error));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROBE_STORE_NAME)) {
        db.createObjectStore(PROBE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new ProbeIndexedDbError('Ouverture IndexedDB refusee.', request.error));
    request.onblocked = () => reject(new ProbeIndexedDbError('Ouverture IndexedDB bloquee.', null));
  });
}

function readWriteProbe(db, marker) {
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(PROBE_STORE_NAME, 'readwrite');
    } catch (error) {
      reject(new ProbeIndexedDbError('Transaction de sonde refusee.', error));
      return;
    }

    const store = tx.objectStore(PROBE_STORE_NAME);
    const getRequest = store.get('marker');
    let previous = null;

    getRequest.onsuccess = () => {
      previous = getRequest.result || null;
      store.put(marker, 'marker');
    };
    getRequest.onerror = () => reject(new ProbeIndexedDbError('Lecture de sonde refusee.', getRequest.error));

    tx.oncomplete = () => resolve(previous);
    tx.onerror = () => reject(new ProbeIndexedDbError('Ecriture de sonde refusee.', tx.error));
    tx.onabort = () => reject(new ProbeIndexedDbError('Transaction de sonde annulee.', tx.error));
  });
}

/**
 * Execute la sonde de persistance.
 *
 * @param {object} [deps] Injections pour les tests.
 * @returns {Promise<{status: string, indexedDbAvailable: boolean,
 *                    indexedDbWritable: boolean, observedRestart: boolean,
 *                    persistedGranted: (boolean|null), message: string,
 *                    error: (string|null)}>}
 */
export async function probeStoragePersistence(deps = {}) {
  const {
    indexedDBRef = typeof indexedDB !== 'undefined' ? indexedDB : null,
    localStorageRef = typeof localStorage !== 'undefined' ? localStorage : null,
    cryptoRef = typeof crypto !== 'undefined' ? crypto : null,
    storageManagerRef = typeof navigator !== 'undefined' ? navigator.storage : null,
    timers = timersParDefaut(),
    clock = Date.now,
    timeoutMs = PROBE_TIMEOUT_MS
  } = deps;

  const report = {
    status: PERSISTENCE_STATUS.UNKNOWN,
    indexedDbAvailable: Boolean(indexedDBRef),
    indexedDbWritable: false,
    observedRestart: false,
    persistedGranted: null,
    message: '',
    error: null
  };

  if (!indexedDBRef) {
    report.status = PERSISTENCE_STATUS.UNAVAILABLE;
    report.message =
      'IndexedDB est indisponible dans ce navigateur ou ce mode. Le coffre ne peut pas etre stocke.';
    return report;
  }

  let marker;
  try {
    marker = {
      id: randomMarkerId(cryptoRef),
      writtenAt: nowIso(clock)
    };
  } catch (error) {
    report.status = PERSISTENCE_STATUS.BLOCKED;
    report.error = error.message;
    report.message = 'Impossible de preparer la sonde de persistance.';
    return report;
  }

  let db = null;
  try {
    db = await withTimeout(openProbeDatabase(indexedDBRef), timeoutMs, timers);
    const previous = await withTimeout(readWriteProbe(db, marker), timeoutMs, timers);
    report.indexedDbWritable = true;
    report.observedRestart = Boolean(previous && previous.id && previous.id !== marker.id);
  } catch (error) {
    report.error = error && error.message ? error.message : String(error);

    if (vientDIndexedDb(error)) {
      // Refus OBSERVE : c'est bien IndexedDB qui a dit non.
      report.status = PERSISTENCE_STATUS.BLOCKED;
      report.message =
        'IndexedDB a refuse l ecriture. Le coffre ne peut pas etre enregistre de facon fiable.';
    } else {
      // La sonde elle-meme a echoue. Elle n'a donc RIEN observe, et ne peut
      // rien affirmer sur le stockage — ni en bien, ni en mal.
      report.status = PERSISTENCE_STATUS.PROBE_FAILED;
      report.message =
        'La verification de persistance n a pas pu s executer. Elle ne dit rien '
        + 'sur l etat reel du stockage.';
    }
    return report;
  } finally {
    try {
      if (db && typeof db.close === 'function') db.close();
    } catch {
      /* fermeture best-effort */
    }
  }

  // Marqueur secondaire non secret dans localStorage : sert uniquement a
  // distinguer un premier lancement d'un redemarrage reel.
  if (localStorageRef) {
    try {
      const stored = localStorageRef.getItem(PERSISTENCE_MARKER_KEY);
      if (stored) {
        report.observedRestart = true;
      } else {
        localStorageRef.setItem(
          PERSISTENCE_MARKER_KEY,
          JSON.stringify({ firstSeenAt: marker.writtenAt })
        );
      }
    } catch (error) {
      report.error = error && error.message ? error.message : String(error);
    }
  }

  if (storageManagerRef && typeof storageManagerRef.persisted === 'function') {
    try {
      report.persistedGranted = Boolean(await storageManagerRef.persisted());
    } catch {
      report.persistedGranted = null;
    }
  }

  if (report.observedRestart) {
    report.status = PERSISTENCE_STATUS.SURVIVED;
    report.message = 'Persistance observee : des donnees d une session precedente ont ete retrouvees.';
  } else {
    report.status = PERSISTENCE_STATUS.UNKNOWN;
    report.message =
      'Premier lancement observe sur ce profil. La persistance ne pourra etre confirmee qu apres un redemarrage du navigateur.';
  }

  return report;
}

/**
 * Traduit un rapport en consigne utilisateur. Renvoie null quand aucune
 * alerte n'est justifiee.
 */
export function describePersistenceIssue(report) {
  if (!report) return null;

  if (report.status === PERSISTENCE_STATUS.UNAVAILABLE) {
    return {
      severity: 'error',
      text:
        'IndexedDB est indisponible. Fermez toute fenetre de navigation privee et relancez le coffre avec start_vault_secure.bat.'
    };
  }

  if (report.status === PERSISTENCE_STATUS.BLOCKED) {
    return {
      severity: 'error',
      text:
        'Le navigateur refuse d ecrire dans IndexedDB. Le coffre ne serait pas conserve. Relancez avec start_vault_secure.bat (profil persistant).'
    };
  }

  // LOT 9 : une sonde en panne n'est PAS un stockage en panne. Le message ne
  // met donc pas le coffre en cause et ne renvoie pas vers un lanceur que
  // l'utilisateur vient d'employer ; il dit exactement ce qui s'est passe.
  if (report.status === PERSISTENCE_STATUS.PROBE_FAILED) {
    return {
      severity: 'warning',
      text:
        'La verification de persistance n a pas pu s executer. Votre coffre n est '
        + 'pas remis en cause : cette alerte ne concerne que le controle lui-meme.'
    };
  }

  return null;
}

export default { probeStoragePersistence, describePersistenceIssue, PERSISTENCE_STATUS };
