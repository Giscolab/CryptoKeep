const CATEGORY_RULES = {
  bank: ['bank', 'banque', 'iban', 'swift'],
  email: ['email', 'mail', 'gmail', 'outlook', 'yahoo'],
  cloud: ['cloud', 'drive', 'dropbox', 'onedrive', 'icloud'],
  social: ['social', 'facebook', 'instagram', 'x', 'twitter', 'linkedin', 'tiktok']
};

function normalizeText(value = '') {
  return String(value).trim().toLowerCase();
}

function inferCategory(entry = {}) {
  const haystack = normalizeText(`${entry.title || ''} ${entry.username || ''} ${entry.url || ''}`);

  for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
    if (keywords.some(keyword => haystack.includes(keyword))) {
      return category;
    }
  }

  return 'other';
}

function filterEntries(entries = [], filters = {}) {
  const query = normalizeText(filters.query);
  const category = normalizeText(filters.category || 'all');

  return entries.filter((entry) => {
    const matchesQuery = !query || [entry.title, entry.username, entry.url]
      .filter(Boolean)
      .some(field => normalizeText(field).includes(query));

    const matchesCategory = category === 'all' || inferCategory(entry) === category;

    return matchesQuery && matchesCategory;
  });
}

function sortEntries(entries = [], sortMode = 'title-asc') {
  const cloned = [...entries];

  if (sortMode === 'recent') {
    return cloned.sort((a, b) => (b.updatedAt || b.lastAccessed || 0) - (a.updatedAt || a.lastAccessed || 0));
  }

  return cloned.sort((a, b) => normalizeText(a.title).localeCompare(normalizeText(b.title), 'fr'));
}

export {
  inferCategory,
  filterEntries,
  sortEntries
};
