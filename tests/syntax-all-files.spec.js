/**
 * Lot 9 - Controle de syntaxe de TOUS les fichiers JavaScript internes.
 *
 * POURQUOI
 * Le depot conserve, par regle, des modules historiques qui ne sont plus
 * importes : `scripts/security.js`, `scripts/storage.js`,
 * `scripts/security/memory.js`, `scripts/core/storage/schema.js`. Aucun test
 * ne les chargeait, aucun bundler ne les compilait : une erreur de syntaxe y
 * serait restee invisible jusqu au jour ou quelqu un les rebranche. Le Lot 1
 * avait deja trouve un `security.js` invalide de cette facon.
 *
 * CE QUE FAIT CE FICHIER
 * Il verifie la syntaxe de chaque fichier, dans le MODE ou il est reellement
 * charge : module ES pour ceux que l application importe, script classique
 * pour ceux que `index.html` charge sans `type="module"`.
 *
 * CE QU IL NE FAIT PAS
 * Il n EXECUTE aucun de ces fichiers : charger un module historique pourrait
 * avoir des effets de bord. `node --check` analyse sans executer.
 *
 * Les bundles tiers minifies (`scripts/vendor/`) sont exclus : la regle du
 * projet interdit de les modifier, et leur syntaxe n est pas notre affaire.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { listerFichiers, lireFichier, estUnFichier } from './helpers/repo-files.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

/** Scripts charges par `index.html` SANS type="module" : syntaxe classique. */
const SCRIPTS_CLASSIQUES = new Set(['scripts/utils/theme-loader.js']);

const FICHIERS = [
  ...listerFichiers('scripts'),
  ...listerFichiers('tests'),
  'eslint.config.mjs',
  'purgecss.config.cjs'
].filter(estUnFichier);

function verifierSyntaxe(chemin) {
  const args = SCRIPTS_CLASSIQUES.has(chemin)
    ? ['--check', chemin]
    : ['--input-type=module', '--check'];

  try {
    if (SCRIPTS_CLASSIQUES.has(chemin)) {
      execFileSync(process.execPath, args, { stdio: 'pipe' });
    } else {
      execFileSync(process.execPath, args, {
        input: lireFichier(chemin), stdio: ['pipe', 'pipe', 'pipe']
      });
    }
    return null;
  } catch (error) {
    const sortie = `${error.stderr || ''}`.trim().split('\n').slice(0, 3).join(' ');
    return sortie || 'erreur de syntaxe';
  }
}

// ===========================================================================

test('S1 - le balayage trouve bien les fichiers HISTORIQUES non importes', () => {
  const historiques = [
    'scripts/security.js',
    'scripts/storage.js',
    'scripts/security/memory.js',
    'scripts/core/storage/schema.js'
  ];
  for (const chemin of historiques) {
    assert.ok(FICHIERS.includes(chemin),
      `Fichier historique absent du balayage : ${chemin}. Un controle qui ne `
      + 'couvre pas ces fichiers ne sert precisement a rien.');
  }
});

test('S2 - le balayage couvre un nombre plausible de fichiers', () => {
  assert.ok(FICHIERS.length >= 100,
    `Seulement ${FICHIERS.length} fichiers analyses : le balayage a du echouer.`);
});

test('S3 - SYNTAXE : tous les fichiers JavaScript internes sont valides', () => {
  const invalides = [];
  for (const chemin of FICHIERS) {
    const erreur = verifierSyntaxe(chemin);
    if (erreur) invalides.push(`${chemin} -> ${erreur}`);
  }
  assert.deepEqual(invalides, [],
    'Un fichier conserve mais invalide casserait l application le jour ou il '
    + 'serait rebranche.');
});

test('S4 - les bundles tiers sont EXCLUS, et le restent', () => {
  assert.ok(!FICHIERS.some((c) => c.includes('vendor')),
    'La regle du projet interdit de toucher aux bundles minifies ; les '
    + 'analyser reviendrait a s en rendre responsable.');
  assert.ok(estUnFichier('scripts/vendor/Chart.min.js'),
    'Le bundle tiers doit rester present : il est charge par index.html');
});

test('S5 - tout script charge par index.html existe reellement', () => {
  const html = lireFichier('index.html');
  const references = [...html.matchAll(/<script[^>]*src="([^"?]+)/g)].map((m) => m[1]);

  assert.ok(references.length > 0, 'index.html doit charger au moins un script');
  const manquants = references.filter((chemin) => !estUnFichier(chemin));
  assert.deepEqual(manquants, [],
    'Un <script src> pointant vers un fichier absent echoue silencieusement '
    + 'au chargement de la page.');
});

test('S6 - tout module importe par un fichier interne existe reellement', () => {
  const casses = [];
  for (const chemin of FICHIERS) {
    if (SCRIPTS_CLASSIQUES.has(chemin)) continue;
    const source = lireFichier(chemin);
    const dossier = chemin.split('/').slice(0, -1).join('/');

    for (const trouve of source.matchAll(/from\s+'(\.[^']+)'|import\s*\(\s*'(\.[^']+)'/g)) {
      // La chaine anti-cache (« ?v=... ») fait partie de l URL servie par le
      // serveur local, pas du chemin sur le disque.
      const cible = (trouve[1] || trouve[2]).split('?')[0];
      const resolu = join(dossier, cible);
      if (!estUnFichier(resolu)) casses.push(`${chemin} -> ${cible}`);
    }
  }
  assert.deepEqual(casses, [],
    'Un import relatif vers un fichier absent fait echouer le chargement du '
    + 'module entier, sans message clair dans le navigateur.');
});

console.log('=== TEST SYNTAXE DE TOUS LES FICHIERS (LOT 9) ===');
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
  console.error(`Syntax checks failed: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Syntax checks passed (${cas.length} scenarios, ${FICHIERS.length} fichiers).`);
}
