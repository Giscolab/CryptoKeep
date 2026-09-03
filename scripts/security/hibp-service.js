/**
 * CryptoKeep - Verification de compromission HIBP (k-anonymity), OPTIONNELLE.
 *
 * ETAT AVANT LE LOT 5, ET DEFAUTS CORRIGES
 *
 * 1. UN ECHEC ETAIT PRESENTE COMME UN SUCCES. Hors ligne, desactive, ou en
 *    cas d'erreur reseau, la fonction renvoyait `{ pwned: false }` — la meme
 *    valeur que « ce mot de passe n'a pas fuite ». Une absence de reponse
 *    etait donc affichable comme un resultat rassurant. Un controle qui n'a
 *    analyse aucune donnee ne doit jamais afficher de resultat positif.
 *    Le champ `checked` distingue desormais explicitement les deux cas.
 *
 * 2. AUCUN DELAI, AUCUNE ANNULATION. Un `fetch` sans `AbortController`
 *    pouvait rester pendant indefiniment et bloquer un audit complet.
 *
 * 3. LE CACHE ETAIT INDEXE PAR LE SHA-1 COMPLET DU MOT DE PASSE. Ce condensat
 *    identifie le secret. Le cache est desormais indexe par le PREFIXE de
 *    5 caracteres et conserve la reponse de la plage, ce qui est a la fois
 *    moins sensible et plus utile : un prefixe sert a des milliers de mots
 *    de passe.
 *
 * 4. AUCUN CONSENTEMENT EXPLICITE. Un simple drapeau `localStorage` suffisait.
 *    L'activation exige desormais un consentement enregistre avec sa date et
 *    la version du texte explicatif accepte.
 *
 * MODELE K-ANONYMITY, EN CLAIR
 * Le mot de passe n'est JAMAIS envoye. Son SHA-1 est calcule localement ;
 * seuls les 5 PREMIERS caracteres hexadecimaux de ce condensat quittent la
 * machine. Le serveur renvoie les quelque 400 a 800 suffixes commencant par
 * ce prefixe, et la comparaison finale se fait localement. Le serveur ne
 * peut donc pas savoir lequel de ces suffixes vous interesse.
 *
 * CE QUE CELA N'EFFACE PAS, ET QU'IL FAUT DIRE
 * Une requete reseau reste une requete reseau : le serveur voit votre adresse
 * IP, l'horodatage, et le fait que vous consultez ce service. La fonction est
 * donc DESACTIVEE PAR DEFAUT et ne s'active que sur consentement explicite.
 *
 * CSP
 * `connect-src` n'autorise qu'un seul hote, `https://api.pwnedpasswords.com`,
 * et rien d'autre. Cette autorisation est STATIQUE : elle figure dans la page
 * meme lorsque la fonction est desactivee. Ce qui decide qu'une requete part
 * n'est donc pas la CSP mais ce module, qui ne fait aucun appel sans
 * consentement enregistre.
 */

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8000;

/** Cle de consentement. Ne contient jamais de secret. */
export const HIBP_CONSENT_KEY = 'cryptokeep.hibp.consent.v1';

/** Version du texte explicatif. Un changement invalide le consentement. */
export const HIBP_NOTICE_VERSION = 1;

/**
 * Texte affiche AVANT toute activation. L'interface doit le montrer tel quel.
 */
export const HIBP_NOTICE = Object.freeze({
  version: HIBP_NOTICE_VERSION,
  title: 'Verifier les mots de passe compromis (optionnel)',
  body: [
    'Cette verification interroge le service Have I Been Pwned pour savoir si '
    + 'un mot de passe figure dans une fuite publique connue.',
    'Votre mot de passe n\'est jamais envoye. Son empreinte SHA-1 est calculee '
    + 'sur votre machine, et seuls les 5 premiers caracteres de cette empreinte '
    + 'sont transmis. Le service renvoie des centaines d\'empreintes commencant '
    + 'par ces 5 caracteres, et la comparaison finale a lieu chez vous.',
    'Le service voit toutefois votre adresse IP et le moment de la requete. '
    + 'C\'est pourquoi cette fonction est desactivee par defaut.',
    'Vous pouvez la desactiver a tout moment. Aucun resultat n\'est conserve '
    + 'sur le disque : le cache vit en memoire et disparait au verrouillage.'
  ],
  endpoint: HIBP_RANGE_URL
});

/**
 * Cache EN MEMOIRE UNIQUEMENT, indexe par prefixe.
 * Jamais ecrit sur disque. Vide par `clearHibpCache()`.
 */
const rangeCache = new Map();

function storage(ref) {
  if (ref) return ref;
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

// ===========================================================================
// Consentement
// ===========================================================================

/**
 * Etat du consentement.
 *
 * DESACTIVE PAR DEFAUT : toute valeur absente, illisible, malformee ou
 * portant une version de notice perimee vaut refus.
 */
export function getHibpConsent(options = {}) {
  const store = storage(options.storage);
  if (!store) return { enabled: false, reason: 'no_storage' };

  let brut = null;
  try {
    brut = store.getItem(HIBP_CONSENT_KEY);
  } catch {
    return { enabled: false, reason: 'storage_unavailable' };
  }
  if (!brut) return { enabled: false, reason: 'not_asked' };

  let parsed;
  try {
    parsed = JSON.parse(brut);
  } catch {
    return { enabled: false, reason: 'malformed' };
  }

  if (!parsed || typeof parsed !== 'object' || parsed.accepted !== true) {
    return { enabled: false, reason: 'declined' };
  }

  if (parsed.noticeVersion !== HIBP_NOTICE_VERSION) {
    // Le texte a change : le consentement precedent ne porte pas dessus.
    return { enabled: false, reason: 'notice_changed' };
  }

  return {
    enabled: true,
    reason: 'accepted',
    acceptedAt: typeof parsed.acceptedAt === 'string' ? parsed.acceptedAt : null,
    noticeVersion: parsed.noticeVersion
  };
}

/**
 * Enregistre une decision explicite.
 *
 * `accepted` doit valoir exactement `true` pour activer : aucune valeur
 * approchante ne vaut consentement.
 */
export function setHibpConsent(accepted, options = {}) {
  const store = storage(options.storage);
  if (!store) return { written: false, enabled: false, reason: 'no_storage' };

  const payload = {
    accepted: accepted === true,
    noticeVersion: HIBP_NOTICE_VERSION,
    acceptedAt: options.now || new Date().toISOString()
  };

  try {
    store.setItem(HIBP_CONSENT_KEY, JSON.stringify(payload));
  } catch {
    return { written: false, enabled: false, reason: 'storage_unavailable' };
  }

  // Un retrait de consentement vide immediatement le cache memoire.
  if (accepted !== true) clearHibpCache();

  return { written: true, enabled: accepted === true, reason: 'recorded' };
}

/** La fonction reseau est-elle active ? */
export function isHibpEnabled(options = {}) {
  return getHibpConsent(options).enabled;
}

// ===========================================================================
// Verification
// ===========================================================================

async function sha1Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Recupere la plage d'un prefixe, avec delai et annulation.
 *
 * @returns {Promise<string>} corps de la reponse
 */
async function fetchRange(prefix, options) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: signalExterne = null,
    fetchImpl = typeof fetch === 'function' ? fetch : null
  } = options;

  if (!fetchImpl) throw new Error('fetch_unavailable');

  // Annulation DEJA demandee avant meme l'appel : on rejette ici, sans
  // dependre de l'implementation de `fetch` pour verifier `signal.aborted`.
  // Sans cette garde, une annulation survenue pendant le calcul du condensat
  // pouvait laisser la promesse pendante indefiniment.
  if (signalExterne && signalExterne.aborted) {
    const abandon = new Error('aborted');
    abandon.name = 'AbortError';
    throw abandon;
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;

  const relayer = () => { if (controller) controller.abort(); };
  if (signalExterne && typeof signalExterne.addEventListener === 'function') {
    if (signalExterne.aborted) relayer();
    else signalExterne.addEventListener('abort', relayer, { once: true });
  }

  if (controller && timeoutMs > 0) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const response = await fetchImpl(`${HIBP_RANGE_URL}${prefix}`, {
      // « Add-Padding » demande au service de renvoyer un nombre variable de
      // lignes factices : la TAILLE de la reponse cesse alors de renseigner
      // sur le nombre de fuites reelles pour ce prefixe.
      headers: { 'Add-Padding': 'true' },
      signal: controller ? controller.signal : undefined
    });

    if (!response || response.ok !== true) {
      throw new Error(`http_${response ? response.status : 'no_response'}`);
    }
    return await response.text();
  } finally {
    if (timer) clearTimeout(timer);
    if (signalExterne && typeof signalExterne.removeEventListener === 'function') {
      signalExterne.removeEventListener('abort', relayer);
    }
  }
}

/**
 * Verifie si un mot de passe figure dans une fuite connue.
 *
 * CONTRAT DU RESULTAT, ET C'EST LE POINT CENTRAL :
 *
 *   { checked: true,  pwned: true|false, count, source }
 *       une reponse a REELLEMENT ete obtenue et comparee ;
 *
 *   { checked: false, pwned: null,       reason, source }
 *       rien n'a pu etre verifie. `pwned` vaut `null`, pas `false` :
 *       l'interface ne peut donc pas presenter une absence de reponse comme
 *       une absence de fuite.
 *
 * `reason` vaut 'disabled', 'no_consent', 'offline', 'timeout', 'aborted',
 * 'network_error' ou 'skipped'.
 *
 * Aucun mot de passe, aucun condensat complet n'est journalise ni retourne.
 */
export async function isPasswordPwned(password, options = {}) {
  if (typeof password !== 'string' || password.length === 0) {
    return { checked: false, pwned: null, count: 0, reason: 'skipped', source: 'local' };
  }

  if (!isHibpEnabled(options)) {
    // Aucune requete n'est emise. Le resultat le dit, sans pretendre que le
    // mot de passe est sain.
    return { checked: false, pwned: null, count: 0, reason: 'disabled', source: 'local' };
  }

  const digest = await sha1Hex(password);
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);

  // Cache indexe par PREFIXE : il ne designe aucun mot de passe en
  // particulier, et sert a tous ceux qui partagent ce prefixe.
  const cached = rangeCache.get(prefix);
  const now = options.now ? Date.parse(options.now) : Date.now();
  let corps = null;
  let source = 'network';

  if (cached && (now - cached.timestamp) < CACHE_DURATION_MS) {
    corps = cached.body;
    source = 'cache';
  } else {
    if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
      return { checked: false, pwned: null, count: 0, reason: 'offline', source: 'local' };
    }

    try {
      corps = await fetchRange(prefix, options);
      rangeCache.set(prefix, { body: corps, timestamp: now });
    } catch (error) {
      const nom = error && error.name ? error.name : '';
      const message = error && error.message ? error.message : '';
      const reason = nom === 'AbortError'
        ? (options.signal && options.signal.aborted ? 'aborted' : 'timeout')
        : (message === 'fetch_unavailable' ? 'offline' : 'network_error');

      // Seule la CATEGORIE d'echec est journalisee : ni URL complete, ni
      // prefixe, ni condensat, ni mot de passe.
      console.warn('[HIBP] Verification indisponible :', reason);
      return { checked: false, pwned: null, count: 0, reason, source: 'local' };
    }
  }

  // Comparaison LOCALE du suffixe. Le service ne sait pas lequel nous
  // interesse : c'est tout le principe du k-anonymity.
  let count = 0;
  for (const ligne of corps.split('\n')) {
    const separateur = ligne.indexOf(':');
    if (separateur === -1) continue;
    const suffixeCandidat = ligne.slice(0, separateur).trim().toUpperCase();
    if (suffixeCandidat !== suffix) continue;
    const occurrences = Number.parseInt(ligne.slice(separateur + 1).trim(), 10);
    count = Number.isFinite(occurrences) ? occurrences : 1;
    break;
  }

  return { checked: true, pwned: count > 0, count, reason: 'ok', source };
}

/**
 * Vide le cache memoire. A APPELER AU VERROUILLAGE.
 *
 * @returns {{cleared: number}} nombre de plages effacees, verifiable
 */
export function clearHibpCache() {
  const cleared = rangeCache.size;
  rangeCache.clear();
  return { cleared };
}

/** Taille du cache. Utile aux tests et a un affichage honnete. */
export function getHibpCacheSize() {
  return rangeCache.size;
}

export default {
  isPasswordPwned,
  isHibpEnabled,
  getHibpConsent,
  setHibpConsent,
  clearHibpCache,
  getHibpCacheSize,
  HIBP_NOTICE,
  HIBP_CONSENT_KEY,
  HIBP_NOTICE_VERSION
};
