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

const SENSITIVE_FIELD_IDS = Object.freeze([
  'entry-title',
  'entry-username',
  'password',
  'website',
  'entry-notes',
  'entry-tags',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'secure-dialog-password',
  'new-password-input'
]);

/**
 * Purge best-effort des valeurs sensibles portees par les formulaires.
 *
 * Cette fonction ne promet aucune zeroisation des chaines JavaScript. Elle
 * supprime les references DOM evitables et retablit le masquage avant que les
 * modales ne soient cachees ou detachees.
 */
export function purgeSensitiveModalState(
  doc = typeof document !== 'undefined' ? document : null
) {
  const report = { cleared: 0, remasked: 0, categoryReset: false };
  if (!doc || typeof doc.getElementById !== 'function') return report;

  SENSITIVE_FIELD_IDS.forEach((id) => {
    const field = doc.getElementById(id);
    if (!field) return;
    if ('value' in field) {
      field.value = '';
      report.cleared += 1;
    }
    if (id === 'password'
      || id === 'currentPassword'
      || id === 'newPassword'
      || id === 'confirmPassword'
      || id === 'secure-dialog-password'
      || id === 'new-password-input') {
      field.type = 'password';
      report.remasked += 1;
    }
  });

  const category = doc.getElementById('category');
  if (category) {
    if ('value' in category) category.value = '';
    if ('selectedIndex' in category) category.selectedIndex = 0;
    if (typeof category.querySelectorAll === 'function') {
      category.querySelectorAll('option[data-entry-category-added="true"]')
        .forEach((option) => option.remove());
    }
    report.categoryReset = true;
  }

  if (typeof doc.querySelectorAll === 'function') {
    doc.querySelectorAll('.toggle-password i').forEach((icon) => {
      icon.className = 'fas fa-eye';
    });
  }

  return report;
}

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

export default { closeAllModals, purgeSensitiveModalState, MODAL_SELECTORS };
