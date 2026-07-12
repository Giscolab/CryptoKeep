// ✅ Import de showView utilisé pour la redirection depuis les accès récents
import { showView } from './sidebar.js';
import { vaultManager } from '../core/vault/manager.js';
import { copyToClipboard } from '../utils/clipboard.js';

function toText(value, fallback = '') {
  return value === null || value === undefined ? fallback : String(value);
}

function createIcon(iconClass) {
  const icon = document.createElement('i');
  icon.className = `fas ${iconClass}`;
  return icon;
}

function setButtonIcon(button, iconClass) {
  button.replaceChildren(createIcon(iconClass));
}

function createIconButton(className, title, iconClass) {
  const button = document.createElement('button');
  button.className = className;
  button.title = title;
  setButtonIcon(button, iconClass);
  return button;
}

function createEmptyMessage(text) {
  const message = document.createElement('p');
  message.textContent = text;
  return message;
}

function getIconClass(title) {
  const normalized = title.toLowerCase();

  if (normalized.includes('bank')) return { icon: 'fa-university', cls: 'bank-icon' };
  if (normalized.includes('email')) return { icon: 'fa-envelope', cls: 'email-icon' };
  if (normalized.includes('cloud')) return { icon: 'fa-cloud', cls: 'cloud-icon' };
  if (normalized.includes('social')) return { icon: 'fa-share-alt', cls: 'social-icon' };
  return { icon: 'fa-key', cls: '' };
}

function createRecentEntryElement(entry) {
  const { icon, cls } = getIconClass(toText(entry.title));

  const wrapper = document.createElement('div');
  wrapper.className = 'vault-item';
  wrapper.dataset.id = toText(entry.id); // ✅ Requis pour scroll ciblé dans passwords-view

  const accountInfo = document.createElement('div');
  accountInfo.className = 'account-info';

  const accountIcon = document.createElement('div');
  accountIcon.className = 'account-icon';
  if (cls) accountIcon.classList.add(cls);
  accountIcon.appendChild(createIcon(icon));

  const accountDetails = document.createElement('div');
  accountDetails.className = 'account-details';

  const title = document.createElement('strong');
  title.textContent = toText(entry.title, 'Sans titre') || 'Sans titre';

  const username = document.createElement('span');
  username.textContent = toText(entry.username);

  accountDetails.append(title, username);
  accountInfo.append(accountIcon, accountDetails);

  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(
    createIconButton('copy', 'Copier', 'fa-copy'),
    createIconButton('edit', 'Modifier', 'fa-edit')
  );

  wrapper.append(accountInfo, actions);
  return wrapper;
}

function findVaultItemById(id) {
  const targetId = toText(id);
  return [...document.querySelectorAll('.vault-item')]
    .find(item => item.dataset.id === targetId) || null;
}

export async function renderRecentAccesses(limit = 4) {
  const container = document.getElementById('recent-entries');
  if (!container) return;

  container.replaceChildren(); // ✅ On vide le conteneur à chaque appel pour éviter les éléments morts

  const entries = vaultManager.getEntries()
    .filter(e => e.lastAccessed)
    .sort((a, b) => b.lastAccessed - a.lastAccessed)
    .slice(0, limit);

  if (!entries.length) {
    container.replaceChildren(createEmptyMessage('Aucun accès récent.'));
    return;
  }

  for (const entry of entries) {
    const wrapper = createRecentEntryElement(entry);

    // ✅ Bouton COPIER : copie dans le presse-papiers + met à jour l'historique
    const copyBtn = wrapper.querySelector('.copy');
    copyBtn.addEventListener('click', async () => {
      const copied = await copyToClipboard(entry.password);
      if (!copied) return;
      await vaultManager.markEntryAccessed(entry.id);
      renderRecentAccesses(); // ✅ On re-render pour garder l'ordre à jour
    });

    // ✅ Bouton MODIFIER : redirige vers passwords-view et scroll vers l'entrée
    const editBtn = wrapper.querySelector('.edit');
    editBtn.addEventListener('click', () => {
  const proceed = confirm("Souhaitez-vous modifier cette entrée dans la liste des mots de passe ?");
  if (!proceed) return;

  void vaultManager.markEntryAccessed(entry.id);
  showView('passwords-view');

  const onRendered = () => {
    const item = findVaultItemById(entry.id);
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
        setButtonIcon(editBtn, 'fa-save');
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
