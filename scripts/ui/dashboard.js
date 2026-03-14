// ✅ Import de showView utilisé pour la redirection depuis les accès récents
import { showView } from './sidebar.js';

export async function renderRecentAccesses(limit = 4) {
  const container = document.getElementById('recent-entries');
  if (!container) return;

  container.innerHTML = ''; // ✅ On vide le conteneur à chaque appel pour éviter les éléments morts

  const entries = window.vaultManager.getEntries()
    .filter(e => e.lastAccessed)
    .sort((a, b) => b.lastAccessed - a.lastAccessed)
    .slice(0, limit);

  if (!entries.length) {
    container.innerHTML = '<p>Aucun accès récent.</p>';
    return;
  }

  for (const entry of entries) {
    const wrapper = document.createElement('div');
    wrapper.className = 'vault-item';
    wrapper.dataset.id = entry.id; // ✅ Requis pour scroll ciblé dans passwords-view

    const title = entry.title?.toLowerCase() || '';
    const iconClass = title.includes('bank') ? 'fa-university bank-icon' :
                      title.includes('email') ? 'fa-envelope email-icon' :
                      title.includes('cloud') ? 'fa-cloud cloud-icon' :
                      title.includes('social') ? 'fa-share-alt social-icon' :
                      'fa-key';

    wrapper.innerHTML = `
      <div class="account-info">
        <div class="account-icon ${iconClass.split(' ')[1] || ''}">
          <i class="fas ${iconClass.split(' ')[0]}"></i>
        </div>
        <div class="account-details">
          <strong>${entry.title || 'Sans titre'}</strong>
          <span>${entry.username || ''}</span>
        </div>
      </div>
      <div class="actions">
        <button class="copy" title="Copier"><i class="fas fa-copy"></i></button>
        <button class="edit" title="Modifier"><i class="fas fa-edit"></i></button>
      </div>
    `;

    // ✅ Bouton COPIER : copie dans le presse-papiers + met à jour l'historique
    const copyBtn = wrapper.querySelector('.copy');
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(entry.password);
      window.vaultManager.markEntryAccessed(entry.id);
      renderRecentAccesses(); // ✅ On re-render pour garder l'ordre à jour
    });

    // ✅ Bouton MODIFIER : redirige vers passwords-view et scroll vers l'entrée
    const editBtn = wrapper.querySelector('.edit');
    editBtn.addEventListener('click', () => {
  const proceed = confirm("Souhaitez-vous modifier cette entrée dans la liste des mots de passe ?");
  if (!proceed) return;

  window.vaultManager.markEntryAccessed(entry.id);
  showView('passwords-view');

  const onRendered = () => {
    const item = document.querySelector(`.vault-item[data-id="${entry.id}"]`);
    if (item) {
      item.scrollIntoView({ behavior: 'smooth' });
      item.classList.add('highlight-scroll');
      setTimeout(() => item.classList.remove('highlight-scroll'), 1500);

      // 🟣 Edition rapide : déverrouille et active l’édition
      const input = item.querySelector('.password-input');
      const editBtn = item.querySelector('.action-btn.edit');
      if (input && editBtn) {
        input.removeAttribute('readonly');
        input.type = 'text';
        input.focus();
        editBtn.innerHTML = '<i class="fas fa-save"></i>';
        editBtn.title = "Enregistrer";
        editBtn.classList.add('editing');
      }
    }
    document.removeEventListener('vault-entries-rendered', onRendered);
  };

  document.addEventListener('vault-entries-rendered', onRendered);
});

    container.appendChild(wrapper); // ✅ On ajoute la fiche complète avec ses boutons fonctionnels
  }
}
