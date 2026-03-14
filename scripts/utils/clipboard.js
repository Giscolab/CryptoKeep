// /scripts/utils/clipboard.js

import toast from './toast.js';
import { logInfo, logError } from './logger.js';

const copyToClipboard = async (text) => {
  if (!navigator.clipboard) {
    logError('Clipboard API not supported.');
    toast.show('Erreur : impossible de copier.', 'error');
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    logInfo('Texte copié dans le presse-papiers.');
    toast.show('Mot de passe copié !', 'success');
    return true;
  } catch (err) {
    logError('Erreur lors de la copie : ' + err);
    toast.show('Erreur lors de la copie.', 'error');
    return false;
  }
};

export default { copyToClipboard };
