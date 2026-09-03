/**
 * CryptoKeep - Initialisation du rapport de securite.
 *
 * LOT 6 - DEFAUT CORRIGE. Ce module appelait `renderSecurityChart` au
 * chargement de la page avec DOUZE MOIS DE DONNEES INVENTEES, commentees
 * « donnees fictives » dans le code lui-meme :
 *
 *   scores: [65, 59, 70, 71, 66, 65, 73, 72, 75, 74, 73, 73]
 *   weak:   [24, 22, 20, 18, 19, 17, 16, 15, 14, 16, 16, 16]
 *
 * L'utilisateur voyait donc une « evolution de la sante de ses mots de
 * passe » qui n'avait aucun rapport avec son coffre, et qui s'affichait meme
 * coffre verrouille. Le coffre ne conserve AUCUN historique de securite :
 * une evolution dans le temps ne peut pas etre calculee, seulement fabriquee.
 *
 * Ce module raccorde desormais le rapport REEL. Le graphique n'est dessine
 * qu'apres un audit effectivement execute, et montre l'etat ACTUEL.
 * La version anterieure est conservee a l'identique dans
 * logs/security-report-init.avant-lot6.txt (dossier ignore par git).
 */

import { initAuditReport } from './audit-report-view.js';

document.addEventListener('DOMContentLoaded', () => {
  const rapport = initAuditReport();
  if (!rapport.bound && rapport.reason === 'view_absent') {
    console.warn('[Vault] Vue du rapport de securite introuvable.');
  }
});
