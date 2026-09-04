/**
 * CryptoKeep - Affichage du rapport de securite (Lot 6).
 *
 * Ce module ne CALCULE rien : il rend ce que `audit-engine.js` a produit.
 * Il ne demande jamais le mot de passe maitre, et n'affiche aucune valeur
 * qui ne provienne pas d'un audit reellement execute.
 *
 * SECURITE D'AFFICHAGE
 * Tout est construit par `textContent` et creation explicite de noeuds.
 * Aucune donnee de coffre ne passe par `innerHTML`. Aucun mot de passe n'est
 * affiche : le moteur n'en transporte pas, et cette couche n'y a pas acces.
 */

import { runSecurityAudit, AUDIT_NOT_RUN, SCORE_MODEL } from '../security/audit-engine.js';
import { vaultManager } from '../core/vault/manager.js';
import { showToast } from '../utils/toast.js';
import { renderSecurityChart } from './security-chart.js';
import { ensureChart, resolveChart } from './chart-loader.js';

/** Dernier rapport, en memoire uniquement. Efface au verrouillage. */
let lastReport = AUDIT_NOT_RUN;

/** Libelles des constats. Decrivent la FORME, jamais le contenu. */
const PROBLEM_LABELS = Object.freeze({
  no_password: 'Aucun mot de passe enregistre',
  very_weak: 'Mot de passe tres faible',
  weak: 'Mot de passe faible',
  reused: 'Mot de passe reutilise sur plusieurs entrees',
  older_than_2_years: 'Inchange depuis plus de 2 ans',
  older_than_1_year: 'Inchange depuis plus d\'un an',
  no_url: 'Aucune URL enregistree',
  no_category: 'Aucune categorie enregistree'
});

const SEVERITY_CLASS = Object.freeze({
  breached: 'vuln-critical',
  no_password: 'vuln-critical',
  reused: 'vuln-high',
  very_weak: 'vuln-high',
  weak: 'vuln-medium',
  older_than_2_years: 'vuln-high',
  older_than_1_year: 'vuln-medium',
  no_url: 'vuln-low',
  no_category: 'vuln-low'
});

function byId(doc, id) { return doc.getElementById(id); }

function setText(doc, id, value) {
  const node = byId(doc, id);
  if (node) node.textContent = String(value);
}

function labelFor(code) {
  return Object.prototype.hasOwnProperty.call(PROBLEM_LABELS, code)
    ? Object.entries(PROBLEM_LABELS).find(([cle]) => cle === code)[1]
    : code;
}

function severityClassFor(codes, breached) {
  if (breached) return SEVERITY_CLASS.breached;
  for (const code of ['no_password', 'reused', 'very_weak', 'older_than_2_years', 'weak', 'older_than_1_year', 'no_url', 'no_category']) {
    if (codes.includes(code)) {
      return Object.entries(SEVERITY_CLASS).find(([cle]) => cle === code)[1];
    }
  }
  return 'vuln-low';
}

function paragraph(text, className) {
  const node = document.createElement('p');
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

/**
 * Fiche d'un constat, avec son action REELLE.
 *
 * CryptoKeep ne peut pas changer un mot de passe sur le site distant : il ne
 * gere que le coffre. L'action ouvre donc la fenetre d'edition de l'entree,
 * et le texte dit explicitement ce qui reste a faire par l'utilisateur.
 */
function createFindingElement(item) {
  const compromis = Boolean(item.breach && item.breach.checked === true && item.breach.pwned === true);

  const wrapper = document.createElement('div');
  wrapper.className = `vulnerability-item ${severityClassFor(item.problems, compromis)}`;
  wrapper.dataset.entryId = item.id;

  const info = document.createElement('div');
  info.className = 'vuln-info';

  const icone = document.createElement('div');
  icone.className = 'vuln-icon';
  const i = document.createElement('i');
  i.className = compromis ? 'fas fa-exclamation-triangle' : 'fas fa-shield-alt';
  icone.appendChild(i);

  const details = document.createElement('div');
  details.className = 'vuln-details';

  const titre = document.createElement('strong');
  titre.textContent = item.title || 'Entree sans titre';

  const causes = document.createElement('span');
  const libelles = item.problems.map(labelFor);
  if (compromis) libelles.unshift('Present dans une fuite publique connue');
  causes.textContent = libelles.join(' · ');

  details.append(titre, causes);

  // Detail mesure, verifiable : bits effectifs et motifs detectes. Les
  // motifs decrivent la forme (« motif clavier »), jamais le contenu.
  if (item.patterns.length > 0 || item.effectiveBits > 0) {
    const mesure = document.createElement('span');
    mesure.className = 'vuln-measure';
    const morceaux = [`${item.effectiveBits} bits effectifs`];
    if (item.naiveBits !== item.effectiveBits) morceaux.push(`${item.naiveBits} bits bruts`);
    if (item.patterns.length > 0) morceaux.push(item.patterns.join(', '));
    if (item.ageDays !== null) morceaux.push(`${item.ageDays} jours`);
    mesure.textContent = morceaux.join(' — ');
    details.appendChild(mesure);
  }

  info.append(icone, details);

  const actions = document.createElement('div');
  actions.className = 'vuln-actions';

  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'vuln-action-btn';
  bouton.dataset.auditAction = 'edit';
  bouton.dataset.entryId = item.id;
  const iconeBouton = document.createElement('i');
  iconeBouton.className = 'fas fa-pen';
  bouton.append(iconeBouton, document.createTextNode(' Modifier cette entrée'));
  // Ce que le bouton ne fait PAS est dit dans son infobulle.
  bouton.title = 'Ouvre l\'entrée dans le coffre. CryptoKeep ne peut pas '
    + 'changer le mot de passe sur le site concerné : cette étape reste manuelle.';

  actions.appendChild(bouton);
  wrapper.append(info, actions);
  return wrapper;
}

/**
 * Fiche d'un groupe de reutilisation. Ne contient aucun mot de passe.
 *
 * LOT 7B : l'action « Résoudre » est reprise ici. Elle existait dans l'ancien
 * `security-dashboard.js`, qui n'est plus declenche : sans ce report, la
 * fonctionnalite aurait purement disparu de l'interface.
 */
function createReuseGroupElement(groupe) {
  const wrapper = document.createElement('div');
  wrapper.className = 'vulnerability-item vuln-high';
  wrapper.dataset.groupId = groupe.groupId;

  const info = document.createElement('div');
  info.className = 'vuln-info';

  const details = document.createElement('div');
  details.className = 'vuln-details';

  const titre = document.createElement('strong');
  titre.textContent = `${groupe.count} entrées partagent le même mot de passe`;

  const liste = document.createElement('span');
  liste.textContent = groupe.entries
    .map((entree) => entree.title || 'Entree sans titre')
    .join(' · ');

  details.append(titre, liste);
  info.appendChild(details);

  const actions = document.createElement('div');
  actions.className = 'vuln-actions';

  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'vuln-action-btn resolve-reuse-btn';
  bouton.dataset.auditAction = 'resolve-reuse';
  bouton.dataset.groupId = groupe.groupId;
  const icone = document.createElement('i');
  icone.className = 'fas fa-random';
  bouton.append(icone, document.createTextNode(' Résoudre ce groupe'));
  bouton.title = 'Ouvre l\'assistant de résolution. Le mot de passe devra aussi '
    + 'être changé sur chaque site concerné : cette étape reste manuelle.';

  actions.appendChild(bouton);
  wrapper.append(info, actions);
  return wrapper;
}

/**
 * Cartes SQUELETTES de l'etat vide.
 *
 * LOT 6 bis - REGRESSION VISUELLE CORRIGEE. Tant qu'aucun audit n'avait ete
 * lance, ces deux sections ne contenaient plus qu'une seule ligne de texte,
 * la ou l'interface d'origine presentait des cartes completes. L'ecran avait
 * perdu sa densite : le gain d'honnetete n'imposait pas cette perte de forme.
 *
 * Ces cartes reprennent EXACTEMENT la structure d'un constat reel — icone,
 * details, severite, action — sans aucune donnee : pas de nom de compte
 * invente, pas de chiffre, pas de mot de passe. Elles sont non interactives
 * et masquees aux lecteurs d'ecran. Le moteur les remplace integralement des
 * qu'un audit reel produit des resultats.
 *
 * @param {number} nombre nombre de cartes a produire
 * @returns {Array<HTMLElement>}
 */
function skeletonCards(nombre) {
  const cartes = [];

  for (let index = 0; index < nombre; index += 1) {
    const wrapper = document.createElement('div');
    wrapper.className = 'vulnerability-item vulnerability-item--skeleton';
    wrapper.dataset.auditSkeleton = 'true';
    wrapper.setAttribute('aria-hidden', 'true');

    const info = document.createElement('div');
    info.className = 'vuln-info';

    const icone = document.createElement('div');
    icone.className = 'vuln-icon';
    const glyphe = document.createElement('i');
    glyphe.className = 'fas fa-shield-alt';
    icone.appendChild(glyphe);

    const details = document.createElement('div');
    details.className = 'vuln-details';
    const titre = document.createElement('strong');
    titre.textContent = '\u2014';
    const sous = document.createElement('span');
    sous.textContent = 'En attente d\'un audit';
    details.append(titre, sous);

    info.append(icone, details);

    const severite = document.createElement('div');
    severite.className = 'vuln-severity';
    severite.textContent = '\u2014';

    const actions = document.createElement('div');
    actions.className = 'vuln-actions';
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'vuln-action-btn';
    bouton.disabled = true;
    const iconeAction = document.createElement('i');
    iconeAction.className = 'fas fa-sync-alt';
    bouton.append(iconeAction, document.createTextNode(' Action'));
    actions.appendChild(bouton);

    wrapper.append(info, severite, actions);
    cartes.push(wrapper);
  }

  return cartes;
}

/** Etat vide d'une liste : le message d'etat PUIS les cartes squelettes. */
function appendEmptyState(conteneur, message, nombreDeCartes) {
  conteneur.appendChild(paragraph(message, 'audit-empty'));
  for (const carte of skeletonCards(nombreDeCartes)) conteneur.appendChild(carte);
}

/** Portee de l'audit : ce qui a ete examine, et ce qui ne l'a pas ete. */
function renderScope(doc, rapport) {
  const conteneur = byId(doc, 'auditScope');
  if (!conteneur) return;
  conteneur.replaceChildren();

  if (rapport.status !== 'completed') {
    conteneur.appendChild(paragraph('Aucun audit exécuté pour l\'instant.', 'audit-empty'));
    return;
  }

  const lignes = [
    ['Source des données', 'Entrées déchiffrées de la session en cours'],
    ['Entrées examinées', String(rapport.scope.entryCount)],
    ['Date de l\'audit', new Date(rapport.generatedAt).toLocaleString('fr-FR')],
    ['Modèle de score', `version ${SCORE_MODEL.version} — ${rapport.score.formula}`],
    ['Vérification de compromission', rapport.breachCheck.enabled
      ? `${rapport.breachCheck.checkedCount}/${rapport.breachCheck.totalCount} entrées vérifiées`
      : 'Désactivée (aucune requête réseau émise)']
  ];

  if (rapport.scope.notExamined.length > 0) {
    lignes.push(['Non examiné', rapport.scope.notExamined.join(' ; ')]);
  }

  for (const [terme, valeur] of lignes) {
    const dt = document.createElement('dt');
    dt.textContent = terme;
    const dd = document.createElement('dd');
    dd.textContent = valeur;
    conteneur.append(dt, dd);
  }
}

/**
 * Note du graphique.
 *
 * Elle est posee independamment de la disponibilite de la bibliotheque : le
 * texte decrit ce que MONTRENT les chiffres, et reste vrai meme si aucun
 * graphique n'est dessine.
 */
function renderChartNote(doc) {
  const note = byId(doc, 'chartNote');
  if (!note) return false;
  note.textContent = 'État à la date du dernier audit. Le coffre ne conserve pas '
    + 'd\'historique : aucune évolution dans le temps ne peut être affichée. '
    + 'Seule la première barre est exclusive ; une même entrée peut apparaître '
    + 'dans plusieurs des suivantes.';
  return true;
}

/** Graphique : etat ACTUEL, jamais une evolution fabriquee. */
function renderChart(doc, rapport) {
  const secours = byId(doc, 'chartFallback');
  const disponible = resolveChart() !== null;

  if (!disponible) {
    // Le chargement de secours n'est tente que s'il y a REELLEMENT quelque
    // chose a dessiner : effacer le rapport au verrouillage ne doit declencher
    // aucune tentative de chargement.
    if (rapport && rapport.status === 'completed') {
      void ensureChart({ doc })
        .then((etat) => {
          if (etat.available && secours) { secours.hidden = true; secours.textContent = ''; }
        })
        .catch(() => { /* chargement de secours best-effort */ });
    }

    // Etat honnete plutot qu un canevas vide et muet.
    if (secours) {
      secours.hidden = false;
      secours.textContent = 'La bibliothèque de graphiques n\'a pas pu être chargée. '
        + 'Les chiffres ci-dessus restent exacts.';
    }
    return false;
  }
  if (secours) { secours.hidden = true; secours.textContent = ''; }
  if (rapport.status !== 'completed') return false;

  const c = rapport.counts;

  // LOT 7B - DEFAUT CORRIGE. « Solides » valait `total - faibles - reutilises`.
  // Une entree SANS MOT DE PASSE n'etant ni faible ni reutilisee, elle etait
  // comptee comme solide. Les categories se chevauchant par ailleurs — une
  // entree peut etre faible, reutilisee ET ancienne —, la soustraction
  // pouvait aussi passer sous zero.
  //
  // « Sans problème » est desormais un comptage EXPLICITE du moteur, et le
  // libelle dit que les autres barres se recoupent.
  renderSecurityChart('securityChart', {
    labels: [
      'Sans problème', 'Faibles', 'Réutilisés', 'Anciens',
      'Sans mot de passe', 'Sans URL', 'Sans catégorie'
    ],
    scores: [
      c.clean, c.weak, c.reused, c.olderThan1Year,
      c.withoutPassword, c.withoutUrl, c.withoutCategory
    ],
    weak: []
  });

  return true;
}

/** Rend l'integralite du rapport. */
export function renderAuditReport(rapport, options = {}) {
  const doc = options.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.getElementById !== 'function') return { rendered: false };

  const complet = rapport && rapport.status === 'completed';
  const c = complet ? rapport.counts : null;
  const tiret = '—';

  setText(doc, 'report-score', complet && rapport.score.value !== null ? `${rapport.score.value}%` : tiret);
  setText(doc, 'report-weak', complet ? c.weak : tiret);
  setText(doc, 'report-reused', complet ? c.reused : tiret);
  setText(doc, 'report-old', complet ? c.olderThan1Year : tiret);
  setText(doc, 'report-no-url', complet ? c.withoutUrl : tiret);
  setText(doc, 'report-no-category', complet ? c.withoutCategory : tiret);

  // Compromission : « — » tant que rien n a ete verifie. Jamais « 0 », qui
  // se lirait comme « aucune fuite ».
  setText(doc, 'report-breached', complet && c.breached !== null ? c.breached : tiret);
  setText(doc, 'report-breached-note', complet && rapport.breachCheck.enabled
    ? (rapport.breachCheck.complete
      ? 'Vérification complète'
      : `Vérification incomplète (${rapport.breachCheck.checkedCount}/${rapport.breachCheck.totalCount})`)
    : 'Vérification désactivée');

  setText(doc, 'report-score-note', complet
    ? (rapport.score.partial
      ? 'Score partiel : la compromission n\'a pas été vérifiée'
      : `Calculé le ${new Date(rapport.generatedAt).toLocaleString('fr-FR')}`)
    : 'Aucun audit exécuté pour l\'instant');

  setText(doc, 'auditStatus', complet
    ? `Audit exécuté le ${new Date(rapport.generatedAt).toLocaleString('fr-FR')} `
      + `sur ${rapport.scope.entryCount} entrée(s) de la session.`
    : (rapport.message || 'Audit non encore exécuté.'));

  // --- constats ---------------------------------------------------------
  const constats = byId(doc, 'auditFindings');
  if (constats) {
    constats.replaceChildren();
    if (!complet) {
      appendEmptyState(constats, 'Aucun audit exécuté pour l\'instant.', 3);
    } else if (rapport.findings.length === 0) {
      appendEmptyState(
        constats,
        `Aucun problème détecté sur les ${rapport.scope.entryCount} entrées examinées.`,
        3
      );
    } else {
      for (const item of rapport.findings) constats.appendChild(createFindingElement(item));
    }
  }
  setText(doc, 'findingsCount', complet ? String(rapport.findings.length) : '');

  // --- groupes de reutilisation ----------------------------------------
  const groupes = byId(doc, 'auditReuseGroups');
  if (groupes) {
    groupes.replaceChildren();
    if (!complet) {
      appendEmptyState(groupes, 'Aucun audit exécuté pour l\'instant.', 2);
    } else if (rapport.reuseGroups.length === 0) {
      appendEmptyState(groupes, 'Aucune réutilisation détectée.', 2);
    } else {
      for (const groupe of rapport.reuseGroups) {
        groupes.appendChild(createReuseGroupElement(groupe));
      }
    }
  }
  setText(doc, 'reuseGroupsCount', complet ? String(rapport.reuseGroups.length) : '');

  renderScope(doc, rapport);
  if (complet) renderChartNote(doc);
  const graphique = renderChart(doc, rapport);

  return { rendered: true, completed: complet, chartRendered: graphique };
}

/**
 * Execute un audit sur les entrees DE LA SESSION.
 *
 * Ne demande jamais le mot de passe maitre : si le coffre est verrouille,
 * l'etat honnete « non execute » est rendu et l'utilisateur est invite a
 * deverrouiller, ce qu'il fait par l'ecran d'authentification habituel.
 */
export async function runAndRenderAudit(options = {}) {
  const manager = options.vaultManager || vaultManager;
  const deverrouille = Boolean(manager && manager.masterKey);

  if (!deverrouille) {
    lastReport = { ...AUDIT_NOT_RUN, message: 'Coffre verrouillé : déverrouillez-le pour lancer un audit.' };
    renderAuditReport(lastReport, options);
    return lastReport;
  }

  const entries = manager.getEntries();
  lastReport = await runSecurityAudit(entries, options.auditOptions || {});
  renderAuditReport(lastReport, options);
  return lastReport;
}

/** Dernier rapport, ou l'etat « non execute ». */
export function getLastAuditReport() {
  return lastReport;
}

/** Efface le rapport. A APPELER AU VERROUILLAGE. */
export function clearAuditReport(options = {}) {
  const avait = lastReport.status === 'completed';
  lastReport = AUDIT_NOT_RUN;
  renderAuditReport(lastReport, options);
  return { cleared: avait };
}

/**
 * Export du rapport au format JSON.
 *
 * Contient les CONSTATS, jamais les mots de passe : le moteur n'en
 * transporte aucun. Le fichier est produit localement, sans reseau.
 */
export function buildAuditExport(rapport) {
  if (!rapport || rapport.status !== 'completed') return null;
  return JSON.stringify({
    generatedAt: rapport.generatedAt,
    scope: rapport.scope,
    counts: rapport.counts,
    score: rapport.score,
    scoreModel: SCORE_MODEL,
    breachCheck: rapport.breachCheck,
    findings: rapport.findings.map((item) => ({
      title: item.title,
      username: item.username,
      effectiveBits: item.effectiveBits,
      naiveBits: item.naiveBits,
      patterns: item.patterns,
      ageDays: item.ageDays,
      problems: item.problems,
      breached: item.breach && item.breach.checked === true ? item.breach.pwned : null
    }))
  }, null, 2);
}

/** Raccorde les controles du rapport. Idempotent. */
export function initAuditReport(options = {}) {
  const doc = options.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.getElementById !== 'function') return { bound: false, reason: 'no_document' };

  const vue = doc.getElementById('security-report-view');
  if (!vue) return { bound: false, reason: 'view_absent' };
  if (vue.dataset && vue.dataset.auditReportBound === 'true') {
    return { bound: false, reason: 'already_bound' };
  }
  if (vue.dataset) vue.dataset.auditReportBound = 'true';

  const lancer = doc.getElementById('runAuditBtn');
  if (lancer) {
    lancer.addEventListener('click', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      lancer.disabled = true;
      void runAndRenderAudit(options).finally(() => { lancer.disabled = false; });
    });
  }

  const exporter = doc.getElementById('exportAuditBtn');
  if (exporter) {
    exporter.addEventListener('click', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      const contenu = buildAuditExport(lastReport);
      if (!contenu) {
        showToast('Lancez d\'abord un audit : il n\'y a rien à exporter.', 'warning');
        return;
      }
      try {
        const blob = new Blob([contenu], { type: 'application/json' });
        const lien = doc.createElement('a');
        lien.href = URL.createObjectURL(blob);
        lien.download = `cryptokeep-audit-${lastReport.generatedAt.slice(0, 10)}.json`;
        lien.click();
        URL.revokeObjectURL(lien.href);
        showToast('Rapport exporté.', 'success');
      } catch {
        showToast('Export impossible dans ce navigateur.', 'error');
      }
    });
  }

  // Action d'un constat : ouvre l'entree dans la fenetre d'edition. C'est le
  // seul geste que le coffre puisse reellement accomplir.
  const constats = doc.getElementById('auditFindings');
  if (constats) {
    constats.addEventListener('click', (event) => {
      const cible = event && event.target;
      const bouton = cible && typeof cible.closest === 'function'
        ? cible.closest('[data-audit-action="edit"]')
        : null;
      if (!bouton) return;
      const entryId = bouton.dataset.entryId;
      if (!entryId || typeof CustomEvent !== 'function') return;
      doc.dispatchEvent(new CustomEvent('vault:edit-entry', { detail: { entryId } }));
      showToast('N\'oubliez pas de changer aussi le mot de passe sur le site concerné.', 'info', 6000);
    });
  }

  // Action d'un groupe de reutilisation : ouvre l'assistant de resolution,
  // deja ecoute par scripts/app.js.
  const groupesConteneur = doc.getElementById('auditReuseGroups');
  if (groupesConteneur) {
    groupesConteneur.addEventListener('click', (event) => {
      const cible = event && event.target;
      const bouton = cible && typeof cible.closest === 'function'
        ? cible.closest('[data-audit-action="resolve-reuse"]')
        : null;
      if (!bouton) return;

      const groupId = bouton.dataset.groupId;
      const groupe = (lastReport.reuseGroups || []).find((item) => item.groupId === groupId);
      if (!groupe || typeof CustomEvent !== 'function') return;

      doc.dispatchEvent(new CustomEvent('vault:open-reuse-resolver', {
        detail: { groupId, groupData: groupe }
      }));
    });
  }

  renderAuditReport(lastReport, options);
  return { bound: true };
}

export default {
  initDashboardMetricActions,
  runAndRenderAudit,
  renderAuditReport,
  initAuditReport,
  getLastAuditReport,
  clearAuditReport,
  buildAuditExport
};

/**
 * Raccorde les quatre actions des cartes du tableau de bord.
 *
 * DEFAUT CORRIGE (Lot 6) : « Voir tout », « Mettre a jour », « Generer de
 * nouveaux » et « Voir l'historique » etaient des `<div>` sans aucun
 * gestionnaire. Ils sont desormais de vrais boutons, et chacun accomplit une
 * action reelle : basculer vers la vue concernee, filtre applique.
 *
 * Ce qu'ils NE FONT PAS est assume : aucun de ces boutons ne remplace un mot
 * de passe automatiquement. Le coffre ne peut pas se connecter a un service
 * tiers pour y changer un secret ; cette etape reste manuelle, et
 * l'infobulle de chaque bouton le dit.
 */
export function initDashboardMetricActions(options = {}) {
  const doc = options.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.querySelectorAll !== 'function') {
    return { bound: 0, reason: 'no_document' };
  }

  const boutons = Array.from(doc.querySelectorAll('[data-metric-action]'));
  let raccordes = 0;

  const INFOBULLES = {
    all: 'Ouvre la liste complète des mots de passe.',
    weak: 'Ouvre la liste des mots de passe. CryptoKeep ne peut pas renforcer '
      + 'un mot de passe à votre place : ouvrez chaque entrée pour la corriger.',
    reused: 'Ouvre le rapport de sécurité, section des réutilisations.',
    old: 'Ouvre la liste des mots de passe, triée du plus récemment modifié au plus ancien.'
  };

  for (const bouton of boutons) {
    const action = bouton.dataset.metricAction;
    if (bouton.dataset.metricActionBound === 'true') continue;
    bouton.dataset.metricActionBound = 'true';

    const infobulle = Object.prototype.hasOwnProperty.call(INFOBULLES, action)
      ? Object.entries(INFOBULLES).find(([cle]) => cle === action)[1]
      : '';
    if (infobulle) bouton.title = infobulle;

    bouton.addEventListener('click', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof CustomEvent !== 'function') return;
      doc.dispatchEvent(new CustomEvent('vault:metric-action', { detail: { action } }));
    });
    raccordes += 1;
  }

  return { bound: raccordes };
}
