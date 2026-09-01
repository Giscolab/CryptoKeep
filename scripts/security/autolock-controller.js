/**
 * CryptoKeep - Controleur de verrouillage automatique (Lot 1).
 *
 * Remplacant de `AutoLock` (scripts/security/autolock.js), qui reste conserve
 * et fonctionnel. Ce controleur corrige les manques verifies de la version
 * historique :
 *
 * - le reglage "Activer le verrouillage auto." est reellement lu et respecte ;
 * - le delai choisi est relu, persiste, et le minuteur redemarre proprement ;
 * - un seul minuteur et un seul intervalle d'affichage existent a tout instant ;
 * - souris, clavier, pointeur, tactile, molette et defilement reinitialisent
 *   le compte a rebours ;
 * - la visibilite de l'onglet est prise en compte ;
 * - le verrouillage ne s'arme qu'apres authentification (`arm()`), il ne se
 *   declenche donc plus sur l'ecran de deverrouillage ;
 * - l'affichage du compte a rebours est optionnel : son absence ne provoque
 *   plus d'erreur.
 *
 * Le rappel de verrouillage fourni doit effectuer la purge (cle maitre,
 * entrees dechiffrees, DOM), exactement comme une deconnexion. Ce module ne
 * touche jamais au coffre chiffre et ne journalise aucun secret.
 */

import { DELAY_OPTIONS, AUTOLOCK_KEY, getStoredDelay } from './autolock.js';

export const AUTOLOCK_ENABLED_KEY = 'autolock-enabled';
export const AUTOLOCK_ON_HIDDEN_KEY = 'autolock-lock-on-hidden';
export const ACTIVITY_EVENTS = Object.freeze([
  'mousemove',
  'mousedown',
  'click',
  'keydown',
  'pointerdown',
  'pointermove',
  'touchstart',
  'touchmove',
  'wheel',
  'scroll'
]);

export const MIN_DELAY_SECONDS = 30;
export const MAX_DELAY_SECONDS = 3600;

function readFlag(storage, key, fallback) {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    return raw === 'true' || raw === '1';
  } catch {
    return fallback;
  }
}

function writeFlag(storage, key, value) {
  if (!storage) return;
  try {
    storage.setItem(key, value ? 'true' : 'false');
  } catch {
    /* preference non critique */
  }
}

export function clampDelaySeconds(seconds) {
  const parsed = Number.parseInt(seconds, 10);
  if (!Number.isFinite(parsed)) return MAX_DELAY_SECONDS / 2;
  return Math.min(MAX_DELAY_SECONDS, Math.max(MIN_DELAY_SECONDS, parsed));
}

export function labelForDelaySeconds(seconds) {
  const found = Object.entries(DELAY_OPTIONS).find(([, value]) => value === seconds);
  return found ? found[0] : null;
}

export class SessionAutoLock {
  /**
   * @param {() => (Promise<any>|any)} onLock rappel de verrouillage complet
   * @param {object} [options] injections pour les tests
   */
  constructor(onLock, options = {}) {
    if (typeof onLock !== 'function') {
      throw new TypeError('SessionAutoLock attend un rappel de verrouillage.');
    }

    this.onLock = onLock;
    this.doc = options.doc ?? (typeof document !== 'undefined' ? document : null);
    this.win = options.win ?? (typeof window !== 'undefined' ? window : null);
    this.storage = options.storage
      ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    this.timers = options.timers ?? {
      setTimeout: (...a) => setTimeout(...a),
      clearTimeout: (...a) => clearTimeout(...a),
      setInterval: (...a) => setInterval(...a),
      clearInterval: (...a) => clearInterval(...a)
    };
    this.clock = options.clock ?? Date.now;

    this.displayElement = options.displayElement
      ?? (this.doc && this.doc.getElementById ? this.doc.getElementById('autolock-timer') : null);
    this.enabledInput = options.enabledInput
      ?? (this.doc && this.doc.getElementById ? this.doc.getElementById('autolock-enabled') : null);
    this.delaySelect = options.delaySelect
      ?? (this.doc && this.doc.getElementById ? this.doc.getElementById('autolock-delay') : null)
      ?? (this.doc && this.doc.querySelector ? this.doc.querySelector('.dropdown-small') : null);
    this.hiddenInput = options.hiddenInput
      ?? (this.doc && this.doc.getElementById ? this.doc.getElementById('autolock-on-hidden') : null);

    this.delaySeconds = clampDelaySeconds(
      options.delaySeconds ?? this._readStoredDelay()
    );
    this.enabled = options.enabled ?? readFlag(this.storage, AUTOLOCK_ENABLED_KEY, true);
    this.lockOnHidden = options.lockOnHidden
      ?? readFlag(this.storage, AUTOLOCK_ON_HIDDEN_KEY, false);

    this.armed = false;
    this.timer = null;
    this.displayInterval = null;
    this.deadline = null;
    this.lockCount = 0;
    this.destroyed = false;

    this._handleActivity = this._handleActivity.bind(this);
    this._handleVisibility = this._handleVisibility.bind(this);
    this._handleEnabledChange = this._handleEnabledChange.bind(this);
    this._handleDelayChange = this._handleDelayChange.bind(this);
    this._handleHiddenChange = this._handleHiddenChange.bind(this);

    this._bindSettings();
    this._syncSettingsUi();
  }

  // ---------------------------------------------------------------- reglages

  _readStoredDelay() {
    if (!this.storage) return MAX_DELAY_SECONDS / 2;
    try {
      const raw = this.storage.getItem(AUTOLOCK_KEY);
      if (raw === null) return typeof getStoredDelay === 'function' ? getStoredDelay() : 1800;
      return Number.parseInt(raw, 10);
    } catch {
      return MAX_DELAY_SECONDS / 2;
    }
  }

  _bindSettings() {
    if (this.enabledInput && typeof this.enabledInput.addEventListener === 'function') {
      this.enabledInput.addEventListener('change', this._handleEnabledChange);
    }
    if (this.delaySelect && typeof this.delaySelect.addEventListener === 'function') {
      this.delaySelect.addEventListener('change', this._handleDelayChange);
    }
    if (this.hiddenInput && typeof this.hiddenInput.addEventListener === 'function') {
      this.hiddenInput.addEventListener('change', this._handleHiddenChange);
    }
  }

  _syncSettingsUi() {
    if (this.enabledInput) this.enabledInput.checked = this.enabled;
    if (this.hiddenInput) this.hiddenInput.checked = this.lockOnHidden;
    if (this.delaySelect) {
      const label = labelForDelaySeconds(this.delaySeconds);
      if (label) this.delaySelect.value = label;
    }
  }

  _handleEnabledChange(event) {
    const checked = event && event.target ? Boolean(event.target.checked) : false;
    this.setEnabled(checked);
  }

  _handleDelayChange(event) {
    const label = event && event.target ? event.target.value : null;
    // Le libelle provient du DOM : on refuse tout acces hors proprietes
    // propres (protection contre __proto__, constructor, prototype).
    if (typeof label !== 'string'
      || !Object.prototype.hasOwnProperty.call(DELAY_OPTIONS, label)) {
      return;
    }
    const seconds = Object.entries(DELAY_OPTIONS)
      .find(([key]) => key === label)?.[1];
    if (seconds === undefined) return;
    this.setDelaySeconds(seconds);
  }

  _handleHiddenChange(event) {
    const checked = event && event.target ? Boolean(event.target.checked) : false;
    this.lockOnHidden = checked;
    writeFlag(this.storage, AUTOLOCK_ON_HIDDEN_KEY, checked);
  }

  /** Active ou desactive le verrouillage automatique et persiste le choix. */
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    writeFlag(this.storage, AUTOLOCK_ENABLED_KEY, this.enabled);
    if (this.enabledInput) this.enabledInput.checked = this.enabled;

    if (!this.enabled) {
      this._stopTimer();
      this._stopDisplay();
      this._renderDisabled();
      return this.enabled;
    }

    if (this.armed) this._restart();
    return this.enabled;
  }

  /** Change le delai (secondes), le persiste et redemarre proprement le minuteur. */
  setDelaySeconds(seconds) {
    this.delaySeconds = clampDelaySeconds(seconds);
    if (this.storage) {
      try {
        this.storage.setItem(AUTOLOCK_KEY, String(this.delaySeconds));
      } catch {
        /* preference non critique */
      }
    }
    const label = labelForDelaySeconds(this.delaySeconds);
    if (label && this.delaySelect) this.delaySelect.value = label;

    if (this.armed && this.enabled) this._restart();
    return this.delaySeconds;
  }

  // ------------------------------------------------------------ cycle de vie

  /** Arme le verrouillage. A appeler UNIQUEMENT apres deverrouillage reussi. */
  arm() {
    if (this.destroyed) return false;
    if (this.armed) {
      this._restart();
      return true;
    }

    this.armed = true;
    this._addActivityListeners();
    if (this.enabled) this._restart();
    else this._renderDisabled();
    return true;
  }

  /** Desarme le verrouillage (verrouillage manuel, deconnexion, session fermee). */
  disarm() {
    this.armed = false;
    this._stopTimer();
    this._stopDisplay();
    this._removeActivityListeners();
    this.deadline = null;
    this._renderIdle();
    return true;
  }

  /** Retire tous les ecouteurs, y compris ceux des reglages. */
  destroy() {
    this.disarm();
    if (this.enabledInput && typeof this.enabledInput.removeEventListener === 'function') {
      this.enabledInput.removeEventListener('change', this._handleEnabledChange);
    }
    if (this.delaySelect && typeof this.delaySelect.removeEventListener === 'function') {
      this.delaySelect.removeEventListener('change', this._handleDelayChange);
    }
    if (this.hiddenInput && typeof this.hiddenInput.removeEventListener === 'function') {
      this.hiddenInput.removeEventListener('change', this._handleHiddenChange);
    }
    this.destroyed = true;
    return true;
  }

  /** Declenche immediatement le verrouillage (usage manuel ou onglet masque). */
  triggerLock(reason = 'manual') {
    this._stopTimer();
    this._stopDisplay();
    this.deadline = null;
    this.lockCount += 1;
    this.armed = false;
    this._removeActivityListeners();
    this._renderIdle();
    return this.onLock(reason);
  }

  // --------------------------------------------------------------- ecouteurs

  _addActivityListeners() {
    if (this._listenersAttached) return;
    if (this.win && typeof this.win.addEventListener === 'function') {
      ACTIVITY_EVENTS.forEach((evt) => {
        this.win.addEventListener(evt, this._handleActivity, { passive: true });
      });
    }
    if (this.doc && typeof this.doc.addEventListener === 'function') {
      this.doc.addEventListener('visibilitychange', this._handleVisibility);
    }
    this._listenersAttached = true;
  }

  _removeActivityListeners() {
    if (!this._listenersAttached) return;
    if (this.win && typeof this.win.removeEventListener === 'function') {
      ACTIVITY_EVENTS.forEach((evt) => {
        this.win.removeEventListener(evt, this._handleActivity);
      });
    }
    if (this.doc && typeof this.doc.removeEventListener === 'function') {
      this.doc.removeEventListener('visibilitychange', this._handleVisibility);
    }
    this._listenersAttached = false;
  }

  _handleActivity() {
    if (!this.armed || !this.enabled) return;
    this._restart();
  }

  _handleVisibility() {
    if (!this.armed || !this.enabled) return;
    const hidden = this.doc && this.doc.visibilityState === 'hidden';

    if (hidden) {
      // Onglet en arriere-plan : le compte a rebours continue de courir.
      // Si l'utilisateur a demande le verrouillage immediat, on l'applique.
      if (this.lockOnHidden) void this.triggerLock('hidden');
      return;
    }

    // Retour au premier plan : si l'echeance est depassee, on verrouille.
    if (this.deadline !== null && this.clock() >= this.deadline) {
      void this.triggerLock('expired');
    }
  }

  // ---------------------------------------------------------------- minuteur

  _restart() {
    this._stopTimer();
    this._stopDisplay();
    this.deadline = this.clock() + this.delaySeconds * 1000;
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      void this.triggerLock('expired');
    }, this.delaySeconds * 1000);
    this._startDisplay();
  }

  _stopTimer() {
    if (this.timer !== null && this.timer !== undefined) {
      this.timers.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // --------------------------------------------------------------- affichage

  _startDisplay() {
    if (!this.displayElement) return;
    this._renderRemaining();
    this.displayInterval = this.timers.setInterval(() => this._renderRemaining(), 1000);
  }

  _stopDisplay() {
    if (this.displayInterval !== null && this.displayInterval !== undefined) {
      this.timers.clearInterval(this.displayInterval);
      this.displayInterval = null;
    }
    if (this.displayElement && this.displayElement.classList) {
      this.displayElement.classList.remove('warning');
    }
  }

  _setDisplayText(text) {
    if (!this.displayElement) return;
    const doc = this.doc;
    if (!doc || typeof doc.createElement !== 'function') return;
    const icon = doc.createElement('i');
    icon.className = 'fas fa-lock';
    this.displayElement.replaceChildren(icon, doc.createTextNode(` ${text}`));
  }

  _renderRemaining() {
    if (!this.displayElement) return;
    const remaining = Math.max(0, (this.deadline ?? this.clock()) - this.clock());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    this._setDisplayText(
      `Verrouillage auto dans ${minutes}:${String(seconds).padStart(2, '0')}`
    );

    if (this.displayElement.classList) {
      if (remaining <= 10000) this.displayElement.classList.add('warning');
      else this.displayElement.classList.remove('warning');
    }
  }

  _renderDisabled() {
    this._setDisplayText('Verrouillage auto desactive');
  }

  _renderIdle() {
    this._setDisplayText('Coffre verrouille');
  }

  /** Etat observable, utilise par les tests et le diagnostic. */
  getState() {
    return {
      armed: this.armed,
      enabled: this.enabled,
      lockOnHidden: this.lockOnHidden,
      delaySeconds: this.delaySeconds,
      hasTimer: this.timer !== null && this.timer !== undefined,
      hasDisplayInterval: this.displayInterval !== null && this.displayInterval !== undefined,
      deadline: this.deadline,
      lockCount: this.lockCount,
      listenersAttached: Boolean(this._listenersAttached),
      destroyed: this.destroyed
    };
  }
}

export default { SessionAutoLock, clampDelaySeconds, labelForDelaySeconds, ACTIVITY_EVENTS };
