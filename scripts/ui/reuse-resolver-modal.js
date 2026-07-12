/**
 * Modal de résolution manuelle des mots de passe réutilisés.
 */

import { PasswordGenerator } from '../utils/password-generator.js';

let currentModal = null;
let currentGroupData = null;
let vaultEntries = [];
let onSaveCallback = null;

function toText(value, fallback = '') {
  return value === null || value === undefined ? fallback : String(value);
}

function createElement(tagName, className = '', text = '') {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function createActionButton(className, text, action) {
  const button = createElement('button', className, text);
  button.dataset.action = action;
  return button;
}

function appendFieldLine(container, label, value) {
  const line = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = label;
  line.append(strong, document.createTextNode(` ${value}`));
  container.appendChild(line);
}

function appendAlert(container, className, title, detail) {
  const alert = createElement('div', className);
  const strong = document.createElement('strong');
  strong.textContent = title;
  alert.append(strong, document.createElement('br'), document.createTextNode(detail));
  container.appendChild(alert);
}

function findAccountStatusBadge(modal, entryId) {
  const targetId = toText(entryId);
  const item = [...modal.querySelectorAll('.account-item')]
    .find(candidate => candidate.dataset.entryId === targetId);
  return item?.querySelector('.status-badge') || null;
}

function updateProgress() {
  if (!currentGroupData) return;
  const total = currentGroupData.entries.length;
  const done = currentGroupData._completed?.length || 0;

  const progressText = document.getElementById('progress-text');
  const progressFill = document.getElementById('progress-fill');
  if (progressText) progressText.textContent = `${done}/${total} modifiés`;
  if (progressFill) {
    progressFill.max = total;
    progressFill.value = done;
  }
}

function showEntryEditor(index) {
  const entry = currentGroupData.entries[index];
  const currentStep = document.getElementById('current-step');
  const title = document.getElementById('current-entry-title');
  const preview = document.getElementById('current-entry-preview');
  const input = document.getElementById('new-password-input');
  const reveal = document.getElementById('password-display');

  if (currentStep) currentStep.textContent = String(index + 1);
  if (title) title.textContent = toText(entry.title, 'Sans titre') || 'Sans titre';
  if (preview) {
    preview.replaceChildren();
    appendFieldLine(preview, 'URL:', toText(entry.url, 'N/A') || 'N/A');
    appendFieldLine(preview, 'Identifiant:', toText(entry.username, 'N/A') || 'N/A');
  }

  if (reveal) {
    reveal.textContent = '';
    reveal.classList.add('hidden');
  }

  if (input) {
    if (currentGroupData._mode === 'generated') {
      input.value = currentGroupData._generatedPasswords[index];
      input.type = 'text';
    } else {
      input.value = '';
      input.type = 'password';
    }
  }

  updateProgress();
}

function moveToNext() {
  currentGroupData._currentIndex += 1;
  if (currentGroupData._currentIndex < currentGroupData.entries.length) {
    showEntryEditor(currentGroupData._currentIndex);
    return;
  }

  updateProgress();
  const btn = document.getElementById('btn-confirm');
  if (btn) btn.disabled = true;

  const successMsg = createElement('div', 'alert alert-success');
  const strong = document.createElement('strong');
  strong.textContent = '✅ Traitement terminé';
  successMsg.append(
    strong,
    document.createElement('br'),
    document.createTextNode(`${currentGroupData._completed.length} sur ${currentGroupData.entries.length} comptes mis à jour.`)
  );

  const body = currentModal?.querySelector('.modal-body');
  if (body) body.prepend(successMsg);

  document.dispatchEvent(new CustomEvent('vault:security-updated'));
}

function buildAffectedAccountsSection(group) {
  const section = createElement('section', 'affected-accounts');
  section.appendChild(createElement('h3', '', 'Comptes concernés'));

  const list = createElement('ul', 'account-list');
  for (const entry of group.entries) {
    const item = createElement('li', 'account-item');
    item.dataset.entryId = toText(entry.id);

    const info = createElement('div', 'account-info');

    const title = document.createElement('strong');
    title.textContent = toText(entry.title, 'Sans titre') || 'Sans titre';
    info.appendChild(title);

    if (entry.url) {
      const url = createElement('span', 'account-url');
      url.textContent = toText(entry.url);
      info.appendChild(url);
    }

    const username = createElement('span', 'account-user');
    username.textContent = toText(entry.username, 'N/A') || 'N/A';
    info.appendChild(username);

    const status = createElement('span', 'status-badge status-pending', 'En attente');
    item.append(info, status);
    list.appendChild(item);
  }

  section.appendChild(list);
  return section;
}

function buildResolutionOptions() {
  const section = createElement('section', 'resolution-options');
  section.appendChild(createElement('h3', '', 'Mode de correction'));

  const cards = createElement('div', 'option-cards');

  const manualCard = createElement('div', 'option-card');
  manualCard.append(
    createElement('h4', '', '📝 Modification manuelle'),
    createElement('p', '', 'Édition individuelle avec confirmation explicite.'),
    createActionButton('btn btn-secondary', 'Modifier manuellement', 'manual')
  );

  const generatedCard = createElement('div', 'option-card');
  generatedCard.append(
    createElement('h4', '', '🎰 Génération assistée'),
    createElement('p', '', 'Pré-remplissage unique par entrée puis validation manuelle.')
  );

  const params = createElement('div', 'generation-params');
  const lengthLabel = document.createElement('label');
  lengthLabel.appendChild(document.createTextNode('Longueur: '));

  const lengthInput = document.createElement('input');
  lengthInput.type = 'range';
  lengthInput.id = 'pwd-length';
  lengthInput.min = '16';
  lengthInput.max = '32';
  lengthInput.value = '20';

  lengthLabel.appendChild(lengthInput);

  const lengthValue = createElement('span', '', '20');
  lengthValue.id = 'pwd-length-val';

  params.append(lengthLabel, lengthValue, document.createTextNode(' caractères'));
  generatedCard.append(params, createActionButton('btn btn-primary', 'Générer et pré-remplir', 'generate'));

  cards.append(manualCard, generatedCard);
  section.appendChild(cards);
  return section;
}

function buildWorkflowSection(group) {
  const section = createElement('section', 'hidden');
  section.id = 'resolution-workflow';

  const heading = document.createElement('h3');
  heading.append(
    document.createTextNode('Traitement en cours '),
    createElement('span', '', '1'),
    document.createTextNode(`/${group.entries.length}`)
  );
  heading.querySelector('span').id = 'current-step';

  const card = createElement('div', 'current-entry-card');

  const currentTitle = document.createElement('h4');
  currentTitle.id = 'current-entry-title';

  const currentPreview = document.createElement('div');
  currentPreview.id = 'current-entry-preview';

  const passwordActions = createElement('div', 'password-actions');
  const revealButton = createActionButton('btn btn-outline', 'Afficher le mot de passe actuel', 'show-current');
  const passwordDisplay = createElement('div', 'password-reveal hidden');
  passwordDisplay.id = 'password-display';
  passwordActions.append(revealButton, passwordDisplay);

  const manualForm = createElement('div', 'manual-edit-form');
  manualForm.id = 'manual-form';

  const passwordLabel = document.createElement('label');
  passwordLabel.appendChild(document.createTextNode('Nouveau mot de passe :'));

  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.id = 'new-password-input';
  passwordInput.className = 'password-input';
  passwordLabel.appendChild(passwordInput);

  manualForm.append(
    passwordLabel,
    createActionButton('btn btn-secondary', 'Générer pour cette entrée', 'generate-one')
  );

  card.append(currentTitle, currentPreview, passwordActions, manualForm);

  const controls = createElement('div', 'workflow-controls');
  const skipButton = createActionButton('btn btn-outline', 'Ignorer (temporairement)', 'skip');
  const confirmButton = createActionButton('btn btn-primary', 'Confirmer la modification', 'confirm');
  confirmButton.id = 'btn-confirm';
  controls.append(skipButton, confirmButton);

  section.append(heading, card, controls);
  return section;
}

function buildModal(group) {
  const modal = createElement('div', 'modal security-modal');
  modal.id = 'reuse-resolver-modal';

  const content = createElement('div', 'modal-content reuse-resolver');

  const header = createElement('header', 'modal-header warning');
  header.append(
    createElement('span', 'icon', '⚠️'),
    createElement('h2', '', `Réutilisation détectée : ${group.entries.length} comptes`),
    createActionButton('btn-close', '×', 'close')
  );

  const body = createElement('div', 'modal-body');
  appendAlert(
    body,
    'alert alert-warning',
    'Risque de sécurité élevé',
    `Le même mot de passe est actuellement utilisé sur ${group.entries.length} comptes différents.`
  );
  body.append(
    buildAffectedAccountsSection(group),
    buildResolutionOptions(),
    buildWorkflowSection(group)
  );

  const footer = createElement('footer', 'modal-footer');
  const progress = createElement('div', 'progress-info');

  const progressText = createElement('span', '', `0/${group.entries.length} modifiés`);
  progressText.id = 'progress-text';

  const progressBar = document.createElement('progress');
  progressBar.className = 'progress-bar';
  const progressFill = progressBar;
  progressFill.id = 'progress-fill';
  progressFill.max = group.entries.length;
  progressFill.value = 0;

  progress.append(progressText, progressBar);
  footer.append(progress, createActionButton('btn btn-outline', 'Fermer (annuler le reste)', 'close'));

  content.append(header, body, footer);
  modal.appendChild(content);
  return modal;
}

export function openReuseResolver(group, allEntries, saveFn) {
  vaultEntries = allEntries;
  currentGroupData = group;
  onSaveCallback = saveFn;

  const modal = buildModal(group);

  document.body.appendChild(modal);
  currentModal = modal;

  const lengthInput = modal.querySelector('#pwd-length');
  const lengthValue = modal.querySelector('#pwd-length-val');

  lengthInput?.addEventListener('input', (event) => {
    lengthValue.textContent = event.target.value;
  });

  modal.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'close') {
      closeReuseResolver();
      return;
    }

    if (action === 'manual') {
      modal.querySelector('.option-cards')?.classList.add('hidden');
      modal.querySelector('#resolution-workflow')?.classList.remove('hidden');
      currentGroupData._mode = 'manual';
      currentGroupData._currentIndex = 0;
      currentGroupData._completed = [];
      showEntryEditor(0);
      return;
    }

    if (action === 'generate') {
      const length = parseInt(document.getElementById('pwd-length')?.value || '20', 10);
      currentGroupData._generatedPasswords = currentGroupData.entries.map(() => PasswordGenerator.generate({ length }));
      modal.querySelector('.option-cards')?.classList.add('hidden');
      modal.querySelector('#resolution-workflow')?.classList.remove('hidden');
      currentGroupData._mode = 'generated';
      currentGroupData._currentIndex = 0;
      currentGroupData._completed = [];
      showEntryEditor(0);
      return;
    }

    if (action === 'show-current') {
      const currentEntry = currentGroupData.entries[currentGroupData._currentIndex];
      const fullEntry = vaultEntries.find((entry) => entry.id === currentEntry.id);
      const display = document.getElementById('password-display');
      if (display) {
        display.textContent = fullEntry?.password || '';
        display.classList.remove('hidden');
      }
      return;
    }

    if (action === 'generate-one') {
      const length = parseInt(document.getElementById('pwd-length')?.value || '20', 10);
      const input = document.getElementById('new-password-input');
      if (input) {
        input.value = PasswordGenerator.generate({ length });
        input.type = 'text';
      }
      return;
    }

    if (action === 'skip') {
      moveToNext();
      return;
    }

    if (action === 'confirm') {
      const input = document.getElementById('new-password-input');
      const newPassword = input?.value || '';
      if (newPassword.length < 8) {
        window.alert('Le mot de passe doit faire au moins 8 caractères');
        return;
      }

      const currentEntry = currentGroupData.entries[currentGroupData._currentIndex];
      const fullEntry = vaultEntries.find((entry) => entry.id === currentEntry.id);

      const remainingPasswords = currentGroupData.entries
        .slice(currentGroupData._currentIndex + 1)
        .map((entry) => vaultEntries.find((candidate) => candidate.id === entry.id)?.password);

      if (remainingPasswords.includes(newPassword)) {
        window.alert('ERREUR : ce mot de passe est encore utilisé dans ce groupe.');
        return;
      }

      const updatedEntry = { ...fullEntry, password: newPassword };
      try {
        await onSaveCallback(updatedEntry);
        const item = findAccountStatusBadge(modal, currentEntry.id);
        if (item) {
          item.className = 'status-badge status-done';
          item.textContent = 'Modifié';
        }

        const cachedEntry = vaultEntries.find((entry) => entry.id === currentEntry.id);
        if (cachedEntry) cachedEntry.password = newPassword;

        currentGroupData._completed.push(currentEntry.id);
        moveToNext();
      } catch (error) {
        window.alert(`Erreur de sauvegarde : ${error?.message || error}`);
      }
    }
  });
}

export function closeReuseResolver() {
  if (!currentModal) return;
  currentModal.remove();
  currentModal = null;
  currentGroupData = null;
  onSaveCallback = null;
}
