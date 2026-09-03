/**
 * CryptoKeep - Politique du mot de passe maitre.
 *
 * LOT 5 : la DECISION de securite ne repose plus sur le seul estimateur
 * `longueur x alphabet`, qui surestime massivement les chaines previsibles
 * (`passwordpassword`, `abababababab`, `azertyuiop`, `P@ssw0rd123`...).
 * Elle est deleguee a `password-policy.js`, qui detecte mots courants,
 * repetitions, sequences, motifs clavier, variantes triviales et repetitions
 * de mots, et qui favorise les phrases de passe longues sans imposer
 * arbitrairement toutes les classes de caracteres.
 *
 * L'ancien estimateur est CONSERVE et reste exporte : il alimente toujours
 * l'affichage, et `MIN_MASTER_PASSWORD_ENTROPY_BITS` demeure exporte pour
 * compatibilite. Il n'est simplement plus l'unique arbitre.
 *
 * La version de ce fichier anterieure au Lot 5 est conservee a l'identique
 * dans logs/master-password-policy.avant-lot5.txt (dossier ignore par git).
 */

import { estimatePasswordEntropyBits } from '../ui/password-meter/password-meter.js';
import { evaluateMasterPasswordPolicy, POLICY } from './password-policy.js';

export const MIN_MASTER_PASSWORD_LENGTH = POLICY.minLength;

/**
 * Seuil historique, conserve pour compatibilite.
 *
 * Il s'applique desormais aux bits EFFECTIFS calcules par password-policy.js,
 * et non plus aux bits bruts de l'estimateur naif.
 */
export const MIN_MASTER_PASSWORD_ENTROPY_BITS = POLICY.minEffectiveBits;

/**
 * Valide un nouveau mot de passe maitre.
 *
 * @returns {{valid: boolean, message?: string, entropyBits?: number,
 *            effectiveBits?: number, naiveBits?: number, analysis?: object}}
 */
export function validateNewMasterPassword(password) {
  const verdict = evaluateMasterPasswordPolicy(password);
  const analysis = verdict.analysis;

  if (!verdict.valid) {
    return {
      valid: false,
      message: verdict.message,
      // Le detail d'analyse est joint pour que l'interface puisse expliquer
      // le refus. Il ne contient JAMAIS le mot de passe lui-meme.
      naiveBits: analysis.naiveBits,
      effectiveBits: analysis.effectiveBits,
      analysis
    };
  }

  return {
    valid: true,
    // `entropyBits` conserve son nom historique pour les appelants existants,
    // mais porte desormais la valeur EFFECTIVE, seule pertinente pour une
    // decision de securite.
    entropyBits: analysis.effectiveBits,
    effectiveBits: analysis.effectiveBits,
    naiveBits: analysis.naiveBits,
    analysis
  };
}

/**
 * Estimateur historique, reexporte pour compatibilite visuelle.
 *
 * A NE PAS utiliser comme decision de securite : il ignore tout motif
 * previsible. Utiliser `validateNewMasterPassword` ou, plus finement,
 * `analyzePassword` de password-policy.js.
 */
export { estimatePasswordEntropyBits };

export default {
  validateNewMasterPassword,
  estimatePasswordEntropyBits,
  MIN_MASTER_PASSWORD_LENGTH,
  MIN_MASTER_PASSWORD_ENTROPY_BITS
};
