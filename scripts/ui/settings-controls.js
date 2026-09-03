/**
 * CryptoKeep - Raccordement reel des reglages (Lot 7).
 *
 * ETAT AVANT CE LOT
 * Cinq bascules du panneau des reglages n'avaient NI identifiant NI
 * gestionnaire : 2FA, remplissage automatique, generateur, alertes de
 * securite, effacement du presse-papiers. Trois d'entre elles etaient
 * COCHEES par defaut. L'utilisateur voyait donc des protections presentees
 * comme actives alors qu'aucune ligne de code ne les mettait en oeuvre.
 * La description de l'effacement du presse-papiers annoncait 60 secondes
 * quand le delai reel etait de 30. Le profil affichait « John Doe ».
 *
 * CE MODULE raccorde ce qui peut l'etre reellement, et n'affiche pour le
 * reste qu'un etat honnete. Il ne persiste que des reglages d'interface,
 * via app-settings.js, dont le schema est ferme et valide dans les deux sens.
 *
 * CE QU'IL NE FAIT PAS
 * Il n'active aucune fonction reseau tout seul. La verification de
 * compromission reste desactivee tant que l'utilisateur n'a pas coche la
 * case apres lecture du texte de consentement.
 */

import { readSettings, writeSettings } from '../utils/app-settings.js';
import {
  getHibpConsent,
  setHibpConsent,
  HIBP_NOTICE
} from '../security/hibp-service.js';
import { showToast } from '../utils/toast.js';
import { runAndRenderAudit } from './audit-report-view.js';

function byId(doc, id) { return doc.getElementById(id); }

/**
 * Applique un reglage, PUIS remet le controle sur l'etat reellement persiste.
 *
 * LOT 7C - DEFAUT CORRIGE. Les gestionnaires appelaient `writeSettings()` et
 * ignoraient son resultat. Quand le stockage refusait l'ecriture — quota
 * depasse, mode restreint, stockage desactive — la case restait sur la valeur
 * demandee alors que le reglage enregistre n'avait pas bouge :
 *
 *   demande UI                    : false
 *   case affichee apres           : false
 *   reglage reellement persiste   : true
 *
 * L'utilisateur decochait « Effacer le presse-papiers », voyait la case
 * decochee, et l'effacement restait actif. C'est exactement la divergence
 * entre interface affichee et comportement reel que ce lot devait supprimer.
 *
 * Le contrat est desormais : l'interface montre TOUJOURS ce qui s'appliquera
 * reellement. En cas de succes, la valeur retenue par le schema ; en cas
 * d'echec, la valeur qui reste en vigueur — et l'utilisateur en est averti.
 *
 * `setHibpConsent` suivait deja cette discipline ; elle est generalisee.
 *
 * @param {object} patch reglages demandes
 * @param {object} options options de stockage
 * @param {Function} resynchroniser recoit l'etat REEL a reafficher
 * @returns {{written: boolean, settings: object}}
 */
function appliquerReglage(patch, options, resynchroniser) {
  const rapport = writeSettings(patch, options);

  // En cas d'echec, l'etat de reference est relu du stockage : c'est lui qui
  // gouverne le comportement, pas ce que l'appelant a demande.
  const reel = rapport.written ? rapport.settings : readSettings(options);

  if (typeof resynchroniser === 'function') resynchroniser(reel);

  if (!rapport.written) {
    showToast(
      'Ce réglage n\'a pas pu être enregistré. Le réglage précédent reste actif.',
      'error', 8000
    );
  }

  return { written: rapport.written, settings: reel };
}

/** Applique une valeur a une case a cocher, sans declencher d'evenement. */
function setChecked(node, valeur) {
  if (node && 'checked' in node) node.checked = Boolean(valeur);
}

/** Applique une valeur a un menu deroulant. */
function setSelect(node, valeur) {
  if (node && 'value' in node) node.value = String(valeur);
}

/**
 * Affiche le texte de consentement HIBP, construit par `textContent`.
 *
 * Le texte vient du module metier : l'interface ne le reformule pas, et ne
 * peut donc pas en adoucir les termes.
 */
function renderHibpNotice(doc) {
  const corps = byId(doc, 'hibp-notice-body');
  if (!corps) return false;

  corps.replaceChildren();

  const titre = doc.createElement('strong');
  titre.textContent = HIBP_NOTICE.title;
  corps.appendChild(titre);

  for (const paragraphe of HIBP_NOTICE.body) {
    const p = doc.createElement('p');
    p.textContent = paragraphe;
    corps.appendChild(p);
  }

  const hote = doc.createElement('p');
  hote.className = 'setting-endpoint';
  hote.textContent = `Seul destinataire contacté : ${HIBP_NOTICE.endpoint}`;
  corps.appendChild(hote);

  return true;
}

/** Etat affiche de la fonction reseau. Jamais flatteur, toujours exact. */
function refreshHibpBadge(doc, options) {
  const consentement = getHibpConsent(options);
  const badge = byId(doc, 'badge-hibp');
  const description = byId(doc, 'desc-hibp');

  if (badge) badge.textContent = consentement.enabled ? 'Activé' : 'Désactivé';
  if (description) {
    description.textContent = consentement.enabled
      ? 'Activé : lors d\'un audit, un préfixe de 5 caractères par mot de passe '
        + 'est envoyé au service. Votre adresse IP est visible par celui-ci.'
      : 'Fonction réseau facultative, désactivée par défaut. '
        + 'Aucune requête n\'est émise tant qu\'elle est désactivée.';
  }

  setChecked(byId(doc, 'setting-hibp'), consentement.enabled);
  return consentement.enabled;
}

/**
 * Raccorde tous les reglages. Idempotent.
 *
 * @returns {{bound: boolean, controls: number, reason?: string}}
 */
export function initSettingsControls(options = {}) {
  const doc = options.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.getElementById !== 'function') {
    return { bound: false, controls: 0, reason: 'no_document' };
  }

  const vue = byId(doc, 'settings-view');
  if (!vue) return { bound: false, controls: 0, reason: 'view_absent' };
  if (vue.dataset && vue.dataset.settingsControlsBound === 'true') {
    return { bound: false, controls: 0, reason: 'already_bound' };
  }
  if (vue.dataset) vue.dataset.settingsControlsBound = 'true';

  const reglages = readSettings(options);
  let raccordes = 0;

  // --- presse-papiers ---------------------------------------------------
  const clipEnabled = byId(doc, 'setting-clipboard-clear');
  const clipSeconds = byId(doc, 'setting-clipboard-seconds');

  setChecked(clipEnabled, reglages.clipboardClearEnabled);
  setSelect(clipSeconds, reglages.clipboardClearSeconds);

  if (clipEnabled) {
    clipEnabled.addEventListener('change', () => {
      const rapport = appliquerReglage(
        { clipboardClearEnabled: Boolean(clipEnabled.checked) },
        options,
        (reel) => {
          setChecked(clipEnabled, reel.clipboardClearEnabled);
          if (clipSeconds) clipSeconds.disabled = !reel.clipboardClearEnabled;
        }
      );

      if (!rapport.written) return;
      showToast(rapport.settings.clipboardClearEnabled
        ? 'CryptoKeep tentera de vider le presse-papiers après chaque copie.'
        : 'Aucune tentative d\'effacement du presse-papiers ne sera faite.',
      'info');
    });
    if (clipSeconds) clipSeconds.disabled = !clipEnabled.checked;
    raccordes += 1;
  }

  if (clipSeconds) {
    clipSeconds.addEventListener('change', () => {
      appliquerReglage(
        { clipboardClearSeconds: Number.parseInt(clipSeconds.value, 10) },
        options,
        (reel) => setSelect(clipSeconds, reel.clipboardClearSeconds)
      );
    });
    raccordes += 1;
  }

  // --- generateur -------------------------------------------------------
  const genLength = byId(doc, 'setting-generator-length');
  const genDigits = byId(doc, 'setting-generator-digits');
  const genSymbols = byId(doc, 'setting-generator-symbols');

  setSelect(genLength, reglages.generatorLength);
  setChecked(genDigits, reglages.generatorDigits);
  setChecked(genSymbols, reglages.generatorSymbols);

  if (genLength) {
    genLength.addEventListener('change', () => {
      appliquerReglage(
        { generatorLength: Number.parseInt(genLength.value, 10) },
        options,
        (reel) => setSelect(genLength, reel.generatorLength)
      );
    });
    raccordes += 1;
  }
  if (genDigits) {
    genDigits.addEventListener('change', () => {
      appliquerReglage(
        { generatorDigits: Boolean(genDigits.checked) },
        options,
        (reel) => setChecked(genDigits, reel.generatorDigits)
      );
    });
    raccordes += 1;
  }
  if (genSymbols) {
    genSymbols.addEventListener('change', () => {
      appliquerReglage(
        { generatorSymbols: Boolean(genSymbols.checked) },
        options,
        (reel) => setChecked(genSymbols, reel.generatorSymbols)
      );
    });
    raccordes += 1;
  }

  // --- resume apres audit ----------------------------------------------
  const alertes = byId(doc, 'setting-security-alerts');
  setChecked(alertes, reglages.securityAlerts);
  if (alertes) {
    alertes.addEventListener('change', () => {
      appliquerReglage(
        { securityAlerts: Boolean(alertes.checked) },
        options,
        (reel) => setChecked(alertes, reel.securityAlerts)
      );
    });
    raccordes += 1;
  }

  // --- verification de compromission (reseau, facultative) --------------
  renderHibpNotice(doc);
  refreshHibpBadge(doc, options);

  const hibp = byId(doc, 'setting-hibp');
  if (hibp) {
    hibp.addEventListener('change', () => {
      const demande = Boolean(hibp.checked);
      const rapport = setHibpConsent(demande, options);

      if (!rapport.written) {
        // L'etat REEL est reaffiche : la case ne doit pas rester cochee si
        // le consentement n'a pas pu etre enregistre.
        showToast('Le réglage n\'a pas pu être enregistré.', 'error');
      } else if (demande) {
        showToast('Vérification activée. Un préfixe de 5 caractères par mot de passe '
          + 'sera envoyé lors des audits.', 'warning', 8000);
      } else {
        showToast('Vérification désactivée. Aucune requête réseau ne sera émise.', 'info');
      }

      refreshHibpBadge(doc, options);
    });
    raccordes += 1;
  }

  // --- audit : raccorde au moteur du Lot 6 ------------------------------
  // DEFAUT CORRIGE : ce bouton appelait `audit-panel.js`, module debranche au
  // Lot 6 parce qu'il REDEMANDAIT le mot de passe maitre. Il etait donc mort.
  const lancerAudit = byId(doc, 'launch-audit-ui');
  if (lancerAudit) {
    lancerAudit.addEventListener('click', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      lancerAudit.disabled = true;
      // La navigation est DIFFUSEE plutot qu'appelee : ce module n'a pas a
      // dependre de la barre laterale, et importer celle-ci executerait son
      // code de chargement dans tout contexte sans document.
      if (typeof CustomEvent === 'function') {
        doc.dispatchEvent(new CustomEvent('vault:navigate', {
          detail: { view: 'security-report-view' }
        }));
      }
      void runAndRenderAudit({ doc })
        .then((rapport) => {
          if (!readSettings(options).securityAlerts) return;
          if (rapport.status !== 'completed') {
            showToast(rapport.message || 'Audit non exécuté.', 'warning');
            return;
          }
          showToast(
            `Audit terminé : ${rapport.findings.length} constat(s) sur `
            + `${rapport.scope.entryCount} entrée(s).`,
            rapport.findings.length > 0 ? 'warning' : 'success'
          );
        })
        .finally(() => { lancerAudit.disabled = false; });
    });
    raccordes += 1;
  }

  return { bound: true, controls: raccordes };
}

export default { initSettingsControls };
