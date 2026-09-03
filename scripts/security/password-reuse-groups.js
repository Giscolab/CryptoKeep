/**
 * MODULE HISTORIQUE - conserve pour compatibilite, NON DECISIONNEL.
 *
 * DEFAUT AUDITE (Lot 5). Le regroupement s'appuie sur un condensat maison de
 * 32 bits, `hash = (hash << 5) - hash + code`, puis sur `Math.abs`. Deux mots
 * de passe DIFFERENTS peuvent donc atterrir dans le meme groupe et etre
 * declares reutilises a tort. Collisions reproductibles :
 *
 *   'Aa'   et 'BB'   -> local_0000000000000840
 *   'AaAa' et 'BBBB' -> local_00000000001f0080
 *   'Ca'   et 'DB'   -> local_000000000000087e
 *
 * L'implementation qui DECIDE est desormais scripts/security/password-reuse.js :
 * elle compare les chaines exactement, n'utilise un condensat que comme cle
 * de regroupement — et confirme ensuite l'egalite exacte —, ne persiste rien,
 * ne journalise rien, et s'efface au verrouillage.
 *
 * Ce fichier reste en place, exporte et teste, pour ne casser aucun appelant
 * externe et pour documenter le defaut. Il ne doit plus etre branche sur une
 * decision de securite.
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
