/**
 * Lot 3 - Fenetre d'ajout/modification : idempotence et purge des secrets.
 * DOM synthetique, aucun coffre reel.
 */
import assert from 'node:assert/strict';
import { StubDocument, StubElement } from './helpers/dom-stub.js';
import {
  initEntryModal,
  openCreateModal,
  openEditModal,
  closeEntryModal,
  resetEntryForm
} from '../scripts/ui/entry-modal.js';

function buildModalDom() {
  const doc = new StubDocument();

  const modal = new StubElement('div', { id: 'passwordModal', classes: ['modal-overlay'] });
  const form = new StubElement('form', { id: 'entry-form' });
  const title = new StubElement('input', { id: 'entry-title' });
  const username = new StubElement('input', { id: 'entry-username' });
  const password = new StubElement('input', { id: 'password', type: 'password' });
  const url = new StubElement('input', { id: 'website' });
  const notes = new StubElement('textarea', { id: 'entry-notes' });
  const tags = new StubElement('input', { id: 'entry-tags' });
  const addBtn = new StubElement('button', { id: 'addPasswordBtn' });
  const closeBtn = new StubElement('button', { id: 'closeAddModal' });
  const cancelBtn = new StubElement('button', { id: 'cancelAddModalBtn' });
  const generate = new StubElement('button', { id: 'generate-password' });
  const submit = new StubElement('button', { id: 'submit-entry' });
  const heading = new StubElement('h3');

  const category = new StubElement('select', { id: 'category' });
  category.options = [
    { value: '' }, { value: 'banking' }, { value: 'email' }, { value: 'work' }
  ];
  category.selectedIndex = 0;

  [modal, form, title, username, password, url, notes, tags,
   addBtn, closeBtn, cancelBtn, generate, submit, category].forEach((el) => doc.register(el));

  doc.register(addBtn, ['#addPasswordBtn, .add-button']);
  doc.register(submit, ['#entry-form button[type="submit"]']);
  doc.register(heading, ['#passwordModal .modal-header h3']);

  return { doc, modal, form, title, username, password, url, notes, tags,
    addBtn, closeBtn, cancelBtn, generate, submit, heading, category };
}

try {
  console.log('=== TEST ENTRY MODAL ===');

  // ===== 17. aucune duplication d'ecouteurs ==============================
  {
    const dom = buildModalDom();
    const premier = initEntryModal({ doc: dom.doc });
    assert.equal(premier.bound, true, 'Le premier raccordement doit reussir');

    const second = initEntryModal({ doc: dom.doc });
    assert.equal(second.bound, false, 'Un second appel ne doit pas raccorder a nouveau');
    assert.equal(second.reason, 'already_bound');

    const troisieme = initEntryModal({ doc: dom.doc });
    assert.equal(troisieme.reason, 'already_bound');

    assert.equal(dom.addBtn.listenerCount('click'), 1,
      'Le bouton d ajout ne doit avoir qu un seul ecouteur');
    assert.equal(dom.form.listenerCount('submit'), 1,
      'Le formulaire ne doit avoir qu un seul ecouteur de soumission');
    assert.equal(dom.generate.listenerCount('click'), 1,
      'Le generateur ne doit avoir qu un seul ecouteur');
    assert.equal(dom.closeBtn.listenerCount('click'), 1);
    assert.equal(dom.cancelBtn.listenerCount('click'), 1);
  }

  // ===== Ouverture reelle du flux d'ajout ================================
  {
    const dom = buildModalDom();
    const { fields } = initEntryModal({ doc: dom.doc });

    assert.equal(dom.modal.classList.contains('active'), false, 'Fermee au depart');
    dom.addBtn.dispatchEvent({ type: 'click' });
    assert.equal(dom.modal.classList.contains('active'), true,
      'addPasswordBtn doit ouvrir la fenetre');
    assert.equal(dom.modal.getAttribute('aria-hidden'), 'false');
    assert.equal(dom.heading.textContent, 'Ajouter un nouveau mot de passe');

    // ===== 16. la fermeture purge le mot de passe ========================
    dom.password.value = 'MotDePasseSaisiPuisAbandonne';
    dom.password.type = 'text';
    dom.title.value = 'Brouillon';
    dom.notes.value = 'note abandonnee';

    dom.cancelBtn.dispatchEvent({ type: 'click' });

    assert.equal(dom.modal.classList.contains('active'), false, 'La fenetre doit se fermer');
    assert.equal(dom.password.value, '', 'Le mot de passe doit etre efface a l abandon');
    assert.equal(dom.password.type, 'password', 'Le champ doit repasser en type password');
    assert.equal(dom.title.value, '', 'Le titre doit etre efface');
    assert.equal(dom.notes.value, '', 'Les notes doivent etre effacees');
    assert.equal(dom.modal.getAttribute('aria-hidden'), 'true');

    // Fermeture par la croix, et par Echap.
    openCreateModal(fields);
    dom.password.value = 'AutreSecret';
    dom.closeBtn.dispatchEvent({ type: 'click' });
    assert.equal(dom.password.value, '', 'La croix doit aussi purger le champ');

    openCreateModal(fields);
    dom.password.value = 'EncoreUnSecret';
    dom.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
    assert.equal(dom.modal.classList.contains('active'), false, 'Echap doit fermer');
    assert.equal(dom.password.value, '', 'Echap doit purger le champ');
  }

  // ===== Mode edition : pre-remplissage de tous les champs ===============
  {
    const dom = buildModalDom();
    const { fields } = initEntryModal({ doc: dom.doc });

    openEditModal(fields, {
      id: 'e1',
      title: 'Ma Banque',
      username: 'alice',
      password: 'MotDePasseExistant',
      url: 'https://banque.test/',
      category: 'bank',
      notes: 'note existante',
      tags: ['perso', 'important']
    });

    assert.equal(dom.modal.classList.contains('active'), true);
    assert.equal(dom.heading.textContent, 'Modifier ce mot de passe');
    assert.equal(dom.title.value, 'Ma Banque');
    assert.equal(dom.username.value, 'alice');
    assert.equal(dom.password.value, 'MotDePasseExistant');
    assert.equal(dom.url.value, 'https://banque.test/');
    assert.equal(dom.notes.value, 'note existante');
    assert.equal(dom.tags.value, 'perso, important', 'Les etiquettes sont editables');
    assert.equal(dom.category.value, 'banking',
      'La categorie interne bank correspond a la valeur banking du markup');

    // Le mot de passe reste masque a l'ouverture.
    assert.equal(dom.password.type, 'password',
      'Le mot de passe ne doit jamais s afficher en clair a l ouverture');

    closeEntryModal(fields);
    assert.equal(dom.password.value, '', 'Sortie du mode edition : champ purge');
  }

  // ===== resetEntryForm est sur pour un formulaire incomplet =============
  {
    assert.doesNotThrow(() => resetEntryForm(null));
    assert.doesNotThrow(() => resetEntryForm({}));
  }

  // ===== Absence de fenetre : refus propre ===============================
  {
    const vide = new StubDocument();
    const resultat = initEntryModal({ doc: vide });
    assert.equal(resultat.bound, false);
    assert.equal(resultat.reason, 'modal_absent');
  }

  console.log('Entry modal tests passed.');
} catch (error) {
  console.error('Entry modal tests failed:', error);
  process.exitCode = 1;
}
