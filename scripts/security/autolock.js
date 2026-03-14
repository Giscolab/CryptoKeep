const DELAY_OPTIONS = {
  '1 minute': 60,
  '2 minutes': 120,
  '5 minutes': 300,
  '10 minutes': 600,
  '30 minutes': 1800
};

const AUTOLOCK_KEY = 'autolock-delay';

function getStoredDelay() {
  const key = AUTOLOCK_KEY;
  const current = localStorage.getItem(key);


  if (current === null) {
    localStorage.setItem(key, '1800');
    console.info('[AUTOLOCK] Valeur par défaut 30 min appliquée');
    return 1800;
  }

  const parsed = parseInt(current, 10);
  if (isNaN(parsed)) {
    console.warn('[AUTOLOCK] Valeur corrompue détectée, fallback 30 min');
    localStorage.setItem(key, '1800');
    return 1800;
  }

  return parsed;
}



export class AutoLock {
  constructor(onLock, timeout = getStoredDelay() * 1000) {
    this.onLock = onLock;
    this.timeout = timeout;
    this.timer = null;
    this.remaining = timeout;
    this.displayElement = document.getElementById('autolock-timer');

    this._reset = this._reset.bind(this);
    this._setupListeners();
    this._startTimer();
    this._startDisplay();
    this.watchDelayChange();

  }

  _setupListeners() {
    ['mousemove', 'keydown', 'click'].forEach(evt =>
      window.addEventListener(evt, this._reset)
    );
  }

  _startTimer() {
    this._clearTimer();
    this.remaining = this.timeout;

    this.timer = setTimeout(() => {
      this._stopDisplay();
      this.onLock();
    }, this.timeout);
  }

  _startDisplay() {
    if (!this.displayElement) return;

    this._stopDisplay(); // Stoppe tout ancien timer
    const endTime = Date.now() + this.remaining;

    this._updateDisplay();

    this.displayInterval = setInterval(() => {
      this.remaining = endTime - Date.now();

      if (this.remaining <= 0) {
        this.remaining = 0;
        this._stopDisplay();
      }

      this._updateDisplay();
    }, 1000);
  }

  _stopDisplay() {
    this.displayElement.classList.remove('warning');
    clearInterval(this.displayInterval);
    this.displayInterval = null;
  }

  _updateDisplay() {
    const minutes = Math.floor(this.remaining / 60000);
    const seconds = Math.floor((this.remaining % 60000) / 1000);
    this.displayElement.innerHTML = `<i class="fas fa-lock"></i> Verrouillage auto dans ${minutes}:${seconds.toString().padStart(2, '0')}`;

    if (this.remaining <= 10000) {
      this.displayElement.classList.add('warning');
    } else {
      this.displayElement.classList.remove('warning');
    }
  }

  lockVault() {
    vaultManager.masterKey = null;
    console.log("[LOCK] Clé supprimée ? ", vaultManager.masterKey === null);
    showAuthScreen();
    const pwInput = document.getElementById('master-password');
    if (pwInput) pwInput.value = '';
    showToast('Session verrouillée automatiquement.', 'error');
  }

  _reset() {
    this._startTimer();
    this._stopDisplay();
    this._startDisplay();
  }

  _clearTimer() {
    if (this.timer) clearTimeout(this.timer);
  }

  stop() {
    this._clearTimer();
    this._stopDisplay();
    ['mousemove', 'keydown', 'click'].forEach(evt =>
      window.removeEventListener(evt, this._reset)
    );
  }

  watchDelayChange() {
    const select = document.querySelector('.dropdown-small');
    if (!select) return;

    select.addEventListener('change', () => {
      const label = select.value;
      const seconds = DELAY_OPTIONS[label] ?? 300;

      localStorage.setItem(AUTOLOCK_KEY, seconds);

      this.timeout = seconds * 1000;
      this._reset(); // Redémarre le timer avec la nouvelle durée
    });

    // Synchronise le <select> avec la valeur actuelle
    const currentDelay = getStoredDelay();
    for (const [label, sec] of Object.entries(DELAY_OPTIONS)) {
      if (sec === currentDelay) {
        select.value = label;
        break;
      }
    }
  }
}
export { getStoredDelay };
