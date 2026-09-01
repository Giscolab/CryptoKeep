/**
 * Lot 2 - Validation structurelle stricte d'un coffre importe.
 * Donnees exclusivement synthetiques.
 */
import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import {
  validateImportedVaultStructure,
  normalizeImportedVersion,
  VaultImportValidationError
} from '../scripts/core/storage/vault-import-validator.js';
import {
  MAX_VAULT_ENTRIES,
  ALLOWED_ENTRY_PROPERTIES
} from '../scripts/core/storage/import-limits.js';
import { buildSyntheticVault } from './helpers/vault-fixtures.js';

function expectCode(action, code, message) {
  try {
    action();
  } catch (error) {
    assert.ok(error instanceof VaultImportValidationError, `${message} : type d'erreur inattendu`);
    assert.equal(error.code, code, `${message} : code attendu ${code}, obtenu ${error.code}`);
    return error;
  }
  assert.fail(`${message} : aucune erreur levee`);
}

try {
  console.log('=== TEST VAULT IMPORT VALIDATOR ===');

  const { record: v2 } = await buildSyntheticVault({
    password: 'phrase-de-passe-synthetique-2026',
    entries: [
      { id: 'entree-1', title: 'Fixture A', username: 'alice', password: 'p1' },
      { id: 'entree-2', title: 'Fixture B', username: 'bob', password: 'p2' }
    ]
  });

  const { record: v1 } = await buildSyntheticVault({
    password: 'phrase-de-passe-synthetique-2026',
    entries: [{ id: 'legacy-1', title: 'Historique', username: 'carol', password: 'p3' }],
    formatVersion: 1
  });

  // --- Versions ------------------------------------------------------------
  assert.equal(normalizeImportedVersion(undefined), 1, 'v1 peut omettre la version');
  assert.equal(normalizeImportedVersion(1), 1);
  assert.equal(normalizeImportedVersion('2.0.0'), 2);
  expectCode(() => normalizeImportedVersion(3), 'unsupported_version', 'Version 3 inconnue');
  expectCode(() => normalizeImportedVersion('v2'), 'unsupported_version', 'Version textuelle libre');

  // --- Coffre v2 valide ----------------------------------------------------
  const okV2 = validateImportedVaultStructure(v2);
  assert.equal(okV2.stats.formatVersion, 2);
  assert.equal(okV2.stats.entryCount, 2);
  assert.equal(okV2.normalized.id, 'current');
  assert.deepEqual(Object.keys(okV2.normalized.entries[0]).sort(), ['ciphertext', 'id', 'iv']);
  // 2 entrees + 1 bloc de validation = 3 IV distincts
  assert.equal(okV2.stats.distinctIvCount, 3, 'Chaque bloc chiffre doit avoir son propre IV');

  // --- Compatibilite du format historique v1 -------------------------------
  const okV1 = validateImportedVaultStructure(v1);
  assert.equal(okV1.stats.formatVersion, 1, 'Le format v1 sans metadonnees doit rester accepte');
  assert.equal(okV1.metadata.iterations, 150000, 'v1 retombe sur les iterations historiques');

  // --- v2 doit declarer ses metadonnees ------------------------------------
  const v2SansKdf = structuredClone(v2);
  delete v2SansKdf.meta.kdf;
  expectCode(() => validateImportedVaultStructure(v2SansKdf), 'missing_property',
    'Un coffre v2 sans kdf doit etre refuse');

  const v2SansIterations = structuredClone(v2);
  delete v2SansIterations.meta.iterations;
  expectCode(() => validateImportedVaultStructure(v2SansIterations), 'missing_property',
    'Un coffre v2 sans iterations doit etre refuse');

  // --- Propriete inattendue : REFUS, jamais suppression silencieuse --------
  const avecProprieteRacine = structuredClone(v2);
  avecProprieteRacine.autreChose = { charge: 'utile' };
  expectCode(() => validateImportedVaultStructure(avecProprieteRacine), 'unexpected_property',
    'Propriete inattendue a la racine');

  const avecProprieteMeta = structuredClone(v2);
  avecProprieteMeta.meta.backdoor = true;
  expectCode(() => validateImportedVaultStructure(avecProprieteMeta), 'unexpected_property',
    'Propriete inattendue dans meta');

  const avecProprieteEntree = structuredClone(v2);
  avecProprieteEntree.entries[0].tags = ['x'];
  expectCode(() => validateImportedVaultStructure(avecProprieteEntree), 'unexpected_property',
    'Propriete inattendue dans une entree');

  // Le tag AES-GCM est DANS le ciphertext : aucun authTag separe accepte.
  assert.ok(!ALLOWED_ENTRY_PROPERTIES.includes('authTag'),
    'authTag ne doit pas figurer dans les proprietes autorisees');
  const avecAuthTag = structuredClone(v2);
  avecAuthTag.entries[0].authTag = 'AAAA';
  expectCode(() => validateImportedVaultStructure(avecAuthTag), 'unexpected_property',
    'Un champ authTag separe doit etre refuse');

  const validationEnrichie = structuredClone(v2);
  validationEnrichie.meta.validation.extra = 1;
  expectCode(() => validateImportedVaultStructure(validationEnrichie), 'unexpected_property',
    'Propriete inattendue dans le bloc de validation');

  // Prototype pollution via JSON : __proto__ devient une cle propre.
  const pollue = JSON.parse(
    JSON.stringify(v2).replace('"entries"', '"__proto__":{"polluted":true},"entries"')
  );
  expectCode(() => validateImportedVaultStructure(pollue), 'unexpected_property',
    'Une cle __proto__ doit etre refusee comme propriete inattendue');

  // --- Identifiants --------------------------------------------------------
  const idVide = structuredClone(v2);
  idVide.entries[0].id = '';
  expectCode(() => validateImportedVaultStructure(idVide), 'invalid_entry_id', 'Identifiant vide');

  const idInvalide = structuredClone(v2);
  idInvalide.entries[0].id = 'id avec espace/../';
  expectCode(() => validateImportedVaultStructure(idInvalide), 'invalid_entry_id', 'Identifiant invalide');

  const idDouble = structuredClone(v2);
  idDouble.entries[1].id = idDouble.entries[0].id;
  expectCode(() => validateImportedVaultStructure(idDouble), 'duplicate_entry_id', 'Identifiant duplique');

  // --- IV ------------------------------------------------------------------
  const ivDouble = structuredClone(v2);
  ivDouble.entries[1].iv = ivDouble.entries[0].iv;
  expectCode(() => validateImportedVaultStructure(ivDouble), 'duplicate_iv',
    'IV reutilise entre deux entrees');

  const ivValidationDouble = structuredClone(v2);
  ivValidationDouble.entries[0].iv = ivValidationDouble.meta.validation.iv;
  expectCode(() => validateImportedVaultStructure(ivValidationDouble), 'duplicate_iv',
    'IV partage entre le bloc de validation et une entree');

  const ivCourt = structuredClone(v2);
  ivCourt.entries[0].iv = 'AAAAAAAA';
  expectCode(() => validateImportedVaultStructure(ivCourt), 'invalid_iv', 'IV de mauvaise taille');

  // --- Base64 --------------------------------------------------------------
  const base64Invalide = structuredClone(v2);
  base64Invalide.entries[0].ciphertext = 'pas du base64 !!';
  expectCode(() => validateImportedVaultStructure(base64Invalide), 'invalid_base64', 'Base64 invalide');

  // --- Limites de charge ---------------------------------------------------
  const tropDEntrees = structuredClone(v2);
  tropDEntrees.entries = new Array(MAX_VAULT_ENTRIES + 1).fill(null).map((_, i) => ({
    id: `e${i}`, iv: v2.entries[0].iv, ciphertext: v2.entries[0].ciphertext
  }));
  expectCode(() => validateImportedVaultStructure(tropDEntrees), 'too_many_entries',
    `Plus de ${MAX_VAULT_ENTRIES} entrees`);

  // --- Structures aberrantes ----------------------------------------------
  expectCode(() => validateImportedVaultStructure(null), 'invalid_structure', 'null');
  expectCode(() => validateImportedVaultStructure([]), 'invalid_structure', 'tableau');
  expectCode(() => validateImportedVaultStructure({ entries: {}, meta: v2.meta }), 'invalid_structure',
    'entries non tableau');

  const selCourt = structuredClone(v2);
  selCourt.meta.salt = 'QUJD';
  expectCode(() => validateImportedVaultStructure(selCourt), 'invalid_salt', 'Sel de mauvaise taille');

  const iterationsBasses = structuredClone(v2);
  iterationsBasses.meta.iterations = 10;
  expectCode(() => validateImportedVaultStructure(iterationsBasses), 'invalid_iterations',
    'Iterations sous le minimum');

  const kdfInconnu = structuredClone(v2);
  kdfInconnu.meta.kdf = 'MD5';
  expectCode(() => validateImportedVaultStructure(kdfInconnu), 'unsupported_kdf', 'KDF non supporte');

  // --- Le validateur ne mute jamais son entree ----------------------------
  const avant = JSON.stringify(v2);
  validateImportedVaultStructure(v2);
  assert.equal(JSON.stringify(v2), avant, 'Le validateur ne doit pas modifier son entree');

  console.log('Vault import validator tests passed.');
} catch (error) {
  console.error('Vault import validator tests failed:', error);
  process.exitCode = 1;
}
