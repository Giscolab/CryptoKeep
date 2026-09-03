/**
 * Lot 2 - Import `.vault` securise : parcours complet et modes de defaillance.
 *
 * Tous les coffres sont synthetiques. Aucun fichier .vault reel n'est lu.
 * L'invariant central verifie partout : AUCUN echec anterieur a l'ecriture ne
 * doit modifier le coffre courant.
 */
import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import {
  importVaultFile,
  assertImportableFile,
  stripBom,
  GENERIC_CRYPTO_FAILURE,
  VaultImportError
} from '../scripts/core/storage/vault-import-service.js';
import { MAX_VAULT_FILE_BYTES } from '../scripts/core/storage/import-limits.js';
import { BACKUP_KEY_V1 } from '../scripts/core/storage/local-backup.js';
import { canonicalize } from '../scripts/core/storage/vault-transaction.js';
import {
  FakeVaultStorage,
  FakeLocalStorage,
  buildSyntheticVault,
  makeVaultFile,
  tamperBase64
} from './helpers/vault-fixtures.js';

const MOT_DE_PASSE_IMPORTE = 'phrase-de-passe-du-coffre-importe';
const MOT_DE_PASSE_COURANT = 'phrase-de-passe-du-coffre-courant';

let coffreImporte;
let coffreCourant;

function deps(storage, overrides = {}) {
  return {
    storage,
    requestPassword: async () => MOT_DE_PASSE_IMPORTE,
    confirmImport: async () => true,
    localStorageRef: new FakeLocalStorage(),
    ...overrides
  };
}

/** Verifie qu'un import echoue avec le code attendu ET sans rien ecrire. */
async function expectFailureWithoutWrite(file, storage, code, message, overrides = {}) {
  const avant = canonicalize(storage.record);
  const ecrituresAvant = storage.writes;
  try {
    await importVaultFile(file, deps(storage, overrides));
  } catch (error) {
    assert.ok(error instanceof VaultImportError, `${message} : type inattendu (${error.name})`);
    assert.equal(error.code, code, `${message} : code attendu ${code}, obtenu ${error.code}`);
    assert.equal(canonicalize(storage.record), avant, `${message} : le coffre courant a ete modifie`);
    assert.equal(storage.writes, ecrituresAvant, `${message} : une ecriture a eu lieu`);
    return error;
  }
  assert.fail(`${message} : aucune erreur levee`);
}

try {
  console.log('=== TEST VAULT IMPORT SERVICE ===');

  coffreImporte = await buildSyntheticVault({
    password: MOT_DE_PASSE_IMPORTE,
    entries: [
      { id: 'importe-1', title: 'Alpha', username: 'alice', password: 'aaa' },
      { id: 'importe-2', title: 'Beta', username: 'bob', password: 'bbb' },
      { id: 'importe-3', title: 'Gamma', username: 'carol', password: 'ccc' }
    ]
  });
  coffreCourant = await buildSyntheticVault({
    password: MOT_DE_PASSE_COURANT,
    entries: [{ id: 'courant-1', title: 'Existant', username: 'dave', password: 'ddd' }]
  });

  // ============ 1. Fichier valide ==========================================
  {
    const storage = new FakeVaultStorage(coffreCourant.record);
    const localStorageRef = new FakeLocalStorage();
    const rapport = await importVaultFile(
      makeVaultFile(coffreImporte.record),
      deps(storage, { localStorageRef })
    );

    assert.equal(rapport.imported, true, 'Import valide refuse');
    assert.equal(rapport.summary.entryCount, 3);
    assert.equal(rapport.summary.formatVersion, 2);
    assert.equal(rapport.summary.cryptographyVerified, true);
    assert.equal(rapport.replacedEntryCount, 1, 'Le coffre remplace comptait une entree');
    assert.equal(storage.record.entries.length, 3, 'Le coffre importe doit etre en place');
    assert.equal(storage.writes, 1, 'Une seule ecriture pour un import reussi');
    // 17. sauvegarde secondaire mise a jour APRES verification
    assert.ok(localStorageRef.getItem(BACKUP_KEY_V1), 'Sauvegarde secondaire absente');
    assert.equal(rapport.backup.written, true);
  }

  // ============ 2. Coffre v1 historique ====================================
  {
    const v1 = await buildSyntheticVault({
      password: MOT_DE_PASSE_IMPORTE,
      entries: [{ id: 'v1-a', title: 'Historique', username: 'eve', password: 'eee' }],
      formatVersion: 1
    });
    const storage = new FakeVaultStorage(coffreCourant.record);
    const rapport = await importVaultFile(makeVaultFile(v1.record), deps(storage));
    assert.equal(rapport.summary.formatVersion, 1, 'Le format v1 doit rester importable');
    assert.equal(storage.record.entries.length, 1);
  }

  // ============ 3. JSON invalide ===========================================
  {
    const storage = new FakeVaultStorage(coffreCourant.record);
    await expectFailureWithoutWrite(
      makeVaultFile(null, { rawText: '{"entries": [ oups' }),
      storage, 'invalid_json', 'JSON invalide'
    );
  }

  // ============ 4. BOM UTF-8 : accepte, pas une erreur =====================
  {
    assert.equal(stripBom('﻿{}'), '{}', 'Le BOM doit etre retire');
    const storage = new FakeVaultStorage(coffreCourant.record);
    const rapport = await importVaultFile(
      makeVaultFile(coffreImporte.record, { bom: true }),
      deps(storage)
    );
    assert.equal(rapport.imported, true, 'Un fichier avec BOM doit etre importable');
  }

  // ============ 5. Mauvais mot de passe ====================================
  {
    const storage = new FakeVaultStorage(coffreCourant.record);
    const erreur = await expectFailureWithoutWrite(
      makeVaultFile(coffreImporte.record),
      storage, 'crypto_failure', 'Mauvais mot de passe',
      { requestPassword: async () => 'mot-de-passe-errone' }
    );
    assert.equal(erreur.message, GENERIC_CRYPTO_FAILURE, 'Le message doit rester generique');
  }

  // ============ 6. Bloc de validation altere ===============================
  {
    const altere = structuredClone(coffreImporte.record);
    altere.meta.validation.ciphertext = tamperBase64(altere.meta.validation.ciphertext);
    const storage = new FakeVaultStorage(coffreCourant.record);
    const erreur = await expectFailureWithoutWrite(
      makeVaultFile(altere), storage, 'crypto_failure', 'Bloc de validation altere'
    );
    assert.equal(erreur.message, GENERIC_CRYPTO_FAILURE,
      'Une alteration ne doit pas se distinguer d\'un mauvais mot de passe');
  }

  // ============ 7. Ciphertext altere : DEUXIEME entree =====================
  {
    const altere = structuredClone(coffreImporte.record);
    altere.entries[1].ciphertext = tamperBase64(altere.entries[1].ciphertext);
    const storage = new FakeVaultStorage(coffreCourant.record);
    await expectFailureWithoutWrite(
      makeVaultFile(altere), storage, 'crypto_failure', 'Deuxieme entree alteree'
    );
  }

  // ============ 8. Ciphertext altere : DERNIERE entree =====================
  {
    const altere = structuredClone(coffreImporte.record);
    const derniereEntree = altere.entries.at(-1);
    derniereEntree.ciphertext = tamperBase64(derniereEntree.ciphertext);
    const storage = new FakeVaultStorage(coffreCourant.record);
    await expectFailureWithoutWrite(
      makeVaultFile(altere), storage, 'crypto_failure', 'Derniere entree alteree'
    );
  }

  // ============ 9. AAD incorrecte ==========================================
  // Un coffre declare v2 dont les entrees ont ete chiffrees SANS AAD (donc au
  // format v1) doit echouer : l'AAD attendue pour v2 ne correspond pas.
  {
    const v1 = await buildSyntheticVault({
      password: MOT_DE_PASSE_IMPORTE,
      entries: [{ id: 'aad-a', title: 'SansAAD', username: 'frank', password: 'fff' }],
      formatVersion: 1
    });
    const menteur = structuredClone(v1.record);
    menteur.meta.version = 2;
    menteur.meta.kdf = 'PBKDF2-HMAC-SHA512';
    menteur.meta.iterations = 150000;
    const storage = new FakeVaultStorage(coffreCourant.record);
    const erreur = await expectFailureWithoutWrite(
      makeVaultFile(menteur), storage, 'crypto_failure', 'AAD incorrecte'
    );
    assert.equal(erreur.message, GENERIC_CRYPTO_FAILURE);
  }

  // Et le miroir : des entrees v2 presentees comme v1 echouent aussi.
  {
    const menteur = structuredClone(coffreImporte.record);
    delete menteur.meta.version;
    delete menteur.meta.kdf;
    delete menteur.meta.iterations;
    const storage = new FakeVaultStorage(coffreCourant.record);
    await expectFailureWithoutWrite(
      makeVaultFile(menteur), storage, 'crypto_failure', 'AAD v2 presentee comme v1'
    );
  }

  // ============ 10. Version inconnue =======================================
  {
    const inconnu = structuredClone(coffreImporte.record);
    inconnu.meta.version = 9;
    const storage = new FakeVaultStorage(coffreCourant.record);
    await expectFailureWithoutWrite(
      makeVaultFile(inconnu), storage, 'unsupported_version', 'Version inconnue'
    );
  }

  // ============ 11. Propriete inattendue ===================================
  {
    const inattendu = structuredClone(coffreImporte.record);
    inattendu.entries[0].authTag = 'AAAA';
    const storage = new FakeVaultStorage(coffreCourant.record);
    await expectFailureWithoutWrite(
      makeVaultFile(inattendu), storage, 'unexpected_property', 'Propriete inattendue'
    );
  }

  // ============ 12. Champ dechiffre trop volumineux ========================
  {
    const enorme = await buildSyntheticVault({
      password: MOT_DE_PASSE_IMPORTE,
      entries: [{ id: 'enorme-1', title: 'X'.repeat(20000), username: 'g', password: 'ggg' }]
    });
    const storage = new FakeVaultStorage(coffreCourant.record);
    await expectFailureWithoutWrite(
      makeVaultFile(enorme.record), storage, 'field_too_large', 'Champ dechiffre trop volumineux'
    );
  }

  // ============ 13. Entree dechiffree trop volumineuse =====================
  {
    // 20 champs de 4000 caracteres : chacun sous MAX_FIELD_LENGTH, mais le
    // total depasse MAX_ENTRY_TOTAL_BYTES (64 Kio).
    const entreeVolumineuse = { id: 'grosse-1', title: 'ok', username: 'h', password: 'hhh' };
    for (let i = 0; i < 20; i += 1) {
      Object.defineProperty(entreeVolumineuse, `extra${i}`, {
        value: 'E'.repeat(4000), enumerable: true, writable: true, configurable: true
      });
    }
    const grosse = await buildSyntheticVault({
      password: MOT_DE_PASSE_IMPORTE,
      entries: [entreeVolumineuse]
    });
    const storage = new FakeVaultStorage(coffreCourant.record);
    await expectFailureWithoutWrite(
      makeVaultFile(grosse.record), storage, 'entry_too_large', 'Entree dechiffree trop volumineuse'
    );
  }

  // ============ 14. Fichier trop volumineux ================================
  {
    const storage = new FakeVaultStorage(coffreCourant.record);
    await expectFailureWithoutWrite(
      makeVaultFile(coffreImporte.record, { size: MAX_VAULT_FILE_BYTES + 1 }),
      storage, 'file_too_large', 'Fichier trop volumineux'
    );
    // La verification a lieu AVANT toute lecture.
    let luDepuisLeDisque = false;
    const fichierPiege = {
      name: 'trop-gros.vault',
      size: MAX_VAULT_FILE_BYTES + 1,
      async text() { luDepuisLeDisque = true; return '{}'; }
    };
    await expectFailureWithoutWrite(fichierPiege, storage, 'file_too_large', 'Taille avant lecture');
    assert.equal(luDepuisLeDisque, false, 'La taille doit etre verifiee avant toute lecture');
  }

  // ============ 15. Extension et fichier inaccessible ======================
  {
    assert.equal(assertImportableFile({ name: 'COFFRE.VAULT', size: 10 }), true,
      'L\'extension doit etre insensible a la casse');
    const storage = new FakeVaultStorage(coffreCourant.record);
    await expectFailureWithoutWrite(
      { name: 'coffre.txt', size: 10, async text() { return '{}'; } },
      storage, 'bad_extension', 'Mauvaise extension'
    );
    await expectFailureWithoutWrite(
      { name: 'coffre.vault', size: 0, async text() { return ''; } },
      storage, 'empty_file', 'Fichier vide'
    );
  }

  // ============ 16. Doublon d'identifiant ==================================
  {
    const doublon = structuredClone(coffreImporte.record);
    doublon.entries[1].id = doublon.entries[0].id;
    const storage = new FakeVaultStorage(coffreCourant.record);
    await expectFailureWithoutWrite(
      makeVaultFile(doublon), storage, 'duplicate_entry_id', 'Doublon d\'identifiant'
    );
  }

  // ============ 17. IV duplique ============================================
  {
    const ivDouble = structuredClone(coffreImporte.record);
    ivDouble.entries[2].iv = ivDouble.entries[0].iv;
    const storage = new FakeVaultStorage(coffreCourant.record);
    await expectFailureWithoutWrite(
      makeVaultFile(ivDouble), storage, 'duplicate_iv', 'IV duplique'
    );
  }

  // ============ 18. Confirmation annulee ===================================
  {
    const storage = new FakeVaultStorage(coffreCourant.record);
    let resumeRecu = null;
    await expectFailureWithoutWrite(
      makeVaultFile(coffreImporte.record), storage, 'cancelled', 'Confirmation annulee',
      {
        confirmImport: async (summary) => { resumeRecu = summary; return false; }
      }
    );
    assert.ok(resumeRecu, 'Un resume doit etre presente avant la confirmation');
    assert.equal(resumeRecu.entryCount, 3, 'Le resume doit annoncer le nombre d\'entrees');
    assert.equal(resumeRecu.allEntriesDecrypted, true,
      'La confirmation intervient apres dechiffrement complet');
  }

  // ============ 19. Mot de passe non fourni ================================
  {
    const storage = new FakeVaultStorage(coffreCourant.record);
    await expectFailureWithoutWrite(
      makeVaultFile(coffreImporte.record), storage, 'cancelled', 'Dialogue de mot de passe annule',
      { requestPassword: async () => null }
    );
  }

  // ============ 20. Transaction IndexedDB interrompue ======================
  {
    const storage = new FakeVaultStorage(coffreCourant.record);
    storage.abortNextWrites = 1;
    const avant = canonicalize(storage.record);
    let erreur = null;
    try {
      await importVaultFile(makeVaultFile(coffreImporte.record), deps(storage));
    } catch (e) { erreur = e; }

    assert.ok(erreur, 'Une transaction annulee doit provoquer une erreur');
    assert.equal(erreur.code, 'transaction_aborted');
    assert.equal(erreur.details.restored, false,
      'Aucune restauration ne doit etre tentee apres une transaction annulee');
    assert.equal(erreur.details.restoreNeeded, false);
    assert.equal(canonicalize(storage.record), avant,
      'L\'ancien record doit rester intact apres annulation de transaction');
  }

  // ============ 21. Echec de verification post-ecriture + restauration =====
  {
    const storage = new FakeVaultStorage(coffreCourant.record);
    storage.corruptReadAfterWrite = true; // la relecture APRES ecriture diverge
    const attendu = canonicalize(storage.record);
    let erreur = null;
    try {
      await importVaultFile(makeVaultFile(coffreImporte.record), deps(storage));
    } catch (e) { erreur = e; }

    assert.ok(erreur, 'Une divergence post-ecriture doit provoquer une erreur');
    assert.equal(erreur.code, 'verification_failed');
    assert.equal(erreur.details.restored, true, 'L\'instantane doit avoir ete restaure');
    assert.equal(erreur.details.verifiedRestore, true, 'La restauration doit etre verifiee');
    assert.equal(canonicalize(storage.record), attendu,
      'Le coffre restaure doit etre identique au coffre d\'origine');
    assert.equal(storage.writes, 2, 'Une ecriture puis une restauration');
  }

  // ============ 22. L'instantane ne contient aucun secret dechiffre ========
  {
    const storage = new FakeVaultStorage(coffreCourant.record);
    storage.corruptReadAfterWrite = true;
    try {
      await importVaultFile(makeVaultFile(coffreImporte.record), deps(storage));
    } catch { /* attendu */ }

    const restaure = JSON.stringify(storage.history[storage.history.length - 1]);
    ['Existant', 'dave', 'ddd', 'Alpha', 'alice', 'aaa'].forEach((secret) => {
      assert.ok(!restaure.includes(secret),
        `L'instantane de restauration ne doit contenir aucun plaintext (${secret})`);
    });
  }

  // ============ 23. Aucune sauvegarde secondaire si l'import echoue ========
  {
    const storage = new FakeVaultStorage(coffreCourant.record);
    const localStorageRef = new FakeLocalStorage();
    try {
      await importVaultFile(makeVaultFile(coffreImporte.record), deps(storage, {
        localStorageRef,
        requestPassword: async () => 'mauvais'
      }));
    } catch { /* attendu */ }
    assert.equal(localStorageRef.getItem(BACKUP_KEY_V1), null,
      'Aucune sauvegarde secondaire ne doit etre ecrite apres un echec');
  }

  // ============ 24. Quota localStorage : le coffre principal reste valide ==
  {
    const storage = new FakeVaultStorage(coffreCourant.record);
    const localStorageRef = new FakeLocalStorage();
    localStorageRef.quotaExceeded = true;
    const rapport = await importVaultFile(
      makeVaultFile(coffreImporte.record),
      deps(storage, { localStorageRef })
    );
    assert.equal(rapport.imported, true, 'Un quota depasse ne doit pas invalider l\'import');
    assert.equal(rapport.backup.written, false);
    assert.equal(rapport.backup.quotaExceeded, true, 'Le depassement doit etre signale');
    assert.equal(storage.record.entries.length, 3, 'Le coffre principal reste ecrit');
  }

  // ============ 25. Le nettoyage final est toujours execute ================
  {
    const storage = new FakeVaultStorage(coffreCourant.record);
    let nettoyages = 0;
    await importVaultFile(makeVaultFile(coffreImporte.record),
      deps(storage, { onCleanup: () => { nettoyages += 1; } }));
    try {
      await importVaultFile(makeVaultFile(coffreImporte.record),
        deps(storage, { onCleanup: () => { nettoyages += 1; }, requestPassword: async () => 'faux' }));
    } catch { /* attendu */ }
    assert.equal(nettoyages, 2, 'Le nettoyage doit avoir lieu en reussite comme en echec');
  }

  // ============ 26. LOT 3C : coffre courant illisible = refus ==============
  // Un import remplace l'INTEGRALITE du coffre. La lecture qui construit
  // l'instantane etait enveloppee dans un `catch { currentRecord = null; }` :
  // une base illisible etait donc traitee comme une base vide, l'import
  // ecrasait le coffre, et aucun retour arriere n'etait possible.
  {
    const storage = new FakeVaultStorage(coffreCourant.record);
    const avant = canonicalize(storage.record);
    storage.failNextRead = true;

    let erreur = null;
    try {
      await importVaultFile(makeVaultFile(coffreImporte.record), deps(storage));
    } catch (error) {
      erreur = error;
    }

    assert.ok(erreur instanceof VaultImportError, 'Un import sur base illisible doit etre refuse');
    assert.equal(erreur.code, 'current_vault_unreadable',
      'Le refus doit nommer la cause : le coffre actuel n a pas pu etre lu');
    assert.equal(erreur.details.wrote, false);
    assert.equal(storage.writes, 0,
      'AUCUNE ecriture ne doit avoir lieu quand l etat courant est inconnu');
    assert.equal(canonicalize(storage.record), avant,
      'Le coffre courant doit rester exactement dans son etat');
  }

  // ============ 27. Un coffre ABSENT reste un import normal ================
  {
    const storage = new FakeVaultStorage(null);
    const rapport = await importVaultFile(makeVaultFile(coffreImporte.record), deps(storage));
    assert.equal(rapport.imported, true,
      'Importer dans une base vide doit rester possible : absent n est pas illisible');
    assert.equal(rapport.replacedEntryCount, 0);
    assert.equal(storage.writes, 1);
  }

  console.log('Vault import service tests passed.');
} catch (error) {
  console.error('Vault import service tests failed:', error);
  process.exitCode = 1;
}
