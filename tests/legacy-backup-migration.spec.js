/**
 * Lot 2 partie 2 - Migration historique VERIFIEE cryptographiquement.
 *
 * Reproduit le defaut audite : une sauvegarde `vaultBackup` structurellement
 * valide mais cryptographiquement invalide etait migree, presentee comme
 * validee, et l'originale supprimee.
 *
 * Donnees exclusivement synthetiques.
 */
import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import {
  migrateLegacyBackup,
  BACKUP_KEY_V1,
  LEGACY_BACKUP_KEY,
  parseBackupEnvelope
} from '../scripts/core/storage/local-backup.js';
import {
  migrateLegacyBackupVerified,
  inspectLegacyBackup,
  hasLegacyBackup
} from '../scripts/core/storage/legacy-backup-migration.js';
import { canonicalize } from '../scripts/core/storage/vault-transaction.js';
import {
  FakeLocalStorage,
  buildSyntheticVault,
  tamperBase64
} from './helpers/vault-fixtures.js';

const MDP = 'phrase-de-passe-sauvegarde-historique';

function makeStore(record, { base64 = false } = {}) {
  const store = new FakeLocalStorage();
  const json = JSON.stringify(record);
  store.setItem(LEGACY_BACKUP_KEY, base64 ? btoa(json) : json);
  return store;
}

/** Invariant central : rien n'a bouge, l'ancienne sauvegarde est intacte. */
function assertLegacyIntact(store, original, message) {
  assert.notEqual(store.getItem(LEGACY_BACKUP_KEY), null,
    `${message} : vaultBackup a ete supprime`);
  assert.equal(store.getItem(LEGACY_BACKUP_KEY), original,
    `${message} : vaultBackup a ete modifie`);
  assert.equal(store.getItem(BACKUP_KEY_V1), null,
    `${message} : une enveloppe a ete ecrite malgre l'echec`);
}

try {
  console.log('=== TEST LEGACY BACKUP MIGRATION ===');

  const coffre = await buildSyntheticVault({
    password: MDP,
    entries: [
      { id: 'h1', title: 'Un', username: 'alice', password: 'aaa' },
      { id: 'h2', title: 'Deux', username: 'bob', password: 'bbb' },
      { id: 'h3', title: 'Trois', username: 'carol', password: 'ccc' }
    ]
  });

  // ===== 1. REPRODUCTION DU DEFAUT : plus de migration sans verificateur ==
  {
    const altere = structuredClone(coffre.record);
    altere.entries[1].ciphertext = tamperBase64(altere.entries[1].ciphertext);
    const store = makeStore(altere);
    const original = store.getItem(LEGACY_BACKUP_KEY);

    const rapport = await migrateLegacyBackup({ storage: store });

    assert.equal(rapport.migrated, false,
      'Une migration sans verificateur cryptographique doit etre refusee');
    assert.equal(rapport.reason, 'verification_required');
    assert.equal(rapport.legacyPreserved, true);
    assertLegacyIntact(store, original, 'Migration sans verificateur');
  }

  // ===== 2. Ciphertext altere (2e entree) =================================
  {
    const altere = structuredClone(coffre.record);
    altere.entries[1].ciphertext = tamperBase64(altere.entries[1].ciphertext);
    const store = makeStore(altere);
    const original = store.getItem(LEGACY_BACKUP_KEY);

    const rapport = await migrateLegacyBackupVerified({
      storage: store, requestPassword: async () => MDP
    });

    assert.equal(rapport.migrated, false, 'Une 2e entree alteree doit bloquer la migration');
    assert.equal(rapport.reason, 'verification_failed');
    assert.equal(rapport.code, 'crypto_failure');
    assertLegacyIntact(store, original, 'Deuxieme entree alteree');
  }

  // ===== 3. Ciphertext altere (DERNIERE entree) ===========================
  {
    const altere = structuredClone(coffre.record);
    const derniere = altere.entries.at(-1);
    derniere.ciphertext = tamperBase64(derniere.ciphertext);
    const store = makeStore(altere);
    const original = store.getItem(LEGACY_BACKUP_KEY);

    const rapport = await migrateLegacyBackupVerified({
      storage: store, requestPassword: async () => MDP
    });

    assert.equal(rapport.migrated, false, 'Une derniere entree alteree doit bloquer la migration');
    assert.equal(rapport.reason, 'verification_failed');
    assertLegacyIntact(store, original, 'Derniere entree alteree');
  }

  // ===== 4. Bloc de validation altere =====================================
  {
    const altere = structuredClone(coffre.record);
    altere.meta.validation.ciphertext = tamperBase64(altere.meta.validation.ciphertext);
    const store = makeStore(altere);
    const original = store.getItem(LEGACY_BACKUP_KEY);

    const rapport = await migrateLegacyBackupVerified({
      storage: store, requestPassword: async () => MDP
    });

    assert.equal(rapport.migrated, false, 'Un bloc de validation altere doit bloquer la migration');
    assert.equal(rapport.reason, 'verification_failed');
    assertLegacyIntact(store, original, 'Bloc de validation altere');
  }

  // ===== 5. Mauvais mot de passe ==========================================
  {
    const store = makeStore(coffre.record);
    const original = store.getItem(LEGACY_BACKUP_KEY);

    const rapport = await migrateLegacyBackupVerified({
      storage: store, requestPassword: async () => 'mauvaise-phrase-de-passe'
    });

    assert.equal(rapport.migrated, false, 'Un mauvais mot de passe doit bloquer la migration');
    assert.equal(rapport.reason, 'verification_failed');
    assertLegacyIntact(store, original, 'Mauvais mot de passe');
  }

  // ===== 6. Annulation du dialogue ========================================
  {
    const store = makeStore(coffre.record);
    const original = store.getItem(LEGACY_BACKUP_KEY);

    const rapport = await migrateLegacyBackupVerified({
      storage: store, requestPassword: async () => null
    });

    assert.equal(rapport.migrated, false);
    assert.equal(rapport.reason, 'cancelled');
    assertLegacyIntact(store, original, 'Dialogue annule');
  }

  // ===== 7. Sans dialogue de mot de passe : refus =========================
  {
    const store = makeStore(coffre.record);
    const original = store.getItem(LEGACY_BACKUP_KEY);

    const rapport = await migrateLegacyBackupVerified({ storage: store });

    assert.equal(rapport.migrated, false, 'Sans dialogue, aucune migration');
    assert.equal(rapport.reason, 'verification_required');
    assertLegacyIntact(store, original, 'Aucun dialogue fourni');
  }

  // ===== 8. Structure invalide ============================================
  {
    const invalide = structuredClone(coffre.record);
    invalide.entries[0].charge = 'inattendue';
    const store = makeStore(invalide);
    const original = store.getItem(LEGACY_BACKUP_KEY);

    const inspection = inspectLegacyBackup({ storage: store });
    assert.equal(inspection.present, true);
    assert.equal(inspection.structurallyValid, false);
    assert.equal(inspection.error, 'unexpected_property');

    const rapport = await migrateLegacyBackupVerified({
      storage: store, requestPassword: async () => MDP
    });
    assert.equal(rapport.migrated, false);
    assert.equal(rapport.reason, 'invalid_legacy');
    assertLegacyIntact(store, original, 'Structure invalide');
  }

  // ===== 9. Migration VALIDE : JSON direct ================================
  {
    const store = makeStore(coffre.record);
    let motDePasseDemande = 0;

    const inspection = inspectLegacyBackup({ storage: store });
    assert.equal(inspection.format, 'json');
    assert.equal(inspection.entryCount, 3);
    assert.equal(inspection.structurallyValid, true);

    const rapport = await migrateLegacyBackupVerified({
      storage: store,
      requestPassword: async () => { motDePasseDemande += 1; return MDP; },
      now: '2026-09-02T00:00:00.000Z'
    });

    assert.equal(motDePasseDemande, 1, 'Le mot de passe doit etre demande une fois');
    assert.equal(rapport.migrated, true, 'Une sauvegarde dechiffrable doit migrer');
    assert.equal(rapport.sourceFormat, 'json');
    assert.equal(rapport.legacyPreserved, false);

    // L'ancienne cle n'est supprimee qu'APRES relecture correcte de la nouvelle.
    assert.equal(store.getItem(LEGACY_BACKUP_KEY), null,
      'L\'ancienne cle doit disparaitre apres une migration verifiee');
    const enveloppe = parseBackupEnvelope(store.getItem(BACKUP_KEY_V1));
    assert.equal(enveloppe.entryCount, 3);
    assert.equal(enveloppe.backupCreatedAt, '2026-09-02T00:00:00.000Z');
    assert.equal(canonicalize(enveloppe.record.entries), canonicalize(coffre.record.entries),
      'Le contenu chiffre doit etre transfere a l\'identique');
  }

  // ===== 10. Migration VALIDE : base64 ====================================
  {
    const store = makeStore(coffre.record, { base64: true });
    const inspection = inspectLegacyBackup({ storage: store });
    assert.equal(inspection.format, 'base64', 'Le format base64 doit etre reconnu');

    const rapport = await migrateLegacyBackupVerified({
      storage: store, requestPassword: async () => MDP
    });
    assert.equal(rapport.migrated, true);
    assert.equal(rapport.sourceFormat, 'base64');
    assert.equal(store.getItem(LEGACY_BACKUP_KEY), null);
    assert.ok(store.getItem(BACKUP_KEY_V1));
  }

  // ===== 11. Aucune sauvegarde historique =================================
  {
    const store = new FakeLocalStorage();
    assert.equal(hasLegacyBackup({ storage: store }), false);
    const rapport = await migrateLegacyBackupVerified({
      storage: store, requestPassword: async () => MDP
    });
    assert.equal(rapport.migrated, false);
    assert.equal(rapport.reason, 'no_legacy_backup');
  }

  // ===== 12. La migration ne touche jamais IndexedDB ======================
  {
    // Le service ne recoit aucun stockage IndexedDB : il ne peut pas y ecrire.
    const store = makeStore(coffre.record);
    const rapport = await migrateLegacyBackupVerified({
      storage: store, requestPassword: async () => MDP
    });
    assert.equal(rapport.migrated, true);
    const source = (await import('node:fs')).readFileSync(
      'scripts/core/storage/legacy-backup-migration.js', 'utf8'
    );
    // Seul le CODE EXECUTE compte : les commentaires sont retires avant
    // la recherche, sinon la documentation du module ferait echouer le test.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split(/\r?\n/)
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    assert.ok(!/putVaultRecord|saveVault|importFullVault|indexedDB/i.test(code),
      'Le service de migration ne doit comporter aucun chemin d\'ecriture IndexedDB');
  }

  console.log('Legacy backup migration tests passed.');
} catch (error) {
  console.error('Legacy backup migration tests failed:', error);
  process.exitCode = 1;
}
