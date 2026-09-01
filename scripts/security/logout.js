/**
 * CryptoKeep - Deconnexion manuelle (Lot 1).
 *
 * Le bouton "Deconnexion" de la barre laterale existait dans `index.html`
 * mais n'etait raccorde a aucun code. Ce module le raccorde reellement.
 *
 * Une deconnexion effectue, dans cet ordre :
 *   1. fermeture de toutes les modales visibles ;
 *   2. purge de la session du VaultManager (cle maitre, sel, entrees
 *      dechiffrees) via `lockVaultSession` ;
 *   3. purge des vues et des champs contenant des secrets ;
 *   4. remise a `password` du champ maitre et decochage de l'affichage ;
 *   5. reinitialisation de la navigation sur le tableau de bord ;
 *   6. retour a l'ecran d'authentification ;
 *   7. tentative conditionnelle de nettoyage du presse-papiers.
 *
 * Ce qui n'est PAS fait, volontairement :
 * - le coffre chiffre (IndexedDB et sauvegarde locale) n'est jamais supprime ;
 * - les preferences non sensibles (theme, delai de verrouillage) sont conservees.
 *
 * Limite assumee : le nettoyage du presse-papiers echoue si le navigateur
 * refuse la lecture ou si le contenu a change depuis la copie. Le rapport
 * retourne distingue explicitement "tente" de "reussi".
 */

import { lockVaultSession } from './session-lock.js';
import { clearMasterPasswordField } from './master-password-field.js';
import { closeAllModals } from '../ui/modal-cleanup.js';

export const LOGOUT_EVENT = 'vault:logout';
export const DEFAULT_LOGOUT_SELECTORS = ['#logout-button', '.logout'];

// Nom de l'attribut data-* marquant un controle deja raccorde.
// Accede litteralement (control.dataset.vaultLogoutBound) pour eviter
// tout acces indexe par variable.
export const BOUND_FLAG = 'vaultLogoutBound';

/** Reinitialise la navigation sur la vue par defaut, sans dependre de la sidebar. */
export function resetNavigation(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return false;

  doc.querySelectorAll('.view').forEach((view) => {
    view.hidden = true;
  });

  const dashboard = doc.getElementById ? doc.getElementById('dashboard-view') : null;
  if (dashboard) dashboard.hidden = false;

  doc.querySelectorAll('.sidebar nav a').forEach((link) => {
    if (link.classList) link.classList.remove('active');
  });

  const navDashboard = doc.getElementById ? doc.getElementById('nav-dashboard') : null;
  if (navDashboard && navDashboard.classList) navDashboard.classList.add('active');

  return true;
}

/**
 * Execute une deconnexion complete.
 *
 * @returns {Promise<object>} rapport verifiable de la deconnexion
 */
export async function logoutVaultSession(vaultManager, options = {}) {
  const {
    doc = typeof document !== 'undefined' ? document : null,
    notify = true,
    message = 'Session fermee. Le coffre chiffre est conserve.',
    type = 'info'
  } = options;

  const modals = closeAllModals(doc);
  const lockReport = await lockVaultSession(vaultManager, { notify, message, type });
  const fieldReport = clearMasterPasswordField(undefined, doc);
  const navigationReset = resetNavigation(doc);

  if (doc && typeof doc.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    try {
      doc.dispatchEvent(new CustomEvent(LOGOUT_EVENT));
    } catch {
      /* diffusion best-effort */
    }
  }

  return {
    modalsClosed: modals.closed + modals.removed,
    masterKeyNull: lockReport.masterKeyNull,
    entryCount: lockReport.entryCount,
    masterPasswordCleared: fieldReport.cleared,
    masterPasswordTypeReset: fieldReport.typeReset,
    masterPasswordToggleReset: fieldReport.toggleReset,
    navigationReset,
    clipboardCleanupAttempted: lockReport.clipboardCleanupAttempted,
    clipboardCleanupSucceeded: lockReport.clipboardCleanupSucceeded
  };
}

/**
 * Raccorde le ou les controles de deconnexion presents dans le DOM.
 * Idempotent : un controle deja raccorde n'obtient jamais un second ecouteur.
 *
 * @returns {{bound: number, alreadyBound: number}}
 */
export function initLogoutControl(vaultManager, options = {}) {
  const {
    doc = typeof document !== 'undefined' ? document : null,
    selectors = DEFAULT_LOGOUT_SELECTORS,
    onLogout = null
  } = options;

  const report = { bound: 0, alreadyBound: 0 };
  if (!doc || typeof doc.querySelectorAll !== 'function') return report;

  const seen = new Set();
  selectors.forEach((selector) => {
    doc.querySelectorAll(selector).forEach((control) => {
      if (seen.has(control)) return;
      seen.add(control);

      if (control.dataset && control.dataset.vaultLogoutBound === 'true') {
        report.alreadyBound += 1;
        return;
      }
      if (control.dataset) control.dataset.vaultLogoutBound = 'true';

      // Le controle historique est un <div> : on lui donne une semantique
      // accessible sans changer le balisage existant.
      if (typeof control.setAttribute === 'function') {
        if (!control.getAttribute || !control.getAttribute('role')) {
          control.setAttribute('role', 'button');
        }
        if (!control.getAttribute || control.getAttribute('tabindex') === null) {
          control.setAttribute('tabindex', '0');
        }
      }

      const run = async () => {
        const result = await logoutVaultSession(vaultManager, options);
        if (typeof onLogout === 'function') onLogout(result);
        return result;
      };

      control.addEventListener('click', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        void run();
      });

      control.addEventListener('keydown', (event) => {
        if (!event) return;
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          if (typeof event.preventDefault === 'function') event.preventDefault();
          void run();
        }
      });

      report.bound += 1;
    });
  });

  return report;
}

export default { initLogoutControl, logoutVaultSession, resetNavigation, LOGOUT_EVENT };
