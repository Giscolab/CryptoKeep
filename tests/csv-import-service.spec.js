/**
 * Lot 2 - Import CSV : mapping, apercu, ajout atomique.
 * Coffres et stockages exclusivement synthetiques.
 */
import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import {
  importCsvFile,
  analyzeCsvRows,
  detectColumnMapping,
  readCsvFile,
  CsvImportError
} from '../scripts/utils/csv-import-service.js';
import { parseCsv } from '../scripts/utils/csv-parser.js';
import { MAX_CSV_FILE_BYTES, MAX_CSV_ROWS } from '../scripts/core/storage/import-limits.js';
import { canonicalize } from '../scripts/core/storage/vault-transaction.js';
import { BACKUP_KEY_V1 } from '../scripts/core/storage/local-backup.js';
import { deriveMasterKey } from '../scripts/core/crypto/pbkdf2.js';
import { decryptData } from '../scripts/core/crypto/aes-gcm.js';
import {
  CURRENT_PBKDF2_ITERATIONS,
  base64ToBytes,
  entryAdditionalData
} from '../scripts/core/storage/vault-format.js';
import {
  FakeVaultStorage,
  FakeLocalStorage,
  buildSyntheticVault
} from './helpers/vault-fixtures.js';

const MOT_DE_PASSE = 'phrase-de-passe-du-coffre-csv';

function makeCsvFile(text, options = {}) {
  const bytes = options.bytes || new TextEncoder().encode(text);
  return {
    name: options.name || 'export.csv',
    size: options.size ?? bytes.byteLength,
    async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); }
  };
}

async function expectFailureWithoutWrite(file, storage, deps, code, message) {
  const avant = canonicalize(storage.record);
  const ecritures = storage.writes;
  try {
    await importCsvFile(file, deps);
  } catch (error) {
    assert.equal(error.code, code, `${message} : code attendu ${code}, obtenu ${error.code}`);
    assert.equal(canonicalize(storage.record), avant, `${message} : le coffre a ete modifie`);
    assert.equal(storage.writes, ecritures, `${message} : une ecriture a eu lieu`);
    return error;
  }
  assert.fail(`${message} : aucune erreur levee`);
}

try {
  console.log('=== TEST CSV IMPORT SERVICE ===');

  const coffre = await buildSyntheticVault({
    password: MOT_DE_PASSE,
    entries: [{ id: 'existant-1', title: 'Deja la', username: 'zoe', password: 'zzz' }]
  });
  const salt = base64ToBytes(coffre.record.meta.salt, 'salt');
  const masterKey = await deriveMasterKey(MOT_DE_PASSE, salt, { iterations: CURRENT_PBKDF2_ITERATIONS });

  function baseDeps(storage, overrides = {}) {
    return {
      storage,
      masterKey,
      confirmImport: async () => true,
      localStorageRef: new FakeLocalStorage(),
      ...overrides
    };
  }

  // ============ 1. Mapping insensible a l'ordre des colonnes ==============
  {
    const { mapping, missing } = detectColumnMapping(
      parseCsv('password,url,name,username\n').normalizedHeaders
    );
    assert.equal(missing.length, 0, 'Toutes les colonnes requises sont presentes');
    assert.equal(mapping.password, 0);
    assert.equal(mapping.url, 1);
    assert.equal(mapping.title, 2);
    assert.equal(mapping.username, 3);

    const francais = detectColumnMapping(
      parseCsv("Nom,Nom d'utilisateur,Mot de passe,Catégorie\n").normalizedHeaders
    );
    assert.equal(francais.missing.length, 0, 'Les en-tetes francais doivent etre reconnus');
    assert.equal(francais.mapping.category, 3);

    const sansMotDePasse = detectColumnMapping(parseCsv('name,url\n').normalizedHeaders);
    assert.ok(sansMotDePasse.missing.includes('password'),
      'Le mot de passe est obligatoire');

    const sansIdentifiant = detectColumnMapping(parseCsv('password,notes\n').normalizedHeaders);
    assert.ok(sansIdentifiant.missing.includes('title|url|username'),
      'Au moins un champ identifiant est requis');
  }

  // ============ 2. URL absente : accepte ==================================
  {
    const analyse = analyzeCsvRows(parseCsv('name,username,password\nSite,alice,secret\n'));
    assert.equal(analyse.acceptedCount, 1, 'Une entree sans URL doit etre acceptee');
    assert.equal(analyse.accepted[0].entry.url, '');
  }
  // Nom d'utilisateur absent : accepte aussi
  {
    const analyse = analyzeCsvRows(parseCsv('name,url,password\nSite,https://x.test,secret\n'));
    assert.equal(analyse.acceptedCount, 1, "Une entree sans nom d'utilisateur doit etre acceptee");
  }
  // Titre absent mais URL presente : accepte
  {
    const analyse = analyzeCsvRows(parseCsv('name,url,password\n,https://x.test,secret\n'));
    assert.equal(analyse.acceptedCount, 1, 'URL seule suffit a identifier');
  }

  // ============ 3. Lignes vides, acceptees et rejetees =====================
  {
    const csv = [
      'name,url,username,password',
      'Bon,https://a.test,alice,secret',
      '',
      ',,,sansidentifiant',
      'SansMotDePasse,https://b.test,bob,',
      'Autre,,carol,secret2'
    ].join('\n');
    const analyse = analyzeCsvRows(parseCsv(csv));

    assert.equal(analyse.acceptedCount, 2, 'Deux lignes valides attendues');
    assert.equal(analyse.skippedCount, 1, 'Une ligne vide ignoree');
    assert.equal(analyse.rejectedCount, 2, 'Deux lignes rejetees');

    const motifs = analyse.rejected.map((r) => r.reason);
    assert.ok(motifs.some((m) => m.includes('mot de passe absent')));
    assert.ok(motifs.some((m) => m.includes('aucun titre')));

    // Aucun mot de passe ne doit apparaitre dans l'apercu ni les rejets.
    const serialise = JSON.stringify({ preview: analyse.preview, rejected: analyse.rejected });
    ['secret', 'secret2', 'sansidentifiant'].forEach((valeur) => {
      assert.ok(!serialise.includes(valeur),
        `Aucun mot de passe ne doit figurer dans l'apercu (${valeur})`);
    });
    assert.equal(analyse.preview[0].passwordProvided, true,
      "L'apercu indique la presence d'un mot de passe sans le montrer");
  }

  // ============ 4. Doublons signales, jamais ecrases =======================
  {
    const csv = 'name,username,password\nSite,alice,aaa\nSite,alice,bbb\n';
    const analyse = analyzeCsvRows(parseCsv(csv));
    assert.equal(analyse.acceptedCount, 2, 'Les deux lignes sont acceptees');
    assert.equal(analyse.duplicates.length, 1, 'La ressemblance est signalee');
    assert.equal(analyse.duplicates[0].firstSeenLine, 2);
  }

  // ============ 5. Import nominal, atomique ================================
  {
    const storage = new FakeVaultStorage(coffre.record);
    const localStorageRef = new FakeLocalStorage();
    const csv = 'name,url,username,password,notes\n'
      + '"Banque, SG",https://sg.test,alice,"mot,de,passe","note\nmultiligne"\n'
      + 'Gmail,https://mail.test,bob,"il a dit ""ok""",\n';

    const rapport = await importCsvFile(makeCsvFile(csv), baseDeps(storage, { localStorageRef }));

    assert.equal(rapport.imported, true);
    assert.equal(rapport.addedCount, 2);
    assert.equal(rapport.totalEntryCount, 3, "L'entree existante doit etre conservee");
    assert.equal(storage.writes, 1, 'Une seule transaction');
    assert.ok(localStorageRef.getItem(BACKUP_KEY_V1),
      'La sauvegarde secondaire est mise a jour apres verification');

    // L'entree preexistante n'est ni remplacee ni modifiee.
    const existante = storage.record.entries.find((e) => e.id === 'existant-1');
    assert.ok(existante, "L'entree preexistante doit subsister");
    assert.equal(existante.ciphertext, coffre.record.entries[0].ciphertext,
      "L'entree preexistante ne doit pas etre rechiffree");

    // Les nouvelles entrees sont dechiffrables et fidelement parsees.
    const nouvelles = storage.record.entries.filter((e) => e.id !== 'existant-1');
    assert.equal(nouvelles.length, 2);
    const dechiffree = await decryptData(nouvelles[0], masterKey, {
      additionalData: entryAdditionalData(nouvelles[0].id, 2)
    });
    assert.equal(dechiffree.title, 'Banque, SG', 'La virgule protegee doit survivre');
    assert.equal(dechiffree.password, 'mot,de,passe');
    assert.ok(dechiffree.notes.includes('\n'), 'Le champ multiligne doit survivre');

    const deuxieme = await decryptData(nouvelles[1], masterKey, {
      additionalData: entryAdditionalData(nouvelles[1].id, 2)
    });
    assert.equal(deuxieme.password, 'il a dit "ok"', 'Les guillemets echappes doivent survivre');
    assert.equal('notes' in deuxieme, false, 'Un champ vide ne doit pas etre stocke');

    // Identifiants neufs, uniques, differents de l'existant.
    const ids = new Set(storage.record.entries.map((e) => e.id));
    assert.equal(ids.size, 3, 'Tous les identifiants doivent etre distincts');

    // IV uniques sur l'ensemble du coffre resultant.
    const ivs = new Set(storage.record.entries.map((e) => e.iv));
    ivs.add(storage.record.meta.validation.iv);
    assert.equal(ivs.size, 4, 'Chaque bloc chiffre doit avoir un IV distinct');
  }

  // ============ 6. UTF-8 invalide refuse ===================================
  {
    const storage = new FakeVaultStorage(coffre.record);
    // 0xFF n'est jamais valide en UTF-8.
    const octets = new Uint8Array([...new TextEncoder().encode('name,password\nA,'), 0xff, 0x0a]);
    await expectFailureWithoutWrite(
      makeCsvFile(null, { bytes: octets }), storage, baseDeps(storage),
      'invalid_utf8', 'UTF-8 invalide'
    );
  }

  // ============ 7. BOM accepte =============================================
  {
    const storage = new FakeVaultStorage(coffre.record);
    const rapport = await importCsvFile(
      makeCsvFile('﻿name,username,password\nSite,alice,secret\n'),
      baseDeps(storage)
    );
    assert.equal(rapport.addedCount, 1, 'Un CSV avec BOM doit etre importable');
  }

  // ============ 8. Fichier trop volumineux =================================
  {
    const storage = new FakeVaultStorage(coffre.record);
    let luDepuisLeDisque = false;
    const piege = {
      name: 'gros.csv',
      size: MAX_CSV_FILE_BYTES + 1,
      async arrayBuffer() { luDepuisLeDisque = true; return new ArrayBuffer(0); }
    };
    await expectFailureWithoutWrite(piege, storage, baseDeps(storage),
      'file_too_large', 'Fichier CSV trop volumineux');
    assert.equal(luDepuisLeDisque, false, 'La taille doit etre verifiee avant lecture');
  }

  // ============ 9. Nombre maximal de lignes depasse ========================
  {
    const storage = new FakeVaultStorage(coffre.record);
    const lignes = ['name,username,password'];
    for (let i = 0; i <= MAX_CSV_ROWS; i += 1) lignes.push(`S${i},u${i},p${i}`);
    await expectFailureWithoutWrite(
      makeCsvFile(`${lignes.join('\n')}\n`), storage, baseDeps(storage),
      'too_many_rows', 'Trop de lignes'
    );
  }

  // ============ 10. Confirmation annulee ===================================
  {
    const storage = new FakeVaultStorage(coffre.record);
    let apercu = null;
    await expectFailureWithoutWrite(
      makeCsvFile('name,username,password\nSite,alice,secret\n'),
      storage,
      baseDeps(storage, { confirmImport: async (info) => { apercu = info; return false; } }),
      'cancelled', 'Confirmation annulee'
    );
    assert.ok(apercu, 'Un apercu doit etre presente');
    assert.equal(apercu.acceptedCount, 1);
    assert.ok(apercu.mapping, 'Le mapping detecte doit etre presente');
    assert.ok(Array.isArray(apercu.preview), "L'apercu des premieres lignes doit etre fourni");
  }

  // ============ 11. Echec pendant le chiffrement d'une entree ==============
  {
    const storage = new FakeVaultStorage(coffre.record);
    let appels = 0;
    await expectFailureWithoutWrite(
      makeCsvFile('name,username,password\nA,a,1\nB,b,2\nC,c,3\n'),
      storage,
      baseDeps(storage, {
        encrypt: async (...args) => {
          appels += 1;
          if (appels === 2) throw new Error('echec de chiffrement simule');
          const { encryptData } = await import('../scripts/core/crypto/aes-gcm.js');
          return encryptData(...args);
        }
      }),
      'encryption_failed', 'Echec de chiffrement'
    );
    assert.equal(storage.record.entries.length, 1,
      'Aucune entree partielle ne doit avoir ete persistee');
  }

  // ============ 12. Transaction IndexedDB interrompue ======================
  {
    const storage = new FakeVaultStorage(coffre.record);
    storage.abortNextWrites = 1;
    const erreur = await expectFailureWithoutWrite(
      makeCsvFile('name,username,password\nA,a,1\nB,b,2\n'),
      storage, baseDeps(storage), 'transaction_aborted', 'Transaction interrompue'
    );
    assert.equal(erreur.details.restored, false,
      'Aucune restauration apres une transaction annulee');
    assert.equal(storage.record.entries.length, 1, "L'ancien record doit rester intact");
  }

  // ============ 13. Echec de verification post-ecriture ====================
  {
    const storage = new FakeVaultStorage(coffre.record);
    storage.corruptReadAfterWrite = true;
    const attendu = canonicalize(storage.record);
    let erreur = null;
    try {
      await importCsvFile(makeCsvFile('name,username,password\nA,a,1\n'), baseDeps(storage));
    } catch (e) { erreur = e; }

    assert.ok(erreur, 'Une divergence doit provoquer une erreur');
    assert.equal(erreur.code, 'verification_failed');
    assert.equal(erreur.details.restored, true);
    assert.equal(erreur.details.verifiedRestore, true);
    assert.equal(canonicalize(storage.record), attendu, 'Le coffre doit avoir ete restaure');
  }

  // ============ 14. L'etat en memoire n'est mis a jour qu'apres reussite ===
  {
    const storage = new FakeVaultStorage(coffre.record);
    storage.abortNextWrites = 1;
    let succesAppele = false;
    try {
      await importCsvFile(makeCsvFile('name,username,password\nA,a,1\n'),
        baseDeps(storage, { onSuccess: async () => { succesAppele = true; } }));
    } catch { /* attendu */ }
    assert.equal(succesAppele, false,
      "L'interface ne doit pas etre mise a jour si l'ecriture echoue");

    const storage2 = new FakeVaultStorage(coffre.record);
    let recues = null;
    await importCsvFile(makeCsvFile('name,username,password\nA,a,1\n'),
      baseDeps(storage2, { onSuccess: async (entries) => { recues = entries; } }));
    assert.equal(recues.length, 1, 'Les entrees ajoutees sont transmises apres reussite');
    assert.ok(recues[0].id, 'Chaque entree ajoutee porte son nouvel identifiant');
  }

  // ============ 15. Coffre verrouille ou absent ============================
  {
    const storage = new FakeVaultStorage(coffre.record);
    await expectFailureWithoutWrite(
      makeCsvFile('name,username,password\nA,a,1\n'), storage,
      { storage, masterKey: null, confirmImport: async () => true },
      'locked', 'Coffre verrouille'
    );

    const vide = new FakeVaultStorage(null);
    await expectFailureWithoutWrite(
      makeCsvFile('name,username,password\nA,a,1\n'), vide, baseDeps(vide),
      'no_vault', 'Aucun coffre existant'
    );
  }

  // ============ 16. Colonnes manquantes ====================================
  {
    const storage = new FakeVaultStorage(coffre.record);
    await expectFailureWithoutWrite(
      makeCsvFile('name,url\nSite,https://x.test\n'), storage, baseDeps(storage),
      'missing_columns', 'Colonne mot de passe absente'
    );
  }

  // ============ 17. Aucune ligne exploitable ===============================
  {
    const storage = new FakeVaultStorage(coffre.record);
    await expectFailureWithoutWrite(
      makeCsvFile('name,username,password\n,,\n,,\n'), storage, baseDeps(storage),
      'no_valid_row', 'Aucune ligne exploitable'
    );
  }

  // ============ 18. readCsvFile refuse un fichier inaccessible =============
  {
    await assert.rejects(
      readCsvFile({ name: 'x.csv' }),
      (e) => e instanceof CsvImportError && e.code === 'unreadable',
      'Un fichier sans taille doit etre refuse'
    );
  }

  console.log('CSV import service tests passed.');
} catch (error) {
  console.error('CSV import service tests failed:', error);
  process.exitCode = 1;
}
