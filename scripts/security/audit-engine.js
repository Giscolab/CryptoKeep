/**
 * CryptoKeep - Moteur d'audit de nouvelle generation (Lot 6).
 *
 * POURQUOI UN NOUVEAU MOTEUR
 * Le rapport de securite affichait des valeurs FICTIVES codees en dur :
 * « 73 % », « 16 mots de passe faibles », « Compte NetBank compromis »,
 * et jusqu'a un mot de passe en clair dans le markup
 * (« Mot de passe : "password123" »). Le graphique « Evolution de la sante
 * des mots de passe » etait alimente par douze mois de chiffres inventes.
 * Un utilisateur pouvait donc lire un diagnostic entierement imaginaire sur
 * son propre coffre.
 *
 * CE MODULE calcule tout, ou n'affiche rien. Il ne connait pas le DOM.
 *
 * SOURCE DE DONNEES : uniquement les entrees DEJA DECHIFFREES de la session.
 * Il ne lit aucun stockage, ne dechiffre rien, et surtout NE DEMANDE JAMAIS
 * le mot de passe maitre : si la session est ouverte, les entrees sont deja
 * disponibles ; si elle ne l'est pas, l'audit renvoie l'etat honnete
 * « non execute » plutot que de reclamer un secret sans raison.
 *
 * CE QU'IL NE FAIT PAS, VOLONTAIREMENT
 * Aucune estimation de temps de cassage, aucune hypothese de puissance GPU,
 * aucune « simulation de collision PBKDF2 ». Ces chiffres, presents dans
 * scripts/tools/audit-crypto.js, reposaient sur des cadences inventees
 * (`gpuRate = 10000`) et donnaient une precision que rien ne justifie.
 * Ce moteur ne produit que des faits verifiables sur le coffre.
 *
 * REPRODUCTIBILITE
 * Le score est une fonction PURE des entrees et de la date de reference.
 * Sa formule est publiee dans `SCORE_MODEL`, et chaque rapport transporte le
 * detail de son calcul (`score.breakdown`) : deux audits des memes donnees
 * donnent le meme resultat, et n'importe qui peut refaire l'addition.
 */

import { analyzePassword } from './password-policy.js';
import { analyzeReuse } from './password-reuse.js';
import { isPasswordPwned, isHibpEnabled } from './hibp-service.js';
import { hasPersistedCategory } from '../utils/vault-filters.js';

/**
 * Modele de score, publie et stable.
 *
 * Le score part de 100 et retire des points par PROBLEME CONSTATE, jamais
 * par supposition. Les poids sont un choix editorial assume, pas une mesure
 * physique : ils ordonnent les priorites, ils n'estiment aucune probabilite.
 */
export const SCORE_MODEL = Object.freeze({
  version: 1,
  start: 100,
  penalties: Object.freeze({
    // Constat le plus grave : le mot de passe est connu publiquement.
    breached: 40,
    // Reutilisation : la compromission d'un service en compromet plusieurs.
    reused: 25,
    // Faiblesse mesuree par la politique du Lot 5 (bits EFFECTIFS).
    veryWeak: 20,
    weak: 10,
    // Anciennete.
    olderThan2Years: 12,
    olderThan1Year: 6
  }),
  // Les penalites sont appliquees par entree, puis moyennees sur le coffre :
  // un coffre de 200 entrees dont 2 sont faibles ne doit pas s'effondrer.
  aggregation: 'moyenne des penalites par entree, bornee a [0, 100]',
  thresholds: Object.freeze({ weakBits: 50, veryWeakBits: 30 })
});

/** Etat renvoye tant qu'aucun audit n'a ete execute. */
export const AUDIT_NOT_RUN = Object.freeze({
  status: 'not_run',
  message: 'Audit non encore exécuté.',
  generatedAt: null,
  scope: null,
  counts: null,
  score: null,
  findings: [],
  breachCheck: null
});

const JOUR_MS = 24 * 60 * 60 * 1000;

/** Age en jours d'une entree, ou `null` si aucune date exploitable. */
function ageInDays(entry, now) {
  const brut = entry.last_modified ?? entry.updatedAt ?? entry.lastModified ?? entry.created_at ?? null;
  if (brut === null || brut === undefined) return null;

  const horodatage = typeof brut === 'number'
    ? (brut > 1e12 ? brut : brut * 1000)
    : Date.parse(brut);

  if (!Number.isFinite(horodatage)) return null;
  const jours = Math.floor((now - horodatage) / JOUR_MS);
  return jours >= 0 ? jours : 0;
}

/** Une URL exploitable est-elle presente ? */
function hasUsableUrl(entry) {
  return typeof entry.url === 'string' && entry.url.trim().length > 0;
}

/**
 * Analyse une entree, sans jamais retenir son mot de passe.
 *
 * @returns {object} constats NON SECRETS pour cette entree
 */
function inspectEntry(entry, now, reusedIds) {
  const password = typeof entry.password === 'string' ? entry.password : '';
  const force = analyzePassword(password);
  const jours = ageInDays(entry, now);

  const problemes = [];
  if (password.length === 0) problemes.push('no_password');
  if (force.effectiveBits < SCORE_MODEL.thresholds.veryWeakBits && password.length > 0) {
    problemes.push('very_weak');
  } else if (force.effectiveBits < SCORE_MODEL.thresholds.weakBits && password.length > 0) {
    problemes.push('weak');
  }
  if (reusedIds.has(entry.id)) problemes.push('reused');
  if (jours !== null && jours > 730) problemes.push('older_than_2_years');
  else if (jours !== null && jours > 365) problemes.push('older_than_1_year');
  if (!hasUsableUrl(entry)) problemes.push('no_url');
  if (!hasPersistedCategory(entry)) problemes.push('no_category');

  return {
    id: entry.id,
    // Donnees NON SECRETES seulement. Jamais le mot de passe, jamais les notes.
    title: typeof entry.title === 'string' ? entry.title : '',
    username: typeof entry.username === 'string' ? entry.username : '',
    effectiveBits: force.effectiveBits,
    naiveBits: force.naiveBits,
    // Les motifs detectes decrivent la FORME du mot de passe, pas son contenu :
    // « motif clavier », « mot courant ». Ils n'exposent aucun secret.
    patterns: force.penalties.map((penalty) => penalty.code),
    ageDays: jours,
    problems: problemes,
    breach: null
  };
}

/** Penalite d'une entree, selon le modele publie. */
function penaltyFor(item) {
  const p = SCORE_MODEL.penalties;
  let total = 0;

  if (item.breach && item.breach.checked === true && item.breach.pwned === true) total += p.breached;
  if (item.problems.includes('reused')) total += p.reused;
  if (item.problems.includes('very_weak')) total += p.veryWeak;
  else if (item.problems.includes('weak')) total += p.weak;
  if (item.problems.includes('older_than_2_years')) total += p.olderThan2Years;
  else if (item.problems.includes('older_than_1_year')) total += p.olderThan1Year;

  return total;
}

/**
 * Execute un audit complet du coffre DEVERROUILLE.
 *
 * @param {Array} entries entrees dechiffrees de la session
 * @param {{now?: number|string, checkBreaches?: boolean, signal?: object,
 *          storage?: object, fetchImpl?: Function}} [options]
 * @returns {Promise<object>} rapport verifiable, sans aucun secret
 */
export async function runSecurityAudit(entries, options = {}) {
  // Session fermee, ou aucune entree disponible : etat honnete, pas de
  // demande de mot de passe, pas de chiffres inventes.
  if (!Array.isArray(entries)) {
    return { ...AUDIT_NOT_RUN, message: 'Coffre verrouille : audit non execute.' };
  }

  const reference = options.now === undefined
    ? Date.now()
    : (typeof options.now === 'number' ? options.now : Date.parse(options.now));
  const generatedAt = new Date(reference).toISOString();

  // --- reutilisations REELLES, par comparaison exacte des chaines --------
  // `analyzeReuse` RETIENT les groupes : sans cela, l'action « Résoudre »
  // du rapport ne pourrait pas retrouver les entrees d'un groupe. Les groupes
  // retenus sont effaces au verrouillage (session-lock.js).
  const groupes = await analyzeReuse(entries);
  const reusedIds = new Set();
  for (const groupe of groupes) {
    for (const membre of groupe.entries) reusedIds.add(membre.id);
  }

  const items = entries.map((entry) => inspectEntry(entry, reference, reusedIds));

  // --- compromission : UNIQUEMENT si activee ET reellement verifiee ------
  const breachRequested = options.checkBreaches === true;
  const breachEnabled = breachRequested && isHibpEnabled(options);
  let breachChecked = 0;
  const breachReasons = new Set();

  if (breachEnabled) {
    for (const item of items) {
      const entry = entries.find((candidate) => candidate.id === item.id);
      const resultat = await isPasswordPwned(entry ? entry.password : '', options);
      item.breach = resultat;
      if (resultat.checked === true) breachChecked += 1;
      else breachReasons.add(resultat.reason);
      if (options.signal && options.signal.aborted) break;
    }
  }

  const breachCheck = {
    requested: breachRequested,
    enabled: breachEnabled,
    checkedCount: breachChecked,
    totalCount: items.length,
    // `complete` n'est vrai que si CHAQUE entree a recu une reponse. Un
    // audit partiel ne doit jamais se presenter comme complet.
    complete: breachEnabled && items.length > 0 && breachChecked === items.length,
    reasons: Array.from(breachReasons)
  };

  // --- comptages REELS ---------------------------------------------------
  const compte = (probleme) => items.filter((item) => item.problems.includes(probleme)).length;

  const counts = {
    total: items.length,
    weak: compte('weak') + compte('very_weak'),
    veryWeak: compte('very_weak'),
    // Nombre d'ENTREES concernees par une reutilisation, et nombre de groupes.
    reused: reusedIds.size,
    reuseGroups: groupes.length,
    olderThan1Year: compte('older_than_1_year') + compte('older_than_2_years'),
    olderThan2Years: compte('older_than_2_years'),
    withoutUrl: compte('no_url'),
    withoutCategory: compte('no_category'),
    withoutPassword: compte('no_password'),
    // LOT 7B : comptage EXPLICITE des entrees sans aucun probleme, au lieu
    // d'une soustraction. `total - faibles - reutilises` classait « solide »
    // une entree sans mot de passe, et comptait deux fois une entree a la
    // fois faible et reutilisee — les categories se chevauchent.
    clean: items.filter((item) => item.problems.length === 0
      && !(item.breach && item.breach.checked === true && item.breach.pwned === true)).length,
    // `null` — et non 0 — quand rien n'a ete verifie : une absence de
    // verification n'est pas une absence de compromission.
    breached: breachEnabled
      ? items.filter((item) => item.breach && item.breach.checked === true && item.breach.pwned === true).length
      : null
  };

  // --- score DOCUMENTE et REPRODUCTIBLE ---------------------------------
  const penalites = items.map((item) => penaltyFor(item));
  const totalPenalites = penalites.reduce((somme, valeur) => somme + valeur, 0);
  const moyenne = items.length > 0 ? totalPenalites / items.length : 0;
  const valeur = items.length === 0
    ? null
    : Math.max(0, Math.min(100, Math.round(SCORE_MODEL.start - moyenne)));

  const score = {
    value: valeur,
    model: SCORE_MODEL.version,
    formula: `${SCORE_MODEL.start} - (somme des penalites / nombre d'entrees)`,
    breakdown: {
      entries: items.length,
      totalPenalty: totalPenalites,
      averagePenalty: Number(moyenne.toFixed(2)),
      byCause: {
        breached: items.filter((i) => i.breach && i.breach.checked === true && i.breach.pwned === true).length
          * SCORE_MODEL.penalties.breached,
        reused: compte('reused') * SCORE_MODEL.penalties.reused,
        veryWeak: compte('very_weak') * SCORE_MODEL.penalties.veryWeak,
        weak: compte('weak') * SCORE_MODEL.penalties.weak,
        olderThan2Years: compte('older_than_2_years') * SCORE_MODEL.penalties.olderThan2Years,
        olderThan1Year: compte('older_than_1_year') * SCORE_MODEL.penalties.olderThan1Year
      }
    },
    // Le score ne tient pas compte de la compromission quand elle n'a pas ete
    // verifiee : il faut le DIRE plutot que de laisser croire a un score complet.
    partial: !breachCheck.complete
  };

  // --- constats, tries du plus grave au moins grave ---------------------
  const rang = {
    breached: 0, reused: 1, very_weak: 2, weak: 3,
    older_than_2_years: 4, older_than_1_year: 5, no_password: 6,
    no_url: 7, no_category: 8
  };
  const gravite = (item) => Math.min(
    ...item.problems.map((probleme) => (
      Object.prototype.hasOwnProperty.call(rang, probleme)
        ? Object.entries(rang).find(([cle]) => cle === probleme)[1]
        : 99
    )),
    item.breach && item.breach.checked === true && item.breach.pwned === true ? 0 : 99
  );

  const findings = items
    .filter((item) => item.problems.length > 0
      || (item.breach && item.breach.checked === true && item.breach.pwned === true))
    .sort((a, b) => gravite(a) - gravite(b));

  return {
    status: 'completed',
    generatedAt,
    scope: {
      source: 'session_entries',
      entryCount: items.length,
      breachCheck: breachCheck.enabled ? 'enabled' : 'disabled',
      // Ce que l'audit N'A PAS examine doit etre dit aussi clairement que
      // ce qu'il a examine.
      notExamined: breachCheck.enabled
        ? (breachCheck.complete ? [] : ['compromission (verification incomplete)'])
        : ['compromission (verification desactivee)']
    },
    counts,
    score,
    findings,
    reuseGroups: groupes,
    breachCheck
  };
}

export default { runSecurityAudit, SCORE_MODEL, AUDIT_NOT_RUN };
