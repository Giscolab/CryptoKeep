/**
 * Lot 1 - Verrouillage automatique : minuteur et etat de session.
 * Minuteurs deterministes, aucune attente reelle, donnees synthetiques.
 */
import {
  SessionAutoLock,
  clampDelaySeconds,
  labelForDelaySeconds,
  AUTOLOCK_ENABLED_KEY,
  AUTOLOCK_ON_HIDDEN_KEY
} from '../scripts/security/autolock-controller.js';
import { AUTOLOCK_KEY, DELAY_OPTIONS, AutoLock } from '../scripts/security/autolock.js';
import { StubDocument, StubElement, StubWindow, StubStorage, FakeTimers } from './helpers/dom-stub.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildHarness(storageInit = {}) {
  const doc = new StubDocument();
  const win = new StubWindow();
  const timers = new FakeTimers(1000);
  const storage = new StubStorage(storageInit);

  const display = new StubElement('div', { id: 'autolock-timer' });
  const enabledInput = new StubElement('input', { id: 'autolock-enabled', type: 'checkbox', checked: true });
  const delaySelect = new StubElement('select', { id: 'autolock-delay', value: '5 minutes' });
  const hiddenInput = new StubElement('input', { id: 'autolock-on-hidden', type: 'checkbox' });
  doc.register(display);
  doc.register(enabledInput);
  doc.register(delaySelect, ['.dropdown-small']);
  doc.register(hiddenInput);

  const locks = [];
  const controller = new SessionAutoLock((reason) => { locks.push(reason); }, {
    doc,
    win,
    storage,
    timers: timers.api,
    clock: timers.clock
  });

  return { doc, win, timers, storage, display, enabledInput, delaySelect, hiddenInput, controller, locks };
}

try {
  console.log('=== TEST AUTOLOCK CONTROLLER ===');

  // --- Bornage et libelles -------------------------------------------------
  assert(clampDelaySeconds(1) === 30, 'Un delai trop court doit etre borne a 30 s');
  assert(clampDelaySeconds(999999) === 3600, 'Un delai trop long doit etre borne a 3600 s');
  assert(clampDelaySeconds('300') === 300, 'Un delai numerique en chaine doit etre accepte');
  assert(labelForDelaySeconds(300) === '5 minutes', 'Le libelle doit correspondre au delai');
  assert(labelForDelaySeconds(7) === null, 'Un delai inconnu ne doit pas inventer de libelle');

  // --- 1. Aucun verrouillage avant authentification -------------------------
  {
    const h = buildHarness({ [AUTOLOCK_KEY]: '60' });
    assert(h.controller.getState().armed === false, 'Le controleur ne doit pas etre arme a la construction');
    assert(h.controller.getState().hasTimer === false, 'Aucun minuteur ne doit tourner avant authentification');
    h.timers.advance(600000);
    assert(h.locks.length === 0, 'Aucun verrouillage ne doit survenir sur l ecran de deverrouillage');
  }

  // --- 2. Armement, expiration, minuteur unique -----------------------------
  {
    const h = buildHarness({ [AUTOLOCK_KEY]: '60' });
    h.controller.arm();
    const state = h.controller.getState();
    assert(state.armed === true, 'arm() doit armer le controleur');
    assert(state.hasTimer === true, 'arm() doit demarrer un minuteur');
    assert(h.timers.pendingTimeouts === 1, 'Un seul minuteur doit exister');

    h.controller.arm();
    h.controller.arm();
    assert(h.timers.pendingTimeouts === 1, 'Des armements repetes ne doivent pas creer de minuteurs concurrents');
    assert(h.timers.pendingIntervals === 1, 'Un seul intervalle d affichage doit exister');

    h.timers.advance(59000);
    assert(h.locks.length === 0, 'Aucun verrouillage avant l echeance');
    h.timers.advance(2000);
    assert(h.locks.length === 1, 'Le verrouillage doit survenir a l echeance');
    assert(h.locks[0] === 'expired', 'La raison doit etre l expiration');
    assert(h.controller.getState().armed === false, 'Le controleur doit se desarmer apres verrouillage');
    assert(h.timers.pendingTimeouts === 0, 'Aucun minuteur ne doit subsister apres verrouillage');
    assert(h.timers.pendingIntervals === 0, 'Aucun intervalle ne doit subsister apres verrouillage');
  }

  // --- 3. L'activite reinitialise le minuteur -------------------------------
  for (const evt of ['mousemove', 'keydown', 'click', 'pointerdown', 'touchstart', 'wheel', 'scroll']) {
    const h = buildHarness({ [AUTOLOCK_KEY]: '60' });
    h.controller.arm();
    h.timers.advance(50000);
    h.win.emit(evt);
    assert(h.timers.pendingTimeouts === 1, `Un seul minuteur apres ${evt}`);
    h.timers.advance(50000);
    assert(h.locks.length === 0, `L evenement ${evt} doit reinitialiser le compte a rebours`);
    h.timers.advance(11000);
    assert(h.locks.length === 1, `Le verrouillage doit finir par survenir apres ${evt}`);
  }

  // --- 4. Le reglage d'activation est respecte ------------------------------
  {
    const h = buildHarness({ [AUTOLOCK_KEY]: '60', [AUTOLOCK_ENABLED_KEY]: 'false' });
    assert(h.controller.getState().enabled === false, 'Le reglage stocke doit etre lu');
    h.controller.arm();
    assert(h.controller.getState().hasTimer === false, 'Aucun minuteur si le verrouillage est desactive');
    h.timers.advance(600000);
    assert(h.locks.length === 0, 'Aucun verrouillage si le reglage est desactive');

    h.controller.setEnabled(true);
    assert(h.storage.getItem(AUTOLOCK_ENABLED_KEY) === 'true', 'Le reglage doit etre persiste');
    assert(h.controller.getState().hasTimer === true, 'Reactiver doit relancer le minuteur');
    h.timers.advance(61000);
    assert(h.locks.length === 1, 'Le verrouillage doit fonctionner apres reactivation');
  }

  // --- 5. Desactivation en cours de session ---------------------------------
  {
    const h = buildHarness({ [AUTOLOCK_KEY]: '60' });
    h.controller.arm();
    h.controller.setEnabled(false);
    assert(h.timers.pendingTimeouts === 0, 'Desactiver doit arreter le minuteur');
    h.timers.advance(600000);
    assert(h.locks.length === 0, 'Aucun verrouillage apres desactivation');
  }

  // --- 6. Changement de delai : persistance et redemarrage propre -----------
  {
    const h = buildHarness({ [AUTOLOCK_KEY]: '60' });
    h.controller.arm();
    h.timers.advance(50000);
    h.controller.setDelaySeconds(DELAY_OPTIONS['2 minutes']);
    assert(h.storage.getItem(AUTOLOCK_KEY) === '120', 'Le nouveau delai doit etre persiste');
    assert(h.timers.pendingTimeouts === 1, 'Un seul minuteur apres changement de delai');
    assert(h.delaySelect.value === '2 minutes', 'Le selecteur doit refleter le delai');
    h.timers.advance(119000);
    assert(h.locks.length === 0, 'Le compte a rebours doit repartir de zero apres changement de delai');
    h.timers.advance(2000);
    assert(h.locks.length === 1, 'Le nouveau delai doit etre applique');
  }

  // --- 7. Reglages pilotes par le DOM ---------------------------------------
  {
    const h = buildHarness({ [AUTOLOCK_KEY]: '60' });
    h.controller.arm();
    h.delaySelect.value = '1 minute';
    h.delaySelect.dispatchEvent({ type: 'change', target: h.delaySelect });
    assert(h.controller.getState().delaySeconds === 60, 'Le selecteur doit piloter le delai');

    h.enabledInput.checked = false;
    h.enabledInput.dispatchEvent({ type: 'change', target: h.enabledInput });
    assert(h.controller.getState().enabled === false, 'La case doit piloter l activation');
    h.timers.advance(600000);
    assert(h.locks.length === 0, 'Decocher la case doit empecher le verrouillage');
  }

  // --- 8. Onglet en arriere-plan --------------------------------------------
  {
    const h = buildHarness({ [AUTOLOCK_KEY]: '60' });
    h.controller.arm();
    h.doc.visibilityState = 'hidden';
    h.doc.dispatchEvent({ type: 'visibilitychange' });
    assert(h.locks.length === 0, 'Par defaut, le masquage seul ne verrouille pas immediatement');

    h.hiddenInput.checked = true;
    h.hiddenInput.dispatchEvent({ type: 'change', target: h.hiddenInput });
    assert(h.storage.getItem(AUTOLOCK_ON_HIDDEN_KEY) === 'true', 'L option doit etre persistee');
    h.doc.dispatchEvent({ type: 'visibilitychange' });
    assert(h.locks.length === 1, 'Avec l option activee, le masquage doit verrouiller');
    assert(h.locks[0] === 'hidden', 'La raison doit indiquer le passage en arriere-plan');
  }

  // --- 9. Retour au premier plan apres echeance depassee --------------------
  {
    const h = buildHarness({ [AUTOLOCK_KEY]: '60' });
    h.controller.arm();
    h.doc.visibilityState = 'hidden';
    h.timers.timeouts.clear(); // simule un onglet gele : le minuteur n'a pas tire
    h.timers.now += 120000;
    h.doc.visibilityState = 'visible';
    h.doc.dispatchEvent({ type: 'visibilitychange' });
    assert(h.locks.length === 1, 'Une echeance depassee pendant le masquage doit verrouiller au retour');
    assert(h.locks[0] === 'expired', 'La raison doit etre l expiration');
  }

  // --- 10. disarm() et destroy() retirent bien les ecouteurs ----------------
  {
    const h = buildHarness({ [AUTOLOCK_KEY]: '60' });
    h.controller.arm();
    assert(h.win.listenerCount('mousemove') === 1, 'Un ecouteur d activite doit exister');
    assert(h.doc.listenerCount('visibilitychange') === 1, 'Un ecouteur de visibilite doit exister');

    h.controller.arm();
    assert(h.win.listenerCount('mousemove') === 1, 'Les ecouteurs ne doivent jamais etre dupliques');

    h.controller.disarm();
    assert(h.win.listenerCount('mousemove') === 0, 'disarm() doit retirer les ecouteurs d activite');
    assert(h.doc.listenerCount('visibilitychange') === 0, 'disarm() doit retirer l ecouteur de visibilite');
    assert(h.timers.pendingTimeouts === 0, 'disarm() doit arreter le minuteur');
    h.timers.advance(600000);
    assert(h.locks.length === 0, 'Aucun verrouillage apres disarm()');

    h.controller.destroy();
    assert(h.enabledInput.listenerCount('change') === 0, 'destroy() doit retirer les ecouteurs de reglage');
    assert(h.controller.getState().destroyed === true, 'destroy() doit marquer le controleur');
  }

  // --- 11. Absence d'element d'affichage : aucune exception -----------------
  {
    const doc = new StubDocument();
    const win = new StubWindow();
    const timers = new FakeTimers(0);
    const locks = [];
    const controller = new SessionAutoLock(() => locks.push('expired'), {
      doc, win, storage: new StubStorage({ [AUTOLOCK_KEY]: '60' }), timers: timers.api, clock: timers.clock
    });
    controller.arm();
    timers.advance(61000);
    assert(locks.length === 1, 'Le verrouillage doit fonctionner sans element d affichage');
  }

  // --- 12. Non-regression : l'implementation historique reste utilisable ----
  {
    const doc = new StubDocument();
    const win = new StubWindow();
    doc.register(new StubElement('div', { id: 'autolock-timer' }));
    globalThis.document = doc;
    globalThis.window = win;
    globalThis.localStorage = new StubStorage({ [AUTOLOCK_KEY]: '1800' });

    const legacy = new AutoLock(() => {});
    assert(typeof legacy.stop === 'function', 'La classe AutoLock historique doit rester utilisable');
    assert(legacy.timeout === 1800000, 'AutoLock doit toujours lire le delai stocke');
    legacy.stop();
    assert(win.listenerCount('mousemove') === 0, 'stop() historique doit retirer ses ecouteurs');

    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.localStorage;
  }

  console.log('Autolock controller tests passed.');
} catch (error) {
  console.error('Autolock controller tests failed:', error);
  process.exitCode = 1;
}
