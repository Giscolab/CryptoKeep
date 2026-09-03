/**
 * Lot 6 - Moteur d'audit de nouvelle generation.
 *
 * Entrees synthetiques uniquement. Aucun coffre reel, aucun appel reseau :
 * la verification de compromission est toujours injectee.
 */
import './webcrypto-setup.js';
import assert from 'node:assert/strict';
import {
  runSecurityAudit,
  SCORE_MODEL,
  AUDIT_NOT_RUN
} from '../scripts/security/audit-engine.js';
import { setHibpConsent } from '../scripts/security/hibp-service.js';
import { FakeLocalStorage } from './helpers/vault-fixtures.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

const MAINTENANT = Date.parse('2026-09-03T12:00:00.000Z');
const ilYA = (jours) => new Date(MAINTENANT - jours * 86400000).toISOString();

const COFFRE = [
  { id: 'solide', title: 'Banque', username: 'a@example.test', password: 'x7$Qm2!vLp9Zk',
    url: 'https://banque.example.test', category: 'bank', last_modified: ilYA(10) },
  { id: 'faible', title: 'Forum', username: 'b@example.test', password: 'azerty2024',
    url: 'https://forum.example.test', category: 'social', last_modified: ilYA(20) },
  { id: 'partage-1', title: 'Cloud', username: 'c@example.test', password: 'MotDePasse-Partage-1!',
    url: 'https://cloud.example.test', category: 'cloud', last_modified: ilYA(400) },
  { id: 'partage-2', title: 'Shop', username: 'd@example.test', password: 'MotDePasse-Partage-1!',
    last_modified: ilYA(900) },
  { id: 'incomplet', title: 'Note', username: '', password: 'jonquille-vitrail-8-Kayak',
    last_modified: ilYA(5) }
];

test('6.1 - comptages REELS sur un coffre synthetique', async () => {
  const r = await runSecurityAudit(COFFRE, { now: MAINTENANT });

  assert.equal(r.status, 'completed');
  assert.equal(r.counts.total, 5);
  assert.equal(r.counts.reused, 2, 'Deux entrees partagent un mot de passe');
  assert.equal(r.counts.reuseGroups, 1);
  assert.equal(r.counts.olderThan1Year, 2, '400 et 900 jours');
  assert.equal(r.counts.olderThan2Years, 1, '900 jours seulement');
  assert.equal(r.counts.withoutUrl, 2, 'partage-2 et incomplet');
  assert.equal(r.counts.withoutCategory, 2);
  assert.ok(r.counts.weak >= 1, 'azerty2024 doit compter comme faible');
  assert.equal(r.counts.withoutPassword, 0);
});

test('6.2 - la faiblesse utilise la POLITIQUE du Lot 5, pas la regle naive', async () => {
  // 'jonquille-vitrail-8-Kayak' echoue a la regle naive (pas de majuscule au
  // debut, peu importe) mais est solide ; 'azerty2024' passe pour "correct"
  // sur une regle par classes de caracteres alors qu'il est previsible.
  const r = await runSecurityAudit(COFFRE, { now: MAINTENANT });
  const faible = r.findings.find((f) => f.id === 'faible');
  const solide = r.findings.find((f) => f.id === 'incomplet');

  assert.ok(faible.problems.includes('weak') || faible.problems.includes('very_weak'),
    'Un motif clavier avec suffixe doit etre detecte comme faible');
  assert.ok(faible.patterns.length > 0, 'Le motif detecte doit etre expose');
  assert.ok(!solide || (!solide.problems.includes('weak') && !solide.problems.includes('very_weak')),
    'Une phrase de passe solide ne doit pas etre marquee faible');
});

test('6.3 - reutilisations REELLES : « Aa » et « BB » ne sont pas groupes', async () => {
  const entrees = [
    { id: '1', title: 'A', password: 'Aa', url: 'https://a.test', category: 'work', last_modified: ilYA(1) },
    { id: '2', title: 'B', password: 'BB', url: 'https://b.test', category: 'work', last_modified: ilYA(1) }
  ];
  const r = await runSecurityAudit(entrees, { now: MAINTENANT });
  assert.equal(r.counts.reused, 0,
    'La collision du condensat 32 bits historique ne doit pas reapparaitre');
  assert.equal(r.counts.reuseGroups, 0);
});

test('6.4 - score DOCUMENTE et REPRODUCTIBLE', async () => {
  const a = await runSecurityAudit(COFFRE, { now: MAINTENANT });
  const b = await runSecurityAudit(COFFRE, { now: MAINTENANT });

  assert.equal(a.score.value, b.score.value, 'Deux audits identiques donnent le meme score');
  assert.equal(a.score.model, SCORE_MODEL.version);
  assert.ok(a.score.formula.length > 0, 'La formule doit etre publiee');

  // L'addition doit etre refaisable a la main.
  const attendu = Math.max(0, Math.min(100, Math.round(
    SCORE_MODEL.start - a.score.breakdown.totalPenalty / a.score.breakdown.entries
  )));
  assert.equal(a.score.value, attendu, 'Le score doit correspondre a sa propre formule');
  assert.equal(a.score.breakdown.entries, 5);
  assert.ok(a.score.breakdown.totalPenalty > 0);
  assert.ok(typeof a.score.breakdown.byCause.reused === 'number');
});

test('6.5 - ordre de grandeur : un bon coffre marque mieux qu un mauvais', async () => {
  const bon = [
    { id: '1', title: 'A', password: 'jonquille-vitrail-8-Kayak', url: 'https://a.test', category: 'work', last_modified: ilYA(5) },
    { id: '2', title: 'B', password: 'F6#nWq2@rTz8Lm', url: 'https://b.test', category: 'work', last_modified: ilYA(5) }
  ];
  const mauvais = [
    { id: '1', title: 'A', password: 'password123', last_modified: ilYA(900) },
    { id: '2', title: 'B', password: 'password123', last_modified: ilYA(900) }
  ];

  const scoreBon = (await runSecurityAudit(bon, { now: MAINTENANT })).score.value;
  const scoreMauvais = (await runSecurityAudit(mauvais, { now: MAINTENANT })).score.value;

  assert.equal(scoreBon, 100, 'Un coffre sans probleme doit marquer 100');
  assert.ok(scoreMauvais < 50, `Un coffre entierement compromis doit s effondrer (obtenu ${scoreMauvais})`);
});

test('6.6 - date et PORTEE du dernier audit', async () => {
  const r = await runSecurityAudit(COFFRE, { now: MAINTENANT });

  assert.equal(r.generatedAt, new Date(MAINTENANT).toISOString());
  assert.equal(r.scope.source, 'session_entries',
    'La source doit dire que seules les entrees de session sont examinees');
  assert.equal(r.scope.entryCount, 5);
  assert.equal(r.scope.breachCheck, 'disabled');
  assert.deepEqual(r.scope.notExamined, ['compromission (verification desactivee)'],
    'Ce qui n a PAS ete examine doit etre annonce');
});

test('6.7 - coffre verrouille : etat honnete, aucun chiffre invente', async () => {
  const r = await runSecurityAudit(null);
  assert.equal(r.status, 'not_run');
  assert.equal(r.score, null, 'Aucun score ne doit etre produit sans donnees');
  assert.equal(r.counts, null);
  assert.deepEqual(r.findings, []);
  assert.equal(AUDIT_NOT_RUN.status, 'not_run');
});

test('6.8 - coffre vide : total 0, aucun score fabrique', async () => {
  const r = await runSecurityAudit([], { now: MAINTENANT });
  assert.equal(r.status, 'completed');
  assert.equal(r.counts.total, 0);
  assert.equal(r.score.value, null, 'Sans entree, il n y a pas de score a afficher');
  assert.deepEqual(r.findings, []);
});

test('6.9 - compromission : « — » et non « 0 » tant que rien n est verifie', async () => {
  const r = await runSecurityAudit(COFFRE, { now: MAINTENANT });
  assert.equal(r.counts.breached, null,
    'Une absence de verification n est PAS une absence de compromission');
  assert.equal(r.breachCheck.enabled, false);
  assert.equal(r.breachCheck.complete, false);
  assert.equal(r.score.partial, true, 'Le score doit se declarer partiel');
});

test('6.10 - compromission activee : comptage reel et score complet', async () => {
  const store = new FakeLocalStorage();
  setHibpConsent(true, { storage: store });

  // Toutes les reponses declarent le suffixe absent, sauf pour une entree.
  const sha1 = async (texte) => Array.from(new Uint8Array(
    await crypto.subtle.digest('SHA-1', new TextEncoder().encode(texte))
  ), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();

  const compromis = await sha1('azerty2024');
  const fetchImpl = async (url) => {
    const prefixe = String(url).slice(-5);
    const corps = prefixe === compromis.slice(0, 5)
      ? `${compromis.slice(5)}:4242`
      : 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1';
    return { ok: true, status: 200, async text() { return corps; } };
  };

  const r = await runSecurityAudit(COFFRE, {
    now: MAINTENANT, checkBreaches: true, storage: store, fetchImpl
  });

  assert.equal(r.breachCheck.enabled, true);
  assert.equal(r.breachCheck.complete, true, 'Toutes les entrees ont recu une reponse');
  assert.equal(r.counts.breached, 1, 'Une seule entree est reellement compromise');
  assert.equal(r.score.partial, false, 'Le score n est plus partiel');
  assert.deepEqual(r.scope.notExamined, []);

  const trouve = r.findings.find((f) => f.id === 'faible');
  assert.equal(trouve.breach.pwned, true);
  assert.equal(trouve.breach.count, 4242);
});

test('6.11 - AUCUN mot de passe dans le rapport', async () => {
  const r = await runSecurityAudit(COFFRE, { now: MAINTENANT });
  const serialise = JSON.stringify(r);

  for (const entree of COFFRE) {
    assert.ok(!serialise.includes(entree.password),
      `Le mot de passe de ${entree.id} ne doit jamais figurer au rapport`);
  }
  for (const constat of r.findings) {
    assert.ok(!('password' in constat), 'Aucun constat ne porte de champ password');
  }
});

test('6.12 - aucune estimation de temps de cassage ni de puissance GPU', async () => {
  const r = await runSecurityAudit(COFFRE, { now: MAINTENANT });
  const serialise = JSON.stringify(r).toLowerCase();

  for (const interdit of ['gpu', 'crack', 'bruteforce', 'brute_force', 'yearstocrack',
    'secondsto', 'attemptspersecond', 'hashrate', 'collision']) {
    assert.ok(!serialise.includes(interdit),
      `Le rapport ne doit produire aucune estimation « ${interdit} »`);
  }

  // Et le moteur lui-meme ne contient aucune cadence inventee.
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../scripts/security/audit-engine.js', import.meta.url), 'utf8');
  const codeUtile = source.split(/\r?\n/)
    .filter((ligne) => !ligne.trim().startsWith('*') && !ligne.trim().startsWith('//'))
    .join('\n');
  assert.ok(!/gpuRate|deriveBits|attemptsPerSecond/.test(codeUtile),
    'Le moteur ne doit simuler aucune attaque');
});

test('6.13 - le moteur ne demande JAMAIS de mot de passe maitre', async () => {
  const { readFileSync } = await import('node:fs');
  for (const chemin of ['../scripts/security/audit-engine.js', '../scripts/ui/audit-report-view.js']) {
    const source = readFileSync(new URL(chemin, import.meta.url), 'utf8');
    const codeUtile = source.split(/\r?\n/)
      .filter((ligne) => !ligne.trim().startsWith('*') && !ligne.trim().startsWith('//'))
      .join('\n');
    assert.ok(!/requestPasswordDialog|prompt\(|masterPassword/.test(codeUtile),
      `${chemin} ne doit jamais reclamer le mot de passe maitre`);
  }
});

console.log('=== TEST AUDIT ENGINE ===');
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
  console.error(`Audit engine tests failed: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Audit engine tests passed (${cas.length} scenarios).`);
}
