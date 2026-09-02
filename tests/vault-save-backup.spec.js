/**
 * Lot 2 partie 2 - Une seule couche de sauvegarde secondaire.
 *
 * Reproduit le defaut audite : le chemin normal `saveVault()` alimentait
 * encore directement `localStorage['vaultBackup']`, laissant deux mecanismes
 * concurrents actifs.
 *
 * Ordre exige et verifie ici :
 *   IndexedDB commit -> relecture -> comparaison canonique -> backup.v1
 *
 * Stockages exclusivement synthetiques.
 */
import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import { StorageManager } from '../scripts/core/storage/manager.js';
import {
  backupToLocal,
  restoreFromLocal,
  clearBackup
} from '../scripts/core/storage/backup.js';
import {
  BACKUP_KEY_V1,
  LEGACY_BACKUP_KEY,
  parseBackupEnvelope
} from '../scripts/core/storage/local-backup.js';
import { canonicalize } from '../scripts/core/storage/vault-transaction.js';
import { VaultManager } from '../scripts/core/vault/manager.js';
import {
  FakeLocalStorage,
  buildSyntheticVault,
  tamperBase64
} from './helpers/vault-fixtures.js';

/**
 * IndexedDB synthetique qui journalise l'ORDRE des operations, afin de
 * prouver que la sauvegarde secondaire arrive bien en dernier.
 */
function makeFakeDb(journal, options = {}) {
  let stored = options.initial ? structuredClone(options.initial) : null;
  const state = { get stored() { return stored; }, set stored(v) { stored = v; } };

  state.db = {
    // Le mode est journalise : seule la transaction d'ECRITURE compte dans
    // l'ordre verifie. La transaction de lecture ouverte par loadVault()
    // valide elle aussi, ce qui est normal et sans interet ici.
    transaction(_store, mode = 'readonly') {
      const tx = {
        objectStore: () => ({
          put(record) {
            journal.push('idb:put');
            if (options.abort) return;
            stored = structuredClone(record);
          },
          get() {
            journal.push('idb:read');
            const req = {};
            queueMicrotask(() => {
              const result = options.corruptRead ? { ...structuredClone(stored), id: 'divergent' } : stored;
              if (req.onsuccess) req.onsuccess({ target: { result } });
            });
            return req;
          }
        })
      };
      queueMicrotask(() => {
        if (options.abort && mode === 'readwrite') {
          journal.push('idb:abort');
          if (tx.onabort) tx.onabort();
        } else {
          if (mode === 'readwrite') journal.push('idb:commit');
          if (tx.oncomplete) tx.oncomplete();
        }
      });
      return tx;
    }
  };
  return state;
}

/** localStorage synthetique qui journalise ses ecritures. */
function makeJournalStorage(journal, options = {}) {
  const store = new FakeLocalStorage();
  const nativeSet = store.setItem.bind(store);
  store.setItem = (key, value) => {
    journal.push(`ls:write:${key}`);
    if (options.quota) {
      const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
    }
    nativeSet(key, value);
  };
  return store;
}

const MOT_DE_PASSE = 'phrase-de-passe-sauvegarde-normale';

try {
  console.log('=== TEST VAULT SAVE BACKUP ===');

  const coffre = await buildSyntheticVault({
    password: MOT_DE_PASSE,
    entries: [{ id: 's1', title: 'Alpha', username: 'alice', password: 'aaa' }]
  });

  // ===== 1. Ordre exact d'une sauvegarde normale ==========================
  {
    const journal = [];
    const store = makeJournalStorage(journal);
    globalThis.localStorage = store;

    const sm = new StorageManager();
    sm.db = makeFakeDb(journal).db;

    const rapport = await sm.saveVault(coffre.record.entries, coffre.record.meta);

    // LOT 3B : une lecture PREALABLE s'ajoute en tete. Elle construit
    // l'instantane chiffre du coffre courant, sans lequel une ecriture
    // validee mais divergente ne pourrait pas etre annulee. Elle ne modifie
    // rien et l'ordre des etapes suivantes est inchange.
    assert.deepEqual(
      journal,
      ['idb:read', 'idb:put', 'idb:commit', 'idb:read', `ls:write:${BACKUP_KEY_V1}`],
      'Ordre attendu : instantane, ecriture IndexedDB, validation, relecture, puis sauvegarde secondaire'
    );
    assert.equal(rapport.written, true, 'La sauvegarde secondaire doit reussir');

    // ===== 2. vaultBackup n'est plus une destination =====================
    assert.equal(store.getItem(LEGACY_BACKUP_KEY), null,
      'Une ecriture normale ne doit plus alimenter vaultBackup');
    assert.ok(store.getItem(BACKUP_KEY_V1),
      'La destination normale est cryptokeep.backup.v1');
    assert.ok(!journal.some((step) => step.includes(LEGACY_BACKUP_KEY)),
      'Aucune ecriture vers la cle historique ne doit apparaitre');

    const enveloppe = parseBackupEnvelope(store.getItem(BACKUP_KEY_V1));
    assert.equal(enveloppe.entryCount, 1);

    delete globalThis.localStorage;
  }

  // ===== 3. Transaction annulee : aucune sauvegarde secondaire ============
  {
    const journal = [];
    const store = makeJournalStorage(journal);
    globalThis.localStorage = store;

    const sm = new StorageManager();
    sm.db = makeFakeDb(journal, { abort: true }).db;

    await assert.rejects(
      sm.saveVault(coffre.record.entries, coffre.record.meta),
      'Une transaction annulee doit rejeter'
    );

    assert.equal(store.getItem(BACKUP_KEY_V1), null,
      'Aucune sauvegarde secondaire apres une transaction annulee');
    assert.equal(store.getItem(LEGACY_BACKUP_KEY), null);
    assert.ok(!journal.some((step) => step.startsWith('ls:write')),
      'Aucune ecriture localStorage ne doit avoir eu lieu');

    delete globalThis.localStorage;
  }

  // ===== 4. Divergence a la relecture : aucune sauvegarde du record ======
  {
    const journal = [];
    const store = makeJournalStorage(journal);
    globalThis.localStorage = store;

    const sm = new StorageManager();
    sm.db = makeFakeDb(journal, { corruptRead: true }).db;

    // Ici le coffre de depart est vide : aucun instantane exploitable n'est
    // disponible, la restauration est donc IMPOSSIBLE et doit etre annoncee
    // comme telle plutot que presentee comme reussie.
    await assert.rejects(
      sm.saveVault(coffre.record.entries, coffre.record.meta),
      (error) => {
        assert.equal(error.name, 'VaultWriteError');
        assert.equal(error.code, 'verification_failed');
        assert.equal(error.details.restored, false,
          'Sans instantane, aucune restauration ne doit etre annoncee');
        assert.equal(error.details.restoreNeeded, true);
        return true;
      },
      'Une relecture divergente doit rejeter'
    );

    assert.equal(store.getItem(BACKUP_KEY_V1), null,
      'Un record non verifie ne doit jamais etre sauvegarde');
    assert.ok(journal.includes('idb:read'), 'La relecture doit avoir eu lieu');
    assert.ok(!journal.some((step) => step.startsWith('ls:write')),
      'Aucune sauvegarde secondaire apres divergence');

    delete globalThis.localStorage;
  }

  // ===== 5. Quota localStorage : le coffre principal reste valide ========
  {
    const journal = [];
    const store = makeJournalStorage(journal, { quota: true });
    globalThis.localStorage = store;

    const fake = makeFakeDb(journal);
    const sm = new StorageManager();
    sm.db = fake.db;

    const rapport = await sm.saveVault(coffre.record.entries, coffre.record.meta);

    assert.equal(rapport.written, false, 'La sauvegarde secondaire echoue');
    assert.equal(rapport.quotaExceeded, true, 'Le depassement doit etre signale');
    assert.ok(rapport.message.includes('principal reste intact'),
      'Le message ne doit pas presenter l\'echec comme un succes');
    assert.equal(canonicalize(fake.stored.entries), canonicalize(coffre.record.entries),
      'Le coffre principal ecrit dans IndexedDB reste valide');
    assert.equal(store.getItem(BACKUP_KEY_V1), null);

    delete globalThis.localStorage;
  }

  // ===== 6. Les fonctions historiques existent et deleguent ==============
  {
    const store = new FakeLocalStorage();
    globalThis.localStorage = store;

    assert.equal(typeof backupToLocal, 'function', 'backupToLocal doit exister');
    assert.equal(typeof restoreFromLocal, 'function', 'restoreFromLocal doit exister');
    assert.equal(typeof clearBackup, 'function', 'clearBackup doit exister');

    const sm = new StorageManager();
    assert.equal(typeof sm.saveToLocalBackup, 'function', 'saveToLocalBackup doit exister');
    assert.equal(typeof sm.restoreFromLocalBackup, 'function', 'restoreFromLocalBackup doit exister');
    assert.equal(typeof sm.importFullVault, 'function', 'importFullVault doit exister');

    // backupToLocal ecrit desormais la NOUVELLE cle, plus l'ancienne.
    const rapport = backupToLocal(coffre.record.entries, coffre.record.meta);
    assert.equal(rapport.written, true);
    assert.ok(store.getItem(BACKUP_KEY_V1), 'backupToLocal doit alimenter la cle versionnee');
    assert.equal(store.getItem(LEGACY_BACKUP_KEY), null,
      'backupToLocal ne doit plus ecrire vaultBackup');

    // restoreFromLocal lit la nouvelle enveloppe.
    const relu = restoreFromLocal();
    assert.ok(relu, 'restoreFromLocal doit retrouver le record');
    assert.equal(canonicalize(relu.entries), canonicalize(coffre.record.entries));

    // saveToLocalBackup delegue aussi.
    store.removeItem(BACKUP_KEY_V1);
    const r2 = sm.saveToLocalBackup(coffre.record.entries, coffre.record.meta);
    assert.equal(r2.written, true);
    assert.ok(store.getItem(BACKUP_KEY_V1));
    assert.equal(store.getItem(LEGACY_BACKUP_KEY), null);

    // clearBackup efface les deux cles.
    store.setItem(LEGACY_BACKUP_KEY, 'ancienne');
    const efface = clearBackup();
    assert.equal(efface.cleared, true);
    assert.equal(efface.legacyCleared, true);
    assert.equal(store.size, 0);

    delete globalThis.localStorage;
  }

  // ===== 7. restoreFromLocalBackup : PORTE ARRIERE FERMEE ===============
  // Cette API historique restaurait le coffre principal sans mot de passe,
  // sans confirmation et sans aucune verification cryptographique.
  {
    // --- 7a. sauvegarde versionnee CRYPTOGRAPHIQUEMENT alteree ----------
    const store = new FakeLocalStorage();
    globalThis.localStorage = store;

    const altere = structuredClone(coffre.record);
    altere.entries[0].ciphertext = tamperBase64(altere.entries[0].ciphertext);
    assert.equal(backupToLocal(altere.entries, altere.meta).written, true,
      'La sauvegarde alteree est structurellement valide, donc ecrite');

    const journal = [];
    const sm = new StorageManager();
    sm.db = makeFakeDb(journal).db; // IndexedDB VIDE

    const refus = await sm.restoreFromLocalBackup();

    assert.equal(refus.restored, false, 'La restauration doit etre refusee');
    assert.equal(refus.reason, 'secure_restore_required',
      'Le refus doit etre explicite');
    assert.ok(!journal.includes('idb:put'),
      'AUCUNE ecriture IndexedDB ne doit avoir lieu');
    assert.equal(journal.filter((e) => e === 'idb:put').length, 0, '0 ecriture exigee');

    delete globalThis.localStorage;
  }
  {
    // --- 7b. meme refus via la facade publique VaultManager -------------
    const store = new FakeLocalStorage();
    globalThis.localStorage = store;
    backupToLocal(coffre.record.entries, coffre.record.meta);

    const journal = [];
    const sm = new StorageManager();
    sm.db = makeFakeDb(journal).db;
    sm.initializeDB = async () => {};

    const vm = new VaultManager({ storage: sm });
    const refus = await vm.restoreFromLocalBackup();

    assert.equal(refus.restored, false,
      'La facade publique ne doit pas contourner le service securise');
    assert.equal(refus.reason, 'secure_restore_required');
    assert.ok(!journal.includes('idb:put'), 'Aucune ecriture via la facade');

    delete globalThis.localStorage;
  }
  {
    // --- 7c. delegation : sauvegarde alteree -> echec cryptographique ---
    const store = new FakeLocalStorage();
    globalThis.localStorage = store;

    const altere = structuredClone(coffre.record);
    altere.entries[0].ciphertext = tamperBase64(altere.entries[0].ciphertext);
    backupToLocal(altere.entries, altere.meta);

    const journal = [];
    const sm = new StorageManager();
    sm.db = makeFakeDb(journal).db;

    let code = null;
    try {
      await sm.restoreFromLocalBackup({
        requestPassword: async () => MOT_DE_PASSE,
        confirmRestore: async () => true
      });
    } catch (error) { code = error.code; }

    assert.equal(code, 'crypto_failure',
      'Une sauvegarde alteree doit echouer a la verification cryptographique');
    assert.ok(!journal.includes('idb:put'),
      'Aucune ecriture apres echec cryptographique');

    delete globalThis.localStorage;
  }
  {
    // --- 7d. delegation : sauvegarde saine -> restauration verifiee -----
    const store = new FakeLocalStorage();
    globalThis.localStorage = store;
    backupToLocal(coffre.record.entries, coffre.record.meta);

    const journal = [];
    const sm = new StorageManager();
    sm.db = makeFakeDb(journal).db;

    const etapes = [];
    const rapport = await sm.restoreFromLocalBackup({
      requestPassword: async () => { etapes.push('mot-de-passe'); return MOT_DE_PASSE; },
      confirmRestore: async () => { etapes.push('confirmation'); return true; }
    });

    assert.equal(rapport.restored, true,
      'Avec les rappels, la delegation doit aboutir');
    assert.deepEqual(etapes, ['confirmation', 'mot-de-passe'],
      'Le service securise est bien celui qui pilote le flux');
    assert.ok(journal.includes('idb:put'), 'La restauration verifiee ecrit');

    delete globalThis.localStorage;
  }
  {
    // --- 7e. un coffre principal present reste prioritaire --------------
    const store = new FakeLocalStorage();
    globalThis.localStorage = store;
    backupToLocal(coffre.record.entries, coffre.record.meta);

    const journal = [];
    const sm = new StorageManager();
    sm.db = makeFakeDb(journal, { initial: coffre.record }).db;

    let code = null;
    try {
      await sm.restoreFromLocalBackup({
        requestPassword: async () => MOT_DE_PASSE,
        confirmRestore: async () => true
      });
    } catch (error) { code = error.code; }

    assert.equal(code, 'primary_vault_has_priority',
      'La couche de compatibilite ne doit jamais ecraser un coffre present');
    assert.ok(!journal.includes('idb:put'), 'Aucune ecriture IndexedDB');

    delete globalThis.localStorage;
  }
  {
    // --- 7f. le code ne contient plus de chemin de restauration directe -
    const fs = await import('node:fs');
    const source = fs.readFileSync('scripts/core/storage/manager.js', 'utf8');
    const debut = source.indexOf('async restoreFromLocalBackup(');
    const fin = source.indexOf('saveToLocalBackup(', debut);
    const corps = source.slice(debut, fin > debut ? fin : source.length)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split(/\r?\n/)
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    assert.ok(!/importFullVault|putVaultRecord/.test(corps),
      'restoreFromLocalBackup ne doit plus ecrire le coffre directement');
    assert.ok(/restoreBackupWhenPrimaryMissing/.test(corps),
      'restoreFromLocalBackup doit deleguer au service securise');
  }

  // ===== 8. Aucune ecriture vaultBackup dans le code du sous-systeme =====
  {
    const fs = await import('node:fs');
    const fichiers = [
      'scripts/core/storage/manager.js',
      'scripts/core/storage/backup.js',
      'scripts/core/storage/local-backup.js'
    ];
    fichiers.forEach((fichier) => {
      const code = fs.readFileSync(fichier, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split(/\r?\n/)
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n');
      assert.ok(!/setItem\(\s*['"]vaultBackup['"]/.test(code),
        `${fichier} ne doit plus ecrire directement vaultBackup`);
      assert.ok(!/setItem\(\s*LEGACY_BACKUP_KEY/.test(code),
        `${fichier} ne doit plus ecrire la cle historique`);
    });
  }

  console.log('Vault save backup tests passed.');
} catch (error) {
  console.error('Vault save backup tests failed:', error);
  process.exitCode = 1;
}
