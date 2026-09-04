/**
 * Lot 9 - Le harnais de test lui-meme.
 *
 * POURQUOI CE FICHIER
 * Trois suites utilisaient `console.assert`. Elles AFFICHAIENT l echec et
 * sortaient malgre tout avec le code 0 : `vault.spec.js` imprimait meme
 * « Tous les tests Vault ont reussi » quelle que soit la realite. Une suite
 * qui ne peut pas echouer ne prouve rien, et une integration continue batie
 * dessus est un decor.
 *
 * Ce fichier verifie donc le harnais : ce qui fait echouer, ce qui est
 * reellement execute, et ce qui n a pas le droit de revenir.
 */
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { listerFichiers, lireFichier, lireCodeSansCommentaires } from './helpers/repo-files.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

const SPECS = readdirSync('tests').filter((n) => n.endsWith('.spec.js')).sort();
const PKG = JSON.parse(lireFichier('package.json'));
const COMMANDES = `${PKG.scripts.test || ''} ${PKG.scripts['test:security'] || ''}`;

// ===========================================================================

test('H1 - toute suite presente est REELLEMENT executee', () => {
  const orphelines = SPECS.filter((nom) => !COMMANDES.includes(`tests/${nom}`));
  assert.deepEqual(orphelines, [],
    'Une suite qui existe sans etre lancee donne une fausse impression de '
    + 'couverture. Ajoutez-la a "test" ou "test:security".');
});

test('H2 - toute suite lancee existe reellement', () => {
  const citees = [...COMMANDES.matchAll(/tests\/([\w.-]+\.spec\.js)/g)].map((m) => m[1]);
  const manquantes = citees.filter((nom) => !SPECS.includes(nom));
  assert.deepEqual(manquantes, [],
    'Une commande qui reference un fichier absent fait echouer la suite entiere');
});

test('H3 - plus aucun console.assert : il n a jamais fait echouer un test', () => {
  const fautives = [...listerFichiers('tests'), ...listerFichiers('scripts')]
    .filter((chemin) => /console\s*\.\s*assert\s*\(/.test(lireFichier(chemin)));

  assert.deepEqual(fautives, [],
    '`console.assert` ecrit un message mais ne change pas le code de sortie : '
    + 'un test bati dessus ne peut pas echouer.');
});

test('H4 - chaque suite porte un chemin d echec explicite', () => {
  const sansEchec = SPECS.filter((nom) => {
    const source = lireFichier(`tests/${nom}`);
    return !/process\.exitCode\s*=\s*1/.test(source) && !/process\.exit\s*\(\s*1/.test(source);
  });
  assert.deepEqual(sansEchec, [],
    'Sans code de sortie non nul, un echec passe inapercu dans une chaine '
    + 'de commandes reliees par « && ».');
});

test('H5 - PREUVE A L EXECUTION : le patron de harnais sort bien en code 1', () => {
  let code = 0;
  try {
    execFileSync(process.execPath, ['tests/helpers/exit-code-canary.mjs'], { stdio: 'pipe' });
  } catch (error) {
    code = error.status;
  }
  assert.equal(code, 1,
    'Le canari echoue par construction : s il sort en 0, le harnais entier '
    + 'est incapable de signaler un echec.');
});

test('H6 - le canari n est PAS enregistre dans npm test', () => {
  assert.ok(!COMMANDES.includes('exit-code-canary'),
    'Le canari echoue volontairement : l enregistrer casserait la suite');
});

test('H7 - les suites utilisent node:assert/strict, pas une assertion maison', () => {
  const sansAssertStrict = SPECS.filter((nom) => {
    const source = lireFichier(`tests/${nom}`);
    return !/from\s+'node:assert\/strict'/.test(source);
  });
  assert.deepEqual(sansAssertStrict, [],
    'Une assertion maison n offre ni diff, ni deepEqual, ni rejects, et se '
    + 'reecrit differemment dans chaque fichier.');
});

test('H8 - aucune suite n atteint le dossier personnel ou l environnement', () => {
  // Ne vise QUE ce qui sort du depot. Une chaine « .vault » dans un test est
  // legitime — les fichiers d import synthetiques portent cette extension —
  // et l interdire ferait echouer des tests corrects.
  const interdits = [
    /os\.homedir\s*\(/,
    /process\.env\.(HOME|USERPROFILE|APPDATA|LOCALAPPDATA)/,
    /['"`]\/home\//, /['"`]C:\\\\Users/, /['"`]~\//
  ];
  const fautives = [];
  for (const nom of SPECS) {
    const source = lireCodeSansCommentaires(`tests/${nom}`);
    const touches = interdits.filter((motif) => motif.test(source));
    if (touches.length > 0) fautives.push(nom);
  }
  assert.deepEqual(fautives, [],
    'Un test ne doit jamais atteindre le dossier personnel de l utilisateur : '
    + 'toutes les donnees doivent etre fabriquees dans le test.');
});

console.log('=== TEST HARNESS (LOT 9) ===');
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
  console.error(`Test harness checks failed: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Test harness checks passed (${cas.length} scenarios).`);
}
