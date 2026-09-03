/**
 * CryptoKeep - Preferences d'application (Lot 7).
 *
 * CE QUI EST PERSISTE, ET CE QUI NE L'EST JAMAIS
 * Uniquement des reglages d'interface issus de LISTES FERMEES ou de bornes
 * numeriques : activation du verrouillage automatique, delai, effacement du
 * presse-papiers, delai avant tentative, longueur du generateur, alertes.
 *
 * Aucun secret, aucun mot de passe, aucun contenu de coffre, aucun terme de
 * recherche. Toute cle inconnue est ignoree, et toute valeur hors liste est
 * remplacee par le defaut — a la LECTURE comme a l'ECRITURE. Une valeur
 * fabriquee a la main dans le stockage ne peut donc pas se propager.
 *
 * Le consentement HIBP n'est PAS gere ici : il vit dans hibp-service.js, avec
 * sa propre cle et sa version de notice, parce qu'il engage une requete
 * reseau et merite un enregistrement distinct.
 */

export const APP_SETTINGS_KEY = 'cryptokeep.settings.v1';

/** Schema ferme. Toute cle absente d'ici est rejetee. */
export const SETTINGS_SCHEMA = Object.freeze({
  clipboardClearEnabled: { type: 'boolean', default: true },
  // Bornes volontairement larges mais finies. 0 n'est pas propose : un
  // effacement immediat empecherait le collage.
  clipboardClearSeconds: { type: 'enum', values: [15, 30, 60, 120, 300], default: 30 },
  generatorLength: { type: 'enum', values: [12, 16, 20, 24, 32, 48], default: 16 },
  generatorSymbols: { type: 'boolean', default: true },
  generatorDigits: { type: 'boolean', default: true },
  securityAlerts: { type: 'boolean', default: true }
});

const ENTREES = Object.freeze(Object.entries(SETTINGS_SCHEMA));

/** Valeurs par defaut, recalculees a chaque appel : jamais d'objet partage. */
export function defaultSettings() {
  const sortie = {};
  for (const [cle, regle] of ENTREES) {
    Object.defineProperty(sortie, cle, {
      value: regle.default, writable: true, enumerable: true, configurable: true
    });
  }
  return sortie;
}

function regleDe(cle) {
  const trouvee = ENTREES.find(([nom]) => nom === cle);
  return trouvee ? trouvee[1] : null;
}

/** Valeur acceptable, ou defaut. Aucune valeur intermediaire n'est inventee. */
function assainirValeur(cle, valeur) {
  const regle = regleDe(cle);
  if (!regle) return undefined;

  if (regle.type === 'boolean') {
    return typeof valeur === 'boolean' ? valeur : regle.default;
  }

  if (regle.type === 'enum') {
    return regle.values.includes(valeur) ? valeur : regle.default;
  }

  return regle.default;
}

/**
 * Filtre un objet de reglages.
 *
 * Applique a la lecture ET a l'ecriture : une cle inconnue n'est jamais
 * persistee, meme si un appelant la fournit.
 */
export function sanitizeSettings(brut) {
  const sortie = defaultSettings();
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return sortie;

  for (const [cle] of ENTREES) {
    const descripteur = Object.getOwnPropertyDescriptor(brut, cle);
    if (!descripteur) continue;
    const valeur = assainirValeur(cle, descripteur.value);
    if (valeur !== undefined) {
      Object.defineProperty(sortie, cle, {
        value: valeur, writable: true, enumerable: true, configurable: true
      });
    }
  }
  return sortie;
}

function magasin(ref) {
  if (ref) return ref;
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

/** Lit les reglages. Toute anomalie ramene aux valeurs par defaut. */
export function readSettings(options = {}) {
  const store = magasin(options.storage);
  if (!store) return defaultSettings();

  let brut = null;
  try {
    brut = store.getItem(APP_SETTINGS_KEY);
  } catch {
    return defaultSettings();
  }
  if (!brut) return defaultSettings();

  try {
    return sanitizeSettings(JSON.parse(brut));
  } catch {
    return defaultSettings();
  }
}

/**
 * Ecrit les reglages, apres filtrage.
 *
 * @returns {{written: boolean, settings: object, reason?: string}}
 */
export function writeSettings(patch, options = {}) {
  const store = magasin(options.storage);
  const fusion = sanitizeSettings({ ...readSettings(options), ...(patch || {}) });

  if (!store) return { written: false, settings: fusion, reason: 'no_storage' };

  try {
    store.setItem(APP_SETTINGS_KEY, JSON.stringify(fusion));
    return { written: true, settings: fusion };
  } catch {
    return { written: false, settings: fusion, reason: 'storage_unavailable' };
  }
}

/**
 * Options de generation issues des reglages.
 *
 * Vit ici, et non dans une couche d'interface : la fenetre d'entree ne doit
 * pas importer tout le panneau des reglages pour lire trois valeurs.
 */
export function generatorOptionsFromSettings(options = {}) {
  const reglages = readSettings(options);
  return {
    length: reglages.generatorLength,
    numbers: reglages.generatorDigits,
    symbols: reglages.generatorSymbols
  };
}

export default {
  generatorOptionsFromSettings,
  readSettings,
  writeSettings,
  sanitizeSettings,
  defaultSettings,
  SETTINGS_SCHEMA,
  APP_SETTINGS_KEY
};
