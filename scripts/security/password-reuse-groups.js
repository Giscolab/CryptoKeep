/**
 * Détection et groupement des mots de passe réutilisés.
 */

/**
 * Groupe les entrées par hash de mot de passe (réutilisations).
 * @param {Array} entries
 * @returns {Array}
 */
export function groupPasswordReuse(entries = []) {
  const hashMap = new Map();

  entries.forEach((entry) => {
    if (!entry?.password) return;

    const hash = hashPasswordForComparison(entry.password);
    if (!hashMap.has(hash)) {
      hashMap.set(hash, {
        hashId: hash.substring(0, 16),
        entries: [],
        riskLevel: 'elevated',
        commonPassword: null
      });
    }

    hashMap.get(hash).entries.push({
      id: entry.id,
      title: entry.title,
      url: entry.url,
      username: entry.username,
      created_at: entry.created_at,
      last_modified: entry.last_modified
    });
  });

  return Array.from(hashMap.values())
    .filter((group) => group.entries.length > 1)
    .map((group) => ({
      ...group,
      severity: group.entries.length > 3 ? 'critical' : 'high',
      description: `Mot de passe réutilisé sur ${group.entries.length} comptes`,
      actionRequired: 'manual_resolution'
    }))
    .sort((a, b) => b.entries.length - a.entries.length);
}

function hashPasswordForComparison(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }

  return `local_${Math.abs(hash).toString(16).padStart(16, '0')}`;
}

/**
 * Retrouve toutes les entrées concernées par un groupe de réutilisation.
 * @param {string} groupId
 * @param {Array} allEntries
 * @returns {Array}
 */
export function getReuseGroupEntries(groupId, allEntries = []) {
  const groups = groupPasswordReuse(allEntries);
  const group = groups.find((item) => item.hashId === groupId);
  if (!group) return [];

  return allEntries.filter((entry) => group.entries.some((groupEntry) => groupEntry.id === entry.id));
}
