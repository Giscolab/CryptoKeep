/**
 * MODULE HISTORIQUE - conserve, NON CHARGE (Lot 6).
 *
 * Ce fichier n'est plus reference par index.html. Il ajoutait un bouton
 * flottant « Audit Securite » ouvrant une fenetre qui REDEMANDAIT le mot de
 * passe maitre — « Saisissez votre mot de passe maitre pour lancer l'analyse
 * complete » — alors que la session etait deja deverrouillee et que les
 * entrees dechiffrees etaient disponibles. Reclamer un secret sans necessite
 * habitue l'utilisateur a le saisir sur demande, ce qui est exactement le
 * reflexe qu'un gestionnaire de mots de passe doit decourager.
 *
 * Il alimentait par ailleurs `AuditCrypto.runAudit`, dont les resultats sont
 * decrits dans l'en-tete de scripts/tools/audit-crypto.js.
 *
 * Le rapport actuel s'obtient par le bouton « Lancer l'audit » du rapport de
 * securite, qui travaille sur les entrees deja dechiffrees et ne demande
 * jamais de mot de passe.
 *
 * Ce fichier est conserve a titre documentaire. Ne pas le rebrancher.
 */

// scripts/ui/audit-panel.js
(function () {
  'use strict';

  function createAuditButton() {
    const btn = document.createElement('button');
    btn.textContent = '🔍 Audit Sécurité';
    btn.className = 'audit-trigger-btn';
    btn.setAttribute('aria-label', 'Lancer l’audit de sécurité');
    btn.onclick = openAuditModal;
    document.body.appendChild(btn);
  }

  function openAuditModal() {
    const overlay = document.createElement('div');
    overlay.className = 'audit-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'audit-modal';

    const title = document.createElement('h2');
    title.textContent = 'Audit cryptographique';
    modal.appendChild(title);

    const desc = document.createElement('p');
    desc.textContent = 'Saisissez votre mot de passe maître pour lancer l’analyse complète.';
    modal.appendChild(desc);

    const input = document.createElement('input');
    input.type = 'password';
    input.className = 'audit-input';
    input.placeholder = 'Mot de passe maître';
    input.setAttribute('aria-label', 'Mot de passe maître');
    modal.appendChild(input);

    const result = document.createElement('pre');
    result.className = 'audit-result';
    modal.appendChild(result);

    const runBtn = document.createElement('button');
    runBtn.textContent = 'Lancer l’audit';
    runBtn.className = 'audit-run-btn';
    runBtn.onclick = async () => {
      runBtn.disabled = true;
      result.textContent = 'Analyse en cours...';
      const report = await AuditCrypto.runAudit(input.value);
      result.textContent = renderReport(report);
      runBtn.disabled = false;
    };
    modal.appendChild(runBtn);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'audit-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => overlay.remove();
    modal.appendChild(closeBtn);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    input.focus();
  }

  function renderReport(report) {
  const lines = ['Resultat de l audit cryptographique'];

  // IV uniqueness
  if (report.ivDuplicates.length === 0) {
    lines.push('IV uniques : OK');
  } else {
    lines.push('IV dupliques detectes.');
    report.ivDuplicates.forEach(d => {
      lines.push(`- ${d.iv} utilise par : ${d.entries.join(', ')}`);
    });
  }

  // Master password strength
  if (report.masterPasswordStrength) {
    const s = report.masterPasswordStrength;
    lines.push(`Force du mot de passe : ${s.rating}`);
    lines.push(`Entropie estimee : ${s.entropyBits.toFixed(1)} bits`);
    lines.push(`Temps estime - CPU local : ${s.crackTime.local}`);
    lines.push(`Temps estime - GPU : ${s.crackTime.gpu}`);
    lines.push(`Temps estime - Cluster : ${s.crackTime.cluster}`);
  } else {
    lines.push('Aucun mot de passe fourni pour l analyse.');
  }

  // Salt
  if (report.saltReuse.saltHex) {
    lines.push(`Salt detecte (${report.saltReuse.saltBytesLength} octets)`);
    lines.push(`Reutilisation : ${report.saltReuse.reused ? 'Oui' : 'Non'}`);
  }

  // PBKDF2 collision test
  lines.push('Test PBKDF2 :');
  lines.push(`- Meme mot de passe + meme salt : ${report.pbkdf2CollisionTest.identicalPasswordKeysMatch ? 'OK' : 'Probleme'}`);
  lines.push(`- Mots de passe differents : ${report.pbkdf2CollisionTest.differentPasswordKeysMatch ? 'Collision' : 'Different'}`);

  return lines.join('\n');
}

// Nombre maximal de trames d attente avant de basculer sur le bouton de
// secours. L ancienne version relancait requestAnimationFrame sans limite :
// si #launch-audit-ui etait absent, la boucle tournait indefiniment et
// createAuditButton() n etait jamais utilisee, rendant l audit inaccessible.
const MAX_ATTACH_FRAMES = 300;

function waitForAuditButtonAndAttach(attempts = 0) {
  const btn = document.getElementById('launch-audit-ui');
  if (btn) {
    btn.addEventListener('click', openAuditModal);
    console.log('[✓] Audit UI connecté au bouton paramètres.');
    return;
  }

  if (attempts >= MAX_ATTACH_FRAMES) {
    // Repli conserve : le bouton flottant historique reste la voie d acces
    // a l audit lorsque le bouton des parametres est introuvable.
    console.warn('[Audit] Bouton #launch-audit-ui introuvable, bouton de secours affiché.');
    createAuditButton();
    return;
  }

  requestAnimationFrame(() => waitForAuditButtonAndAttach(attempts + 1));
}
waitForAuditButtonAndAttach();
})();
