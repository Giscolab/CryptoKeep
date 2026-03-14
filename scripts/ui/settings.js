import { updateUserProfileInDB, loadUserProfileFromDB } from '../utils/idb-helper.js';
import { showToast } from '../utils/toast.js';
import { updateSidebarProfile } from './sidebar-profile.js';

/**
 * Initialise le panneau des paramètres utilisateur.
 * Gère le chargement initial des données et la mise à jour.
 */
export function initSettingsPanel() {
  const nameInput = document.querySelector('#settings-view #name');
  const emailInput = document.querySelector('#settings-view #email');
  const languageSelect = document.querySelector('#settings-view #language');
  const updateBtn = document.querySelector('#settings-view .btn.btn-primary');

  if (!nameInput || !emailInput || !languageSelect || !updateBtn) {
    console.warn('[Settings] Éléments du formulaire non trouvés.');
    return;
  }

  if (updateBtn.dataset.initialized === 'true') return;
  updateBtn.dataset.initialized = 'true';

  // Chargement des données utilisateur
  loadUserProfileFromDB().then(profile => {
    if (!profile) return;
    if (profile.name) nameInput.value = profile.name;
    if (profile.email) emailInput.value = profile.email;
    if (profile.language) languageSelect.value = profile.language;
  }).catch(err => {
    console.error('[Settings] Erreur au chargement du profil :', err);
  });

  // Sauvegarde du profil
  updateBtn.addEventListener('click', async () => {
    console.log('[Settings] Bouton cliqué');

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const language = languageSelect.value;

    if (!name || !email) {
      console.warn('[Settings] Champs manquants');
      (showToast || alert)("Tous les champs sont requis.");
      return;
    }

    try {
      await updateUserProfileInDB({ name, email, language });
      updateSidebarProfile(); // 🔄 Met à jour la sidebar en live
      console.log('[Settings] Sauvegarde réussie');
      (showToast || alert)("Profil mis à jour avec succès.");
    } catch (err) {
      console.error('[Settings] Erreur :', err);
      (showToast || alert)("Erreur lors de la mise à jour du profil.");
    }
  });
}
