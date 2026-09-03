/**
 * CryptoKeep - Fenetre de suppression volontaire (Lot 8).
 *
 * ETAT AVANT CE LOT
 * La carte « Zone critique » contenait un bouton « Supprimer le compte »
 * SANS identifiant et SANS gestionnaire. Il ne supprimait rien. Sa
 * description — « Supprime definitivement votre compte Vault et toutes les
 * donnees » — etait doublement fausse : il n'y a pas de compte, et rien
 * n'etait supprime.
 *
 * CE QUE FAIT CE MODULE
 * Il raccorde ce bouton a une confirmation forte :
 *   1. l'utilisateur choisit une PORTEE (coffre, profil, ou tout) ;
 *   2. la fenetre affiche ce qui sera supprime ET ce qui sera conserve ;
 *   3. l'utilisateur saisit une phrase exacte ;
 *   4. le bouton de confirmation reste DESACTIVE tant que la phrase ne
 *      correspond pas ;
 *   5. la suppression s'execute, puis son rapport reel est affiche.
 *
 * REGLES RESPECTEES
 * - Construction exclusivement par APIs DOM et `textContent`. Aucun
 *   `innerHTML` : le rapport contient des noms de bases et des cles, et rien
 *   de ce qui est affiche ne doit pouvoir devenir du balisage.
 * - Aucun style inline : la CSP interdit `unsafe-inline`.
 * - Aucun declenchement automatique. `destroyVaultData` n'est appelee que
 *   depuis le gestionnaire du bouton de confirmation, apres verification de
 *   la phrase.
 * - Le rapport affiche est celui du moteur, pas un message d'encouragement.
 *   Une suppression partielle est presentee comme partielle.
 */

import {
  DESTRUCTION_PHRASE,
  DESTRUCTION_SCOPES,
  confirmationMatches,
  survivorsForScope,
  targetsForScope,
  createDeleteFactory,
  destroyVaultData
} from '../core/vault/vault-destruction.js';
import { openDB } from '../core/storage/indexeddb.js';
import { openProfileDatabase, PROFILE_STORE_NAME } from '../utils/idb-helper.js';
import { showToast } from '../utils/toast.js';

/** Identifiant du bouton de la « Zone critique ». */
export const DESTRUCTION_BUTTON_ID = 'delete-vault-data';
export const DESTRUCTION_MODAL_ID = 'vault-destruction-modal';
export const DESTRUCTION_CONFIRM_ID = 'destruction-confirm-phrase';
export const DESTRUCTION_SUBMIT_ID = 'destruction-submit';

/** Libelles des portees. Le defaut est la portee la MOINS destructrice. */
const PORTEES = Object.freeze([
  Object.freeze({
    value: DESTRUCTION_SCOPES.VAULT,
    label: 'Le coffre seulement',
    detail: 'Supprime le coffre chiffré et sa sauvegarde secondaire.'
  }),
  Object.freeze({
    value: DESTRUCTION_SCOPES.PROFILE,
    label: 'Le profil seulement',
    detail: 'Supprime le nom, le courriel, la langue et les préférences.'
  }),
  Object.freeze({
    value: DESTRUCTION_SCOPES.ALL,
    label: 'Le coffre ET le profil',
    detail: 'Supprime toutes les données locales de CryptoKeep.'
  })
]);

function element(doc, tag, className, text) {
  const noeud = doc.createElement(tag);
  if (className) noeud.className = className;
  if (text !== undefined && text !== null) noeud.textContent = String(text);
  return noeud;
}

function listeDeTextes(doc, className, textes) {
  const liste = element(doc, 'ul', className);
  for (const texte of textes) liste.appendChild(element(doc, 'li', null, texte));
  return liste;
}

/** Description LISIBLE de ce qu'une portee supprime, batie sur les cibles reelles. */
export function describeScope(scope) {
  const cibles = targetsForScope(scope);
  if (!cibles) return [];

  const lignes = [];
  for (const base of cibles.databases) {
    lignes.push(base.name === 'VaultDB'
      ? 'Le coffre chiffré (base « VaultDB »).'
      : 'Le profil local (base « vault-db »).');
  }
  if (cibles.storageKeys.length > 0) {
    lignes.push(`${cibles.storageKeys.length} entrée(s) de stockage local : `
      + cibles.storageKeys.join(', '));
  }
  return lignes;
}

/** Rend le rapport du moteur, sans l'embellir. */
export function renderDestructionReport(doc, conteneur, rapport) {
  conteneur.replaceChildren();

  const titre = element(doc, 'h4', 'destruction-report__title');
  if (rapport.status === 'refused') {
    titre.textContent = 'Suppression refusée : rien n’a été modifié.';
  } else if (rapport.status === 'partial') {
    titre.textContent = 'Suppression INCOMPLÈTE : une partie des données est toujours présente.';
  } else if (!rapport.erasedSomething) {
    // Regle etablie au Lot 6 : aucun resultat positif sur une operation qui
    // n'a rien trouve. « Terminee » ne doit pas se lire « supprimee ».
    titre.textContent = 'Terminé : il n’y avait aucune donnée à supprimer.';
  } else {
    titre.textContent = `Terminé : ${rapport.removedRecords} enregistrement(s) supprimé(s) et vérifié(s).`;
  }
  conteneur.appendChild(titre);

  const detail = element(doc, 'ul', 'destruction-report__list');
  for (const cible of rapport.targets) {
    const nom = cible.kind === 'storage'
      ? `Stockage local — ${cible.key}`
      : `${cible.database}${cible.store ? ` / ${cible.store}` : ''}`;
    const etat = {
      cleared: 'supprimé et vérifié',
      absent: 'rien à supprimer',
      failed: 'ÉCHEC — la donnée est toujours présente',
      unverified: 'NON VÉRIFIÉ — impossible de confirmer la suppression',
      skipped: 'non traité',
      dropped: 'base retirée',
      blocked: 'base vidée, mais son nom subsiste'
    };
    const libelle = new Map(Object.entries(etat)).get(cible.outcome) || cible.outcome;
    detail.appendChild(element(doc, 'li', null, `${nom} : ${libelle}`));
  }
  conteneur.appendChild(detail);

  if (rapport.clipboard) {
    conteneur.appendChild(element(doc, 'p', 'destruction-report__note',
      rapport.clipboard.succeeded
        ? 'Presse-papiers : contenu copié par CryptoKeep effacé.'
        : `Presse-papiers : effacement non confirmé (${rapport.clipboard.reason || 'inconnu'}).`));
  }

  for (const note of rapport.notes || []) {
    conteneur.appendChild(element(doc, 'p', 'destruction-report__note', note));
  }

  conteneur.appendChild(element(doc, 'p', 'destruction-report__limit',
    'Limite honnête : cette page ne peut effacer que ses propres données de '
    + 'navigateur. Les fichiers que vous avez exportés vous-même, les '
    + 'sauvegardes système et les blocs déjà libérés sur le disque ne sont pas '
    + 'concernés.'));

  return conteneur;
}

/** Cablage reel des surfaces. Separe pour rester remplacable dans les tests. */
export function defaultDestructionSurfaces(globalObject = globalThis) {
  const databases = [
    { name: 'VaultDB', stores: ['vault'], open: () => openDB() },
    { name: 'vault-db', stores: [PROFILE_STORE_NAME], open: () => openProfileDatabase() }
  ];
  const storage = globalObject && globalObject.localStorage ? globalObject.localStorage : null;
  const deleteFactory = globalObject && globalObject.indexedDB
    ? createDeleteFactory(globalObject.indexedDB) : null;
  return { databases, storage, deleteFactory };
}

/**
 * Construit la fenetre. Elle n'est PAS presente dans `index.html` : une
 * fenetre de suppression dormante dans le document est une fenetre qu'un
 * defaut d'affichage peut reveler.
 */
function buildModal(doc, etat) {
  const overlay = element(doc, 'div', 'modal-overlay secure-dialog active');
  overlay.id = DESTRUCTION_MODAL_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const modal = element(doc, 'div', 'modal secure-dialog__modal destruction-modal');
  const header = element(doc, 'div', 'modal-header');
  header.appendChild(element(doc, 'h3', 'secure-dialog__title', 'Supprimer des données'));
  modal.appendChild(header);

  const body = element(doc, 'div', 'modal-body');

  body.appendChild(element(doc, 'p', 'destruction-warning',
    'Cette action est irréversible depuis CryptoKeep. Aucune donnée supprimée '
    + 'ici ne peut être récupérée par l’application.'));

  // --- choix de la portee ----------------------------------------------
  const groupe = element(doc, 'fieldset', 'destruction-scope');
  groupe.appendChild(element(doc, 'legend', null, 'Que voulez-vous supprimer ?'));

  for (const portee of PORTEES) {
    const ligne = element(doc, 'div', 'destruction-scope__option');
    const radio = doc.createElement('input');
    // Propriete ET attribut : la propriete est ce que lit le navigateur,
    // l'attribut est ce que lisent les selecteurs et les outils d'analyse.
    radio.type = 'radio';
    radio.setAttribute('type', 'radio');
    radio.name = 'destruction-scope';
    radio.setAttribute('name', 'destruction-scope');
    radio.value = portee.value;
    radio.id = `destruction-scope-${portee.value}`;
    radio.checked = portee.value === etat.scope;

    const label = element(doc, 'label', null, portee.label);
    label.setAttribute('for', radio.id);

    ligne.append(radio, label, element(doc, 'span', 'destruction-scope__detail', portee.detail));
    groupe.appendChild(ligne);
  }
  body.appendChild(groupe);

  // --- ce qui part / ce qui reste ---------------------------------------
  const supprime = element(doc, 'div', 'destruction-effect');
  supprime.appendChild(element(doc, 'h4', null, 'Sera supprimé'));
  body.appendChild(supprime);

  const conserve = element(doc, 'div', 'destruction-effect destruction-effect--kept');
  conserve.appendChild(element(doc, 'h4', null, 'Sera conservé'));
  body.appendChild(conserve);

  // --- phrase de confirmation -------------------------------------------
  const consigne = element(doc, 'p', 'destruction-phrase');
  consigne.append(
    doc.createTextNode('Pour confirmer, saisissez exactement : '),
    element(doc, 'strong', null, DESTRUCTION_PHRASE)
  );
  body.appendChild(consigne);

  const champ = doc.createElement('input');
  champ.type = 'text';
  champ.setAttribute('type', 'text');
  champ.id = DESTRUCTION_CONFIRM_ID;
  champ.className = 'auth-form__input destruction-input';
  champ.setAttribute('autocomplete', 'off');
  champ.setAttribute('aria-label', 'Phrase de confirmation');
  body.appendChild(champ);

  const rapportZone = element(doc, 'div', 'destruction-report');
  body.appendChild(rapportZone);

  modal.appendChild(body);

  // --- actions -----------------------------------------------------------
  const footer = element(doc, 'div', 'modal-footer');
  const annuler = element(doc, 'button', 'btn btn-secondary', 'Annuler');
  annuler.type = 'button';
  const valider = element(doc, 'button', 'btn btn-danger', 'Supprimer définitivement');
  valider.type = 'button';
  valider.id = DESTRUCTION_SUBMIT_ID;
  valider.disabled = true;
  footer.append(annuler, valider);
  modal.appendChild(footer);

  overlay.appendChild(modal);
  return { overlay, groupe, supprime, conserve, champ, rapportZone, annuler, valider };
}

/**
 * Ouvre la fenetre de suppression.
 *
 * @returns {object} references utiles aux tests, jamais des donnees de coffre
 */
export function openDestructionModal(options = {}) {
  const doc = options.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.createElement !== 'function') return { opened: false, reason: 'no_document' };

  const existante = doc.getElementById(DESTRUCTION_MODAL_ID);
  if (existante) return { opened: false, reason: 'already_open' };

  const etat = { scope: DESTRUCTION_SCOPES.VAULT };
  const vue = buildModal(doc, etat);

  const rafraichirEffets = () => {
    vue.supprime.replaceChildren(element(doc, 'h4', null, 'Sera supprimé'));
    vue.supprime.appendChild(listeDeTextes(doc, 'destruction-effect__list', describeScope(etat.scope)));
    vue.conserve.replaceChildren(element(doc, 'h4', null, 'Sera conservé'));
    vue.conserve.appendChild(listeDeTextes(doc, 'destruction-effect__list', survivorsForScope(etat.scope)));
  };

  const rafraichirBouton = () => {
    // La phrase seule autorise le bouton. Changer de portee remet donc la
    // decision a plat : la phrase est revalidee contre la nouvelle portee.
    vue.valider.disabled = !confirmationMatches(vue.champ.value);
  };

  vue.groupe.addEventListener('change', (evenement) => {
    const cible = evenement && evenement.target ? evenement.target : null;
    if (!cible || cible.name !== 'destruction-scope') return;
    if (!targetsForScope(cible.value)) return;
    etat.scope = cible.value;
    rafraichirEffets();
    rafraichirBouton();
  });

  vue.champ.addEventListener('input', rafraichirBouton);
  vue.champ.addEventListener('change', rafraichirBouton);

  const fermer = () => {
    // Le champ est vide avant retrait : la phrase n'est pas un secret, mais
    // laisser un noeud detache porteur d'une saisie ne sert a rien.
    vue.champ.value = '';
    if (typeof vue.overlay.remove === 'function') vue.overlay.remove();
  };
  vue.annuler.addEventListener('click', fermer);

  vue.valider.addEventListener('click', () => {
    // Double verrou : l'etat `disabled` est une commodite d'interface, la
    // verification de la phrase est la condition reelle.
    if (!confirmationMatches(vue.champ.value)) return;

    vue.valider.disabled = true;
    const surfaces = options.surfaces || defaultDestructionSurfaces();

    void destroyVaultData({
      scope: etat.scope,
      confirmation: vue.champ.value,
      databases: surfaces.databases,
      storage: surfaces.storage,
      deleteFactory: surfaces.deleteFactory,
      clearSession: options.clearSession || null,
      clearClipboard: options.clearClipboard || null,
      restoreFirstUse: options.restoreFirstUse || null
    }).then((rapport) => {
      vue.champ.value = '';
      renderDestructionReport(doc, vue.rapportZone, rapport);

      if (rapport.status === 'partial') {
        showToast('Suppression incomplète : lisez le détail affiché.', 'error', 10000);
      } else if (!rapport.erasedSomething) {
        showToast('Aucune donnée à supprimer.', 'info');
      } else {
        showToast('Suppression effectuée et vérifiée.', 'success');
      }

      vue.annuler.textContent = 'Fermer';
      if (typeof options.onComplete === 'function') options.onComplete(rapport);
    });
  });

  rafraichirEffets();
  rafraichirBouton();
  (doc.body || doc.documentElement).appendChild(vue.overlay);

  return { opened: true, overlay: vue.overlay, scope: etat };
}

/**
 * Raccorde le bouton de la « Zone critique ». Idempotent.
 *
 * IMPORTANT : cette fonction n'ouvre rien et ne supprime rien. Elle installe
 * un ecouteur de clic, et rien d'autre.
 */
export function initVaultDestructionControl(options = {}) {
  const doc = options.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.getElementById !== 'function') return { bound: false, reason: 'no_document' };

  const bouton = doc.getElementById(DESTRUCTION_BUTTON_ID);
  if (!bouton) return { bound: false, reason: 'button_absent' };
  if (bouton.dataset && bouton.dataset.vaultDestructionBound === 'true') {
    return { bound: false, reason: 'already_bound' };
  }
  if (bouton.dataset) bouton.dataset.vaultDestructionBound = 'true';

  bouton.addEventListener('click', (evenement) => {
    if (evenement && typeof evenement.preventDefault === 'function') evenement.preventDefault();
    openDestructionModal({ ...options, doc });
  });

  return { bound: true };
}

export default { initVaultDestructionControl, openDestructionModal };
