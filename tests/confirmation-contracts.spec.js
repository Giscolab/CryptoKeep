/**
 * Lot 2 partie 2 - Contrats de confirmation au niveau METIER.
 *
 * Invariant : l'absence de callback de confirmation ne vaut JAMAIS
 * consentement implicite. Elle produit un refus controle, sans persistance.
 *
 * Les trois services concernes sont testes independamment du DOM.
 */
import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import { importVaultFile } from '../scripts/core/storage/vault-import-service.js';
import { importCsvFile } from '../scripts/utils/csv-import-service.js';
import {
  restoreBackupWhenPrimaryMissing,
  restoreBackupDeliberately
} from '../scripts/core/storage/backup-restore-service.js';
import { writeLocalBackup } from '../scripts/core/storage/local-backup.js';
import { canonicalize } from '../scripts/core/storage/vault-transaction.js';
import { deriveMasterKey } from '../scripts/core/crypto/pbkdf2.js';
import {
  CURRENT_PBKDF2_ITERATIONS,
  base64ToBytes
} from '../scripts/core/storage/vault-format.js';
import {
  FakeVaultStorage,
  FakeLocalStorage,
  buildSyntheticVault,
  makeVaultFile
} from './helpers/vault-fixtures.js';

const MDP = 'phrase-de-passe-contrats-confirmation';

function makeCsvFile(text) {
  const bytes = new TextEncoder().encode(text);
  return {
    name: 'export.csv',
    size: bytes.byteLength,
    async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); }
  };
}

async function expectCode(promise, code, message) {
  try {
    await promise;
  } catch (error) {
    assert.equal(error.code, code, `${message} : code attendu ${code}, obtenu ${error.code}`);
    return error;
  }
  assert.fail(`${message} : aucune erreur levee`);
}

try {
  console.log('=== TEST CONFIRMATION CONTRACTS ===');

  const coffre = await buildSyntheticVault({
    password: MDP,
    entries: [{ id: 'c1', title: 'Existant', username: 'zoe', password: 'zzz' }]
  });
  const importe = await buildSyntheticVault({
    password: MDP,
    entries: [{ id: 'i1', title: 'Importe', username: 'alice', password: 'aaa' }]
  });
  const salt = base64ToBytes(coffre.record.meta.salt, 'salt');
  const masterKey = await deriveMasterKey(MDP, salt, { iterations: CURRENT_PBKDF2_ITERATIONS });

  // ======================= IMPORT .vault =================================
  {
    // a) callback absent -> refus, aucune ecriture
    const storage = new FakeVaultStorage(coffre.record);
    const avant = canonicalize(storage.record);
    await expectCode(
      importVaultFile(makeVaultFile(importe.record), {
        storage,
        requestPassword: async () => MDP,
        localStorageRef: new FakeLocalStorage()
      }),
      'confirmation_required',
      'Import .vault sans callback'
    );
    assert.equal(storage.writes, 0, 'Aucune ecriture sans confirmation possible');
    assert.equal(canonicalize(storage.record), avant, 'Le coffre doit etre inchange');
  }
  {
    // b) callback retourne false -> refus, aucune ecriture
    const storage = new FakeVaultStorage(coffre.record);
    await expectCode(
      importVaultFile(makeVaultFile(importe.record), {
        storage,
        requestPassword: async () => MDP,
        confirmImport: async () => false,
        localStorageRef: new FakeLocalStorage()
      }),
      'cancelled', 'Import .vault refuse'
    );
    assert.equal(storage.writes, 0);
  }
  {
    // c) callback retourne true -> operation autorisee
    const storage = new FakeVaultStorage(coffre.record);
    const rapport = await importVaultFile(makeVaultFile(importe.record), {
      storage,
      requestPassword: async () => MDP,
      confirmImport: async () => true,
      localStorageRef: new FakeLocalStorage()
    });
    assert.equal(rapport.imported, true, 'Import autorise avec confirmation');
    assert.equal(storage.writes, 1);
  }

  // ========================= IMPORT CSV ==================================
  const csv = 'name,username,password\nSite,alice,secret\n';
  {
    // a) callback absent
    const storage = new FakeVaultStorage(coffre.record);
    const avant = canonicalize(storage.record);
    await expectCode(
      importCsvFile(makeCsvFile(csv), {
        storage, masterKey, localStorageRef: new FakeLocalStorage()
      }),
      'confirmation_required', 'Import CSV sans callback'
    );
    assert.equal(storage.writes, 0, 'Aucune ecriture sans confirmation possible');
    assert.equal(canonicalize(storage.record), avant);
  }
  {
    // b) callback false
    const storage = new FakeVaultStorage(coffre.record);
    await expectCode(
      importCsvFile(makeCsvFile(csv), {
        storage, masterKey, confirmImport: async () => false,
        localStorageRef: new FakeLocalStorage()
      }),
      'cancelled', 'Import CSV refuse'
    );
    assert.equal(storage.writes, 0);
  }
  {
    // c) callback true
    const storage = new FakeVaultStorage(coffre.record);
    const rapport = await importCsvFile(makeCsvFile(csv), {
      storage, masterKey, confirmImport: async () => true,
      localStorageRef: new FakeLocalStorage()
    });
    assert.equal(rapport.imported, true, 'Import CSV autorise avec confirmation');
    assert.equal(rapport.addedCount, 1);
    assert.equal(storage.writes, 1);
  }

  // ====================== RESTAURATION ===================================
  {
    // a) callback absent, coffre principal manquant
    const store = new FakeLocalStorage();
    writeLocalBackup(coffre.record, { storage: store });
    const storage = new FakeVaultStorage(null);

    await expectCode(
      restoreBackupWhenPrimaryMissing({
        storage, localStorageRef: store, requestPassword: async () => MDP
      }),
      'confirmation_required', 'Restauration sans callback'
    );
    assert.equal(storage.writes, 0, 'Aucune ecriture sans confirmation possible');
    assert.equal(storage.record, null, 'Le stockage principal reste vide');
  }
  {
    // b) callback false
    const store = new FakeLocalStorage();
    writeLocalBackup(coffre.record, { storage: store });
    const storage = new FakeVaultStorage(null);
    await expectCode(
      restoreBackupWhenPrimaryMissing({
        storage, localStorageRef: store,
        requestPassword: async () => MDP,
        confirmRestore: async () => false
      }),
      'cancelled', 'Restauration refusee'
    );
    assert.equal(storage.writes, 0);
  }
  {
    // c) callback true
    const store = new FakeLocalStorage();
    writeLocalBackup(coffre.record, { storage: store });
    const storage = new FakeVaultStorage(null);
    const rapport = await restoreBackupWhenPrimaryMissing({
      storage, localStorageRef: store,
      requestPassword: async () => MDP,
      confirmRestore: async () => true
    });
    assert.equal(rapport.restored, true, 'Restauration autorisee avec confirmation');
    assert.equal(storage.writes, 1);
  }
  {
    // d) restauration volontaire sans callback renforce
    const store = new FakeLocalStorage();
    writeLocalBackup(coffre.record, { storage: store });
    const storage = new FakeVaultStorage(coffre.record);
    await expectCode(
      restoreBackupDeliberately({
        storage, localStorageRef: store, requestPassword: async () => MDP
      }),
      'no_confirmation', 'Restauration volontaire sans confirmation renforcee'
    );
    assert.equal(storage.writes, 0);
  }

  // ============ Aucun prompt()/confirm() natif dans le sous-systeme ======
  {
    const fs = await import('node:fs');
    const fichiers = [
      'scripts/core/storage/vault-import-service.js',
      'scripts/core/storage/backup-restore-service.js',
      'scripts/core/storage/legacy-backup-migration.js',
      'scripts/utils/csv-import-service.js',
      'scripts/utils/import-csv.js',
      'scripts/ui/secure-dialogs.js',
      'scripts/app.js'
    ];
    fichiers.forEach((fichier) => {
      const code = fs.readFileSync(fichier, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split(/\r?\n/)
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n');
      assert.ok(!/(^|[^.\w])prompt\s*\(/.test(code),
        `${fichier} ne doit pas utiliser prompt()`);
      assert.ok(!/(^|[^.\w])confirm\s*\(/.test(code),
        `${fichier} ne doit pas utiliser confirm() natif`);
    });
  }

  console.log('Confirmation contracts tests passed.');
} catch (error) {
  console.error('Confirmation contracts tests failed:', error);
  process.exitCode = 1;
}
