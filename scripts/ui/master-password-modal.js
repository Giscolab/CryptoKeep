/**
 * CryptoKeep - Fenetre de changement du mot de passe maitre (Lot 4).
 *
 * ETAT AVANT CE LOT
 * `#changePasswordBtn` et `#changePasswordModal` existaient dans index.html
 * sans AUCUN gestionnaire : la fenetre ne s'ouvrait jamais. Le bouton de
 * validation n'avait pas d'identifiant, et le pied de fenetre etait un frere
 * de `.modal`, donc rendu hors de la boite de dialogue.
 *
 * CE MODULE raccorde l'interface existante. Toute la logique metier et
 * cryptographique vit dans scripts/core/vault/master-password-change.js, qui
 * ne connait pas le DOM.
 *
 * HYGIENE DES CHAMPS
 * Les trois champs de mot de passe sont vides ET remis en `type="password"`
 * dans un `finally` : a la fermeture, a l'annulation, apres un succes ET
 * apres un echec. Aucune valeur n'est conservee dans une variable de module,
 * ni copiee ailleurs, ni journalisee.
 *
 * MESSAGES
 * Le message affiche est celui du module metier, deja generique. Aucun detail
 * cryptographique, aucun mot de passe. La console ne recoit que le CODE de
 * refus, jamais la saisie.
 */

import { vaultManager } from '../core/vault/manager.js';
import {
  changeMasterPassword,
  MasterPasswordChangeError
} from '../core/vault/master-password-change.js';
import { evaluatePasswordStrength } from './password-meter/password-meter.js';
import { showToast } from '../utils/toast.js';

/** Etat de la fenetre. Ne contient JAMAIS de mot de passe. */
const modalState = {
  saving: false
};

function byId(doc, id) {
  return doc.getElementById(id);
}

/** Rassemble les references, resolues une seule fois. */
export function collectChangePasswordFields(doc) {
  return {
    modal: byId(doc, 'changePasswordModal'),
    current: byId(doc, 'currentPassword'),
    next: byId(doc, 'newPassword'),
    confirm: byId(doc, 'confirmPassword'),
    submit: byId(doc, 'confirmChangePasswordBtn'),
    cancel: byId(doc, 'cancelChangeModalBtn'),
    close: byId(doc, 'closeChangeModal'),
    open: byId(doc, 'changePasswordBtn'),
    strength: byId(doc, 'changePasswordStrength'),
    strengthLabel: byId(doc, 'changePasswordStrengthLabel'),
    message: byId(doc, 'changePasswordMessage')
  };
}

/**
 * Vide les trois champs et retablit leur masquage.
 *
 * Appele a chaque fermeture, quelle qu'en soit la cause. Un mot de passe
 * maitre ne doit jamais rester visible ni saisi dans une fenetre fermee.
 */
export function resetChangePasswordForm(fields) {
  if (!fields) return;

  [fields.current, fields.next, fields.confirm].forEach((node) => {
    if (!node) return;
    if ('value' in node) node.value = '';
    node.type = 'password';
  });

  // Les icones d'affichage repassent a l'oeil ferme.
  if (fields.modal && typeof fields.modal.querySelectorAll === 'function') {
    fields.modal.querySelectorAll('.toggle-password i').forEach((icon) => {
      icon.className = 'fas fa-eye';
    });
  }

  renderStrength(fields, 0, false);
  clearMessage(fields);
}

function clearMessage(fields) {
  if (!fields.message) return;
  fields.message.textContent = '';
  fields.message.hidden = true;
  fields.message.classList.remove('is-error', 'is-success');
}

/**
 * Affiche un message. `textContent` uniquement : aucune donnee ne passe par
 * innerHTML.
 */
function showMessage(fields, texte, type) {
  if (!fields.message) return;
  fields.message.textContent = texte;
  fields.message.hidden = false;
  fields.message.classList.toggle('is-error', type === 'error');
  fields.message.classList.toggle('is-success', type === 'success');
}

/**
 * Indicateur de solidite propre a cette fenetre.
 *
 * `active` n'est jamais allume pour un champ vide : un indicateur qui montre
 * un niveau sans avoir rien analyse serait un resultat sans donnee.
 */
function renderStrength(fields, score, hasInput) {
  if (!fields.strength || typeof fields.strength.querySelectorAll !== 'function') return;

  const dots = Array.from(fields.strength.querySelectorAll('.strength-dot'));
  dots.forEach((dot, index) => {
    dot.classList.toggle('active', hasInput && index < score);
  });

  if (fields.strengthLabel) {
    const labels = ['Tres faible', 'Faible', 'Moyen', 'Bon', 'Fort'];
    fields.strengthLabel.textContent = hasInput
      ? (labels[Math.max(0, Math.min(4, score - 1))] || '')
      : '';
  }
}

function setModalVisible(fields, visible) {
  if (!fields.modal) return;
  fields.modal.classList.toggle('active', visible);
  fields.modal.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

/** Ouvre la fenetre, toujours sur un formulaire vierge. */
export function openChangePasswordModal(fields) {
  resetChangePasswordForm(fields);
  setModalVisible(fields, true);
  if (fields.current && typeof fields.current.focus === 'function') fields.current.focus();
}

/** Ferme la fenetre et purge systematiquement les champs. */
export function closeChangePasswordModal(fields) {
  setModalVisible(fields, false);
  resetChangePasswordForm(fields);
}

/**
 * Vide les trois champs et retablit leur masquage, sans toucher au reste.
 *
 * Separe de `resetChangePasswordForm` parce qu'il est appele PENDANT une
 * operation en cours, ou l'indicateur et le message ne doivent pas bouger.
 */
function purgeFields(fields) {
  [fields.current, fields.next, fields.confirm].forEach((node) => {
    if (!node) return;
    if ('value' in node) node.value = '';
    node.type = 'password';
  });
}

function setSaving(fields, saving) {
  modalState.saving = saving;
  if (fields.submit) {
    fields.submit.disabled = saving;
    fields.submit.setAttribute('aria-busy', saving ? 'true' : 'false');
  }
  if (fields.cancel) fields.cancel.disabled = saving;
}

/**
 * Soumission.
 *
 * Les trois valeurs sont lues, puis les champs du DOM sont purges
 * IMMEDIATEMENT : des que la saisie est capturee, les noeuds du document
 * n'ont plus aucune raison de porter un mot de passe maitre, et l'operation
 * dure le temps de deux derivations PBKDF2 a 220 000 iterations. Un second
 * passage a lieu dans le `finally`, succes comme echec, pour couvrir les
 * sorties anticipees.
 *
 * Les valeurs ne sont recopiees dans aucune variable de module : elles vivent
 * dans la portee de cette fonction, et le module metier ne les conserve pas.
 *
 * @returns {Promise<{changed: boolean, code?: string}>}
 */
export async function submitChangePassword(fields, deps = {}) {
  if (modalState.saving) return { changed: false, code: 'saving' };

  const manager = deps.vaultManager || vaultManager;
  setSaving(fields, true);
  clearMessage(fields);

  const value = (node) => (node && 'value' in node ? node.value : '');
  const saisie = {
    currentPassword: value(fields.current),
    newPassword: value(fields.next),
    confirmPassword: value(fields.confirm)
  };

  // La saisie est captee : les champs du document sont vides sur-le-champ.
  purgeFields(fields);
  renderStrength(fields, 0, false);

  try {
    const rapport = await changeMasterPassword(manager, saisie, deps.changeOptions || {});

    const avertissements = [];
    if (rapport.backup && rapport.backup.written === false) {
      avertissements.push('La sauvegarde secondaire n\'a pas pu être mise à jour.');
    }
    // Lot 7b : le renouvellement de session peut echouer APRES un changement
    // reussi. Le message doit alors dire que le changement a bien eu lieu.
    if (rapport.session && rapport.session.reason === 'session_renewal_failed') {
      avertissements.push(rapport.session.message);
    }

    showToast(
      `Mot de passe principal modifié.${avertissements.length ? ' ' + avertissements.join(' ') : ''}`,
      avertissements.length ? 'warning' : 'success',
      avertissements.length ? 9000 : 3000
    );
    closeChangePasswordModal(fields);
    return { changed: true, entryCount: rapport.entryCount };
  } catch (error) {
    const estConnue = error instanceof MasterPasswordChangeError;
    const message = estConnue
      ? error.message
      : 'Le changement de mot de passe n\'a pas pu aboutir.';

    showMessage(fields, message, 'error');
    // Seul le CODE est journalise. Jamais la saisie, jamais un detail interne.
    console.warn('[Vault] Changement de mot de passe refuse :', estConnue ? error.code : 'inconnu');

    // Le champ fautif reprend le focus quand il est identifie.
    const champ = estConnue && error.details ? error.details.field : null;
    const cible = champ === 'currentPassword' ? fields.current
      : champ === 'newPassword' ? fields.next
        : champ === 'confirmPassword' ? fields.confirm : null;
    if (cible && typeof cible.focus === 'function') cible.focus();

    return { changed: false, code: estConnue ? error.code : 'unknown' };
  } finally {
    // Second passage, qui couvre toute sortie anticipee. En cas d'echec la
    // fenetre reste ouverte, mais vide : la saisie est a refaire.
    purgeFields(fields);
    renderStrength(fields, 0, false);
    setSaving(fields, false);
  }
}

/**
 * Raccorde la fenetre. Idempotent : plusieurs appels n'ajoutent jamais un
 * second jeu d'ecouteurs.
 *
 * @returns {{bound: boolean, reason?: string, fields?: object}}
 */
export function initMasterPasswordModal(options = {}) {
  const doc = options.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.getElementById !== 'function') {
    return { bound: false, reason: 'no_document' };
  }

  const fields = collectChangePasswordFields(doc);
  if (!fields.modal) return { bound: false, reason: 'modal_absent' };

  // Marqueur d'idempotence, accede litteralement.
  if (fields.modal.dataset && fields.modal.dataset.changePasswordBound === 'true') {
    return { bound: false, reason: 'already_bound', fields };
  }
  if (fields.modal.dataset) fields.modal.dataset.changePasswordBound = 'true';

  // --- ouverture ---------------------------------------------------------
  if (fields.open) {
    fields.open.addEventListener('click', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      openChangePasswordModal(fields);
    });
  }

  // --- fermeture ---------------------------------------------------------
  [fields.close, fields.cancel].forEach((button) => {
    if (!button) return;
    button.addEventListener('click', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      closeChangePasswordModal(fields);
    });
  });

  fields.modal.addEventListener('click', (event) => {
    if (event && event.target === fields.modal) closeChangePasswordModal(fields);
  });

  doc.addEventListener('keydown', (event) => {
    if (event && event.key === 'Escape' && fields.modal.classList.contains('active')) {
      closeChangePasswordModal(fields);
    }
  });

  // --- affichage des mots de passe --------------------------------------
  if (typeof fields.modal.querySelectorAll === 'function') {
    fields.modal.querySelectorAll('.toggle-password').forEach((button) => {
      button.addEventListener('click', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        const wrapper = typeof button.closest === 'function'
          ? button.closest('.password-input-wrapper')
          : null;
        const input = wrapper && typeof wrapper.querySelector === 'function'
          ? wrapper.querySelector('input')
          : null;
        if (!input) return;

        const visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        const icon = typeof button.querySelector === 'function' ? button.querySelector('i') : null;
        if (icon) icon.className = visible ? 'fas fa-eye' : 'fas fa-eye-slash';
      });
    });
  }

  // --- indicateur de solidite -------------------------------------------
  if (fields.next) {
    fields.next.addEventListener('input', (event) => {
      const saisie = (event && event.target && event.target.value) || '';
      renderStrength(fields, evaluatePasswordStrength(saisie), saisie.length > 0);
    });
  }

  // --- validation --------------------------------------------------------
  if (fields.submit) {
    fields.submit.addEventListener('click', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      void submitChangePassword(fields, options);
    });
  }

  return { bound: true, fields };
}

export default {
  initMasterPasswordModal,
  openChangePasswordModal,
  closeChangePasswordModal,
  resetChangePasswordForm,
  submitChangePassword,
  collectChangePasswordFields
};
