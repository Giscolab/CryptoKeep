/**
 * Lot 1 - Deconnexion manuelle reelle.
 * Donnees synthetiques uniquement. Aucun coffre reel n'est ouvert.
 */
import { StubDocument, StubElement, StubWindow } from './helpers/dom-stub.js';
import assert from 'node:assert/strict';

// LOT 9 : l'assertion maison est remplacee par `node:assert/strict`, qui
// s'appelle de la meme facon — assert(valeur, message) — mais apporte en
// plus `equal`, `deepEqual`, `rejects` et un diff lisible en cas d'echec.

/** Coffre synthetique reproduisant l'interface utilisee par le verrouillage. */
function makeFakeVaultManager() {
  return {
    masterKey: { type: 'cle-synthetique' },
    salt: new Uint8Array([1, 2, 3, 4]),
    formatVersion: 2,
    storageDeleted: false,
    vault: { entries: [{ id: 'a', title: 'Fixture' }] },
    getEntries() { return this.vault.entries.slice(); },
    clearSession() {
      if (this.salt instanceof Uint8Array) this.salt.fill(0);
      this.masterKey = null;
      this.salt = null;
      this.formatVersion = null;
      this.vault.entries = [];
    }
  };
}

function buildDom() {
  const doc = new StubDocument();

  const logout = new StubElement('div', { id: 'logout-button', classes: ['logout'] });
  doc.register(logout, ['.logout', '#logout-button']);

  const authScreen = new StubElement('section', { id: 'auth-screen' });
  authScreen.hidden = true;
  const vaultUi = new StubElement('div', { id: 'vault-ui' });
  doc.register(authScreen);
  doc.register(vaultUi);

  const masterInput = new StubElement('input', { id: 'master-password', type: 'text', value: 'synthetique' });
  const toggle = new StubElement('input', { id: 'toggle-password-visibility', type: 'checkbox', checked: true });
  doc.register(masterInput);
  doc.register(toggle);

  const dashboard = new StubElement('section', { id: 'dashboard-view', classes: ['view'] });
  const passwords = new StubElement('section', { id: 'passwords-view', classes: ['view'] });
  passwords.hidden = false;
  doc.register(dashboard, ['.view']);
  doc.register(passwords, ['.view']);

  const navDashboard = new StubElement('a', { id: 'nav-dashboard' });
  const navPasswords = new StubElement('a', { id: 'nav-passwords', classes: ['active'] });
  doc.register(navDashboard, ['.sidebar nav a']);
  doc.register(navPasswords, ['.sidebar nav a']);

  const modal = new StubElement('div', { id: 'changePasswordModal', classes: ['modal-overlay', 'active'] });
  doc.register(modal, ['.modal-overlay.active']);
  const dynamicModal = new StubElement('div', { id: 'reuse-resolver-modal' });
  doc.register(dynamicModal, ['#reuse-resolver-modal']);

  const passwordField = new StubElement('input', { id: 'password', type: 'password', value: 'secret-synthetique' });
  doc.register(passwordField, ['#password']);

  const reveal = new StubElement('span', { id: 'password-display' });
  reveal.textContent = 'secret-affiche';
  doc.register(reveal, ['.password-reveal, #password-display']);

  const entries = new StubElement('div', { id: 'entries' });
  entries.children = [new StubElement('div')];
  doc.register(entries);

  return { doc, logout, authScreen, vaultUi, masterInput, toggle, dashboard, passwords, navDashboard, navPasswords, modal, dynamicModal, passwordField, reveal, entries };
}

try {
  console.log('=== TEST LOGOUT SESSION ===');

  const dom = buildDom();
  globalThis.document = dom.doc;
  globalThis.window = new StubWindow();

  const { resetMasterPasswordFieldCache } = await import('../scripts/security/master-password-field.js');
  resetMasterPasswordFieldCache();
  const { logoutVaultSession, initLogoutControl } = await import('../scripts/security/logout.js');

  const vaultManager = makeFakeVaultManager();
  const report = await logoutVaultSession(vaultManager, { doc: dom.doc, notify: false });

  // 1. Purge cryptographique.
  assert(vaultManager.masterKey === null, 'La cle en memoire doit etre effacee');
  assert(vaultManager.salt === null, 'Le sel de session doit etre efface');
  assert(vaultManager.formatVersion === null, 'La version de format de session doit etre effacee');
  assert(report.masterKeyNull === true, 'Le rapport doit confirmer la cle nulle');
  assert(report.entryCount === 0, 'Aucune entree dechiffree ne doit subsister');

  // 2. Le coffre chiffre n'est PAS supprime.
  assert(vaultManager.storageDeleted === false, 'La deconnexion ne doit jamais supprimer le coffre chiffre');

  // 3. Champs et vues contenant des secrets.
  assert(dom.passwordField.value === '', 'Le champ mot de passe d entree doit etre vide');
  assert(dom.reveal.textContent === '', 'Aucun mot de passe ne doit rester affiche');
  assert(dom.reveal.classList.contains('hidden'), 'Le mot de passe affiche doit etre masque');
  assert(dom.entries.children.length === 0, 'La liste des entrees doit etre videe');

  // 4. Champ maitre : vide, type password, case decochee.
  assert(dom.masterInput.value === '', 'Le champ maitre doit etre vide');
  assert(dom.masterInput.type === 'password', 'Le champ maitre doit repasser en type password');
  assert(dom.toggle.checked === false, 'La case d affichage doit etre decochee');
  assert(report.masterPasswordCleared && report.masterPasswordTypeReset, 'Le rapport doit confirmer le nettoyage du champ');

  // 5. Modales fermees.
  assert(!dom.modal.classList.contains('active'), 'Les modales visibles doivent etre fermees');
  assert(dom.dynamicModal.removed === true, 'Les modales injectees doivent etre retirees');
  assert(report.modalsClosed >= 2, 'Le rapport doit compter les modales fermees');

  // 6. Navigation reinitialisee.
  assert(dom.dashboard.hidden === false, 'La vue par defaut doit etre le tableau de bord');
  assert(dom.passwords.hidden === true, 'Les autres vues doivent etre masquees');
  assert(dom.navDashboard.classList.contains('active'), 'Le lien tableau de bord doit etre actif');
  assert(!dom.navPasswords.classList.contains('active'), 'Les autres liens ne doivent plus etre actifs');
  assert(report.navigationReset === true, 'Le rapport doit confirmer la reinitialisation de navigation');

  // 7. Retour a l'ecran d'authentification.
  assert(dom.authScreen.hidden === false, 'L ecran d authentification doit etre affiche');
  assert(dom.vaultUi.hidden === true, 'L interface du coffre doit etre masquee');

  // 8. Presse-papiers : resultat honnete, jamais annonce comme reussi sans preuve.
  assert(report.clipboardCleanupAttempted === false, 'Aucune copie active : aucune tentative ne doit etre annoncee');
  assert(report.clipboardCleanupSucceeded === false, 'Aucun succes ne doit etre annonce sans tentative');

  // 9. Evenement de deconnexion diffuse.
  assert(dom.doc.dispatched.includes('vault:logout'), 'Un evenement vault:logout doit etre diffuse');

  // 10. Idempotence du raccordement : pas d ecouteurs multiplies.
  const dom2 = buildDom();
  globalThis.document = dom2.doc;
  resetMasterPasswordFieldCache();
  const vm2 = makeFakeVaultManager();
  const first = initLogoutControl(vm2, { doc: dom2.doc, notify: false });
  const second = initLogoutControl(vm2, { doc: dom2.doc, notify: false });
  assert(first.bound === 1, `Un seul controle doit etre raccorde (obtenu ${first.bound})`);
  assert(second.bound === 0 && second.alreadyBound === 1, 'Un second appel ne doit pas raccorder a nouveau');
  assert(dom2.logout.listenerCount('click') === 1, 'Le bouton ne doit avoir qu un seul ecouteur de clic');
  assert(dom2.logout.getAttribute('role') === 'button', 'Le controle doit etre accessible au clavier');

  // 11. Deconnexions successives : le second appel reste sans effet de bord.
  await logoutVaultSession(vm2, { doc: dom2.doc, notify: false });
  const secondReport = await logoutVaultSession(vm2, { doc: dom2.doc, notify: false });
  assert(secondReport.masterKeyNull === true, 'Une seconde deconnexion doit rester sure');
  assert(secondReport.entryCount === 0, 'Une seconde deconnexion ne doit rien reveler');

  delete globalThis.document;
  delete globalThis.window;
  console.log('Logout session tests passed.');
} catch (error) {
  console.error('Logout session tests failed:', error);
  process.exitCode = 1;
}
