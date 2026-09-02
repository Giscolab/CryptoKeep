/**
 * CryptoKeep - Pipeline recherche / categorie / tri (Lot 3).
 *
 * Source UNIQUE de la logique de presentation des entrees. Le tableau de
 * bord et la vue des mots de passe utilisent desormais le meme pipeline :
 *
 *   entrees de session -> recherche -> filtre categorie -> tri -> rendu
 *
 * Les exports historiques `inferCategory`, `filterEntries` et `sortEntries`
 * sont CONSERVES avec leur comportement observable, et restent couverts par
 * tests/vault-filters.spec.js.
 *
 * La recherche s'effectue exclusivement sur les entrees DEJA DECHIFFREES de
 * la session. Aucun index de recherche nest construit ni persiste : cela
 * reviendrait a stocker des secrets en clair pour gagner du temps.
 */
const CATEGORY_RULES = {
  bank: ['bank', 'banque', 'iban', 'swift'],
  email: ['email', 'mail', 'gmail', 'outlook', 'yahoo'],
  cloud: ['cloud', 'drive', 'dropbox', 'onedrive', 'icloud'],
  social: ['social', 'facebook', 'instagram', 'x', 'twitter', 'linkedin', 'tiktok']
};

/**
 * Normalisation Unicode pour la comparaison textuelle.
 *
 * Decomposition canonique NFD puis suppression des marques diacritiques
 * (categorie Unicode Mn). « Café » et « CAFE » se comparent donc egaux, de
 * meme que « École » et « ecole ». On n'utilise aucune table ASCII : la
 * methode reste correcte pour le grec, le cyrillique ou le vietnamien.
 *
 * `toLowerCase()` est applique APRES la decomposition, sur le resultat
 * depouille de ses accents.
 */
function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .trim()
    .toLowerCase();
}

/** Alias public de la normalisation de recherche. */
function normalizeSearchText(value = '') {
  return normalizeText(value);
}

/** Categorie de repli documentee, utilisee quand rien ne permet de decider. */
const FALLBACK_CATEGORY = 'other';

/** Categories acceptees comme valeur persistee. */
const PERSISTED_CATEGORIES = ['bank', 'email', 'cloud', 'social', 'shopping', 'entertainment', 'work', 'other'];

/**
 * Categorie EFFECTIVE d'une entree, dans cet ordre :
 *
 *   1. categorie persistee valide dans l'entree ;
 *   2. sinon, inference historique sur le titre / identifiant / URL ;
 *   3. sinon, repli documente `other`.
 *
 * L'inference n'est qu'un REPLI d'affichage : elle ne doit jamais etre
 * reecrite dans l'entree, sous peine de modifier des anciennes entrees a
 * leur simple affichage.
 */
function resolveCategory(entry = {}) {
  const persisted = typeof entry.category === 'string' ? entry.category.trim().toLowerCase() : '';
  if (persisted.length > 0 && PERSISTED_CATEGORIES.includes(persisted)) {
    return persisted;
  }
  return inferCategory(entry);
}

/** Une entree porte-t-elle une categorie explicitement persistee ? */
function hasPersistedCategory(entry = {}) {
  const persisted = typeof entry.category === 'string' ? entry.category.trim().toLowerCase() : '';
  return persisted.length > 0 && PERSISTED_CATEGORIES.includes(persisted);
}

function inferCategory(entry = {}) {  const haystack = normalizeText(`${entry.title || ''} ${entry.username || ''} ${entry.url || ''}`);

  for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
    if (keywords.some(keyword => haystack.includes(keyword))) {
      return category;
    }
  }

  return FALLBACK_CATEGORY;
}

/**
 * Champs recherchables.
 *
 * Le MOT DE PASSE et les NOTES en sont volontairement exclus : taper une
 * chaine et voir une entree apparaitre revelerait le contenu du champ.
 * Titre, identifiant, URL, categorie et etiquettes suffisent a retrouver
 * une entree.
 */
const SEARCHABLE_FIELDS = ['title', 'username', 'url', 'category'];

function entryHaystack(entry) {
  const parts = [];
  for (const field of SEARCHABLE_FIELDS) {
    const value = Object.getOwnPropertyDescriptor(entry, field)?.value;
    if (typeof value === 'string' && value.length > 0) parts.push(value);
  }
  if (Array.isArray(entry.tags)) {
    for (const tag of entry.tags) if (typeof tag === 'string') parts.push(tag);
  }
  return normalizeText(parts.join(' '));
}

function filterEntries(entries = [], filters = {}) {
  const query = normalizeText(filters.query);
  const category = normalizeText(filters.category || 'all');

  return entries.filter((entry) => {
    const matchesQuery = !query || entryHaystack(entry).includes(query);
    const matchesCategory = category === 'all' || resolveCategory(entry) === category;
    return matchesQuery && matchesCategory;
  });
}

/**
 * Comparateur Unicode. `Intl.Collator` gere correctement accents, casse et
 * alphabets non latins, la ou `localeCompare` sur une chaine deja depouillee
 * de ses accents perdait de l'information.
 */
const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

/** Horodatage de derniere modification, quel que soit le nom du champ. */
function modifiedAt(entry) {
  const raw = entry.last_modified ?? entry.updatedAt ?? entry.lastModified ?? null;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return typeof entry.lastAccessed === 'number' ? entry.lastAccessed : 0;
}

/**
 * Tri STABLE.
 *
 * `Array.prototype.sort` est stable depuis ES2019, mais la stabilite du
 * resultat ne suffit pas ici : deux entrees egales selon la cle principale
 * doivent garder un ordre DETERMINISTE d'un rendu a l'autre, meme si la
 * liste source arrive dans un ordre different. Une cle secondaire explicite
 * est donc appliquee : titre, puis identifiant.
 *
 * Les valeurs absentes sont traitees comme des chaines vides et se placent
 * en tete du tri alphabetique, sans jamais provoquer d'erreur.
 */
function sortEntries(entries = [], sortMode = 'title-asc') {
  const decorated = entries.map((entry, index) => ({ entry, index }));

  const byId = (a, b) => {
    const idA = typeof a.entry.id === 'string' ? a.entry.id : '';
    const idB = typeof b.entry.id === 'string' ? b.entry.id : '';
    if (idA !== idB) return idA < idB ? -1 : 1;
    return a.index - b.index;
  };

  if (sortMode === 'recent') {
    decorated.sort((a, b) => {
      const diff = modifiedAt(b.entry) - modifiedAt(a.entry);
      if (diff !== 0) return diff;
      const titleDiff = collator.compare(a.entry.title ?? '', b.entry.title ?? '');
      if (titleDiff !== 0) return titleDiff;
      return byId(a, b);
    });
    return decorated.map((item) => item.entry);
  }

  decorated.sort((a, b) => {
    const titleDiff = collator.compare(a.entry.title ?? '', b.entry.title ?? '');
    if (titleDiff !== 0) return titleDiff;
    return byId(a, b);
  });
  return decorated.map((item) => item.entry);
}

/**
 * Pipeline complet, partage par toutes les vues qui presentent les memes
 * donnees. Recherche, filtre et tri ne sont pas trois systemes independants.
 *
 * @param {Array} entries entrees dechiffrees de la session
 * @param {{query?: string, category?: string, sortMode?: string}} view
 * @returns {Array} entrees visibles, dans leur ordre final
 */
function buildVisibleEntries(entries = [], view = {}) {
  const filtered = filterEntries(entries, {
    query: view.query || '',
    category: view.category || 'all'
  });
  return sortEntries(filtered, view.sortMode || 'title-asc');
}

export {
  inferCategory,
  resolveCategory,
  hasPersistedCategory,
  filterEntries,
  sortEntries,
  buildVisibleEntries,
  normalizeSearchText,
  SEARCHABLE_FIELDS,
  FALLBACK_CATEGORY,
  PERSISTED_CATEGORIES
};
