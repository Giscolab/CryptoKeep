/**
 * Filtres, categories et tris du coffre.
 *
 * LOT 9 : `console.assert` remplace par `node:assert/strict`. L ancienne
 * version affichait « Tous les tests filtres ont reussi » meme lorsqu une
 * assertion etait fausse, et sortait avec le code 0. Les six assertions
 * d origine sont conservees telles quelles et le fichier est enrichi.
 *
 * Aucune donnee reelle : entrees fabriquees sur place.
 */
import assert from 'node:assert/strict';
import { filterEntries, inferCategory, sortEntries } from '../scripts/utils/vault-filters.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

const entrees = [
  { title: 'Banque SG', username: 'alice', url: 'https://sg.fr', updatedAt: 10 },
  { title: 'Gmail Perso', username: 'bob', url: 'https://mail.google.com', updatedAt: 30 },
  { title: 'Dropbox', username: 'charlie', url: 'https://dropbox.com', updatedAt: 20 }
];

// --- scenarios d origine, convertis ---------------------------------------

test('F1 - categories deduites', () => {
  assert.equal(inferCategory(entrees[0]), 'bank', 'Categorie banque incorrecte');
  assert.equal(inferCategory(entrees[1]), 'email', 'Categorie email incorrecte');
  assert.equal(inferCategory(entrees[2]), 'cloud', 'Categorie cloud incorrecte');
});

test('F2 - filtre par recherche', () => {
  assert.equal(filterEntries(entrees, { query: 'gmail', category: 'all' }).length, 1,
    'Filtre par recherche incorrect');
});

test('F3 - filtre par categorie', () => {
  assert.equal(filterEntries(entrees, { query: '', category: 'bank' }).length, 1,
    'Filtre par categorie incorrect');
});

test('F4 - tri alphabetique', () => {
  assert.equal(sortEntries(entrees, 'title-asc')[0].title, 'Banque SG',
    'Tri alphabetique incorrect');
});

test('F5 - tri par date recente', () => {
  assert.equal(sortEntries(entrees, 'recent')[0].title, 'Gmail Perso',
    'Tri recent incorrect');
});

// --- enrichissements (Lot 9) ----------------------------------------------

test('F6 - la recherche est insensible aux accents et a la casse', () => {
  const avecAccents = [{ title: 'Crédit Agricole', username: 'a', url: '', updatedAt: 1 }];
  for (const requete of ['credit', 'CREDIT', 'Crédit', 'crédit']) {
    assert.equal(filterEntries(avecAccents, { query: requete, category: 'all' }).length, 1,
      `La recherche « ${requete} » doit trouver « Crédit Agricole »`);
  }
});

test('F7 - une requete sans correspondance ne renvoie RIEN', () => {
  assert.deepEqual(filterEntries(entrees, { query: 'zzz-introuvable', category: 'all' }), [],
    'Une recherche infructueuse ne doit pas retomber sur la liste complete');
});

test('F8 - filtrer et trier ne modifient jamais la liste source', () => {
  const source = entrees.map((e) => ({ ...e }));
  const avant = JSON.stringify(source);

  filterEntries(source, { query: 'gmail', category: 'all' });
  sortEntries(source, 'title-asc');
  sortEntries(source, 'recent');

  assert.equal(JSON.stringify(source), avant,
    'Un tri en place reordonnerait la liste du coffre a l insu de l appelant');
});

test('F9 - une entree sans titre, sans URL ni identifiant ne fait pas tomber les filtres', () => {
  const bancales = [
    { title: '', username: '', url: '', updatedAt: 0 },
    { title: null, username: null, url: null, updatedAt: null },
    {}
  ];
  assert.doesNotThrow(() => filterEntries(bancales, { query: 'x', category: 'all' }));
  assert.doesNotThrow(() => sortEntries(bancales, 'title-asc'));
  assert.doesNotThrow(() => sortEntries(bancales, 'recent'));
  assert.doesNotThrow(() => bancales.forEach((e) => inferCategory(e)));
});

test('F10 - un tri inconnu ne perd aucune entree', () => {
  const resultat = sortEntries(entrees, 'tri-inexistant');
  assert.equal(resultat.length, entrees.length,
    'Un critere inconnu ne doit pas silencieusement vider la liste');
});

console.log('=== TEST VAULT FILTERS ===');
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
  console.error(`Vault filters tests failed: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Vault filters tests passed (${cas.length} scenarios).`);
}
