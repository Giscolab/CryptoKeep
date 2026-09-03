/**
 * IndexedDB synthetique minimal, fidele au contrat utilise par
 * `scripts/core/storage/manager.js` (Lot 3b).
 *
 * Objectif : faire passer les tests par le VRAI `StorageManager`, et non par
 * une reimplementation de sa logique. Seule la base est simulee.
 *
 * Contrat reproduit :
 *   - `db.transaction(name, mode)` renvoie une transaction portant
 *     `oncomplete`, `onabort`, `onerror` ;
 *   - `store.put(record)` n'est applique qu'a la VALIDATION de la
 *     transaction, comme dans IndexedDB ;
 *   - une transaction annulee n'ecrit rien : l'ancien record reste intact ;
 *   - `store.get(key)` renvoie via `req.onsuccess({ target: { result } })`.
 *
 * Injections de panne disponibles :
 *   - `abortNextWrites` : annule les N prochaines transactions d'ecriture ;
 *   - `divergeReadAfterCommit` : la premiere relecture qui suit une ecriture
 *     VALIDEE renvoie un record different de celui ecrit. C'est exactement le
 *     scenario "commit reussi puis verification en echec" ;
 *   - `failNextReads` : fait ECHOUER les N prochaines lectures. Une base
 *     illisible n'est pas une base vide : c'est la distinction que le Lot 3c
 *     verifie.
 *
 * Aucune donnee reelle : tout est fabrique par les fixtures synthetiques.
 */

class FakeRequest {
  constructor() {
    this.onsuccess = null;
    this.onerror = null;
  }
}

class FakeObjectStore {
  constructor(transaction) {
    this.transaction = transaction;
  }

  get(key) {
    const request = new FakeRequest();
    this.transaction.reads.push({ key, request });
    return request;
  }


  put(value) {
    const request = new FakeRequest();
    this.transaction.pendingWrites.push(structuredClone(value));
    return request;
  }

  clear() {
    const request = new FakeRequest();
    this.transaction.pendingClear = true;
    return request;
  }
}

class FakeTransaction {
  constructor(db, mode) {
    this.db = db;
    this.mode = mode;
    this.reads = [];
    this.pendingWrites = [];
    this.pendingClear = false;
    this.oncomplete = null;
    this.onabort = null;
    this.onerror = null;
    this.error = null;
    // La validation est asynchrone, comme dans IndexedDB : les handlers
    // installes juste apres `put()` sont donc bien en place.
    setTimeout(() => this._settle(), 0);
  }

  objectStore() {
    return new FakeObjectStore(this);
  }

  _settle() {
    const writing = this.pendingWrites.length > 0 || this.pendingClear;

    if (writing && this.db.abortNextWrites > 0) {
      this.db.abortNextWrites -= 1;
      this.db.aborts += 1;
      const error = new Error('IndexedDB transaction aborted.');
      error.name = 'AbortError';
      this.error = error;
      if (typeof this.onabort === 'function') this.onabort();
      return;
    }

    // Lectures : servies au moment de la validation.
    for (const read of this.reads) {
      // Une base ILLISIBLE n'est pas une base vide : la requete echoue, elle
      // ne renvoie pas `undefined`. C'est la distinction que le Lot 3c doit
      // faire, et qu'un stub renvoyant `null` masquerait completement.
      this.db.readCount += 1;

      if (this.db.failNextReads > 0 || this.db.failReadsAt.has(this.db.readCount)) {
        if (this.db.failNextReads > 0) this.db.failNextReads -= 1;
        this.db.readFailures += 1;
        const error = new Error('IndexedDB read failed.');
        error.name = 'DataError';
        if (typeof read.request.onerror === 'function') read.request.onerror(error);
        continue;
      }

      const result = this.db._readRecord(read.key);
      if (typeof read.request.onsuccess === 'function') {
        read.request.onsuccess({ target: { result } });
      }
    }

    if (this.pendingClear) {
      this.db.records.clear();
    }
    for (const record of this.pendingWrites) {
      this.db.records.set(record.id, record);
      this.db.commits += 1;
      this.db.history.push(structuredClone(record));
      if (this.db.divergeReadAfterCommit) {
        this.db.divergeReadAfterCommit = false;
        this.db._divergePending = true;
      }
    }

    if (typeof this.oncomplete === 'function') this.oncomplete();
  }
}

export class FakeIDBDatabase {
  constructor(initialRecord = null) {
    this.records = new Map();
    if (initialRecord) {
      this.records.set(initialRecord.id, structuredClone(initialRecord));
    }
    this.commits = 0;
    this.aborts = 0;
    this.abortNextWrites = 0;
    this.failNextReads = 0;
    // Numeros de lecture (1-based) a faire echouer. Permet de viser une
    // lecture PRECISE de la sequence, par exemple la lecture prealable faite
    // par saveVault() apres celle du VaultManager.
    this.failReadsAt = new Set();
    this.readCount = 0;
    this.readFailures = 0;
    this.divergeReadAfterCommit = false;
    this._divergePending = false;
    this.history = [];
  }

  transaction(_name, mode = 'readonly') {
    return new FakeTransaction(this, mode);
  }

  _readRecord(key) {
    const stored = this.records.get(key);
    if (!stored) return undefined;
    const copy = structuredClone(stored);
    if (this._divergePending) {
      this._divergePending = false;
      // Divergence realiste : le record relu n'est pas celui qui vient
      // d'etre ecrit. Aucun secret n'est fabrique ici.
      if (Array.isArray(copy.entries) && copy.entries.length > 0) {
        copy.entries[0] = { ...copy.entries[0], id: `${copy.entries[0].id}-divergent` };
      } else {
        copy.meta = { ...copy.meta, last_modified: 'divergent' };
      }
    }
    return copy;
  }

  /** Etat persistant reel, sans injection de divergence. */
  peek(key = 'current') {
    const stored = this.records.get(key);
    return stored ? structuredClone(stored) : null;
  }
}

export default { FakeIDBDatabase };
