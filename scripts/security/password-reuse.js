/**
 * CryptoKeep - Detection sure des mots de passe reutilises (Lot 5).
 *
 * DEFAUT DE L'IMPLEMENTATION HISTORIQUE
 * `password-reuse-groups.js` regroupe les entrees par un condensat maison
 * de 32 bits (`hash = (hash << 5) - hash + code`), puis prend `Math.abs`.
 * Deux mots de passe DIFFERENTS peuvent donc tomber dans le meme groupe et
 * etre declares reutilises alors qu'ils ne le sont pas. La collision est
 * triviale a exhiber :
 *
 *   'Aa'   -> local_0000000000000840
 *   'BB'   -> local_0000000000000840
 *
 * et elle se propage : 'AaAa' et 'BBBB' collisionnent aussi. Un utilisateur
 * pouvait donc voir « mot de passe reutilise sur 2 comptes » pour deux
 * secrets distincts, et changer un mot de passe sans raison.
 *
 * CE MODULE compare les chaines EXACTEMENT. Le condensat n'est utilise que
 * comme cle de regroupement pour eviter une comparaison quadratique ; a
 * l'interieur de chaque seau, l'egalite EXACTE des chaines est verifiee
 * avant qu'une reutilisation soit declaree. Un condensat, seul, ne decide
 * jamais.
 *
 * CE QU'IL NE FAIT PAS
 * - Aucune persistance : ni localStorage, ni sessionStorage, ni IndexedDB,
 *   ni cookie. Les groupes vivent dans une Map de module, effacee au
 *   verrouillage par `clearReuseAnalysis()`.
 * - Aucune journalisation : aucun mot de passe, aucun condensat, aucun
 *   fragment ne passe par `console`.
 * - Aucun condensat artisanal : quand un condensat est calcule, c'est
 *   SHA-256 via Web Crypto.
 * - Aucun identifiant de groupe derive du mot de passe. Les identifiants
 *   sont tires de `crypto.getRandomValues` et changent a chaque analyse :
 *   un identifiant qui fuiterait ne dirait rien du secret.
 *
 * PREREQUIS
 * L'analyse porte sur les entrees DEJA DECHIFFREES de la session. Elle n'a
 * de sens que coffre deverrouille, et ses resultats doivent disparaitre au
 * verrouillage.
 */

/** Groupes de la derniere analyse. Vidée par `clearReuseAnalysis()`. */
let currentGroups = [];

/** Identifiant de groupe aleatoire, sans aucun lien avec le mot de passe. */
function randomGroupId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `reuse_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Condensat SHA-256 hexadecimal. Jamais artisanal, jamais journalise. */
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Vue NON SECRETE d'une entree. Ne contient jamais le mot de passe. */
function describeEntry(entry) {
  return {
    id: entry.id,
    title: entry.title,
    url: entry.url,
    username: entry.username,
    created_at: entry.created_at,
    last_modified: entry.last_modified
  };
}

function severityFor(count) {
  return count > 3 ? 'critical' : 'high';
}

/**
 * Construit les groupes de reutilisation par comparaison EXACTE des chaines.
 *
 * Version synchrone, sans aucun condensat : la reference de correction.
 * `Map` compare ses cles par egalite stricte de chaines, donc deux mots de
 * passe distincts ne peuvent pas partager un seau.
 *
 * @param {Array} entries entrees dechiffrees de la session
 * @returns {Array} groupes, sans aucun mot de passe
 */
export function findReuseGroupsExact(entries = []) {
  const seaux = new Map();

  for (const entry of entries) {
    if (!entry || typeof entry.password !== 'string' || entry.password.length === 0) continue;
    const existant = seaux.get(entry.password);
    if (existant) existant.push(entry);
    else seaux.set(entry.password, [entry]);
  }

  const groupes = [];
  for (const membres of seaux.values()) {
    if (membres.length < 2) continue;
    const groupId = randomGroupId();
    groupes.push({
      groupId,
      hashId: groupId,
      entries: membres.map(describeEntry),
      count: membres.length,
      severity: severityFor(membres.length),
      description: `Mot de passe reutilise sur ${membres.length} comptes`,
      verifiedExact: true
    });
  }

  // La Map des seaux sort de portee ici : aucune reference aux mots de passe
  // n'est conservee par ce module.
  seaux.clear();

  return groupes.sort((a, b) => b.count - a.count);
}

/**
 * Meme resultat, en passant par un condensat SHA-256 comme cle de seau.
 *
 * Un condensat ne DECIDE jamais : a l'interieur de chaque seau, les chaines
 * sont comparees exactement, et un seau qui contiendrait deux secrets
 * differents — ce que SHA-256 rend indistinguable d'une collision reelle en
 * pratique, mais que le code ne SUPPOSE pas — se scinde en sous-groupes.
 *
 * Le condensat est INJECTABLE (`options.digest`) afin que les tests puissent
 * en fournir un volontairement collisionnant et verifier que la confirmation
 * d'egalite exacte fait bien son travail. En production, c'est SHA-256.
 *
 * @param {Array} entries entrees dechiffrees de la session
 * @param {{digest?: Function}} [options]
 * @returns {Promise<Array>} groupes, sans aucun mot de passe
 */
export async function findReuseGroups(entries = [], options = {}) {
  const digestOf = typeof options.digest === 'function' ? options.digest : sha256Hex;
  const seaux = new Map();

  for (const entry of entries) {
    if (!entry || typeof entry.password !== 'string' || entry.password.length === 0) continue;
    const digest = await digestOf(entry.password);
    const existant = seaux.get(digest);
    if (existant) existant.push(entry);
    else seaux.set(digest, [entry]);
  }

  const groupes = [];
  for (const membres of seaux.values()) {
    // CONFIRMATION D'EGALITE EXACTE. Le condensat a seulement rapproche des
    // candidats ; c'est cette comparaison qui declare la reutilisation.
    const parValeur = new Map();
    for (const membre of membres) {
      const existant = parValeur.get(membre.password);
      if (existant) existant.push(membre);
      else parValeur.set(membre.password, [membre]);
    }

    for (const identiques of parValeur.values()) {
      if (identiques.length < 2) continue;
      const groupId = randomGroupId();
      groupes.push({
        groupId,
        // Alias de COMPATIBILITE pour scripts/ui/security-dashboard.js, qui
        // lisait `hashId`. La valeur n'est plus un condensat : c'est un
        // identifiant aleatoire, sans aucun lien avec le mot de passe.
        hashId: groupId,
        entries: identiques.map(describeEntry),
        count: identiques.length,
        severity: severityFor(identiques.length),
        description: `Mot de passe reutilise sur ${identiques.length} comptes`,
        verifiedExact: true
      });
    }
    parValeur.clear();
  }

  seaux.clear();
  return groupes.sort((a, b) => b.count - a.count);
}

/**
 * Analyse la session et RETIENT les groupes, pour que l'interface puisse
 * retrouver les entrees d'un groupe par son identifiant.
 *
 * Seules des donnees NON SECRETES sont retenues : identifiants d'entree,
 * titres, URL, noms d'utilisateur. Jamais un mot de passe, jamais un
 * condensat.
 */
export async function analyzeReuse(entries = []) {
  currentGroups = await findReuseGroups(entries);
  return currentGroups;
}

/** Groupes de la derniere analyse. Tableau vide apres verrouillage. */
export function getReuseGroups() {
  return currentGroups;
}

/**
 * Entrees COMPLETES d'un groupe, retrouvees dans la liste de session.
 *
 * Les mots de passe ne viennent pas des groupes retenus — qui n'en
 * contiennent pas — mais de la liste passee en argument, qui n'existe que
 * coffre deverrouille.
 */
export function getReuseGroupEntries(groupId, allEntries = []) {
  const groupe = currentGroups.find((item) => item.groupId === groupId);
  if (!groupe) return [];

  const identifiants = new Set(groupe.entries.map((item) => item.id));
  return allEntries.filter((entry) => identifiants.has(entry.id));
}

/**
 * Efface les groupes retenus. A APPELER AU VERROUILLAGE.
 *
 * @returns {{cleared: number}} nombre de groupes effaces, verifiable
 */
export function clearReuseAnalysis() {
  const cleared = currentGroups.length;
  currentGroups = [];
  return { cleared };
}

export default {
  findReuseGroups,
  findReuseGroupsExact,
  analyzeReuse,
  getReuseGroups,
  getReuseGroupEntries,
  clearReuseAnalysis
};
