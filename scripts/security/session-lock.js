import { showAuthScreen } from '../ui/auth-screen/auth-screen.js';
import { clearVaultListSession } from '../ui/vault-list/vault-list.js';
import { showToast } from '../utils/toast.js';
import { clearOwnedClipboard } from '../utils/clipboard.js';
import { clearMasterPasswordField } from './master-password-field.js';
import { closeAllModals } from '../ui/modal-cleanup.js';
import { clearReuseAnalysis } from './password-reuse.js';
import { clearHibpCache } from './hibp-service.js';

function clearInputValue(selector) {
  document.querySelectorAll(selector).forEach((input) => {
    input.value = '';
  });
}

function setButtonIcon(button, iconClass) {
  const icon = document.createElement('i');
  icon.className = `fas ${iconClass}`;
  button.replaceChildren(icon);
}

function clearRenderedSecrets() {
  clearInputValue('.password-input');
  clearInputValue('.url-input');
  clearInputValue('#password');
  clearInputValue('#entry-title');
  clearInputValue('#entry-username');
  clearInputValue('#entry-url');
  clearInputValue('#website');

  document.querySelectorAll('.toggle-password').forEach((button) => {
    setButtonIcon(button, 'fa-eye');
  });

  document.querySelectorAll('.action-btn.edit.editing').forEach((button) => {
    button.classList.remove('editing');
    button.title = 'Modifier';
    setButtonIcon(button, 'fa-edit');
  });

  document.querySelectorAll('.password-reveal, #password-display').forEach((node) => {
    node.textContent = '';
    node.classList.add('hidden');
  });

  document.getElementById('current-entry-preview')?.replaceChildren();
  document.getElementById('reuse-resolver-modal')?.remove();
}

function clearRenderedVaultDom() {
  // Lot 1 : toute modale visible est fermee, y compris celles injectees
  // dynamiquement, avant la purge des vues.
  closeAllModals();
  clearRenderedSecrets();
  clearVaultListSession();
}

// Lot 1 : le nettoyage ne se limite plus a vider la valeur. Le champ
// repasse en type="password" et la case d'affichage est decochee.
function clearMasterPasswordInput() {
  return clearMasterPasswordField();
}

function showLockedAuthScreen() {
  try {
    showAuthScreen();
  } catch (error) {
    console.warn('[LOCK] Affichage de l’écran verrouillé incomplet :', error);
    const authScreen = document.getElementById('auth-screen');
    const vaultUi = document.getElementById('vault-ui');
    if (authScreen) authScreen.hidden = false;
    if (vaultUi) vaultUi.hidden = true;
  }
}

function clearVaultManagerSession(vaultManager) {
  try {
    if (vaultManager && typeof vaultManager.clearSession === 'function') {
      vaultManager.clearSession();
      return;
    }

    if (vaultManager) {
      vaultManager.masterKey = null;
      if (vaultManager.vault && typeof vaultManager.vault.clear === 'function') {
        vaultManager.vault.clear();
      }
    }
  } catch (error) {
    console.warn('[LOCK] Nettoyage mémoire incomplet :', error);
    if (vaultManager) vaultManager.masterKey = null;
  }
}

export async function lockVaultSession(
  vaultManager,
  options = {}
) {
  const {
    notify = true,
    message = 'Session verrouillée automatiquement.',
    type = 'error'
  } = options;

  clearVaultManagerSession(vaultManager);
  clearRenderedVaultDom();
  showLockedAuthScreen();
  clearMasterPasswordInput();

  // LOT 5 : les analyses derivees des entrees dechiffrees n'ont plus aucune
  // raison d'exister une fois le coffre verrouille.
  //   - les groupes de reutilisation retiennent des titres, URL et noms
  //     d'utilisateur, qui sont des donnees de coffre ;
  //   - le cache HIBP retient des condensats derives des mots de passe.
  // Les deux sont en memoire uniquement, et sont vides ici.
  const reuse = clearReuseAnalysis();
  let hibpCacheCleared = false;
  try {
    clearHibpCache();
    hibpCacheCleared = true;
  } catch {
    /* nettoyage best-effort */
  }

  const clipboard = await clearOwnedClipboard();

  if (typeof document !== 'undefined'
    && typeof document.dispatchEvent === 'function'
    && typeof CustomEvent === 'function') {
    try {
      document.dispatchEvent(new CustomEvent('vault:locked'));
    } catch {
      /* diffusion best-effort */
    }
  }

  if (notify) {
    showToast(message, type);
  }

  return {
    masterKeyNull: vaultManager?.masterKey === null,
    entryCount: typeof vaultManager?.getEntries === 'function' ? vaultManager.getEntries().length : 0,
    clipboardCleanupAttempted: clipboard.attempted,
    clipboardCleanupSucceeded: clipboard.succeeded,
    reuseGroupsCleared: reuse.cleared,
    hibpCacheCleared
  };
}
