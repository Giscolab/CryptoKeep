/**
 * CryptoKeep - Presse-papiers (Lot 7 : formulations honnetes et reglages).
 *
 * CE QUE CE MODULE PEUT PROMETTRE, ET CE QU'IL NE PEUT PAS
 * L'effacement du presse-papiers est une TENTATIVE, jamais une garantie.
 * Aucune page web ne controle le presse-papiers du systeme :
 *
 *  - l'onglet doit avoir le focus au moment de la tentative ; en arriere-plan,
 *    l'ecriture est refusee par le navigateur ;
 *  - la lecture du presse-papiers demande une permission que l'utilisateur
 *    peut refuser, et qui n'existe pas dans tous les navigateurs ;
 *  - le systeme, un gestionnaire d'historique du presse-papiers ou une autre
 *    application peuvent avoir conserve une copie hors de portee ;
 *  - l'utilisateur peut avoir colle la valeur ailleurs entre-temps.
 *
 * Les messages affiches disent donc « tentative », jamais « efface » au futur.
 *
 * NE PAS ECRASER UNE NOUVELLE COPIE. Avant d'effacer, le contenu courant est
 * relu et compare a celui que ce module a ecrit. S'il a change — l'utilisateur
 * a copie autre chose — RIEN n'est ecrase. Si la relecture est impossible
 * (permission refusee, API absente), rien n'est ecrase non plus : mieux vaut
 * laisser un secret que detruire le travail de l'utilisateur a l'aveugle.
 */

import { showToast } from './toast.js';
import { readSettings } from './app-settings.js';

export const CLIPBOARD_CLEAR_DELAY_MS = 30000;

/** Delai effectif, issu des reglages. Repli sur la valeur historique. */
export function resolveClipboardTtl(options = {}) {
  if (Number.isFinite(options.ttlMs)) return options.ttlMs;
  try {
    const reglages = readSettings(options);
    if (reglages.clipboardClearEnabled === false) return 0;
    return reglages.clipboardClearSeconds * 1000;
  } catch {
    return CLIPBOARD_CLEAR_DELAY_MS;
  }
}

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
  // `dismiss()` annule aussi la minuterie d'auto-suppression du toast ;
  // `remove()` seul laissait cette minuterie vivante jusqu'a son echeance.
  if (countdownToast) {
    if (typeof countdownToast.dismiss === 'function') countdownToast.dismiss();
    else countdownToast.remove();
  }
  countdownToast = null;
}

function renderCountdown(copy) {
  clearCountdownToast();
  countdownToast = showToast('', 'info', copy.expiresAt - Date.now());
  const message = countdownToast?.querySelector('.toast__message');

  const update = () => {
    if (!message || activeCopy?.token !== copy.token) return;
    const seconds = Math.max(0, Math.ceil((copy.expiresAt - Date.now()) / 1000));
    // « Tentative » : le navigateur peut refuser l'ecriture, et le systeme
    // peut avoir conserve une copie hors de portee de cette page.
    message.textContent = `Tentative d'effacement du presse-papiers dans ${seconds} s.`;
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
  const ttlMs = resolveClipboardTtl(options);

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
    // Un delai nul signifie que l'effacement automatique est DESACTIVE dans
    // les reglages : aucune minuterie n'est armee, et rien n'est promis.
    if (ttlMs > 0) scheduleClipboardClear(text, ttlMs);
    return true;
  } catch (error) {
    console.warn('[Clipboard] Copy failed:', error);
    showToast('Impossible de copier dans le presse-papiers.', 'error');
    return false;
  }
}

/**
 * Annule la tentative programmee, SANS toucher au presse-papiers.
 *
 * LOT 7B : les minuteries armees par `scheduleClipboardClear` — un delai
 * pouvant aller jusqu'a cinq minutes, et un intervalle d'une seconde pour le
 * compte a rebours — maintenaient la boucle d'evenements vivante. En
 * navigateur c'est sans consequence, mais tout contexte sans interface
 * restait bloque jusqu'a leur echeance : la suite de tests ne rendait la main
 * qu'au bout de trente secondes.
 *
 * A appeler quand la tentative n'a plus lieu d'etre : verrouillage, fermeture
 * de session, ou fin d'un scenario de test.
 *
 * @returns {{cancelled: boolean}} vrai si une tentative etait programmee
 */
export function cancelClipboardClear() {
  const programmee = Boolean(activeCopy || clearTimer || countdownTimer);
  clearTimers();
  clearCountdownToast();
  activeCopy = null;
  return { cancelled: programmee };
}

export async function clearOwnedClipboard() {
  const copy = activeCopy;
  if (!copy) {
    return { attempted: false, succeeded: false, unchanged: false, reason: 'nothing_to_clear' };
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
    // Sans lecture possible, on ne peut pas savoir si le presse-papiers
    // contient encore NOTRE valeur. Ecrire a l'aveugle detruirait ce que
    // l'utilisateur a copie depuis. On ne touche donc a rien.
    return {
      attempted: false, succeeded: false, unchanged: false,
      reason: 'read_unavailable'
    };
  }

  try {
    const currentValue = await navigator.clipboard.readText();

    if (activeCopy && activeCopy.token !== copy.token) {
      return { attempted: true, succeeded: false, unchanged: false, reason: 'superseded' };
    }

    if (currentValue !== copy.text) {
      // L'utilisateur a copie autre chose : sa copie est PRESERVEE.
      return { attempted: true, succeeded: false, unchanged: false, reason: 'replaced_by_user' };
    }

    await navigator.clipboard.writeText('');
    // Formulation exacte : ce module a ecrit une chaine vide. Il ne peut pas
    // affirmer qu'aucune copie ne subsiste ailleurs dans le systeme.
    showToast('Presse-papiers vidé par CryptoKeep. Une copie peut subsister ailleurs dans le système.', 'info');
    return { attempted: true, succeeded: true, unchanged: true, reason: 'cleared' };
  } catch (error) {
    // Cause la plus frequente : permission de lecture refusee, ou onglet sans
    // focus. Le presse-papiers n'est PAS modifie.
    const nom = error && error.name ? error.name : 'unknown';
    const refus = nom === 'NotAllowedError' || nom === 'SecurityError';
    console.warn('[Clipboard] Tentative d\'effacement impossible :', nom);
    if (refus) {
      showToast(
        'Effacement du presse-papiers impossible : permission refusée par le navigateur. '
        + 'Videz-le manuellement si nécessaire.',
        'warning', 7000
      );
    }
    return {
      attempted: true, succeeded: false, unchanged: false,
      reason: refus ? 'permission_denied' : 'error'
    };
  }
}

export default {
  copyToClipboard,
  clearOwnedClipboard,
  cancelClipboardClear,
  resolveClipboardTtl
};
