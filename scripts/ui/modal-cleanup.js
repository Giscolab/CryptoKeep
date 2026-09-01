/**
 * CryptoKeep - Fermeture generique des fenetres modales (Lot 1).
 *
 * Le `ModalManager` de `scripts/ui/modal.js` ne connait que les modales
 * explicitement enregistrees. Le verrouillage et la deconnexion doivent
 * fermer TOUTE modale visible, y compris celles injectees dynamiquement
 * (resolveur de reutilisation, boites de dialogue futures).
 *
 * Ce module n'utilise que des APIs DOM (aucun innerHTML) et ne lit aucune
 * donnee de coffre.
 */

export const MODAL_SELECTORS = [
  '.modal-overlay.active',
  '.modal.active',
  '.modal-overlay[open]',
  'dialog[open]'
];

/**
 * Ferme toutes les modales visibles et retire l'etat `modal-open` du body.
 *
 * @returns {{closed: number, removed: number}}
 */
export function closeAllModals(doc = typeof document !== 'undefined' ? document : null) {
  const report = { closed: 0, removed: 0 };
  if (!doc || typeof doc.querySelectorAll !== 'function') return report;

  MODAL_SELECTORS.forEach((selector) => {
    doc.querySelectorAll(selector).forEach((node) => {
      try {
        if (node.classList && typeof node.classList.remove === 'function') {
          node.classList.remove('active');
        }
        if (typeof node.close === 'function' && node.open) {
          node.close();
        } else if (node.open) {
          node.open = false;
        }
        report.closed += 1;
      } catch {
        /* fermeture best-effort */
      }
    });
  });

  // Modales injectees dynamiquement : elles n'ont pas d'etat persistant utile
  // une fois la session fermee, et peuvent contenir des secrets rendus.
  ['#reuse-resolver-modal'].forEach((selector) => {
    const node = doc.querySelector ? doc.querySelector(selector) : null;
    if (node && typeof node.remove === 'function') {
      node.remove();
      report.removed += 1;
    }
  });

  const body = doc.body;
  if (body && body.classList && typeof body.classList.remove === 'function') {
    body.classList.remove('modal-open');
  }

  return report;
}

export default { closeAllModals, MODAL_SELECTORS };
