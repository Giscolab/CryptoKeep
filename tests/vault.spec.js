/**
 * Vault en memoire — operations de base.
 *
 * LOT 9 : ce fichier utilisait `console.assert`, qui ECRIT un message mais ne
 * fait jamais echouer le processus. Le fichier affichait donc « Tous les tests
 * Vault ont reussi » meme quand une assertion etait fausse, et `npm test`
 * renvoyait 0. Toutes les assertions d origine sont CONSERVEES, converties en
 * `node:assert/strict`, et le fichier est enrichi.
 *
 * Aucune donnee reelle : entrees fabriquees sur place, aucun chiffrement,
 * aucun stockage.
 */
import assert from 'node:assert/strict';
import { Vault } from '../scripts/core/vault/vault.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

function entree(id, titre, extra = {}) {
  return { id, title: titre, username: `u-${id}`, password: `MotDePasse-${id}!`, ...extra };
}

// --- scenarios d origine, convertis ---------------------------------------

test('V1 - ajout : les entrees ajoutees sont toutes presentes', () => {
  const vault = new Vault();
  vault.addEntry(entree('id-001', 'Gmail'));
  vault.addEntry(entree('id-002', 'Github'));
  assert.equal(vault.getAllEntries().length, 2, 'Mauvais nombre d entrees');
});

test('V2 - hasEntry reconnait une entree presente et une absente', () => {
  const vault = new Vault();
  vault.addEntry(entree('id-001', 'Gmail'));
  assert.equal(vault.hasEntry('id-001'), true);
  assert.equal(vault.hasEntry('id-inconnu'), false,
    'hasEntry ne doit pas repondre vrai pour un identifiant absent');
});

test('V3 - suppression : l entree disparait, les autres restent', () => {
  const vault = new Vault();
  vault.addEntry(entree('id-001', 'Gmail'));
  vault.addEntry(entree('id-002', 'Github'));

  vault.removeEntry('id-001');
  assert.equal(vault.hasEntry('id-001'), false, 'Suppression echouee');
  assert.equal(vault.hasEntry('id-002'), true,
    'Supprimer une entree ne doit pas en emporter d autres');
  assert.equal(vault.getAllEntries().length, 1);
});

test('V4 - mise a jour : le champ change, l identifiant est conserve', () => {
  const vault = new Vault();
  const original = entree('id-002', 'Github');
  vault.addEntry(original);

  vault.updateEntry('id-002', { ...original, title: 'Github Enterprise' });
  const trouve = vault.getAllEntries().find((e) => e.id === 'id-002');
  assert.equal(trouve.title, 'Github Enterprise', 'Mise a jour echouee');
  assert.equal(trouve.id, 'id-002', 'L identifiant ne doit pas changer');
  assert.equal(vault.getAllEntries().length, 1, 'Une mise a jour ne doit rien ajouter');
});

test('V5 - clear : le coffre est vide', () => {
  const vault = new Vault();
  vault.addEntry(entree('id-001', 'Gmail'));
  vault.addEntry(entree('id-002', 'Github'));
  vault.clear();
  assert.equal(vault.getAllEntries().length, 0, 'clear() echoue');
});

// --- enrichissements (Lot 9) ----------------------------------------------

test('V6 - un coffre neuf est vide, sans entree fantome', () => {
  assert.deepEqual(new Vault().getAllEntries(), []);
  assert.equal(new Vault().hasEntry('quoi-que-ce-soit'), false);
});

test('V7 - clear() efface REELLEMENT : aucun secret ne subsiste', () => {
  const vault = new Vault();
  vault.addEntry(entree('id-001', 'Banque', { password: 'Secret-A-Effacer-42!' }));
  vault.clear();

  const restant = JSON.stringify(vault.getAllEntries());
  assert.ok(!restant.includes('Secret-A-Effacer-42!'),
    'Un mot de passe ne doit pas survivre a la purge de session');
});

test('V8 - supprimer une entree absente ne casse rien', () => {
  const vault = new Vault();
  vault.addEntry(entree('id-001', 'Gmail'));
  vault.removeEntry('id-inexistant');
  assert.equal(vault.getAllEntries().length, 1,
    'Une suppression sans cible ne doit rien retirer');
});

test('V9 - la liste rendue ne permet pas de muter le coffre par effet de bord', () => {
  const vault = new Vault();
  vault.addEntry(entree('id-001', 'Gmail'));

  const liste = vault.getAllEntries();
  liste.push(entree('id-injecte', 'Injectee'));

  assert.equal(vault.hasEntry('id-injecte'), false,
    'Modifier la liste retournee ne doit pas modifier le coffre');
});

console.log('=== TEST VAULT ===');
let echecs = 0;
for (const { label, fn } of cas) {
  try { await fn(); console.log(`  ok   ${label}`); }
  catch (error) {
    echecs += 1;
    console.error(`  ECHEC ${label}`);
    console.error(`        ${error && error.message}`);
  }
}
if (echecs > 0) {
  console.error(`Vault tests failed: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Vault tests passed (${cas.length} scenarios).`);
}
