/**
 * CryptoKeep - Cycle de vie du champ mot de passe maitre (Lot 1).
 *
 * Regles appliquees :
 * - la reference du champ est resolue UNE SEULE FOIS et mise en cache ;
 * - la chaine contenant le mot de passe vit le temps d'un appel et rien de plus ;
 * - le champ du DOM est vide immediatement apres usage, en reussite comme en
 *   echec (bloc `finally`) ;
 * - le champ repasse en `type="password"` ;
 * - la case "Afficher le mot de passe" est reinitialisee ;
 * - le nettoyage est rejoue sur changement d'ecran, masquage d'onglet et
 *   fermeture de page.
 *
 * Limite assumee : JavaScript ne permet pas d'effacer de facon fiable une
 * chaine deja allouee. Vider le champ du DOM et abandonner les references
 * reduit la fenetre d'exposition, cela ne garantit pas l'effacement memoire.
 * Aucune valeur n'est jamais journalisee.
 */

export const MASTER_PASSWORD_INPUT_ID = 'master-password';
export const MASTER_PASSWORD_TOGGLE_ID = 'toggle-password-visibility';

let cachedField = null;
let hygieneInstalled = false;

/**
 * Resout et met en cache la reference du champ. Les appels suivants ne
 * refont pas de recherche DOM.
 */
export function getMasterPasswordField(doc = typeof document !== 'undefined' ? document : null) {
  if (cachedField && cachedField.doc === doc) return cachedField;
  if (!doc || typeof doc.getElementById !== 'function') return null;

  const input = doc.getElementById(MASTER_PASSWORD_INPUT_ID);
  if (!input) return null;

  cachedField = {
    doc,
    input,
    toggle: doc.getElementById(MASTER_PASSWORD_TOGGLE_ID) || null
  };
  return cachedField;
}

/** Reinitialise le cache. Utilise par les tests et lors d'un remplacement du DOM. */
export function resetMasterPasswordFieldCache() {
  cachedField = null;
  hygieneInstalled = false;
}

/**
 * Vide le champ, retablit `type="password"` et decoche l'affichage.
 * Sur : reussite, echec, verrouillage, deconnexion, changement d'ecran.
 *
 * @returns {{cleared: boolean, typeReset: boolean, toggleReset: boolean}}
 */
export function clearMasterPasswordField(
  field = getMasterPasswordField(),
  doc = typeof document !== 'undefined' ? document : null
) {
  const resolved = field || getMasterPasswordField(doc);
  const report = { cleared: false, typeReset: false, toggleReset: false };
  if (!resolved || !resolved.input) return report;

  const { input, toggle } = resolved;

  try {
    input.value = '';
    report.cleared = true;
  } catch {
    /* nettoyage best-effort */
  }

  try {
    if (input.type !== 'password') input.type = 'password';
    report.typeReset = input.type === 'password';
  } catch {
    /* nettoyage best-effort */
  }

  try {
    if (toggle && toggle.checked) toggle.checked = false;
    report.toggleReset = !toggle || toggle.checked === false;
  } catch {
    /* nettoyage best-effort */
  }

  return report;
}

/**
 * Lit la valeur du champ, la transmet au gestionnaire, puis nettoie
 * inconditionnellement. La valeur n'est jamais retournee a l'appelant et
 * n'est jamais journalisee.
 *
 * @param {(password: string) => (Promise<any>|any)} handler
 * @param {object} [options]
 * @returns {Promise<any>} la valeur retournee par `handler`
 */
export async function consumeMasterPassword(handler, options = {}) {
  const {
    doc = typeof document !== 'undefined' ? document : null,
    field = getMasterPasswordField(doc)
  } = options;

  if (typeof handler !== 'function') {
    throw new TypeError('consumeMasterPassword attend une fonction.');
  }

  if (!field || !field.input) {
    throw new Error('Champ mot de passe maitre introuvable.');
  }

  let password = field.input.value;
  try {
    return await handler(password);
  } finally {
    password = '';
    clearMasterPasswordField(field, doc);
  }
}

/**
 * Branche le nettoyage automatique du champ sur les evenements de sortie
 * d'ecran. Idempotent : plusieurs appels n'ajoutent pas plusieurs ecouteurs.
 */
export function installMasterPasswordHygiene(options = {}) {
  const {
    doc = typeof document !== 'undefined' ? document : null,
    win = typeof window !== 'undefined' ? window : null
  } = options;

  if (hygieneInstalled) return false;
  const field = getMasterPasswordField(doc);
  if (!field) return false;

  const clear = () => {
    clearMasterPasswordField(field, doc);
  };

  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden') clear();
    });
    doc.addEventListener('vault:locked', clear);
    doc.addEventListener('vault:logout', clear);
  }

  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('pagehide', clear);
    win.addEventListener('beforeunload', clear);
  }

  const form = doc && typeof doc.getElementById === 'function' ? doc.getElementById('auth-form') : null;
  if (form && typeof form.addEventListener === 'function') {
    form.addEventListener('reset', clear);
  }

  hygieneInstalled = true;
  return true;
}

export default {
  getMasterPasswordField,
  clearMasterPasswordField,
  consumeMasterPassword,
  installMasterPasswordHygiene,
  resetMasterPasswordFieldCache
};
