/**
 * CryptoKeep - Preferences d'affichage non sensibles (Lot 3).
 *
 * SEULES trois valeurs sont persistees, et chacune est justifiee :
 *
 *  - `category` : une valeur choisie dans une liste FERMEE et connue a
 *    l'avance (`bank`, `email`, ...). Elle ne provient jamais d'une saisie
 *    libre et ne peut donc contenir aucune donnee de coffre.
 *  - `sortMode` : une valeur d'une liste fermee (`title-asc`, `recent`).
 *  - `sortDirection` : `asc` ou `desc`.
 *
 * Le TERME DE RECHERCHE n'est JAMAIS persiste. C'est une saisie libre :
 * l'utilisateur peut y coller un identifiant, une URL privee, un fragment de
 * note, voire un mot de passe. Le conserver reviendrait a ecrire du plaintext
 * de coffre dans `localStorage`, ce que le modele de menace interdit.
 *
 * Toute valeur inconnue est ignoree a la lecture comme a l'ecriture : une
 * cle `localStorage` alteree ne peut pas injecter de valeur arbitraire dans
 * l'interface.
 */

export const VIEW_PREFERENCES_KEY = 'cryptokeep.view-preferences.v1';

/** Listes fermees. Toute valeur hors liste est refusee. */
export const ALLOWED_CATEGORIES = Object.freeze([
  'all', 'bank', 'email', 'cloud', 'social', 'shopping', 'entertainment', 'work', 'other'
]);
export const ALLOWED_SORT_MODES = Object.freeze(['title-asc', 'recent']);
export const ALLOWED_SORT_DIRECTIONS = Object.freeze(['asc', 'desc']);

export const DEFAULT_VIEW_PREFERENCES = Object.freeze({
  category: 'all',
  sortMode: 'title-asc',
  sortDirection: 'asc'
});

/**
 * Champs dont la persistance est explicitement INTERDITE.
 * Sert de garde-fou lisible et testable.
 */
export const FORBIDDEN_PREFERENCE_FIELDS = Object.freeze([
  'query', 'search', 'password', 'username', 'url', 'notes', 'tags', 'title'
]);

function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

/** Ne conserve que les trois champs autorises, avec des valeurs de la liste. */
export function sanitizeViewPreferences(candidate) {
  const result = { ...DEFAULT_VIEW_PREFERENCES };
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return result;

  const category = candidate.category;
  if (typeof category === 'string' && ALLOWED_CATEGORIES.includes(category)) {
    result.category = category;
  }

  const sortMode = candidate.sortMode;
  if (typeof sortMode === 'string' && ALLOWED_SORT_MODES.includes(sortMode)) {
    result.sortMode = sortMode;
  }

  const sortDirection = candidate.sortDirection;
  if (typeof sortDirection === 'string' && ALLOWED_SORT_DIRECTIONS.includes(sortDirection)) {
    result.sortDirection = sortDirection;
  }

  return result;
}

/** Lit les preferences. Toute valeur illisible retombe sur les defauts. */
export function readViewPreferences(options = {}) {
  const storage = resolveStorage(options.storage);
  if (!storage) return { ...DEFAULT_VIEW_PREFERENCES };

  try {
    const raw = storage.getItem(VIEW_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_VIEW_PREFERENCES };
    return sanitizeViewPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_VIEW_PREFERENCES };
  }
}

/**
 * Ecrit les preferences apres filtrage.
 *
 * Le filtrage est applique a l'ECRITURE et non seulement a la lecture : un
 * appelant qui transmettrait par erreur un terme de recherche ne peut pas
 * le faire persister.
 *
 * @returns {{written: boolean, stored: object}}
 */
export function writeViewPreferences(preferences, options = {}) {
  const storage = resolveStorage(options.storage);
  const stored = sanitizeViewPreferences(preferences);

  if (!storage) return { written: false, stored };

  try {
    storage.setItem(VIEW_PREFERENCES_KEY, JSON.stringify(stored));
    return { written: true, stored };
  } catch {
    // Quota ou stockage indisponible : une preference d'affichage perdue
    // n'a aucune consequence sur le coffre.
    return { written: false, stored };
  }
}

export default {
  readViewPreferences,
  writeViewPreferences,
  sanitizeViewPreferences,
  VIEW_PREFERENCES_KEY,
  DEFAULT_VIEW_PREFERENCES
};
