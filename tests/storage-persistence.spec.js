/**
 * Lot 1 - Sonde de persistance du stockage local.
 * IndexedDB synthetique. Aucun coffre reel n'est ouvert ni lu.
 */
import {
  probeStoragePersistence,
  describePersistenceIssue,
  PERSISTENCE_STATUS,
  PERSISTENCE_MARKER_KEY
} from '../scripts/security/storage-persistence.js';
import { StubStorage } from './helpers/dom-stub.js';
import { webcrypto } from 'node:crypto';
// LOT 9 : `node:assert/strict` remplace l'assertion maison. Le module exporte
// une fonction appelable directement, donc aucun site d'appel ne change.
import assert from 'node:assert/strict';

/** IndexedDB synthetique minimal : open + transaction readwrite get/put. */
function makeFakeIndexedDb(options = {}) {
  const { failOpen = false, failWrite = false, store = new Map() } = options;

  return {
    store,
    open() {
      const request = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
      queueMicrotask(() => {
        if (failOpen) {
          request.error = new Error('ouverture refusee');
          if (request.onerror) request.onerror();
          return;
        }
        request.result = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => {},
          close: () => {},
          transaction() {
            const tx = { oncomplete: null, onerror: null, onabort: null };
            const objectStore = {
              get(key) {
                const req = { onsuccess: null, onerror: null };
                queueMicrotask(() => {
                  req.result = store.get(key);
                  if (req.onsuccess) req.onsuccess();
                  queueMicrotask(() => {
                    if (failWrite) {
                      tx.error = new Error('ecriture refusee');
                      if (tx.onerror) tx.onerror();
                    } else if (tx.oncomplete) {
                      tx.oncomplete();
                    }
                  });
                });
                return req;
              },
              put(value, key) { if (!failWrite) store.set(key, value); }
            };
            tx.objectStore = () => objectStore;
            return tx;
          }
        };
        if (request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    }
  };
}

try {
  console.log('=== TEST STORAGE PERSISTENCE ===');

  // 1. IndexedDB absent : statut explicite, avertissement clair.
  const absent = await probeStoragePersistence({
    indexedDBRef: null,
    localStorageRef: new StubStorage(),
    cryptoRef: webcrypto,
    storageManagerRef: null
  });
  assert(absent.status === PERSISTENCE_STATUS.UNAVAILABLE, 'IndexedDB absent doit donner le statut unavailable');
  assert(absent.indexedDbAvailable === false, 'La disponibilite doit etre rapportee comme fausse');
  const absentIssue = describePersistenceIssue(absent);
  assert(absentIssue && absentIssue.severity === 'error', 'Un avertissement d erreur doit etre produit');

  // 2. Ecriture refusee : statut blocked, jamais un statut positif.
  const blocked = await probeStoragePersistence({
    indexedDBRef: makeFakeIndexedDb({ failWrite: true }),
    localStorageRef: new StubStorage(),
    cryptoRef: webcrypto,
    storageManagerRef: null
  });
  assert(blocked.status === PERSISTENCE_STATUS.BLOCKED, 'Une ecriture refusee doit donner le statut blocked');
  assert(blocked.indexedDbWritable === false, 'L ecriture ne doit pas etre annoncee comme possible');
  assert(describePersistenceIssue(blocked) !== null, 'Un blocage doit produire un avertissement');

  // 3. Ouverture refusee.
  const failedOpen = await probeStoragePersistence({
    indexedDBRef: makeFakeIndexedDb({ failOpen: true }),
    localStorageRef: new StubStorage(),
    cryptoRef: webcrypto,
    storageManagerRef: null
  });
  assert(failedOpen.status === PERSISTENCE_STATUS.BLOCKED, 'Une ouverture refusee doit donner le statut blocked');

  // 4. Premier lancement : le statut reste INCONNU. Aucun resultat positif
  //    ne doit etre affiche alors qu aucun redemarrage n a ete observe.
  const sharedStore = new Map();
  const sharedLocal = new StubStorage();
  const firstRun = await probeStoragePersistence({
    indexedDBRef: makeFakeIndexedDb({ store: sharedStore }),
    localStorageRef: sharedLocal,
    cryptoRef: webcrypto,
    storageManagerRef: null
  });
  assert(firstRun.status === PERSISTENCE_STATUS.UNKNOWN, 'Un premier lancement doit rester au statut unknown');
  assert(firstRun.indexedDbWritable === true, 'L ecriture doit avoir reussi');
  assert(firstRun.observedRestart === false, 'Aucun redemarrage ne doit etre affirme au premier lancement');
  assert(describePersistenceIssue(firstRun) === null, 'Un premier lancement sain ne doit pas alarmer');
  assert(sharedLocal.getItem(PERSISTENCE_MARKER_KEY) !== null, 'Un marqueur non secret doit etre depose');

  // 5. Deuxieme lancement : persistance reellement observee.
  const secondRun = await probeStoragePersistence({
    indexedDBRef: makeFakeIndexedDb({ store: sharedStore }),
    localStorageRef: sharedLocal,
    cryptoRef: webcrypto,
    storageManagerRef: null
  });
  assert(secondRun.status === PERSISTENCE_STATUS.SURVIVED, 'Un second lancement doit constater la persistance');
  assert(secondRun.observedRestart === true, 'Le redemarrage doit etre observe a partir de donnees reelles');

  // 6. Le marqueur depose ne contient aucun secret.
  const marker = JSON.parse(sharedLocal.getItem(PERSISTENCE_MARKER_KEY));
  assert(Object.keys(marker).length === 1 && 'firstSeenAt' in marker, 'Le marqueur ne doit contenir qu un horodatage');

  // === LOT 9 : REGRESSION DU DEMARRAGE ==================================
  //
  // DEFAUT CONSTATE EN NAVIGATEUR. `timers = { setTimeout, clearTimeout }`
  // capturait les fonctions natives SANS leur receveur. `timers.setTimeout()`
  // s'appelait donc avec `this === timers`, ce que Chrome refuse avec
  // « Illegal invocation ». La sonde echouait a CHAQUE demarrage et affichait
  // « Le navigateur refuse d ecrire dans IndexedDB [...] Relancez avec
  // start_vault_secure.bat » sur un coffre parfaitement enregistre — en
  // renvoyant vers le lanceur que l utilisateur venait d employer.
  //
  // Sous Node, une fonction `setTimeout` detachee reste appelable : les tests
  // unitaires passaient. Ce test reproduit donc la contrainte du navigateur.

  const setTimeoutNatif = globalThis.setTimeout;
  const clearTimeoutNatif = globalThis.clearTimeout;

  /** Se comporte comme une methode native liee : refuse un autre receveur. */
  function setTimeoutCommeEnNavigateur(fn, delay) {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError('Illegal invocation');
    }
    return setTimeoutNatif(fn, delay);
  }
  function clearTimeoutCommeEnNavigateur(handle) {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError('Illegal invocation');
    }
    return clearTimeoutNatif(handle);
  }

  globalThis.setTimeout = setTimeoutCommeEnNavigateur;
  globalThis.clearTimeout = clearTimeoutCommeEnNavigateur;

  let navigateur;
  try {
    // AUCUN `timers` injecte : c'est le chemin par defaut, celui du navigateur.
    navigateur = await probeStoragePersistence({
      indexedDBRef: makeFakeIndexedDb({ store: new Map() }),
      localStorageRef: new StubStorage(),
      cryptoRef: webcrypto,
      storageManagerRef: null
    });
  } finally {
    globalThis.setTimeout = setTimeoutNatif;
    globalThis.clearTimeout = clearTimeoutNatif;
  }

  // 8. La sonde s execute reellement sous la contrainte du navigateur.
  assert(navigateur.error === null,
    `La sonde ne doit plus echouer sur ses propres minuteurs. Recu : ${navigateur.error}`);
  assert(navigateur.indexedDbWritable === true,
    'L ecriture a reussi : elle doit etre rapportee comme telle');
  assert(navigateur.status === PERSISTENCE_STATUS.UNKNOWN,
    'Premier lancement sain : statut unknown, pas blocked');
  assert(describePersistenceIssue(navigateur) === null,
    'DEFAUT HISTORIQUE : une alerte rouge etait affichee a chaque demarrage');

  // 9. Une panne de la SONDE n est jamais presentee comme un refus du stockage.
  const sondeCassee = await probeStoragePersistence({
    indexedDBRef: makeFakeIndexedDb({ store: new Map() }),
    localStorageRef: new StubStorage(),
    cryptoRef: webcrypto,
    storageManagerRef: null,
    timers: {
      setTimeout() { throw new TypeError('Illegal invocation'); },
      clearTimeout() {}
    }
  });
  assert(sondeCassee.status === PERSISTENCE_STATUS.PROBE_FAILED,
    'Une panne interne ne doit pas etre requalifiee en refus d IndexedDB');
  assert(sondeCassee.indexedDbWritable === false,
    'Rien n a ete observe : rien ne doit etre affirme');

  const consigne = describePersistenceIssue(sondeCassee);
  assert(consigne !== null, 'Une panne de la sonde doit rester visible');
  assert(consigne.severity === 'warning',
    'Une sonde en panne n est pas une erreur de stockage');
  assert(!/start_vault_secure/.test(consigne.text),
    'Renvoyer vers le lanceur que l utilisateur vient d employer n aide personne');
  assert(!/refuse d ecrire/.test(consigne.text),
    'Le message ne doit pas affirmer un refus qui n a pas ete observe');

  // 10. Un VRAI refus d IndexedDB reste, lui, une erreur.
  const vraiRefus = await probeStoragePersistence({
    indexedDBRef: makeFakeIndexedDb({ failWrite: true }),
    localStorageRef: new StubStorage(),
    cryptoRef: webcrypto,
    storageManagerRef: null
  });
  assert(vraiRefus.status === PERSISTENCE_STATUS.BLOCKED,
    'La correction ne doit pas avoir desarme la detection reelle');
  assert(describePersistenceIssue(vraiRefus).severity === 'error');

  // 11. Le module ne capture plus aucune fonction native sans son receveur.
  // Commentaires retires : le module DOCUMENTE precisement ce defaut, et un
  // test qui echouerait sur sa propre explication pousserait a supprimer
  // l explication plutot que le defaut.
  const codeModule = (await import('node:fs')).readFileSync(
    'scripts/security/storage-persistence.js', 'utf8'
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert(!/timers\s*=\s*\{\s*setTimeout\s*,\s*clearTimeout\s*\}/.test(codeModule),
    'La capture detachee `timers = { setTimeout, clearTimeout }` ne doit pas revenir');

  // 7. Aucun repli Math.random pour une valeur d identite.
  const source = (await import('node:fs')).readFileSync(
    'scripts/security/storage-persistence.js',
    'utf8'
  );
  assert(!/Math\.random\s*\(/.test(source), 'Aucun Math.random ne doit apparaitre dans le module');

  console.log('Storage persistence tests passed.');
} catch (error) {
  console.error('Storage persistence tests failed:', error);
  process.exitCode = 1;
}
