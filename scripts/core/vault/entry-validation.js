/**
 * CryptoKeep - Validation et normalisation d'une entree de coffre (Lot 3).
 *
 * Couche PURE et reutilisable : aucun acces au DOM, au stockage ni au reseau.
 * Elle sert a l'AJOUT comme a la MODIFICATION, afin que les deux flux
 * appliquent exactement les memes regles.
 *
 * Le format d'entree n'est pas modifie : la charge utile chiffree reste un
 * objet JSON libre. `notes` et `tags` s'ajoutent comme de simples proprietes
 * et restent retrocompatibles — le validateur de plaintext du Lot 2 accepte
 * deja chaines, nombres, booleens et tableaux de chaines.
 *
 * Aucun mot de passe n'est jamais journalise ni insere dans un message
 * d'erreur : seul le NOM du champ fautif apparait.
 */

import {
  MAX_ENTRY_TAGS,
  MAX_FIELD_LENGTH,
  MAX_NOTES_LENGTH
} from '../storage/import-limits.js';

/** Longueurs maximales, centralisees et reutilisees par les tests. */
export const ENTRY_LIMITS = Object.freeze({
  title: 200,
  username: MAX_FIELD_LENGTH,
  password: 512,
  url: 2048,
  category: 64,
  notes: MAX_NOTES_LENGTH,
  tagLength: 48,
  tagCount: MAX_ENTRY_TAGS
});

/** Categories connues de l'interface. `other` est le repli documente. */
export const KNOWN_CATEGORIES = Object.freeze([
  'bank', 'email', 'cloud', 'social', 'shopping', 'entertainment', 'work', 'other'
]);

/**
 * Correspondances entre les valeurs du <select> de index.html et les
 * categories internes utilisees par les filtres. `banking` est la valeur
 * historique du markup ; elle designe la categorie interne `bank`.
 */
export const CATEGORY_ALIASES = Object.freeze({
  banking: 'bank',
  bank: 'bank',
  email: 'email',
  cloud: 'cloud',
  social: 'social',
  shopping: 'shopping',
  entertainment: 'entertainment',
  work: 'work',
  other: 'other'
});

/** Schemas d'URL refuses : ils permettraient d'executer du code au clic. */
export const FORBIDDEN_URL_SCHEMES = Object.freeze([
  'javascript:', 'data:', 'vbscript:', 'blob:', 'file:', 'about:'
]);

/** Schemas explicitement acceptes pour une URL destinee a etre ouverte. */
export const ALLOWED_URL_SCHEMES = Object.freeze(['http:', 'https:', 'ftp:', 'ftps:']);

export class EntryValidationError extends Error {
  constructor(code, field, message) {
    super(message);
    this.name = 'EntryValidationError';
    this.code = code;
    this.field = field;
  }
}

function fail(code, field, message) {
  throw new EntryValidationError(code, field, message);
}

/** Normalise les espaces : bords supprimes, suites internes reduites a une. */
export function normalizeWhitespace(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Normalisation DEFENSIVE d'une URL d'entree.
 *
 * Regles :
 * - une valeur vide est acceptee et rend une chaine vide (URL facultative) ;
 * - les schemas dangereux sont refuses, meme deguises par des espaces, des
 *   retours ligne ou une casse melangee (`JaVaScRiPt:`) ;
 * - une valeur SANS schema n'est jamais transformee d'office en URL active :
 *   elle n'est prefixee par `https://` que si elle ressemble reellement a un
 *   nom d'hote (au moins un point, pas d'espace, pas de deux-points) ;
 * - toute autre valeur ambigue est refusee plutot que devinee.
 *
 * @param {unknown} rawValue
 * @returns {string} URL normalisee, ou chaine vide
 * @throws {EntryValidationError}
 */
export function normalizeEntryUrl(rawValue) {
  if (rawValue === null || rawValue === undefined) return '';

  // Les caracteres de controle servent a masquer un schema interdit
  // (`java\nscript:`). Ils sont retires avant toute analyse.
  //
  // Filtrage par point de code plutot que par expression reguliere : une
  // classe de caracteres de controle litterale declenche `no-control-regex`,
  // et ce filtre est plus lisible.
  const cleaned = Array.from(String(rawValue))
    .filter((character) => {
      const code = character.codePointAt(0);
      if (code <= 0x1f || code === 0x7f) return false;      // controles C0 et DEL
      if (code >= 0x200b && code <= 0x200d) return false;   // espaces de largeur nulle
      if (code === 0xfeff) return false;                    // BOM
      return true;
    })
    .join('')
    .trim();
  if (cleaned.length === 0) return '';

  if (cleaned.length > ENTRY_LIMITS.url) {
    fail('field_too_long', 'url', `L'URL depasse ${ENTRY_LIMITS.url} caracteres.`);
  }

  const lowered = cleaned.toLowerCase();
  for (const scheme of FORBIDDEN_URL_SCHEMES) {
    if (lowered.startsWith(scheme)) {
      fail('forbidden_scheme', 'url', `Le schema ${scheme} n'est pas autorise dans une URL.`);
    }
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(cleaned);

  if (!hasScheme) {
    // Pas de schema : on n'active la valeur que si elle ressemble reellement
    // a un nom d'hote. Analyse LINEAIRE, sans quantificateur imbrique : une
    // expression du type `^[^\s:/?#]+\.[^\s:/?#]{2,}(...)?$` est vulnerable
    // au retour arriere exponentiel sur une saisie hostile.
    const hostPart = cleaned.split('/')[0].split('?')[0].split('#')[0];
    const labels = hostPart.split('.');
    const looksLikeHost = hostPart.length > 0
      && labels.length >= 2
      && !/[\s:]/.test(hostPart)
      && /^[a-z0-9.-]+$/i.test(hostPart)
      && labels.every((label) => label.length > 0)
      && labels[labels.length - 1].length >= 2;

    if (!looksLikeHost) {
      fail('invalid_url', 'url', "L'URL est ambigue : indiquez une adresse complete (https://...).");
    }
    return normalizeEntryUrl(`https://${cleaned}`);
  }

  let parsed;
  try {
    parsed = new URL(cleaned);
  } catch {
    fail('invalid_url', 'url', "L'URL est invalide.");
  }

  // Double controle apres analyse : `new URL` resout certains encodages.
  if (FORBIDDEN_URL_SCHEMES.includes(parsed.protocol.toLowerCase())) {
    fail('forbidden_scheme', 'url', `Le schema ${parsed.protocol} n'est pas autorise dans une URL.`);
  }

  if (!ALLOWED_URL_SCHEMES.includes(parsed.protocol.toLowerCase())) {
    fail('unsupported_scheme', 'url', `Le schema ${parsed.protocol} n'est pas pris en charge.`);
  }

  if (!parsed.hostname) {
    fail('invalid_url', 'url', "L'URL ne comporte pas de nom d'hote.");
  }

  return parsed.toString();
}

/** Normalise une categorie : alias du markup, repli documente sur `other`. */
export function normalizeCategory(rawValue) {
  if (rawValue === null || rawValue === undefined) return '';
  const value = String(rawValue).trim().toLowerCase();
  if (value.length === 0) return '';

  if (value.length > ENTRY_LIMITS.category) {
    fail('field_too_long', 'category', 'La categorie est trop longue.');
  }

  if (!Object.prototype.hasOwnProperty.call(CATEGORY_ALIASES, value)) {
    fail('unknown_category', 'category', 'Categorie inconnue.');
  }

  return Object.entries(CATEGORY_ALIASES).find(([key]) => key === value)[1];
}

/**
 * Normalise une liste d'etiquettes : espaces reduits, minuscules, doublons
 * supprimes, limites de nombre et de longueur appliquees.
 */
export function normalizeTags(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return [];

  const items = Array.isArray(rawValue)
    ? rawValue
    : String(rawValue).split(',');

  const seen = new Set();
  const tags = [];

  for (const item of items) {
    const tag = normalizeWhitespace(String(item)).toLowerCase();
    if (tag.length === 0) continue;

    if (tag.length > ENTRY_LIMITS.tagLength) {
      fail('field_too_long', 'tags', `Une etiquette depasse ${ENTRY_LIMITS.tagLength} caracteres.`);
    }

    if (seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);

    if (tags.length > ENTRY_LIMITS.tagCount) {
      fail('too_many_tags', 'tags', `Plus de ${ENTRY_LIMITS.tagCount} etiquettes.`);
    }
  }

  return tags;
}

function assertMaxLength(value, field, max) {
  if (value.length > max) {
    fail('field_too_long', field, `Le champ ${field} depasse ${max} caracteres.`);
  }
}

/**
 * Valide et normalise une saisie d'entree, pour l'ajout comme pour la
 * modification.
 *
 * Regles retenues, alignees sur le modele existant :
 * - le TITRE est obligatoire : `renderVaultEntries` et la confirmation de
 *   suppression s'appuient dessus pour identifier l'entree sans exposer de
 *   secret ;
 * - le MOT DE PASSE est obligatoire pour une entree de type mot de passe ;
 * - le nom d'utilisateur, l'URL, la categorie, les notes et les etiquettes
 *   sont facultatifs.
 *
 * @param {object} input saisie brute
 * @param {{partial?: boolean}} [options] `partial` n'exige pas les champs
 *        obligatoires absents (modification champ par champ)
 * @returns {object} charge utile normalisee, prete a etre chiffree
 */
export function validateEntryInput(input, options = {}) {
  const { partial = false } = options;

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('invalid_input', 'entry', 'Saisie invalide.');
  }

  const result = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);

  // --- titre -------------------------------------------------------------
  if (has('title') || !partial) {
    const title = normalizeWhitespace(input.title);
    if (title.length === 0) {
      fail('required', 'title', 'Le nom du service est obligatoire.');
    }
    assertMaxLength(title, 'title', ENTRY_LIMITS.title);
    result.title = title;
  }

  // --- nom d'utilisateur -------------------------------------------------
  if (has('username')) {
    const username = normalizeWhitespace(input.username);
    assertMaxLength(username, 'username', ENTRY_LIMITS.username);
    result.username = username;
  }

  // --- mot de passe ------------------------------------------------------
  // Jamais normalise : les espaces peuvent etre significatifs. Jamais
  // journalise, jamais insere dans un message d'erreur.
  if (has('password') || !partial) {
    const password = typeof input.password === 'string' ? input.password : '';
    if (password.length === 0) {
      fail('required', 'password', 'Le mot de passe est obligatoire.');
    }
    assertMaxLength(password, 'password', ENTRY_LIMITS.password);
    result.password = password;
  }

  // --- URL, categorie, notes, etiquettes ---------------------------------
  if (has('url')) result.url = normalizeEntryUrl(input.url);
  if (has('category')) result.category = normalizeCategory(input.category);

  if (has('notes')) {
    const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
    assertMaxLength(notes, 'notes', ENTRY_LIMITS.notes);
    result.notes = notes;
  }

  if (has('tags')) result.tags = normalizeTags(input.tags);

  return result;
}

export default {
  validateEntryInput,
  normalizeEntryUrl,
  normalizeCategory,
  normalizeTags,
  normalizeWhitespace,
  ENTRY_LIMITS,
  KNOWN_CATEGORIES,
  EntryValidationError
};
