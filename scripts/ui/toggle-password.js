// /scripts/ui/toggle-password.js
import { logInfo, logError } from '../utils/logger.js';

/**
 * Initialise tous les boutons de toggle visibilité des champs password.
 * À appeler sur DOMContentLoaded OU après l’injection dynamique de champs.
 */
export function initTogglePassword() {
  // Sélectionne tous les boutons avec .toggle-password qui précèdent un input[type=password|text]
  const toggles = document.querySelectorAll('.toggle-password');
  if (toggles.length === 0) {
    logInfo('Aucun bouton toggle-password trouvé.');
    return;
  }

  toggles.forEach(btn => {
    btn.addEventListener('click', function () {
      // Recherche l’input précédent dans le flux DOM
      let input = this.previousElementSibling;
      // Cas rare : si ce n’est pas un input, cherche le parent le plus proche
      if (!input || !input.tagName || input.tagName.toLowerCase() !== 'input') {
        input = this.closest('.password-input-wrapper')?.querySelector('input[type="password"], input[type="text"]');
      }
      if (!input) {
        logError('Aucun champ input associé au toggle-password');
        return;
      }
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      this.innerHTML = isPassword
        ? '<i class="fas fa-eye-slash"></i>'
        : '<i class="fas fa-eye"></i>';
      logInfo(`Champ mot de passe basculé en ${input.type}`);
    });
  });

  logInfo('Toggle-password initialisé sur ' + toggles.length + ' bouton(s).');
}

// Optionnel : auto-init si besoin
// document.addEventListener('DOMContentLoaded', initTogglePassword);

export default { init: initTogglePassword };
