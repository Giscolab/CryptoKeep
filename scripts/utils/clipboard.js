import { showToast } from './toast.js';

export const CLIPBOARD_CLEAR_DELAY_MS = 30000;

let activeCopy = null;
let clearTimer = null;
let countdownTimer = null;
let countdownToast = null;

function clearTimers() {
  if (clearTimer) clearTimeout(clearTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  clearTimer = null;
  countdownTimer = null;
}

function clearCountdownToast() {
  countdownToast?.remove();
  countdownToast = null;
}

function renderCountdown(copy) {
  clearCountdownToast();
  countdownToast = showToast('', 'info', copy.expiresAt - Date.now());
  const message = countdownToast?.querySelector('.toast__message');

  const update = () => {
    if (!message || activeCopy?.token !== copy.token) return;
    const seconds = Math.max(0, Math.ceil((copy.expiresAt - Date.now()) / 1000));
    message.textContent = `Presse-papiers efface dans ${seconds} s.`;
  };

  update();
  countdownTimer = setInterval(update, 1000);
}

function scheduleClipboardClear(text, ttlMs) {
  clearTimers();

  const copy = {
    text,
    token: crypto.randomUUID(),
    expiresAt: Date.now() + ttlMs
  };
  activeCopy = copy;
  renderCountdown(copy);
  clearTimer = setTimeout(() => {
    void clearOwnedClipboard();
  }, ttlMs);
}

export async function copyToClipboard(text, options = {}) {
  const ttlMs = options.ttlMs ?? CLIPBOARD_CLEAR_DELAY_MS;

  if (typeof text !== 'string' || text.length === 0) {
    showToast('Aucun secret a copier.', 'warning');
    return false;
  }

  if (
    typeof navigator === 'undefined'
    || !navigator.clipboard
    || typeof navigator.clipboard.writeText !== 'function'
  ) {
    showToast('Presse-papiers indisponible.', 'error');
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    scheduleClipboardClear(text, ttlMs);
    return true;
  } catch (error) {
    console.warn('[Clipboard] Copy failed:', error);
    showToast('Impossible de copier dans le presse-papiers.', 'error');
    return false;
  }
}

export async function clearOwnedClipboard() {
  const copy = activeCopy;
  if (!copy) {
    return { attempted: false, succeeded: false, unchanged: false };
  }

  clearTimers();
  clearCountdownToast();
  activeCopy = null;

  if (
    typeof navigator === 'undefined'
    || !navigator.clipboard
    || typeof navigator.clipboard.readText !== 'function'
    || typeof navigator.clipboard.writeText !== 'function'
  ) {
    return { attempted: false, succeeded: false, unchanged: false };
  }

  try {
    const currentValue = await navigator.clipboard.readText();
    if (activeCopy && activeCopy.token !== copy.token) {
      return { attempted: true, succeeded: false, unchanged: false };
    }

    if (currentValue !== copy.text) {
      return { attempted: true, succeeded: false, unchanged: false };
    }

    await navigator.clipboard.writeText('');
    showToast('Presse-papiers efface.', 'info');
    return { attempted: true, succeeded: true, unchanged: true };
  } catch (error) {
    console.warn('[Clipboard] Conditional clear failed:', error);
    return { attempted: true, succeeded: false, unchanged: false };
  }
}

export default { copyToClipboard, clearOwnedClipboard };
