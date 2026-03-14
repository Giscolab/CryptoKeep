/**
 * Modal de résolution manuelle des mots de passe réutilisés.
 */

import { PasswordGenerator } from '../utils/password-generator.js';

let currentModal = null;
let currentGroupData = null;
let vaultEntries = [];
let onSaveCallback = null;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function updateProgress() {
  if (!currentGroupData) return;
  const total = currentGroupData.entries.length;
  const done = currentGroupData._completed.length;

  const progressText = document.getElementById('progress-text');
  const progressFill = document.getElementById('progress-fill');
  if (progressText) progressText.textContent = `${done}/${total} modifiés`;
  if (progressFill) progressFill.style.width = `${(done / total) * 100}%`;
}

function showEntryEditor(index) {
  const entry = currentGroupData.entries[index];
  const currentStep = document.getElementById('current-step');
  const title = document.getElementById('current-entry-title');
  const preview = document.getElementById('current-entry-preview');
  const input = document.getElementById('new-password-input');
  const reveal = document.getElementById('password-display');

  if (currentStep) currentStep.textContent = String(index + 1);
  if (title) title.textContent = entry.title || 'Sans titre';
  if (preview) {
    preview.innerHTML = `
      <p><strong>URL:</strong> ${escapeHtml(entry.url || 'N/A')}</p>
      <p><strong>Identifiant:</strong> ${escapeHtml(entry.username || 'N/A')}</p>
    `;
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

  const successMsg = document.createElement('div');
  successMsg.className = 'alert alert-success';
  successMsg.innerHTML = `
    <strong>✅ Traitement terminé</strong><br>
    ${currentGroupData._completed.length} sur ${currentGroupData.entries.length} comptes mis à jour.
  `;

  const body = currentModal?.querySelector('.modal-body');
  if (body) body.prepend(successMsg);

  document.dispatchEvent(new CustomEvent('vault:security-updated'));
}

export function openReuseResolver(group, allEntries, saveFn) {
  vaultEntries = allEntries;
  currentGroupData = group;
  onSaveCallback = saveFn;

  const modal = document.createElement('div');
  modal.id = 'reuse-resolver-modal';
  modal.className = 'modal security-modal';
  modal.innerHTML = `
    <div class="modal-content reuse-resolver">
      <header class="modal-header warning">
        <span class="icon">⚠️</span>
        <h2>Réutilisation détectée : ${group.entries.length} comptes</h2>
        <button class="btn-close" data-action="close">×</button>
      </header>

      <div class="modal-body">
        <div class="alert alert-warning">
          <strong>Risque de sécurité élevé</strong><br>
          Le même mot de passe est actuellement utilisé sur ${group.entries.length} comptes différents.
        </div>

        <section class="affected-accounts">
          <h3>Comptes concernés</h3>
          <ul class="account-list">
            ${group.entries.map((entry) => `
              <li class="account-item" data-entry-id="${entry.id}">
                <div class="account-info">
                  <strong>${escapeHtml(entry.title || 'Sans titre')}</strong>
                  ${entry.url ? `<span class="account-url">${escapeHtml(entry.url)}</span>` : ''}
                  <span class="account-user">${escapeHtml(entry.username || 'N/A')}</span>
                </div>
                <span class="status-badge status-pending">En attente</span>
              </li>
            `).join('')}
          </ul>
        </section>

        <section class="resolution-options">
          <h3>Mode de correction</h3>
          <div class="option-cards">
            <div class="option-card">
              <h4>📝 Modification manuelle</h4>
              <p>Édition individuelle avec confirmation explicite.</p>
              <button class="btn btn-secondary" data-action="manual">Modifier manuellement</button>
            </div>

            <div class="option-card">
              <h4>🎰 Génération assistée</h4>
              <p>Pré-remplissage unique par entrée puis validation manuelle.</p>
              <div class="generation-params">
                <label>Longueur: <input type="range" id="pwd-length" min="16" max="32" value="20"></label>
                <span id="pwd-length-val">20</span> caractères
              </div>
              <button class="btn btn-primary" data-action="generate">Générer et pré-remplir</button>
            </div>
          </div>
        </section>

        <section id="resolution-workflow" class="hidden">
          <h3>Traitement en cours <span id="current-step">1</span>/${group.entries.length}</h3>
          <div class="current-entry-card">
            <h4 id="current-entry-title"></h4>
            <div id="current-entry-preview"></div>

            <div class="password-actions">
              <button class="btn btn-outline" data-action="show-current">Afficher le mot de passe actuel</button>
              <div id="password-display" class="password-reveal hidden"></div>
            </div>

            <div class="manual-edit-form" id="manual-form">
              <label>Nouveau mot de passe :
                <input type="password" id="new-password-input" class="password-input">
              </label>
              <button class="btn btn-secondary" data-action="generate-one">Générer pour cette entrée</button>
            </div>
          </div>

          <div class="workflow-controls">
            <button class="btn btn-outline" data-action="skip">Ignorer (temporairement)</button>
            <button class="btn btn-primary" data-action="confirm" id="btn-confirm">Confirmer la modification</button>
          </div>
        </section>
      </div>

      <footer class="modal-footer">
        <div class="progress-info">
          <span id="progress-text">0/${group.entries.length} modifiés</span>
          <div class="progress-bar"><div id="progress-fill" style="width:0%"></div></div>
        </div>
        <button class="btn btn-outline" data-action="close">Fermer (annuler le reste)</button>
      </footer>
    </div>
  `;

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
        const item = modal.querySelector(`li[data-entry-id="${currentEntry.id}"] .status-badge`);
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
