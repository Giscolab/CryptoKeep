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

  const iconClass = iconClassForType(type);
  if (iconClass) {
    const icon = document.createElement('i');
    icon.className = `fas ${iconClass}`;
    toast.appendChild(icon);
  }

  const messageNode = document.createElement('span');
  messageNode.className = 'toast__message';
  messageNode.textContent = message || '';
  toast.appendChild(messageNode);

  const closeButton = document.createElement('button');
  closeButton.className = 'toast__close';
  closeButton.setAttribute('aria-label', 'Fermer');
  closeButton.textContent = '×';
  toast.appendChild(closeButton);

  // Supprimer au clic sur la croix
  const dismiss = () => toast.remove();
  closeButton.onclick = dismiss;

  // Timer auto-suppression
  setTimeout(dismiss, duration);

  container.appendChild(toast);
  return toast;
}

function iconClassForType(type) {
  switch (type) {
    case 'success':
      return 'fa-check-circle';
    case 'error':
      return 'fa-times-circle';
    case 'warning':
      return 'fa-exclamation-triangle';
    case 'info':
      return 'fa-info-circle';
    default:
      return '';
  }
}

export default { show: showToast };
