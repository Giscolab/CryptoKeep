import { showToast } from '../../utils/toast.js';
import {
  buildVisibleEntries,
  filterEntries,
  sortEntries,
  resolveCategory
} from '../../utils/vault-filters.js';
import { deleteEntry, describeEntryForConfirmation } from '../../core/vault/entry-operations.js';
import { confirmDialog } from '../secure-dialogs.js';
import { readViewPreferences, writeViewPreferences } from '../../utils/view-preferences.js';
import { vaultManager } from '../../core/vault/manager.js';
import { copyToClipboard } from '../../utils/clipboard.js';

// Preferences NON SENSIBLES restaurees au chargement : categorie et mode de
// tri, tous deux issus de listes fermees. Le terme de recherche n'est jamais
// persiste : saisie libre pouvant contenir du plaintext de coffre.
const storedPreferences = readViewPreferences();

const vaultUIState = {
  initialized: false,
  rawEntries: [],
  query: '',
  category: storedPreferences.category,
  sortMode: storedPreferences.sortMode
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

function resetVaultUIState() {
  vaultUIState.rawEntries = [];
  // Le terme de recherche est TOUJOURS purge : saisie libre pouvant
  // contenir un fragment de donnee de coffre.
  vaultUIState.query = '';
  const preferences = readViewPreferences();
  vaultUIState.category = preferences.category;
  vaultUIState.sortMode = preferences.sortMode;
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
  // Categorie EFFECTIVE : valeur persistee si elle existe, sinon inference
  // historique. L'entree elle-meme n'est jamais modifiee par l'affichage.
  wrapper.dataset.category = resolveCategory(entry);

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
  // LOT 3B : le bouton « Modifier » est retabli ici. Deux implementations
  // concurrentes de la liste des acces recents coexistaient : celle de
  // scripts/ui/dashboard.js offrait « Copier » et « Modifier », celle-ci
  // seulement « Copier ». Comme le rafraichissement centralise passait par
  // celle-ci, le bouton « Modifier » disparaissait des que la vue etait
  // reactualisee. Les deux fiches sont desormais identiques.
  actions.append(
    createIconButton('copy', 'Copier', 'fa-copy'),
    createIconButton('edit', 'Modifier', 'fa-edit')
  );

  wrapper.append(accountInfo, actions);
  return wrapper;
}

/**
 * Pipeline unique, partage avec toutes les vues :
 * entrees de session -> recherche -> filtre categorie -> tri -> rendu.
 */
function getVisibleEntries() {
  return buildVisibleEntries(vaultUIState.rawEntries, {
    query: vaultUIState.query,
    category: vaultUIState.category,
    sortMode: vaultUIState.sortMode
  });
}

// HELPER HISTORIQUE conserve. Il ne resolvait que les controles de la vue
// des mots de passe ; initializeVaultControls() raccorde desormais les DEUX
// vues. Exporte pour rester utilisable, mais plus appele en interne.
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

/** Applique un etat accessible au groupe de boutons de categorie. */
function markActiveCategory(buttons, category) {
  buttons.forEach((button) => {
    const isActive = (button.dataset.category || 'all') === category;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

/** Persiste les seules preferences non sensibles : categorie et tri. */
function persistViewPreferences() {
  writeViewPreferences({
    category: vaultUIState.category,
    sortMode: vaultUIState.sortMode
  });
}

/**
 * Raccorde les controles des DEUX vues.
 *
 * Le champ de recherche du tableau de bord n'avait ni identifiant ni
 * gestionnaire : il ne faisait rien. Il partage desormais exactement le meme
 * etat et le meme pipeline que celui de la vue des mots de passe.
 */
function initializeVaultControls() {
  if (vaultUIState.initialized) return;

  const searchInputs = Array.from(
    document.querySelectorAll('#searchInput, #dashboardSearchInput')
  );

  const applySearch = (value) => {
    vaultUIState.query = value || '';
    // Les deux champs restent synchronises : une meme recherche, un meme
    // resultat, quelle que soit la vue.
    searchInputs.forEach((input) => {
      if (input.value !== vaultUIState.query) input.value = vaultUIState.query;
    });
    // LOT 3B : les DEUX vues sont rendues. Auparavant seule `#entries` etait
    // reconstruite, si bien qu'une recherche saisie sur le tableau de bord
    // ne modifiait rien de ce que le tableau de bord affichait.
    renderAllVaultViews();
  };

  searchInputs.forEach((input) => {
    input.addEventListener('input', (event) => applySearch(event.target.value));
  });

  const categoryButtons = Array.from(
    document.querySelectorAll('.category-filter .category-btn')
  );

  categoryButtons.forEach((button) => {
    // La categorie provient de l'attribut `data-category` du markup ; le
    // libelle ne sert que de repli pour les boutons historiques.
    if (!button.dataset.category) {
      const label = button.textContent?.toLowerCase() || '';
      button.dataset.category = label.includes('banque') ? 'bank'
        : label.includes('email') ? 'email'
          : label.includes('cloud') ? 'cloud'
            : label.includes('seaux') ? 'social'
              : 'all';
    }

    button.setAttribute('aria-pressed', 'false');

    const activate = () => {
      vaultUIState.category = button.dataset.category || 'all';
      markActiveCategory(categoryButtons, vaultUIState.category);
      persistViewPreferences();
      renderAllVaultViews();
    };

    button.addEventListener('click', activate);
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        activate();
      }
    });
  });

  markActiveCategory(categoryButtons, vaultUIState.category);

  const sortButtons = Array.from(document.querySelectorAll('.vault-actions button.sort-button'));
  const legacySort = document.querySelector('#passwords-view .password-tools .vault-actions button:first-child');
  if (legacySort && !sortButtons.includes(legacySort)) sortButtons.push(legacySort);

  sortButtons.forEach((button) => {
    setSortButtonContent(button);
    button.addEventListener('click', () => {
      vaultUIState.sortMode = vaultUIState.sortMode === 'title-asc' ? 'recent' : 'title-asc';
      sortButtons.forEach(setSortButtonContent);
      persistViewPreferences();
      renderAllVaultViews();
    });
  });

  // --- boutons « Filtrer » ------------------------------------------------
  // LOT 3B : ces deux boutons existaient dans index.html sans aucun
  // gestionnaire. Ils ne sont plus decoratifs : chacun affiche ou masque le
  // groupe de filtres de categorie de sa propre vue, designe par
  // `aria-controls`. Si ce groupe est introuvable, le bouton est
  // explicitement desactive plutot que de rester inerte en silence.
  const filterToggles = Array.from(
    document.querySelectorAll('.vault-actions button.filter-button')
  );

  filterToggles.forEach((button) => {
    const groupId = button.getAttribute('aria-controls');
    const group = groupId ? document.getElementById(groupId) : null;

    if (!group) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      button.title = 'Aucun groupe de filtres associé à ce bouton.';
      return;
    }

    const syncState = () => {
      const visible = !group.hidden;
      button.setAttribute('aria-expanded', visible ? 'true' : 'false');
      button.classList.toggle('active', visible);
    };

    syncState();
    button.addEventListener('click', () => {
      group.hidden = !group.hidden;
      syncState();
    });
  });

  if (refreshButton && !sortButtons.includes(refreshButton) && !filterToggles.includes(refreshButton)) {
    refreshButton.addEventListener('click', async () => {
      try {
        const decrypted = await vaultManager.decryptAllEntries();
        renderVaultEntries(decrypted);
        showToast('Liste des mots de passe actualisée.', 'success');
      } catch (error) {
        console.warn('[Vault] Actualisation impossible :', error?.name || 'erreur');
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

/**
 * Raccorde les actions d'une entree rendue.
 *
 * DEFAUT CORRIGE (Lot 3) : la sauvegarde d'une edition en ligne etait
 * branchee sur DEUX evenements a la fois :
 *
 *     input.addEventListener('blur', saveEdit);
 *     btn.addEventListener('click', saveEdit);
 *
 * Cliquer sur le bouton retirait le focus du champ : `blur` declenchait
 * `saveEdit`, puis `click` le declenchait une seconde fois. Les
 * `removeEventListener` etaient places APRES plusieurs `await`, donc trop
 * tard. Chaque sauvegarde appelait en plus `markEntryAccessed`, ce qui
 * pouvait porter une seule action utilisateur a quatre ecritures, deux IV et
 * deux ciphertexts pour la meme modification.
 *
 * L'edition en ligne est desormais remplacee par l'ouverture de la fenetre
 * d'edition complete : un seul evenement, un seul chemin de sauvegarde, et
 * tous les champs modifiables. Le verrou d'entry-operations.js garantit
 * qu'une action utilisateur ne produit qu'une operation, meme si plusieurs
 * evenements la demandent.
 */
function bindEntryActions(container) {
  container.querySelectorAll('.action-btn.copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      const input = btn.closest('.vault-item')?.querySelector('.password-input');
      if (!input) return;

      const copied = await copyToClipboard(input.value);
      if (!copied) return;

      const id = btn.closest('.vault-item')?.dataset.id;
      if (id) await vaultManager.markEntryAccessed(id);
      setButtonIcon(btn, 'fa-check');
      setTimeout(() => {
        setButtonIcon(btn, 'fa-copy');
      }, 1500);
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

      // Verrou local : un second clic pendant la confirmation ou l'ecriture
      // est ignore. Le verrou d'entry-operations.js constitue la seconde
      // barriere, cote metier.
      if (btn.dataset.deleting === 'true') return;
      btn.dataset.deleting = 'true';
      btn.disabled = true;

      try {
        const entry = vaultManager.getEntries().find((item) => item.id === id);
        const identite = describeEntryForConfirmation(entry);

        // Confirmation identifiant l'entree par une donnee NON SECRETE.
        // Construction par textContent uniquement : aucune donnee de coffre
        // ne passe par innerHTML.
        const lignes = [['Entrée', identite.title]];
        if (identite.host) lignes.push(['Site', identite.host]);
        if (identite.username) lignes.push(['Identifiant', identite.username]);

        const confirme = await confirmDialog({
          title: 'Supprimer cette entrée ?',
          message: 'Cette action est définitive pour cette entrée.',
          lines: lignes,
          warning: 'Le mot de passe et les notes ne sont pas affichés ici.',
          confirmLabel: 'Supprimer'
        });
        if (!confirme) return;

        await deleteEntry(vaultManager, id);
        showToast('Entrée supprimée.', 'success');
        // Les vues sont rafraichies par l'abonnement centralise a
        // `vault:entries-changed`.
      } catch (error) {
        console.warn('[Vault] Suppression refusee :', error?.code || 'erreur');
        showToast(error?.message || 'Erreur lors de la suppression.', 'error');
      } finally {
        btn.dataset.deleting = 'false';
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll('.action-btn.edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.vault-item')?.dataset.id;
      if (!id) return;

      // UN SEUL evenement, un seul chemin. La fenetre d'edition prend le
      // relais et permet de modifier tous les champs persistes.
      if (typeof CustomEvent === 'function') {
        document.dispatchEvent(new CustomEvent('vault:edit-entry', { detail: { entryId: id } }));
      }
    });
  });
}

/**
 * Entrees dechiffrees de la SESSION servant de source aux deux vues.
 *
 * `vaultUIState.rawEntries` est alimente par `renderVaultEntries()`. Avant le
 * premier rendu de la liste complete - juste apres le deverrouillage, par
 * exemple - il est vide : la source de reference reste alors le gestionnaire
 * de coffre. Aucune lecture de stockage n'est faite ici.
 */
function sessionEntries() {
  return vaultUIState.rawEntries.length > 0
    ? vaultUIState.rawEntries
    : vaultManager.getEntries();
}

/** Ordre des acces recents, deterministe jusqu'aux egalites. */
function byMostRecentAccess(a, b) {
  const diff = (b.lastAccessed || 0) - (a.lastAccessed || 0);
  if (diff !== 0) return diff;
  const titleA = typeof a.title === 'string' ? a.title : '';
  const titleB = typeof b.title === 'string' ? b.title : '';
  if (titleA !== titleB) return titleA < titleB ? -1 : 1;
  const idA = typeof a.id === 'string' ? a.id : '';
  const idB = typeof b.id === 'string' ? b.id : '';
  return idA < idB ? -1 : (idA > idB ? 1 : 0);
}

/**
 * Acces recents VISIBLES : meme recherche, meme filtre de categorie et meme
 * mode de tri que la vue des mots de passe.
 *
 * LOT 3B - DEFAUT CORRIGE. Le champ de recherche du tableau de bord etait
 * bien ecoute, mais son gestionnaire ne rendait que `#entries`, conteneur de
 * la vue des mots de passe. Sur le tableau de bord, `#recent-entries` restait
 * strictement inchange : la recherche, le filtre et le tri ne produisaient
 * aucun effet visible la ou l'utilisateur les actionnait.
 *
 * @returns {{visible: Array, accessed: number}} `accessed` compte les entrees
 *          reellement consultees, AVANT recherche et filtre. Il permet de
 *          distinguer « aucun acces recent » de « aucun resultat pour cette
 *          recherche » sans jamais afficher un message faussement rassurant.
 */
function buildVisibleRecentEntries(limit) {
  const accessed = sessionEntries().filter((entry) => entry.lastAccessed);

  const filtered = filterEntries(accessed, {
    query: vaultUIState.query,
    category: vaultUIState.category
  });

  // Le mode de tri est celui, unique, partage par les deux vues. En mode
  // « récents » l'ordre est celui des acces ; en mode « A-Z » c'est le
  // comparateur Unicode commun qui s'applique.
  const ordered = vaultUIState.sortMode === 'title-asc'
    ? sortEntries(filtered, 'title-asc')
    : [...filtered].sort(byMostRecentAccess);

  return { visible: ordered.slice(0, limit), accessed: accessed.length };
}

async function renderRecentAccesses(limit = 4) {
  const container = document.getElementById('recent-entries');
  if (!container) return;

  container.replaceChildren();

  const { visible, accessed } = buildVisibleRecentEntries(limit);

  if (!visible.length) {
    // Message HONNETE : il distingue l'absence d'acces recent de l'absence
    // de resultat pour la recherche en cours.
    container.replaceChildren(createEmptyMessage(
      accessed === 0
        ? 'Aucun accès récent.'
        : 'Aucun accès récent ne correspond à la recherche actuelle.'
    ));
    return;
  }

  for (const entry of visible) {
    const wrapper = createRecentEntryElement(entry);

    wrapper.querySelector('.copy')?.addEventListener('click', async () => {
      const copied = await copyToClipboard(entry.password);
      if (!copied) return;
      await vaultManager.markEntryAccessed(entry.id);
      void renderRecentAccesses(limit);
    });

    // LOT 3B : « Modifier » ouvre la fenetre d'edition complete, exactement
    // comme depuis la vue des mots de passe. L'implementation historique de
    // dashboard.js redirigeait vers l'autre vue puis y reactivait l'edition
    // en ligne, chemin de sauvegarde supprime au Lot 3 : le bouton
    // « Enregistrer » qu'elle affichait n'enregistrait donc plus rien.
    wrapper.querySelector('.edit')?.addEventListener('click', () => {
      if (typeof CustomEvent !== 'function') return;
      document.dispatchEvent(new CustomEvent('vault:edit-entry', {
        detail: { entryId: entry.id }
      }));
    });

    container.appendChild(wrapper);
  }
}

/**
 * Rendu des DEUX vues a partir du meme etat.
 *
 * Chaque controle de recherche, de categorie ou de tri passe par ici : une
 * seule action utilisateur met a jour la liste complete ET les acces recents.
 */
function renderAllVaultViews() {
  renderVaultEntries(vaultUIState.rawEntries);
  void renderRecentAccesses().catch(() => { /* rendu best-effort */ });
}

function clearVaultListSession() {
  resetVaultUIState();

  const entries = document.getElementById('entries');
  if (entries) entries.replaceChildren();

  const recentEntries = document.getElementById('recent-entries');
  if (recentEntries) recentEntries.replaceChildren();

  const countElem = document.getElementById('vault-count');
  if (countElem) countElem.textContent = '0/0';
}

export {
  getPasswordsViewControls,
  renderVaultEntries,
  renderRecentAccesses,
  clearVaultListSession
};
