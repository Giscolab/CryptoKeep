/**
 * Serveur local — types MIME et en-têtes de sécurité.
 *
 * DEFAUT CORRIGE. Signale depuis un navigateur reel :
 *
 *   Refused to execute script from 'http://127.0.0.1:8000/scripts/utils/
 *   theme-loader.js' because its MIME type ('text/plain') is not executable,
 *   and strict MIME type checking is enabled.
 *
 * `SimpleHTTPRequestHandler` consulte `extensions_map`, puis les types MIME du
 * systeme. Sous Windows, `mimetypes` lit le REGISTRE : une entree `.js`
 * associee a `text/plain` — ce que font certains antivirus — faisait annoncer
 * `text/plain` pour tous les scripts. Combine a `X-Content-Type-Options:
 * nosniff`, que ce serveur envoie volontairement, le navigateur refusait de
 * les executer et l'application ne demarrait pas du tout.
 *
 * Le defaut ne se voyait NI dans les tests Node, NI sous Linux : il dependait
 * de la configuration de la machine. Ce test lance donc le VRAI serveur et
 * lit les en-têtes qu'il renvoie reellement.
 *
 * Aucune donnee reelle : seuls des fichiers du depot sont servis, sur un port
 * ephemere de l'interface de bouclage.
 */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { lireFichier } from './helpers/repo-files.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

/** Interpreteur Python disponible, ou `null`. */
function trouverPython() {
  for (const candidat of ['python3', 'python', 'py']) {
    try {
      execFileSync(candidat, ['--version'], { stdio: 'pipe' });
      return candidat;
    } catch { /* candidat suivant */ }
  }
  return null;
}

function portLibre() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** Demarre le vrai serveur du projet et attend qu'il reponde. */
async function demarrerServeur(python) {
  const port = await portLibre();
  const processus = spawn(python, [
    'scripts/secure_local_server.py', '--bind', '127.0.0.1',
    '--port', String(port), '--directory', '.'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const echeance = Date.now() + 15000;
  while (Date.now() < echeance) {
    try {
      const reponse = await fetch(`http://127.0.0.1:${port}/index.html`);
      if (reponse.ok) return { port, processus };
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  processus.kill();
  throw new Error('Le serveur local n a pas repondu en 15 s.');
}

const python = trouverPython();
let serveur = null;

/** Type MIME renvoye pour une ressource, sans le parametre de charset. */
async function typeDe(chemin) {
  const reponse = await fetch(`http://127.0.0.1:${serveur.port}${chemin}`);
  assert.equal(reponse.status, 200, `Ressource introuvable : ${chemin}`);
  return {
    type: (reponse.headers.get('content-type') || '').split(';')[0].trim(),
    entetes: reponse.headers
  };
}

// ===========================================================================
// 1. Le défaut signalé, sur les fichiers exacts qui échouaient
// ===========================================================================

test('S1 - les quatre fichiers refusés par Chromium sont servis en text/javascript', async () => {
  // Les quatre chemins cités dans le rapport d'erreur du navigateur.
  const enCause = [
    '/scripts/utils/theme-loader.js',
    '/scripts/vendor/Chart.min.js',
    '/scripts/app.js',
    '/scripts/ui/security-report-init.js'
  ];

  const fautifs = [];
  for (const chemin of enCause) {
    const { type } = await typeDe(chemin);
    if (type !== 'text/javascript') fautifs.push(`${chemin} -> ${type}`);
  }

  assert.deepEqual(fautifs, [],
    'Avec « X-Content-Type-Options: nosniff », un script annoncé autrement '
    + 'que comme du JavaScript est REFUSÉ par le navigateur, et l application '
    + 'ne démarre pas.');
});

test('S2 - tout script chargé par index.html est exécutable', async () => {
  const html = lireFichier('index.html');
  const scripts = [...html.matchAll(/<script[^>]*src="([^"?]+)/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 3, 'index.html doit charger plusieurs scripts');

  const fautifs = [];
  for (const src of scripts) {
    const { type } = await typeDe(`/${src}`);
    if (type !== 'text/javascript') fautifs.push(`${src} -> ${type}`);
  }
  assert.deepEqual(fautifs, [], 'Chaque script de la page doit être exécutable.');
});

test('S3 - toute feuille de style de index.html est servie en text/css', async () => {
  const html = lireFichier('index.html');
  const feuilles = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"?]+)/g)]
    .map((m) => m[1]).filter((h) => !h.startsWith('http'));

  const fautifs = [];
  for (const href of feuilles) {
    const { type } = await typeDe(`/${href}`);
    if (type !== 'text/css') fautifs.push(`${href} -> ${type}`);
  }
  assert.deepEqual(fautifs, [],
    'Sous nosniff, une feuille annoncée en text/plain est ignorée : '
    + 'l interface s affiche sans aucun style.');
});

test('S4 - les modules importés dynamiquement sont exécutables', async () => {
  // Un module ES refusé fait échouer le chargement de toute sa chaîne
  // d'imports, sans message clair dans la page.
  const modules = [
    '/scripts/core/vault/manager.js',
    '/scripts/core/crypto/aes-gcm.js',
    '/scripts/security/session-lock.js',
    '/scripts/ui/settings-controls.js'
  ];
  for (const chemin of modules) {
    const { type } = await typeDe(chemin);
    assert.equal(type, 'text/javascript', `Module non exécutable : ${chemin}`);
  }
});

test('S5 - le manifeste et le favicon portent leur type réel', async () => {
  const manifeste = await typeDe('/public/icons/site.webmanifest');
  assert.equal(manifeste.type, 'application/manifest+json');

  const favicon = await typeDe('/public/icons/favicon-32x32.png');
  assert.equal(favicon.type, 'image/png');
});

test('S6 - index.html est servi en text/html, pas en texte brut', async () => {
  const { type } = await typeDe('/index.html');
  assert.equal(type, 'text/html',
    'Annoncée en text/plain, la page s afficherait comme du code source.');
});

// ===========================================================================
// 2. Le type ne doit dépendre d'AUCUNE configuration de machine
// ===========================================================================

test('S7 - la table des types est explicite dans le code, pas héritée du système', () => {
  const source = lireFichier('scripts/secure_local_server.py');

  assert.ok(/extensions_map\s*=\s*\{/.test(source),
    'Sans table explicite, le type dépend du registre Windows ou de /etc/mime.types');
  assert.ok(/\*\*SimpleHTTPRequestHandler\.extensions_map/.test(source),
    'La table doit COMPLÉTER celle de Python, jamais la remplacer : les types '
    + 'd encodage (.gz, .bz2) doivent survivre');

  for (const [extension, type] of [
    ['.js', 'text/javascript'], ['.mjs', 'text/javascript'],
    ['.css', 'text/css'], ['.html', 'text/html'],
    ['.webmanifest', 'application/manifest+json']
  ]) {
    assert.ok(source.includes(`"${extension}": "${type}"`),
      `Type non déterministe pour ${extension} : il doit valoir ${type}`);
  }
});

test('S8 - les en-têtes de sécurité sont toujours présents', async () => {
  const { entetes } = await typeDe('/scripts/app.js');

  assert.equal(entetes.get('x-content-type-options'), 'nosniff',
    'C est cet en-tête qui rend le type MIME décisif : il ne doit PAS être '
    + 'retiré pour contourner le problème');
  assert.ok(/no-store/.test(entetes.get('cache-control') || ''));
  assert.ok((entetes.get('content-security-policy') || '').includes("script-src 'self'"));
  assert.equal(entetes.get('referrer-policy'), 'no-referrer');
});

test('S9 - la CSP servie n autorise ni unsafe-inline ni unsafe-eval', async () => {
  const { entetes } = await typeDe('/index.html');
  const csp = entetes.get('content-security-policy') || '';

  assert.ok(csp.length > 0, 'Aucune CSP servie');
  assert.ok(!/unsafe-inline/.test(csp), 'La CSP ne doit jamais autoriser unsafe-inline');
  assert.ok(!/unsafe-eval/.test(csp), 'La CSP ne doit jamais autoriser unsafe-eval');
});

test('S10 - la correction ne masque pas le problème en désactivant nosniff', () => {
  const source = lireFichier('scripts/secure_local_server.py');
  assert.ok(source.includes('"X-Content-Type-Options", "nosniff"'),
    'Retirer nosniff ferait disparaître le message d erreur en laissant le '
    + 'navigateur deviner le type : ce serait masquer le défaut, pas le corriger.');
});

// ===========================================================================
// EXÉCUTION
// ===========================================================================

console.log('=== TEST SERVEUR LOCAL ===');

if (!python) {
  // Un contrôle qui n a rien contrôlé ne peut pas se déclarer réussi.
  console.error('  ECHEC   Python introuvable : le serveur local n a PAS été '
    + 'testé. Aucun résultat ne peut en être tiré. Python est de toute façon '
    + 'exigé par start_vault_secure.bat.');
  process.exitCode = 1;
} else {
  serveur = await demarrerServeur(python);
  let echecs = 0;

  for (const { label, fn } of cas) {
    try { await fn(); console.log(`  ok   ${label}`); }
    catch (error) {
      echecs += 1;
      console.error(`  ECHEC ${label}`);
      console.error(`        ${error && error.message}`);
    }
  }

  serveur.processus.kill();

  if (echecs > 0) {
    console.error(`Local server tests failed: ${echecs} scenario(s).`);
    process.exitCode = 1;
  } else {
    console.log(`Local server tests passed (${cas.length} scenarios).`);
  }
}
