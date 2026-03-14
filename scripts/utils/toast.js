// /scripts/utils/toast.js

/**
 * Affiche une notification toast à l'utilisateur.
 * @param {string} message - Le message à afficher.
 * @param {'success'|'error'|'warning'|'info'} type - Le type de toast (change la couleur).
 * @param {number} duration - Durée d'affichage en ms.
 */
export function showToast(message, type = 'success', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    ${iconForType(type)}
    <span>${message}</span>
    <button class="toast__close" aria-label="Fermer">&times;</button>
  `;

  // Supprimer au clic sur la croix
  toast.querySelector('.toast__close').onclick = () => toast.remove();

  // Timer auto-suppression
  setTimeout(() => toast.remove(), duration);

  container.appendChild(toast);
}

function iconForType(type) {
  switch (type) {
    case 'success':
      return '<i class="fas fa-check-circle"></i>';
    case 'error':
      return '<i class="fas fa-times-circle"></i>';
    case 'warning':
      return '<i class="fas fa-exclamation-triangle"></i>';
    case 'info':
      return '<i class="fas fa-info-circle"></i>';
    default:
      return '';
  }
}

export default { show: showToast };
