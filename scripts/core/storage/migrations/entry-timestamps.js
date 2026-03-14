/**
 * Migration et normalisation des timestamps d'entrées (snake_case).
 */

function toIsoDate(value, fallbackIso) {
  if (!value) return fallbackIso;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? fallbackIso : new Date(ms).toISOString();
  }
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  return fallbackIso;
}

export function normalizeEntryTimestamps(entry, vaultMeta = {}) {
  if (!entry || typeof entry !== 'object') return entry;

  const nowIso = new Date().toISOString();
  const vaultCreated = toIsoDate(vaultMeta.created_at, nowIso);

  const created = toIsoDate(entry.created_at || entry.createdAt, vaultCreated);
  const modified = toIsoDate(
    entry.last_modified || entry.updatedAt || entry.lastModified,
    created
  );

  entry.created_at = created;
  entry.last_modified = modified;

  return entry;
}

export function migrateEntryTimestamps(entries = [], vaultMeta = {}) {
  let modified = false;

  for (const entry of entries) {
    const before = `${entry?.created_at ?? ''}|${entry?.last_modified ?? ''}`;
    normalizeEntryTimestamps(entry, vaultMeta);
    const after = `${entry?.created_at ?? ''}|${entry?.last_modified ?? ''}`;
    if (before !== after) modified = true;
  }

  return modified;
}

export function touchEntryModified(entry) {
  if (!entry || typeof entry !== 'object') return;
  entry.last_modified = new Date().toISOString();
}
