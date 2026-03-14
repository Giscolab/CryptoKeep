import { loadUserProfileFromDB } from '../utils/idb-helper.js';

/**
 * Met à jour dynamiquement les infos utilisateur dans la sidebar.
 */
export async function updateSidebarProfile() {
  const nameEl = document.querySelector('.user-name');
  const emailEl = document.querySelector('.user-email');
  const avatarEl = document.querySelector('.avatar');
  const userSection = document.querySelector('.user-section');

  if (!nameEl || !emailEl || !avatarEl || !userSection) {
    console.warn('[Sidebar] Élément(s) introuvable(s) dans .user-section');
    return;
  }

  try {
    const profile = await loadUserProfileFromDB();

    const hasName = profile?.name?.trim();
    const hasEmail = profile?.email?.trim();

    nameEl.textContent = hasName ? profile.name : '';
    emailEl.textContent = hasEmail ? profile.email : '';
    avatarEl.textContent = hasName ? getInitials(profile.name) : '';

    // Masquer la section complète si aucune info
    userSection.style.display = hasName || hasEmail ? '' : 'none';

  } catch (err) {
    console.error('[Sidebar] Erreur chargement profil :', err);
    nameEl.textContent = '';
    emailEl.textContent = '';
    avatarEl.textContent = '';
    userSection.style.display = 'none';
  }
}

/**
 * Génère les initiales à partir du nom complet
 * Ex: "Marie Lemoine" → "ML"
 */
function getInitials(name) {
  return name
    .split(' ')
    .map(w => w[0]?.toUpperCase() || '')
    .slice(0, 2)
    .join('');
}
