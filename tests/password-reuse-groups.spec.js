/**
 * Groupes de reutilisation (module historique conserve).
 *
 * LOT 9 : l assertion maison est remplacee par `node:assert/strict`, et le
 * fichier — que l enonce du lot signalait comme incomplet — est enrichi. Les
 * cinq assertions d origine sont conservees a l identique.
 *
 * Ce module est le regroupement HISTORIQUE. Il reste exporte et teste pour ne
 * casser aucun appelant ; l analyse en vigueur est `password-reuse.js`, testee
 * separement. Les deux doivent rester d accord sur l essentiel, et le
 * scenario R8 le verifie.
 *
 * Aucune donnee reelle : mots de passe fabriques sur place.
 */
import assert from 'node:assert/strict';
import { groupPasswordReuse, getReuseGroupEntries } from '../scripts/security/password-reuse-groups.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

const entrees = [
  { id: '1', title: 'Mail', password: 'SamePass!123', username: 'a' },
  { id: '2', title: 'Bank', password: 'SamePass!123', username: 'b' },
  { id: '3', title: 'Cloud', password: 'Unique!456', username: 'c' }
];

// --- scenarios d origine, convertis ---------------------------------------

test('R1 - un seul groupe de reutilisation est detecte', () => {
  const groupes = groupPasswordReuse(entrees);
  assert.equal(groupes.length, 1, 'Un seul groupe de reutilisation attendu.');
  assert.equal(groupes[0].entries.length, 2, 'Le groupe doit contenir 2 entrees.');
});

test('R2 - les metadonnees de groupe ne transportent AUCUN mot de passe', () => {
  const groupes = groupPasswordReuse(entrees);
  assert.ok(!groupes[0].entries.some((e) => Object.hasOwn(e, 'password')),
    'Le mot de passe ne doit pas apparaitre dans les metadonnees de groupe.');

  const serialise = JSON.stringify(groupes);
  assert.ok(!serialise.includes('SamePass!123'),
    'Aucun mot de passe ne doit survivre a la serialisation d un groupe');
  assert.ok(!serialise.includes('Unique!456'));
});

test('R3 - la resolution rend les entrees completes, pour edition', () => {
  const groupes = groupPasswordReuse(entrees);
  const resolues = getReuseGroupEntries(groupes[0].hashId, entrees);
  assert.equal(resolues.length, 2,
    'La resolution d un groupe doit retourner les entrees completes.');
  assert.ok(resolues.every((e) => e.password === 'SamePass!123'),
    'La resolution doit conserver les mots de passe originaux pour edition.');
});

// --- enrichissements (Lot 9) ----------------------------------------------

test('R4 - aucune reutilisation : aucun groupe, jamais un groupe vide', () => {
  const uniques = [
    { id: '1', title: 'A', password: 'Alpha-1!', username: 'a' },
    { id: '2', title: 'B', password: 'Beta-2!', username: 'b' }
  ];
  assert.deepEqual(groupPasswordReuse(uniques), [],
    'Sans reutilisation, il ne doit exister aucun groupe');
});

test('R5 - liste vide ou invalide : aucun resultat, aucune exception', () => {
  assert.deepEqual(groupPasswordReuse([]), []);
  assert.deepEqual(groupPasswordReuse(), []);
  assert.doesNotThrow(() => groupPasswordReuse([{ id: '1' }, {}, null].filter(Boolean)));
});

test('R6 - trois entrees identiques forment UN groupe de trois', () => {
  const trois = ['1', '2', '3'].map((id) => ({
    id, title: `T${id}`, username: `u${id}`, password: 'Triple-Meme-9!'
  }));
  const groupes = groupPasswordReuse(trois);
  assert.equal(groupes.length, 1);
  assert.equal(groupes[0].entries.length, 3,
    'Trois reutilisations ne doivent pas produire trois groupes de deux');
});

test('R7 - un identifiant de groupe inconnu ne resout rien', () => {
  assert.deepEqual(getReuseGroupEntries('groupe-inexistant', entrees), [],
    'Un identifiant inconnu ne doit pas retomber sur toutes les entrees');
  assert.deepEqual(getReuseGroupEntries(undefined, entrees), []);
  assert.deepEqual(getReuseGroupEntries('x', []), []);
});

test('R8 - accord avec l analyse en vigueur (password-reuse.js)', async () => {
  const { findReuseGroups } = await import('../scripts/security/password-reuse.js');
  const enVigueur = await findReuseGroups(entrees);
  const historique = groupPasswordReuse(entrees);

  const idsHistorique = historique.flatMap((g) => g.entries.map((e) => e.id)).sort();
  const idsEnVigueur = enVigueur.flatMap((g) => g.entries.map((e) => e.id)).sort();

  assert.deepEqual(idsHistorique, idsEnVigueur,
    'Les deux moteurs doivent designer les MEMES entrees comme reutilisees ; '
    + 'un desaccord signalerait que le module historique induit en erreur');
});

test('R9 - l identifiant de groupe n est pas derive du mot de passe en clair', () => {
  const groupes = groupPasswordReuse(entrees);
  const identifiant = String(groupes[0].hashId);
  assert.ok(!identifiant.includes('SamePass'),
    'Un identifiant de groupe qui contient le mot de passe le divulgue');
  assert.ok(identifiant.length > 0, 'Un groupe doit porter un identifiant utilisable');
});

console.log('=== TEST PASSWORD REUSE GROUPS ===');
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
  console.error(`Password reuse group tests failed: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Password reuse group tests passed (${cas.length} scenarios).`);
}
