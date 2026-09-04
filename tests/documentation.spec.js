/**
 * Lot 10 - Cohérence de la documentation.
 *
 * POURQUOI CE FICHIER
 * L audit du Lot 10 a trouvé, dans les documents du dépôt : deux liens vers un
 * `SECURITY.md` inexistant, une image de démonstration absente, une
 * arborescence de projet entièrement fictive, onze fonctions annoncées sans
 * une ligne de code, une feuille de route datée et périmée, une licence MIT
 * dont deux clauses étaient dupliquées, un manifeste PWA au chemin absolu, et
 * un lanceur `start.bat` qui n a jamais existé.
 *
 * Aucun de ces défauts n était détectable autrement qu'à la lecture. Ce
 * fichier les rend détectables par `npm test`.
 *
 * Il ne juge PAS le style ni le contenu : il vérifie des faits vérifiables —
 * un fichier cité existe, une constante citée correspond au code, une fonction
 * annoncée a une implémentation.
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { lireFichier, estUnFichier } from './helpers/repo-files.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

/** Documents en vigueur, dont la cohérence est exigée. */
const DOCS_EN_VIGUEUR = [
  'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'THREAT_MODEL.md',
  'docs/LANCEMENT-SECURISE.md', 'docs/FONCTIONS-IMPLEMENTEES.md',
  'docs/FONCTIONS-PREVUES.md', 'docs/FORMATS-DE-COFFRE.md',
  'docs/MIGRATIONS.md', 'docs/DECISION-APPLICATION-DESKTOP.md',
  'docs/MODULES-HISTORIQUES.md', 'docs/SITE-HISTORIQUE.md',
  'docs/launcher.md', 'docs/2FA-WEBAUTHN-AUTOFILL.md',
  'tests/browser/README.md'
];

/**
 * Documents HISTORIQUES : conservés, non soumis aux mêmes exigences.
 * Ils doivent en revanche porter une marque de statut (scénario D9).
 */
const DOCS_HISTORIQUES = ['docs/SITE-HISTORIQUE.md'];

// ===========================================================================
// 1. Les documents annoncés existent
// ===========================================================================

test('D1 - tous les documents en vigueur existent', () => {
  const manquants = DOCS_EN_VIGUEUR.filter((chemin) => !estUnFichier(chemin));
  assert.deepEqual(manquants, [],
    'Un document listé comme référence doit exister. `SECURITY.md` était lié '
    + 'deux fois depuis le README et n existait pas.');
});

test('D2 - aucun lien local cassé dans les documents en vigueur', () => {
  const casses = [];

  for (const doc of DOCS_EN_VIGUEUR) {
    const source = lireFichier(doc);
    const dossier = doc.includes('/') ? doc.split('/').slice(0, -1).join('/') : '.';

    // Motif volontairement simple : une alternance imbriquee ici serait
    // signalee comme expression reguliere risquee par ESLint, et l ancre est
    // retiree apres coup plutot que dans le motif.
    for (const trouve of source.matchAll(/\]\(([^)\s]+)\)/g)) {
      const cible = trouve[1].split('#')[0];
      if (cible.length === 0) continue;
      // Les URL absolues et les badges externes sortent du périmètre : ce test
      // vérifie le dépôt, pas le réseau.
      if (/^(https?:|mailto:|#)/.test(cible)) continue;

      const resolu = cible.startsWith('/')
        ? cible.slice(1)
        : join(dossier, cible);

      if (!estUnFichier(resolu)) casses.push(`${doc} -> ${cible}`);
    }
  }

  assert.deepEqual(casses, [],
    'Un lien vers un fichier absent trompe le lecteur sans jamais échouer.');
});

test('D3 - aucune image locale manquante', () => {
  const manquantes = [];

  for (const doc of [...DOCS_EN_VIGUEUR, 'CHANGELOG.md']) {
    if (!estUnFichier(doc)) continue;
    const source = lireFichier(doc);

    for (const trouve of source.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const cible = trouve[1];
      if (/^https?:/.test(cible)) continue;
      const dossier = doc.includes('/') ? doc.split('/').slice(0, -1).join('/') : '.';
      if (!estUnFichier(join(dossier, cible))) manquantes.push(`${doc} -> ${cible}`);
    }
  }

  assert.deepEqual(manquantes, [],
    'Le README affichait `docs/vault-demo.gif`, absent du dépôt : un cadre '
    + 'cassé sur la page d accueil du projet.');
});

// ===========================================================================
// 2. Les chemins et commandes cités correspondent à la réalité
// ===========================================================================

test('D4 - tout fichier du dépôt cité dans un document existe', () => {
  const introuvables = [];
  // Chemins en `code` qui ressemblent à des fichiers du dépôt.
  const motif = /`((?:scripts|tests|docs|public)\/[A-Za-z0-9_./-]+\.[a-z]{2,4}|[A-Za-z0-9_-]+\.(?:bat|py|json|md))`/g;

  // Fichiers produits A L EXECUTION : ils n existent pas dans le depot, et
  // c est normal. `start.bat` est cite pour dire qu il n existe PAS ; le
  // scenario D5 s en charge.
  const HORS_DEPOT = new Set(['server.json', 'export-log.html', 'start.bat']);

  for (const doc of DOCS_EN_VIGUEUR) {
    const source = lireFichier(doc);
    const dossier = doc.includes('/') ? doc.split('/').slice(0, -1).join('/') : '.';

    for (const trouve of source.matchAll(motif)) {
      const cible = trouve[1];
      if (cible.endsWith('.log') || cible.includes('<')) continue;
      if (HORS_DEPOT.has(cible.split('/').pop())) continue;

      // Un chemin cite peut etre relatif au document ou a la racine du depot.
      if (estUnFichier(cible) || estUnFichier(join(dossier, cible))) continue;
      introuvables.push(`${doc} -> ${cible}`);
    }
  }

  assert.deepEqual(introuvables, [],
    'Un chemin cité mais absent envoie le lecteur dans le vide.');
});

test('D5 - le lanceur `start.bat` n est plus mentionné : il n a jamais existé', () => {
  const fautifs = [];
  for (const doc of DOCS_EN_VIGUEUR) {
    const source = lireFichier(doc);
    // On cherche `start.bat` seul, pas start_vault_secure.bat.
    if (/(^|[^_\w])start\.bat/.test(source) && !/n(?:'|\s)existe\s+\*?\*?pas/i.test(source)) {
      fautifs.push(doc);
    }
  }
  assert.deepEqual(fautifs, [],
    'Les seuls lanceurs réels sont start_vault_secure.bat et start_vault_local.bat.');
});

test('D6 - les deux lanceurs réels existent bien', () => {
  assert.ok(estUnFichier('start_vault_secure.bat'), 'Lanceur recommandé absent');
  assert.ok(estUnFichier('start_vault_local.bat'), 'Lanceur historique absent');
});

test('D7 - l accès local n est JAMAIS présenté comme HTTPS', () => {
  // Le CHANGELOG est EXCLU : c est un journal, et il mentionne legitimement
  // la chaine fautive pour dire qu elle a ete retiree du README.
  const fautifs = [];
  for (const doc of DOCS_EN_VIGUEUR) {
    const source = lireFichier(doc);
    for (const trouve of source.matchAll(/https:\/\/(127\.0\.0\.1|localhost)[^\s`)]*/g)) {
      fautifs.push(`${doc} -> ${trouve[0]}`);
    }
  }
  assert.deepEqual(fautifs, [],
    'Le serveur local n implémente aucun TLS. Le présenter comme HTTPS ferait '
    + 'croire à une protection du transport qui n existe pas.');

  // Controle POSITIF : les documents d usage doivent le dire explicitement.
  for (const doc of ['README.md', 'SECURITY.md', 'docs/LANCEMENT-SECURISE.md']) {
    const source = lireFichier(doc);
    assert.ok(/HTTP EN CLAIR|HTTP en clair/.test(source) && /aucun TLS|AUCUN TLS/i.test(source),
      `${doc} doit dire explicitement que l acces local est en HTTP sans TLS`);
  }
});

// ===========================================================================
// 3. Les valeurs techniques citées correspondent au code
// ===========================================================================

test('D8 - les constantes citées correspondent à vault-format.js', () => {
  const source = lireFichier('scripts/core/storage/vault-format.js');
  // Lecture ligne a ligne plutot que par expression reguliere construite : le
  // resultat est identique et le motif reste litteral.
  const valeurDe = (nom) => {
    const ligne = source.split('\n').find((l) => l.startsWith(`export const ${nom} = `));
    assert.ok(ligne, `Constante introuvable dans le code : ${nom}`);
    const valeur = ligne.split('=')[1].trim().replace(';', '');
    assert.ok(/^\d+$/.test(valeur), `Valeur non numerique pour ${nom} : ${valeur}`);
    return valeur;
  };

  const iterations = valeurDe('CURRENT_PBKDF2_ITERATIONS');
  const legacy = valeurDe('LEGACY_PBKDF2_ITERATIONS');
  const sel = valeurDe('VAULT_SALT_BYTES');

  // Écrit avec ou sans séparateur de milliers dans les documents.
  const formats = (n) => [n, `${n.slice(0, 3)} ${n.slice(3)}`, `${n.slice(0, 3)},${n.slice(3)}`];

  for (const doc of ['README.md', 'SECURITY.md', 'docs/FORMATS-DE-COFFRE.md']) {
    const texte = lireFichier(doc);
    assert.ok(formats(iterations).some((f) => texte.includes(f)),
      `${doc} doit citer les ${iterations} itérations réelles`);
    assert.ok(!/\b100\s?000 itérations\b/.test(texte),
      `${doc} cite un nombre d itérations qui n est pas celui du code`);
  }

  const formats2 = lireFichier('docs/FORMATS-DE-COFFRE.md');
  assert.ok(formats2.includes(`${sel} octets`),
    `Le document des formats doit citer un sel de ${sel} octets`);

  // Verification CIBLEE sur la ligne de comparaison v1/v2. Se contenter de
  // chercher « 220 000 » quelque part dans le document ne suffit pas : la
  // valeur apparait aussi dans l exemple JSON, et une ligne de tableau fausse
  // passerait inapercue. C est exactement ce qu a montre la mutation M89.
  const ligneIterations = formats2.split('\n')
    .find((ligne) => /^\|\s*Itérations PBKDF2/.test(ligne));
  assert.ok(ligneIterations,
    'Le tableau de comparaison v1/v2 doit comporter une ligne « Itérations PBKDF2 »');

  for (const [nom, valeur] of [['v1', legacy], ['v2', iterations]]) {
    assert.ok(formats(valeur).some((f) => ligneIterations.includes(f)),
      `La ligne « Itérations PBKDF2 » doit citer la valeur réelle du format `
      + `${nom} (${valeur}). Ligne lue : ${ligneIterations}`);
  }
});

// ===========================================================================
// 4. Aucune fonction annoncée sans code
// ===========================================================================

test('D9 - aucune fonction inexistante n est annoncée comme disponible', () => {
  // Chaque terme correspond à une fonction que le README annonçait avant le
  // Lot 10 et qui n'existe dans aucun fichier du code.
  const jamaisImplementees = [
    'biometric-auth', 'emergency-kit', 'crypto-engine.js', 'security-monitor.js',
    'stress-tests', 'penetration-tests'
  ];

  // L inventaire se TERMINE par la liste de ce qui etait annonce sans exister.
  // Cette section doit nommer ces termes : c est sa raison d etre. Seule la
  // partie qui decrit le disponible est examinee.
  const SEPARATEUR = "## Ce que le dépôt annonçait sans l'implémenter";

  const fautifs = [];
  for (const doc of DOCS_EN_VIGUEUR) {
    if (DOCS_HISTORIQUES.includes(doc)) continue;
    const complet = lireFichier(doc);
    const source = complet.includes(SEPARATEUR) ? complet.split(SEPARATEUR)[0] : complet;

    for (const terme of jamaisImplementees) {
      if (source.includes(terme)) fautifs.push(`${doc} -> ${terme}`);
    }
  }

  assert.deepEqual(fautifs, [],
    'Ces modules et dossiers n existent pas. Les annoncer dans une '
    + 'arborescence de projet fait croire à un code qui n a jamais été écrit.');
});

test('D10 - 2FA et remplissage automatique sont annoncés comme ABSENTS', () => {
  const inventaire = lireFichier('docs/FONCTIONS-IMPLEMENTEES.md');

  for (const fonction of ['Double authentification', 'Remplissage automatique']) {
    const ligne = inventaire.split('\n').find((l) => l.includes(fonction));
    assert.ok(ligne, `Fonction absente de l inventaire : ${fonction}`);
    assert.ok(/\*\*Absent\*\*/.test(ligne),
      `${fonction} doit être marquée « Absent » : la bascule est désactivée `
      + `dans index.html. Ligne lue : ${ligne}`);
  }

  // Contrôle croisé avec le code : les bascules DOIVENT rester désactivées.
  const html = lireFichier('index.html');
  for (const id of ['setting-2fa', 'setting-autofill']) {
    const balise = html.split('\n').find((ligne) => ligne.includes(`id="${id}"`));
    assert.ok(balise, `Bascule introuvable dans index.html : ${id}`);
    assert.ok(balise.includes('disabled'),
      `${id} doit rester désactivée tant que la fonction n est pas implémentée`);
  }
});

test('D11 - HIBP est présenté comme désactivé par défaut', () => {
  const inventaire = lireFichier('docs/FONCTIONS-IMPLEMENTEES.md');
  assert.ok(/HIBP/.test(inventaire) && /Expérimental/.test(inventaire),
    'La seule fonction réseau doit être marquée expérimentale');

  const consentement = lireFichier('scripts/security/hibp-service.js');
  assert.ok(/enabled:\s*false/.test(consentement) || /DEFAULT[^=]*=\s*false/.test(consentement)
    || /consentement/i.test(consentement),
  'Le code doit confirmer que HIBP part désactivé');
});

// ===========================================================================
// 5. Licence, manifeste, site historique
// ===========================================================================

test('D12 - la licence MIT ne contient AUCUNE clause dupliquée', () => {
  const licence = lireFichier('LICENSE');

  const compter = (motif) => (licence.match(motif) || []).length;
  assert.equal(compter(/Permission is hereby granted/g), 1,
    'La clause de permission était présente DEUX fois');
  assert.equal(compter(/THE SOFTWARE IS PROVIDED "AS IS"/g), 1,
    'La clause de garantie était présente DEUX fois, dont une tronquée');
  assert.equal(compter(/The above copyright notice/g), 1);
  assert.ok(/MIT License/.test(licence));
});

test('D13 - le manifeste PWA fonctionne depuis un sous-répertoire', () => {
  const manifeste = JSON.parse(lireFichier('public/icons/site.webmanifest'));

  assert.ok(!manifeste.start_url.startsWith('/'),
    'Un `start_url` absolu casse l installation quand le projet est servi '
    + 'depuis un sous-répertoire, ce qui est le cas sur GitHub Pages');
  assert.equal(manifeste.name, 'CryptoKeep',
    'Le manifeste doit porter le nom du projet');

  for (const icone of manifeste.icons) {
    assert.ok(estUnFichier(join('public/icons', icone.src)),
      `Icône déclarée mais absente : ${icone.src}`);
  }
});

test('D14 - le site de documentation historique porte une marque de statut', () => {
  const page = lireFichier('docs/index.html');
  assert.ok(/Page historique/.test(page),
    'La page annonce des fonctions inexistantes et des URL fausses : elle doit '
    + 'dire son statut avant que quiconque la lise');
  assert.ok(estUnFichier('docs/SITE-HISTORIQUE.md'),
    'Le statut doit être expliqué dans un document dédié');
  // Conservation : la page et ses bundles restent en place.
  assert.ok(estUnFichier('docs/index.html'));
  assert.ok(estUnFichier('docs/assets/index-q6yya6Gb.js'));
});

test('D15 - les modules historiques sont tous recensés', () => {
  const recensement = lireFichier('docs/MODULES-HISTORIQUES.md');
  const historiques = [
    'scripts/crypto.js', 'scripts/storage.js', 'scripts/security.js',
    'scripts/core/storage/schema.js', 'scripts/security/memory.js',
    'scripts/ui/audit-panel.js', 'scripts/security/audit.js',
    'scripts/security/security-dashboard-audit.js'
  ];

  const absents = historiques.filter((chemin) => {
    const nom = chemin.split('/').pop();
    return !recensement.includes(nom);
  });
  assert.deepEqual(absents, [],
    'Un module conservé mais non recensé sera pris pour l implémentation en vigueur.');

  const existants = historiques.filter(estUnFichier);
  assert.deepEqual(existants, historiques,
    'Ces modules doivent être CONSERVÉS : la règle du projet interdit toute suppression.');
});

test('D16 - le nom du projet est cohérent, et l ambiguïté est expliquée', () => {
  const readme = lireFichier('README.md');
  assert.ok(/CryptoKeep/.test(readme));
  assert.ok(/vault-personal/.test(readme),
    'Le README doit expliquer pourquoi les deux noms circulent, plutôt que de '
    + 'laisser le lecteur découvrir la contradiction ailleurs');
});

console.log('=== TEST DOCUMENTATION (LOT 10) ===');
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
  console.error(`Documentation checks failed: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Documentation checks passed (${cas.length} scenarios).`);
}
