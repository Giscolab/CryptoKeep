/**
 * CryptoKeep - Dialogues securises pour l'import et la restauration (Lot 2).
 *
 * Regles :
 * - JAMAIS `prompt()` : la fenetre native n'offre pas de champ masque, son
 *   contenu peut etre conserve par le navigateur, et elle bloque l'onglet ;
 * - le champ de saisie est un `<input type="password">` dedie ;
 * - le champ est vide et retire du DOM apres usage, en reussite comme en
 *   echec, via un bloc `finally` ;
 * - construction exclusivement par APIs DOM et `textContent` : aucun
 *   `innerHTML`, rien qui puisse injecter du balisage depuis un fichier
 *   importe ; aucun style inline, la CSP interdit `unsafe-inline`.
 *
 * LIMITE ASSUMEE : vider le champ et abandonner les references reduit la
 * fenetre d'exposition. La chaine JavaScript contenant le mot de passe ne
 * peut pas etre effacee de la memoire de facon fiable.
 */

function createElement(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function buildOverlay(doc, titleText, descriptionText) {
  const overlay = createElement(doc, 'div', 'modal-overlay secure-dialog active');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const modal = createElement(doc, 'div', 'modal secure-dialog__modal');
  const header = createElement(doc, 'div', 'modal-header');
  const title = createElement(doc, 'h3', 'secure-dialog__title', titleText);
  header.appendChild(title);

  const body = createElement(doc, 'div', 'modal-body');
  if (descriptionText) {
    body.appendChild(createElement(doc, 'p', 'secure-dialog__description', descriptionText));
  }

  const footer = createElement(doc, 'div', 'modal-footer');

  modal.append(header, body, footer);
  overlay.appendChild(modal);

  return { overlay, body, footer, title };
}

/**
 * Demande un mot de passe dans une fenetre dediee.
 *
 * @returns {Promise<string|null>} le mot de passe, ou null si annulation
 */
export function requestPasswordDialog(options = {}) {
  const doc = options.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return Promise.resolve(null);

  const { overlay, body, footer } = buildOverlay(
    doc,
    options.title || 'Mot de passe requis',
    options.description || ''
  );

  const label = createElement(doc, 'label', 'sr-only', 'Mot de passe');
  label.setAttribute('for', 'secure-dialog-password');

  const input = doc.createElement('input');
  input.type = 'password';
  input.id = 'secure-dialog-password';
  input.className = 'auth-form__input secure-dialog__input';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Mot de passe du coffre');

  const error = createElement(doc, 'p', 'secure-dialog__error');
  error.hidden = true;

  body.append(label, input, error);

  const cancel = createElement(doc, 'button', 'btn btn-secondary', 'Annuler');
  cancel.type = 'button';
  const submit = createElement(doc, 'button', 'btn btn-primary', 'Valider');
  submit.type = 'button';
  footer.append(cancel, submit);

  doc.body.appendChild(overlay);
  if (typeof input.focus === 'function') input.focus();

  return new Promise((resolve) => {
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      try {
        resolve(value);
      } finally {
        // Nettoyage inconditionnel : valeur videe, type remis a password,
        // noeud retire du document.
        try {
          input.value = '';
          input.type = 'password';
        } catch {
          /* nettoyage best-effort */
        }
        if (typeof overlay.remove === 'function') overlay.remove();
      }
    };

    submit.addEventListener('click', () => {
      const value = input.value;
      if (!value) {
        error.textContent = 'Un mot de passe est requis.';
        error.hidden = false;
        return;
      }
      finish(value);
    });

    cancel.addEventListener('click', () => finish(null));

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit.click();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
    });
  });
}

/** Ajoute une ligne "libelle : valeur" dans un resume. */
function appendSummaryLine(doc, list, labelText, valueText) {
  const item = createElement(doc, 'li', 'secure-dialog__summary-item');
  item.append(
    createElement(doc, 'span', 'secure-dialog__summary-label', `${labelText} : `),
    createElement(doc, 'span', 'secure-dialog__summary-value', valueText)
  );
  list.appendChild(item);
}

/**
 * Demande une confirmation explicite en presentant un resume.
 *
 * Le resume est construit uniquement avec `textContent` : aucune valeur issue
 * d'un fichier importe ne peut produire du balisage.
 *
 * @param {{title?: string, message?: string, lines?: Array<[string, string]>,
 *          warning?: string, confirmLabel?: string, doc?: Document}} options
 * @returns {Promise<boolean>}
 */
export function confirmDialog(options = {}) {
  const doc = options.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return Promise.resolve(false);

  const { overlay, body, footer } = buildOverlay(
    doc,
    options.title || 'Confirmation requise',
    options.message || ''
  );

  if (Array.isArray(options.lines) && options.lines.length > 0) {
    const list = createElement(doc, 'ul', 'secure-dialog__summary');
    options.lines.forEach((line) => {
      if (!Array.isArray(line) || line.length < 2) return;
      appendSummaryLine(doc, list, String(line[0]), String(line[1]));
    });
    body.appendChild(list);
  }

  if (options.warning) {
    body.appendChild(createElement(doc, 'p', 'secure-dialog__warning', options.warning));
  }

  const cancel = createElement(doc, 'button', 'btn btn-secondary', 'Annuler');
  cancel.type = 'button';
  const confirm = createElement(doc, 'button', 'btn btn-primary', options.confirmLabel || 'Confirmer');
  confirm.type = 'button';
  footer.append(cancel, confirm);

  doc.body.appendChild(overlay);
  if (typeof cancel.focus === 'function') cancel.focus();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try {
        resolve(value);
      } finally {
        if (typeof overlay.remove === 'function') overlay.remove();
      }
    };

    confirm.addEventListener('click', () => finish(true));
    cancel.addEventListener('click', () => finish(false));
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
  });
}

export default { requestPasswordDialog, confirmDialog };
