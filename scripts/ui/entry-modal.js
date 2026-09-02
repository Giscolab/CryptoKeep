/**
 * CryptoKeep - Flux d'ajout et de modification d'une entree (Lot 3).
 *
 * ETAT AVANT CE LOT
 * `addPasswordBtn`, `passwordModal`, `closeAddModal` et `cancelAddModalBtn`
 * existaient dans index.html mais AUCUN script ne les raccordait : la fenetre
 * ne s'ouvrait jamais. Le formulaire `#entry-form` avait bien un gestionnaire
 * dans app.js, mais il ne lisait que le titre, le nom d'utilisateur et le mot
 * de passe : `#website` et `#category` n'etaient jamais persistes.
 *
 * CE MODULE raccorde l'interface existante plutot que d'en creer une nouvelle.
 * Il delegue toute la logique metier a entry-validation.js et
 * entry-operations.js, qui eux-memes s'appuient sur la couche de stockage
 * securisee du Lot 2.
 *
 * Aucune valeur sensible n'est journalisee, et le champ mot de passe est vide
 * a chaque fermeture, en validation comme en abandon.
 */

import { vaultManager } from '../core/vault/manager.js';
import { createEntry, updateEntry } from '../core/vault/entry-operations.js';
import { PasswordGenerator } from '../utils/password-generator.js';
import { showToast } from '../utils/toast.js';


/** Etat de la fenetre : mode courant et identifiant edite. */
const modalState = {
  mode: 'create',
  entryId: null,
  saving: false
};

function byId(doc, id) {
  return doc.getElementById(id);
}

/** Rassemble les references du formulaire, resolues une seule fois. */
function collectFields(doc) {
  return {
    modal: byId(doc, 'passwordModal'),
    form: byId(doc, 'entry-form'),
    title: byId(doc, 'entry-title'),
    username: byId(doc, 'entry-username'),
    password: byId(doc, 'password'),
    url: byId(doc, 'website'),
    category: byId(doc, 'category'),
    notes: byId(doc, 'entry-notes'),
    tags: byId(doc, 'entry-tags'),
    submit: doc.querySelector('#entry-form button[type="submit"]'),
    heading: doc.querySelector('#passwordModal .modal-header h3'),
    generate: byId(doc, 'generate-password'),
    toggle: doc.querySelector('#passwordModal .password-input-wrapper .toggle-password')
  };
}

/**
 * Remet le formulaire a zero.
 *
 * Le champ mot de passe est vide ET repasse en `type="password"` : une valeur
 * sensible ne doit jamais rester visible dans une fenetre fermee.
 */
export function resetEntryForm(fields) {
  if (!fields) return;

  // Acces litteraux : aucune indexation par variable sur l'objet des champs.
  [fields.title, fields.username, fields.password, fields.url, fields.notes, fields.tags]
    .forEach((node) => {
      if (node && 'value' in node) node.value = '';
    });

  if (fields.password) fields.password.type = 'password';

  if (fields.category) {
    // Lot 3b : retire les options ajoutees dynamiquement pour representer la
    // categorie historique de l'entree PRECEDEMMENT ouverte. Sans ce nettoyage
    // elles s'accumuleraient d'une ouverture a l'autre. Les options du markup
    // ne sont jamais touchees.
    const ajoutees = typeof fields.category.querySelectorAll === 'function'
      ? Array.from(fields.category.querySelectorAll('option[data-entry-category-added="true"]'))
      : [];
    ajoutees.forEach((option) => {
      if (typeof option.remove === 'function') option.remove();
    });
    fields.category.selectedIndex = 0;
  }

  if (fields.toggle) {
    const icon = fields.toggle.querySelector('i');
    if (icon) icon.className = 'fas fa-eye';
  }
}

function setModalVisible(fields, visible) {
  if (!fields.modal) return;
  fields.modal.classList.toggle('active', visible);
  fields.modal.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

/** Ferme la fenetre et purge systematiquement les champs sensibles. */
export function closeEntryModal(fields) {
  setModalVisible(fields, false);
  resetEntryForm(fields);
  modalState.mode = 'create';
  modalState.entryId = null;
}

/** Ouvre la fenetre en mode creation. */
export function openCreateModal(fields) {
  modalState.mode = 'create';
  modalState.entryId = null;
  resetEntryForm(fields);

  if (fields.heading) fields.heading.textContent = 'Ajouter un nouveau mot de passe';
  if (fields.submit) fields.submit.textContent = 'Enregistrer';

  setModalVisible(fields, true);
  if (fields.title && typeof fields.title.focus === 'function') fields.title.focus();
}

/** Ouvre la fenetre en mode modification, pre-remplie avec l'entree. */
export function openEditModal(fields, entry) {
  if (!entry) return false;

  modalState.mode = 'edit';
  modalState.entryId = entry.id;
  resetEntryForm(fields);

  const assign = (node, value) => {
    if (node && 'value' in node) node.value = typeof value === 'string' ? value : '';
  };

  assign(fields.title, entry.title);
  assign(fields.username, entry.username);
  assign(fields.password, entry.password);
  assign(fields.url, entry.url);
  assign(fields.notes, entry.notes);
  assign(fields.tags, Array.isArray(entry.tags) ? entry.tags.join(', ') : '');

  if (fields.category && typeof entry.category === 'string' && entry.category.length > 0) {
    // La valeur du markup pour la banque est `banking` ; la categorie interne
    // est `bank`. Les deux sont acceptees a la selection.
    const cible = entry.category === 'bank' ? 'banking' : entry.category;
    const option = Array.from(fields.category.options || [])
      .find((opt) => opt.value === cible || opt.value === entry.category);

    if (option) {
      fields.category.value = option.value;
    } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      // LOT 3B : categorie persistee inconnue du markup. Sans option
      // correspondante, le `<select>` afficherait « Aucune catégorie » et la
      // validation du formulaire effacerait silencieusement une valeur que
      // l'utilisateur n'a pas touchee. L'option est donc ajoutee pour que le
      // formulaire represente fidelement l'entree ouverte.
      const ajoutee = document.createElement('option');
      if (ajoutee.dataset) ajoutee.dataset.entryCategoryAdded = 'true';
      ajoutee.value = entry.category;
      // textContent : aucune donnee d'entree ne passe par innerHTML.
      ajoutee.textContent = entry.category;
      fields.category.appendChild(ajoutee);
      fields.category.value = entry.category;
    }
  }

  if (fields.heading) fields.heading.textContent = 'Modifier ce mot de passe';
  if (fields.submit) fields.submit.textContent = 'Mettre a jour';

  setModalVisible(fields, true);
  if (fields.title && typeof fields.title.focus === 'function') fields.title.focus();
  return true;
}

/** Lit la saisie. Le mot de passe n'est ni journalise ni conserve ailleurs. */
function readForm(fields) {
  const value = (node) => (node && 'value' in node ? node.value : '');

  const input = {
    title: value(fields.title),
    username: value(fields.username),
    password: value(fields.password),
    url: value(fields.url),
    notes: value(fields.notes),
    tags: value(fields.tags)
  };

  // LOT 3B - DEFAUT CORRIGE. La categorie n'etait transmise que lorsqu'elle
  // etait NON VIDE : selectionner « Aucune catégorie » ne transmettait donc
  // rien, la fusion partielle conservait l'ancienne valeur et la categorie
  // d'une entree etait impossible a effacer depuis l'interface.
  //
  // Elle est desormais TOUJOURS transmise des que le `<select>` existe : la
  // chaine vide vaut « aucune categorie », et `normalizeCategory('')` la
  // renvoie telle quelle. L'entree perd alors sa categorie persistee et
  // l'affichage repasse au repli par inference, sans jamais reecrire cette
  // inference dans l'entree.
  //
  // Le risque d'ecrasement silencieux qui motivait l'ancien comportement est
  // traite en amont, dans `openEditModal()` : une entree portant une
  // categorie absente de la liste des options se voit ajouter son option, de
  // sorte que le `<select>` represente fidelement l'entree ouverte.
  if (fields.category) input.category = value(fields.category);

  return input;
}

function setSaving(fields, saving) {
  modalState.saving = saving;
  if (!fields.submit) return;
  fields.submit.disabled = saving;
  fields.submit.setAttribute('aria-busy', saving ? 'true' : 'false');
}

/**
 * Soumission du formulaire.
 *
 * Le bouton est desactive pendant l'enregistrement, et un verrou local
 * complete le verrou d'operation d'entry-operations.js : un clic repete ne
 * peut produire ni double creation ni double modification.
 */
async function handleSubmit(fields, event) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  if (modalState.saving) return { ignored: true, reason: 'saving' };

  setSaving(fields, true);
  const input = readForm(fields);

  try {
    if (modalState.mode === 'edit' && modalState.entryId) {
      await updateEntry(vaultManager, modalState.entryId, input, { partial: false });
      showToast('Entrée mise à jour.', 'success');
    } else {
      await createEntry(vaultManager, input);
      showToast('Entrée enregistrée.', 'success');
    }

    closeEntryModal(fields);
    return { saved: true };
  } catch (error) {
    // Message non sensible : jamais de mot de passe, jamais de detail interne.
    const message = error?.field
      ? `Champ « ${error.field} » : ${error.message}`
      : (error?.message || "L'enregistrement a échoué.");
    showToast(message, 'error', 8000);
    console.warn('[Vault Entry] Refus :', error?.code || 'inconnu');
    return { saved: false, code: error?.code || 'unknown' };
  } finally {
    // Le bouton est toujours reactive, en succes comme en echec.
    setSaving(fields, false);
  }
}

/**
 * Raccorde la fenetre. Idempotent : plusieurs appels n'ajoutent jamais un
 * second jeu d'ecouteurs.
 *
 * @returns {{bound: boolean, reason?: string, fields?: object}}
 */
export function initEntryModal(options = {}) {
  const doc = options.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.getElementById !== 'function') {
    return { bound: false, reason: 'no_document' };
  }

  const fields = collectFields(doc);
  if (!fields.modal || !fields.form) {
    return { bound: false, reason: 'modal_absent' };
  }

  // Marqueur d'idempotence, accede litteralement (data-entry-modal-bound).
  if (fields.modal.dataset && fields.modal.dataset.entryModalBound === 'true') {
    return { bound: false, reason: 'already_bound', fields };
  }
  if (fields.modal.dataset) fields.modal.dataset.entryModalBound = 'true';

  // --- ouverture ---------------------------------------------------------
  doc.querySelectorAll('#addPasswordBtn, .add-button').forEach((button) => {
    button.addEventListener('click', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      openCreateModal(fields);
    });
  });

  // --- fermeture ---------------------------------------------------------
  [byId(doc, 'closeAddModal'), byId(doc, 'cancelAddModalBtn')].forEach((button) => {
    if (button) {
      button.addEventListener('click', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        closeEntryModal(fields);
      });
    }
  });

  // Clic sur le fond, et touche Echap.
  fields.modal.addEventListener('click', (event) => {
    if (event && event.target === fields.modal) closeEntryModal(fields);
  });
  doc.addEventListener('keydown', (event) => {
    if (event && event.key === 'Escape' && fields.modal.classList.contains('active')) {
      closeEntryModal(fields);
    }
  });

  // --- generateur --------------------------------------------------------
  // Le bouton remplit le champ sans jamais enregistrer l'entree, et peut etre
  // actionne autant de fois que voulu. `PasswordGenerator` utilise
  // exclusivement crypto.getRandomValues.
  if (fields.generate && fields.password) {
    fields.generate.addEventListener('click', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      try {
        fields.password.value = PasswordGenerator.generate();
        fields.password.dispatchEvent(new Event('input', { bubbles: true }));
      } catch {
        showToast('Génération impossible.', 'error');
      }
    });
  }

  // --- affichage du mot de passe ----------------------------------------
  if (fields.toggle && fields.password) {
    fields.toggle.addEventListener('click', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      const visible = fields.password.type === 'text';
      fields.password.type = visible ? 'password' : 'text';
      const icon = fields.toggle.querySelector('i');
      if (icon) icon.className = visible ? 'fas fa-eye' : 'fas fa-eye-slash';
    });
  }

  // --- soumission --------------------------------------------------------
  fields.form.addEventListener('submit', (event) => {
    void handleSubmit(fields, event);
  });

  // --- demande d'edition emise par la liste ------------------------------
  doc.addEventListener('vault:edit-entry', (event) => {
    const entryId = event?.detail?.entryId;
    if (!entryId) return;
    const entry = vaultManager.getEntries().find((item) => item.id === entryId);
    if (entry) openEditModal(fields, entry);
  });

  return { bound: true, fields };
}

export default {
  initEntryModal,
  openCreateModal,
  openEditModal,
  closeEntryModal,
  resetEntryForm
};
