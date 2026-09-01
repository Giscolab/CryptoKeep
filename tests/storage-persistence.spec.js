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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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
