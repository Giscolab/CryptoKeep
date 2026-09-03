/**
 * Lot 5 partie 2 - Detection sure des mots de passe reutilises.
 *
 * Toutes les entrees sont synthetiques. Aucun coffre reel n'est lu.
 */
import '../tests/webcrypto-setup.js';
import assert from 'node:assert/strict';
import {
  findReuseGroups,
  findReuseGroupsExact,
  analyzeReuse,
  getReuseGroups,
  getReuseGroupEntries,
  clearReuseAnalysis
} from '../scripts/security/password-reuse.js';
import { groupPasswordReuse } from '../scripts/security/password-reuse-groups.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

const entree = (id, password, title = `Entree ${id}`) => ({
  id, password, title, username: `${id}@example.test`, url: `https://${id}.example.test`
});

test('2.1 - COLLISION CONNUE : « Aa » et « BB » ne sont pas une reutilisation', async () => {
  const entrees = [entree('1', 'Aa'), entree('2', 'BB')];

  // L'implementation HISTORIQUE les confond : c'est le defaut a corriger.
  const historique = groupPasswordReuse(entrees);
  assert.equal(historique.length, 1,
    'Pre-requis du test : l ancien condensat 32 bits regroupe bien « Aa » et « BB »');
  assert.equal(historique[0].entries.length, 2);

  // La nouvelle implementation ne les confond pas.
  const exact = findReuseGroupsExact(entrees);
  assert.deepEqual(exact, [],
    'DEFAUT CORRIGE : deux mots de passe differents ne forment pas un groupe');

  const parCondensat = await findReuseGroups(entrees);
  assert.deepEqual(parCondensat, [],
    'Le chemin par condensat doit confirmer l egalite exacte, donc ne rien grouper');
});

test('2.2 - autres collisions du condensat 32 bits', async () => {
  const collisions = [['Aa', 'BB'], ['AaAa', 'BBBB'], ['Ca', 'DB'], ['AaBB', 'BBAa']];

  for (const [gauche, droite] of collisions) {
    const entrees = [entree('g', gauche), entree('d', droite)];
    const groupes = await findReuseGroups(entrees);
    assert.deepEqual(groupes, [],
      `« ${gauche} » et « ${droite} » sont differents et ne doivent pas etre groupes`);
  }
});

test('2.2b - CONDENSAT COLLISIONNANT : l egalite exacte est bien confirmee', async () => {
  // Ce test prouve que la confirmation d'egalite exacte n'est pas
  // decorative. Le condensat injecte fait DELIBEREMENT collisionner tous les
  // mots de passe : sans confirmation, les quatre entrees formeraient un seul
  // groupe. Avec confirmation, seules les egalites reelles subsistent.
  const condensatConstant = async () => 'meme-seau-pour-tout-le-monde';

  const entrees = [
    entree('1', 'Aa'),
    entree('2', 'BB'),
    entree('3', 'partage'),
    entree('4', 'partage')
  ];

  const groupes = await findReuseGroups(entrees, { digest: condensatConstant });

  assert.equal(groupes.length, 1,
    'Un condensat qui collisionne totalement ne doit pas creer de faux groupe');
  assert.deepEqual(groupes[0].entries.map((e) => e.id).sort(), ['3', '4'],
    'Seules les entrees dont les chaines sont REELLEMENT egales sont groupees');
  assert.equal(groupes[0].verifiedExact, true);

  // Et le meme jeu, avec un condensat qui ne collisionne pas, donne le meme
  // resultat : la confirmation ne change rien quand le condensat est bon.
  const parSha256 = await findReuseGroups(entrees);
  assert.deepEqual(
    parSha256.map((g) => g.entries.map((e) => e.id).sort().join(',')),
    groupes.map((g) => g.entries.map((e) => e.id).sort().join(','))
  );
});

test('2.3 - une vraie reutilisation est bien detectee', async () => {
  const entrees = [
    entree('1', 'MotDePasse-Partage-1!'),
    entree('2', 'MotDePasse-Partage-1!'),
    entree('3', 'MotDePasse-Unique-2!'),
    entree('4', 'MotDePasse-Partage-1!')
  ];

  for (const groupes of [findReuseGroupsExact(entrees), await findReuseGroups(entrees)]) {
    assert.equal(groupes.length, 1, 'Un seul groupe attendu');
    assert.equal(groupes[0].count, 3);
    assert.equal(groupes[0].verifiedExact, true,
      'Le groupe doit declarer que l egalite exacte a ete verifiee');
    assert.deepEqual(groupes[0].entries.map((e) => e.id).sort(), ['1', '2', '4']);
    assert.equal(groupes[0].severity, 'high');
  }
});

test('2.4 - AUCUN mot de passe ni condensat dans les groupes', async () => {
  const secret = 'MotDePasse-Tres-Secret-9!';
  const groupes = await findReuseGroups([entree('1', secret), entree('2', secret)]);
  const serialise = JSON.stringify(groupes);

  assert.ok(!serialise.includes(secret), 'Aucun mot de passe ne doit figurer dans un groupe');
  assert.ok(!('password' in groupes[0].entries[0]),
    'Les entrees decrites ne portent pas de champ password');

  // L'identifiant de groupe ne doit pas etre derive du mot de passe : deux
  // analyses successives des MEMES donnees produisent des identifiants
  // differents.
  const secondes = await findReuseGroups([entree('1', secret), entree('2', secret)]);
  assert.notEqual(groupes[0].groupId, secondes[0].groupId,
    'Un identifiant derive du secret serait un oracle ; il doit etre aleatoire');
  assert.match(groupes[0].groupId, /^reuse_[0-9a-f]{32}$/);
});

test('2.5 - aucune persistance', async () => {
  // Un stockage est installe et surveille : le module ne doit rien y ecrire.
  const ecritures = [];
  const faux = {
    getItem() { return null; },
    setItem(cle, valeur) { ecritures.push([cle, valeur]); },
    removeItem(cle) { ecritures.push(['remove', cle]); }
  };
  globalThis.localStorage = faux;
  globalThis.sessionStorage = faux;

  try {
    await analyzeReuse([entree('1', 'partage'), entree('2', 'partage')]);
  } finally {
    delete globalThis.localStorage;
    delete globalThis.sessionStorage;
  }

  assert.deepEqual(ecritures, [], 'Aucune ecriture de stockage ne doit avoir lieu');
});

test('2.6 - aucune journalisation', async () => {
  const secret = 'MotDePasse-Jamais-Journalise-7!';
  const captures = [];
  const capturer = (...args) => { captures.push(args.map(String).join(' ')); };
  const vraiLog = console.log;
  const vraiWarn = console.warn;
  const vraiError = console.error;
  const vraiInfo = console.info;
  console.log = capturer; console.warn = capturer;
  console.error = capturer; console.info = capturer;

  try {
    await analyzeReuse([entree('1', secret), entree('2', secret), entree('3', 'autre')]);
  } finally {
    console.log = vraiLog; console.warn = vraiWarn;
    console.error = vraiError; console.info = vraiInfo;
  }

  assert.deepEqual(captures, [], 'Le module ne doit rien journaliser du tout');
});

test('2.7 - les groupes sont effaces au verrouillage', async () => {
  await analyzeReuse([entree('1', 'partage'), entree('2', 'partage')]);
  assert.equal(getReuseGroups().length, 1, 'Pre-requis : un groupe existe');

  const rapport = clearReuseAnalysis();
  assert.equal(rapport.cleared, 1, 'Le nettoyage doit etre verifiable');
  assert.deepEqual(getReuseGroups(), [], 'Aucun groupe ne doit subsister');
  assert.deepEqual(getReuseGroupEntries('reuse_' + '0'.repeat(32), []), []);
});

test('2.8 - retrouver les entrees d un groupe', async () => {
  const entrees = [
    entree('1', 'partage'), entree('2', 'partage'), entree('3', 'unique')
  ];
  const groupes = await analyzeReuse(entrees);
  const retrouvees = getReuseGroupEntries(groupes[0].groupId, entrees);

  assert.equal(retrouvees.length, 2);
  assert.deepEqual(retrouvees.map((e) => e.id).sort(), ['1', '2']);
  // Les mots de passe viennent de la liste de SESSION, jamais des groupes.
  assert.equal(retrouvees[0].password, 'partage');

  assert.deepEqual(getReuseGroupEntries('identifiant-inexistant', entrees), []);
  clearReuseAnalysis();
});

test('2.9 - cas limites : vide, mots de passe absents, une seule entree', async () => {
  assert.deepEqual(await findReuseGroups([]), []);
  assert.deepEqual(findReuseGroupsExact([]), []);
  assert.deepEqual(await findReuseGroups([entree('1', 'seul')]), []);
  assert.deepEqual(await findReuseGroups([
    { id: '1', title: 'Sans mot de passe' },
    { id: '2', title: 'Vide', password: '' },
    null
  ]), [], 'Les entrees sans mot de passe sont ignorees, sans erreur');
});

test('2.10 - gros volume : le condensat et la comparaison exacte concordent', async () => {
  const entrees = [];
  for (let index = 0; index < 300; index += 1) {
    entrees.push(entree(`e${index}`, `MotDePasse-${index % 40}`));
  }

  const exact = findReuseGroupsExact(entrees);
  const parCondensat = await findReuseGroups(entrees);

  assert.equal(exact.length, 40, '40 mots de passe distincts, tous reutilises');
  assert.equal(parCondensat.length, exact.length,
    'Les deux chemins doivent donner exactement les memes groupes');

  const cle = (groupes) => groupes
    .map((g) => g.entries.map((e) => e.id).sort().join(','))
    .sort()
    .join('|');
  assert.equal(cle(parCondensat), cle(exact));
  clearReuseAnalysis();
});

console.log('=== TEST PASSWORD REUSE ===');
let echecs = 0;
for (const { label, fn } of cas) {
  try {
    await fn();
    console.log(`  ok   ${label}`);
  } catch (error) {
    echecs += 1;
    console.error(`  ECHEC ${label}`);
    console.error(`        ${error && error.message}`);
  }
}
if (echecs > 0) {
  console.error(`Password reuse tests failed: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Password reuse tests passed (${cas.length} scenarios).`);
}
