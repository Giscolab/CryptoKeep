/**
 * Registre IndexedDB synthetique MULTI-BASES (Lot 8).
 *
 * POURQUOI UN SECOND HELPER
 * `fake-indexeddb.js` simule UNE base, un store, une cle. Il est utilise par
 * 67 scenarios existants et n'est pas modifie ici : la regle de conservation
 * s'applique aux helpers comme au reste. Le Lot 8 a besoin d'autre chose —
 * deux bases distinctes (`VaultDB` et `vault-db`), `count()`, `close()` et
 * `deleteDatabase()` — donc d'un helper qui lui est propre.
 *
 * CE QU'IL SIMULE FIDELEMENT
 *   - `store.clear()` n'est applique qu'a la VALIDATION de la transaction ;
 *   - une transaction annulee ne vide rien : les enregistrements restent ;
 *   - un store inexistant leve une `NotFoundError` a l'ouverture de la
 *     transaction, comme le fait IndexedDB ;
 *   - `deleteDatabase` peut reussir, echouer, ou etre BLOQUEE par une
 *     connexion restee ouverte.
 *
 * AUCUNE DONNEE REELLE : les enregistrements sont fabriques par les tests.
 * Ce registre ne touche jamais le disque, ni IndexedDB du navigateur.
 */

class FakeRequest {
  constructor() {
    this.onsuccess = null;
    this.onerror = null;
    this.result = undefined;
  }
}

function erreurNotFound(storeName) {
  const error = new Error(`No objectStore named ${storeName} in this database.`);
  error.name = 'NotFoundError';
  return error;
}

class FakeStore {
  constructor(transaction, records) {
    this.transaction = transaction;
    this.records = records;
  }

  count() {
    const request = new FakeRequest();
    this.transaction.reads.push({ type: 'count', request });
    return request;
  }

  get(key) {
    const request = new FakeRequest();
    this.transaction.reads.push({ type: 'get', key, request });
    return request;
  }

  put(value) {
    const request = new FakeRequest();
    this.transaction.pendingPuts.push(value);
    return request;
  }

  clear() {
    const request = new FakeRequest();
    this.transaction.pendingClear = true;
    return request;
  }
}

class FakeTransaction {
  constructor(db, storeName, mode) {
    this.db = db;
    this.storeName = storeName;
    this.mode = mode;
    this.reads = [];
    this.pendingPuts = [];
    this.pendingClear = false;
    this.oncomplete = null;
    this.onabort = null;
    this.onerror = null;
    this.error = null;
    setTimeout(() => this._settle(), 0);
  }

  objectStore() {
    return new FakeStore(this, this.db._store(this.storeName));
  }

  _settle() {
    const records = this.db._store(this.storeName);
    const ecrit = this.pendingClear || this.pendingPuts.length > 0;

    // Transaction ECHOUEE : rien n'est applique, l'ancien contenu reste.
    if (ecrit && this.db.registry.abortNextWrites > 0) {
      this.db.registry.abortNextWrites -= 1;
      this.db.registry.aborts += 1;
      const error = new Error('IndexedDB transaction aborted.');
      error.name = 'AbortError';
      this.error = error;
      if (typeof this.onabort === 'function') this.onabort();
      return;
    }

    for (const lecture of this.reads) {
      this.db.registry.readCount += 1;

      if (this.db.registry.failNextReads > 0
        || this.db.registry.failReadsAt.has(this.db.registry.readCount)) {
        if (this.db.registry.failNextReads > 0) this.db.registry.failNextReads -= 1;
        this.db.registry.readFailures += 1;
        const error = new Error('IndexedDB read failed.');
        error.name = 'DataError';
        if (typeof lecture.request.onerror === 'function') {
          lecture.request.onerror({ target: { error } });
        }
        continue;
      }

      let resultat;
      if (lecture.type === 'count') {
        // Injection : le vidage « reussit » mais la relecture montre que les
        // enregistrements sont toujours la. C'est le seul moyen de prouver
        // que la verification n'est pas decorative.
        resultat = (this.db.registry.pretendStillPresent > 0 && this.db.registry.clears > 0)
          ? this.db.registry.pretendStillPresent
          : records.size;
      } else {
        resultat = records.get(lecture.key);
      }
      if (typeof lecture.request.onsuccess === 'function') {
        lecture.request.onsuccess({ target: { result: resultat } });
      }
    }

    if (this.pendingClear) {
      this.db.registry.clears += 1;
      records.clear();
    }
    for (const valeur of this.pendingPuts) {
      records.set(valeur.id, valeur);
    }

    if (typeof this.oncomplete === 'function') this.oncomplete();
  }
}

class FakeDatabase {
  constructor(registry, name) {
    this.registry = registry;
    this.name = name;
    this.closed = false;
  }

  _store(storeName) {
    const base = this.registry.bases.get(this.name);
    if (!base || !base.has(storeName)) throw erreurNotFound(storeName);
    return base.get(storeName);
  }

  transaction(storeName, mode = 'readonly') {
    if (this.closed) {
      const error = new Error('The database connection is closing.');
      error.name = 'InvalidStateError';
      throw error;
    }
    // Comme IndexedDB : un store inexistant leve DES L'OUVERTURE de la
    // transaction, pas au moment de la requete.
    this._store(storeName);
    return new FakeTransaction(this, storeName, mode);
  }

  close() {
    this.closed = true;
    this.registry.openConnections -= 1;
  }
}

export class FakeIdbRegistry {
  /**
   * @param {object} contenuInitial ex. { VaultDB: { vault: [{id:'current'}] } }
   */
  constructor(contenuInitial = {}) {
    this.bases = new Map();
    for (const [nomBase, stores] of Object.entries(contenuInitial)) {
      const base = new Map();
      for (const [nomStore, records] of Object.entries(stores)) {
        const map = new Map();
        for (const record of records) map.set(record.id, record);
        base.set(nomStore, map);
      }
      this.bases.set(nomBase, base);
    }

    this.openConnections = 0;
    this.aborts = 0;
    this.clears = 0;
    this.readCount = 0;
    this.readFailures = 0;
    this.deleted = [];

    // Injections de panne
    this.abortNextWrites = 0;
    this.failNextReads = 0;
    this.failReadsAt = new Set();
    this.pretendStillPresent = 0;
    this.refuseOpen = new Set();
    this.deleteOutcome = new Map();   // nom -> 'blocked' | 'failed'
  }

  /** Interface d'ouverture, injectee comme `descripteur.open`. */
  open(name) {
    if (this.refuseOpen.has(name)) {
      const error = new Error('Open refused.');
      error.name = 'UnknownError';
      return Promise.reject(error);
    }
    if (!this.bases.has(name)) this.bases.set(name, new Map());
    this.openConnections += 1;
    return Promise.resolve(new FakeDatabase(this, name));
  }

  /** Interface conforme a `IDBFactory.deleteDatabase`. */
  deleteDatabase(name) {
    const request = { onsuccess: null, onerror: null, onblocked: null };
    setTimeout(() => {
      const forcee = this.deleteOutcome.get(name);
      if (forcee === 'blocked') {
        if (typeof request.onblocked === 'function') request.onblocked();
        return;
      }
      if (forcee === 'failed') {
        if (typeof request.onerror === 'function') request.onerror();
        return;
      }
      this.bases.delete(name);
      this.deleted.push(name);
      if (typeof request.onsuccess === 'function') request.onsuccess();
    }, 0);
    return request;
  }

  /** Etat REEL, sans injection : ce que le test doit croire. */
  peek(nomBase, nomStore) {
    const base = this.bases.get(nomBase);
    if (!base) return null;
    const store = base.get(nomStore);
    if (!store) return null;
    return [...store.values()];
  }

  hasBase(nomBase) { return this.bases.has(nomBase); }
}

export default { FakeIdbRegistry };
