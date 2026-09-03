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

  // LOT 7B : la minuterie d'auto-suppression est CONSERVEE sur le noeud, et
  // annulee si la notification est retiree avant son echeance. Sans cela, un
  // toast de longue duree — le compte a rebours du presse-papiers dure autant
  // que le delai regle — maintenait une minuterie vivante meme apres son
  // retrait. En navigateur c'est sans consequence ; dans tout contexte sans
  // interface, la boucle d'evenements restait bloquee jusqu'a l'echeance.
  const dismiss = () => {
    if (toast.autoDismissTimer) {
      clearTimeout(toast.autoDismissTimer);
      toast.autoDismissTimer = null;
    }
    toast.remove();
  };

  closeButton.onclick = dismiss;
  toast.dismiss = dismiss;
  toast.autoDismissTimer = setTimeout(dismiss, duration);

  // Une notification ne doit jamais retarder la fin d'un processus. En
  // navigateur, `setTimeout` renvoie un nombre et cette ligne est sans effet ;
  // hors navigateur, elle empeche une minuterie d'affichage de maintenir la
  // boucle d'evenements vivante pour rien.
  if (toast.autoDismissTimer && typeof toast.autoDismissTimer.unref === 'function') {
    toast.autoDismissTimer.unref();
  }

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
