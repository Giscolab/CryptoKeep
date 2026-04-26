import { showToast } from '../../utils/toast.js';
import { filterEntries, inferCategory, sortEntries } from '../../utils/vault-filters.js';

const vaultUIState = {
  initialized: false,
  rawEntries: [],
  query: '',
  category: 'all',
  sortMode: 'title-asc'
};

function getIconClass(title) {
  const t = title?.toLowerCase() || '';

  if (t.includes('bank') || t.includes('banque')) return { icon: 'fa-university', cls: 'bank-icon' };
  if (t.includes('email') || t.includes('mail')) return { icon: 'fa-envelope', cls: 'email-icon' };
  if (t.includes('cloud') || t.includes('drive')) return { icon: 'fa-cloud', cls: 'cloud-icon' };
  if (t.includes('social') || t.includes('facebook') || t.includes('instagram')) return { icon: 'fa-share-alt', cls: 'social-icon' };
  if (t.includes('shop')) return { icon: 'fa-shopping-cart', cls: 'shopping-icon' };
  if (t.includes('film') || t.includes('stream')) return { icon: 'fa-film', cls: 'entertainment-icon' };

  return { icon: 'fa-key', cls: '' };
}

function getStrength(password = '') {
  let score = 0;

  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  return score;
}

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

function setSortButtonContent(button) {
  const isRecent = vaultUIState.sortMode === 'recent';
  button.replaceChildren(
    createIcon(isRecent ? 'fa-sort-amount-down' : 'fa-sort-alpha-down'),
    document.createTextNode(isRecent ? ' Trier : récents' : ' Trier : A-Z')
  );
}

function createVaultEntryElement(entry) {
  const { icon, cls } = getIconClass(entry.title || '');
  const password = toText(entry.password);
  const score = getStrength(password);

  const dotClasses = [
    score === 0 ? 'danger' : (score < 3 ? 'warning' : 'active'),
    score > 1 ? (score < 3 ? 'warning' : 'active') : '',
    score > 2 ? 'active' : '',
    score > 3 ? 'active' : '',
    score > 4 ? 'active' : ''
  ];

  const wrapper = document.createElement('div');
  wrapper.className = 'vault-item';
  wrapper.dataset.id = toText(entry.id);
  wrapper.dataset.category = inferCategory(entry);

  const accountInfo = document.createElement('div');
  accountInfo.className = 'account-info';

  const accountIcon = document.createElement('div');
  accountIcon.className = 'account-icon';
  if (cls) accountIcon.classList.add(cls);
  accountIcon.appendChild(createIcon(icon));

  const accountDetails = document.createElement('div');
  accountDetails.className = 'account-details';

  const title = document.createElement('strong');
  title.textContent = toText(entry.title);

  const username = document.createElement('span');
  username.textContent = toText(entry.username);

  const urlField = document.createElement('div');
  urlField.className = 'url-field';

  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.className = 'url-input';
  urlInput.readOnly = true;
  urlInput.value = toText(entry.url);
  urlField.appendChild(urlInput);

  const passwordField = document.createElement('div');
  passwordField.className = 'password-field';

  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.className = 'password-input';
  passwordInput.readOnly = true;
  passwordInput.value = password;

  const toggleButton = createIconButton('toggle-password', 'Afficher/masquer', 'fa-eye');
  passwordField.append(passwordInput, toggleButton);

  const strength = document.createElement('div');
  strength.className = 'strength-indicator';

  const strengthLabel = document.createElement('span');
  strengthLabel.textContent = 'Solidité :';
  strength.appendChild(strengthLabel);

  for (const dotClass of dotClasses) {
    const dot = document.createElement('div');
    dot.className = 'strength-dot';
    if (dotClass) dot.classList.add(dotClass);
    strength.appendChild(dot);
  }

  const strengthPercent = document.createElement('div');
  strengthPercent.className = 'strength-percent';
  strengthPercent.textContent = `${score * 20}%`;
  strength.appendChild(strengthPercent);

  accountDetails.append(title, username, urlField, passwordField, strength);
  accountInfo.append(accountIcon, accountDetails);

  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(
    createIconButton('action-btn copy', 'Copier le mot de passe', 'fa-copy'),
    createIconButton('action-btn edit', 'Modifier', 'fa-edit'),
    createIconButton('action-btn delete', 'Supprimer', 'fa-trash')
  );

  wrapper.append(accountInfo, actions);
  return wrapper;
}

function createRecentEntryElement(entry) {
  const { icon, cls } = getIconClass(entry.title || '');

  const wrapper = document.createElement('div');
  wrapper.className = 'vault-item';
  wrapper.dataset.id = toText(entry.id);

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
  actions.appendChild(createIconButton('copy', 'Copier', 'fa-copy'));

  wrapper.append(accountInfo, actions);
  return wrapper;
}

function getVisibleEntries() {
  const filtered = filterEntries(vaultUIState.rawEntries, {
    query: vaultUIState.query,
    category: vaultUIState.category
  });

  return sortEntries(filtered, vaultUIState.sortMode);
}

function getPasswordsViewControls() {
  const passwordsView = document.getElementById('passwords-view');
  if (!passwordsView) return {};

  return {
    searchInput: passwordsView.querySelector('#searchInput'),
    categoryButtons: passwordsView.querySelectorAll('.category-filter .category-btn'),
    sortButton: passwordsView.querySelector('.password-tools .vault-actions button:first-child'),
    refreshButton: passwordsView.querySelector('#vault-list .vault-actions button')
  };
}

function initializeVaultControls() {
  if (vaultUIState.initialized) return;

  const { searchInput, categoryButtons, sortButton, refreshButton } = getPasswordsViewControls();

  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      vaultUIState.query = event.target.value || '';
      renderVaultEntries(vaultUIState.rawEntries);
    });
  }

  categoryButtons?.forEach((button) => {
    const label = button.textContent?.toLowerCase() || '';
    const category = label.includes('banque') ? 'bank'
      : label.includes('email') ? 'email'
        : label.includes('cloud') ? 'cloud'
          : label.includes('réseaux') ? 'social'
            : 'all';

    button.dataset.category = category;

    button.addEventListener('click', () => {
      vaultUIState.category = button.dataset.category || 'all';

      categoryButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      renderVaultEntries(vaultUIState.rawEntries);
    });
  });

  if (sortButton) {
    sortButton.addEventListener('click', () => {
      vaultUIState.sortMode = vaultUIState.sortMode === 'title-asc' ? 'recent' : 'title-asc';
      setSortButtonContent(sortButton);

      renderVaultEntries(vaultUIState.rawEntries);
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', async () => {
      try {
        const decrypted = await window.vaultManager.decryptAllEntries();
        renderVaultEntries(decrypted);
        showToast('Liste des mots de passe actualisée.', 'success');
      } catch (error) {
        console.error(error);
        showToast('Impossible d’actualiser les entrées.', 'error');
      }
    });
  }

  vaultUIState.initialized = true;
}

function renderVaultEntries(entries) {
  initializeVaultControls();
  vaultUIState.rawEntries = Array.isArray(entries) ? entries : [];

  const visibleEntries = getVisibleEntries();
  const container = document.getElementById('entries');
  if (!container) return;

  container.replaceChildren();

  const countElem = document.getElementById('vault-count');
  if (countElem) {
    countElem.textContent = `${visibleEntries.length}/${vaultUIState.rawEntries.length}`;
  }

  if (!visibleEntries.length) {
    container.replaceChildren(createEmptyMessage('Aucune entrée ne correspond à la recherche actuelle.'));
    return;
  }

  for (const entry of visibleEntries) {
    container.appendChild(createVaultEntryElement(entry));
  }

  bindEntryActions(container);

  document.dispatchEvent(new CustomEvent('vault-entries-rendered'));
}

function bindEntryActions(container) {
  container.querySelectorAll('.action-btn.copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.vault-item')?.querySelector('.password-input');
      if (!input) return;

      navigator.clipboard.writeText(input.value).then(() => {
        const id = btn.closest('.vault-item')?.dataset.id;
        if (id) window.vaultManager.markEntryAccessed(id);
        setButtonIcon(btn, 'fa-check');
        setTimeout(() => {
          setButtonIcon(btn, 'fa-copy');
        }, 1500);
        showToast('Mot de passe copié dans le presse-papiers !', 'success');
      });
    });
  });

  container.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.password-field')?.querySelector('.password-input');
      if (!input) return;

      input.type = input.type === 'password' ? 'text' : 'password';
      btn.querySelector('i')?.classList.toggle('fa-eye');
      btn.querySelector('i')?.classList.toggle('fa-eye-slash');
    });
  });

  container.querySelectorAll('.action-btn.delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.vault-item')?.dataset.id;
      if (!id) return;

      if (!confirm('Supprimer cette entrée ?')) return;

      try {
        const vault = await window.vaultManager.storage.loadVault();
        const updated = vault.entries.filter(entry => entry.id !== id);
        await window.vaultManager.storage.saveVault(updated, vault.meta);
        const decrypted = await window.vaultManager.decryptAllEntries();
        renderVaultEntries(decrypted);
        await renderRecentAccesses();
        showToast('Entrée supprimée.', 'success');
      } catch (error) {
        console.error(error);
        showToast('Erreur lors de la suppression.', 'error');
      }
    });
  });

  container.querySelectorAll('.action-btn.edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.vault-item');
      const input = item?.querySelector('.password-input');
      const urlInput = item?.querySelector('.url-input');
      if (!item || !input) return;

      input.removeAttribute('readonly');
      input.type = 'text';
      input.focus();
      urlInput?.removeAttribute('readonly');

      setButtonIcon(btn, 'fa-save');
      btn.title = 'Enregistrer';
      btn.classList.add('editing');

      async function saveEdit() {
        input.setAttribute('readonly', true);
        input.type = 'password';
        urlInput?.setAttribute('readonly', true);
        setButtonIcon(btn, 'fa-edit');
        btn.title = 'Modifier';
        btn.classList.remove('editing');

        const id = item.dataset.id;

        try {
          await window.vaultManager.updateEntry(id, {
            password: input.value,
            url: urlInput?.value || ''
          });
          await window.vaultManager.markEntryAccessed(id);
          const decrypted = await window.vaultManager.decryptAllEntries();
          renderVaultEntries(decrypted);
          await renderRecentAccesses();
          showToast('Mot de passe mis à jour.', 'success');
        } catch (error) {
          console.error(error);
          showToast('Erreur lors de la mise à jour.', 'error');
        }

        input.removeEventListener('blur', saveEdit);
        btn.removeEventListener('click', saveEdit);
      }

      input.addEventListener('blur', saveEdit);
      btn.addEventListener('click', saveEdit);
    });
  });
}

async function renderRecentAccesses(limit = 4) {
  const container = document.getElementById('recent-entries');
  if (!container) return;

  container.replaceChildren();

  const entries = window.vaultManager.getEntries()
    .filter(entry => entry.lastAccessed)
    .sort((a, b) => b.lastAccessed - a.lastAccessed)
    .slice(0, limit);

  if (!entries.length) {
    container.replaceChildren(createEmptyMessage('Aucun accès récent.'));
    return;
  }

  for (const entry of entries) {
    const wrapper = createRecentEntryElement(entry);

    wrapper.querySelector('.copy')?.addEventListener('click', () => {
      navigator.clipboard.writeText(entry.password);
      window.vaultManager.markEntryAccessed(entry.id);
      renderRecentAccesses();
    });

    container.appendChild(wrapper);
  }
}

export {
  renderVaultEntries,
  renderRecentAccesses
};
