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
      result.innerHTML = '<em>⏳ Analyse en cours…</em>';
      const report = await AuditCrypto.runAudit(input.value);
      result.innerHTML = renderReport(report);
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
  let html = `<div class="audit-report">`;
  html += `<h3>🛡️ Résultat de l'audit cryptographique</h3>`;

  // IV uniqueness
  if (report.ivDuplicates.length === 0) {
    html += `<p><span class="tooltip" title="Chaque IV (vecteur d'initialisation) doit être unique pour chaque entrée chiffrée. S'il est dupliqué, la sécurité de AES-GCM s'effondre.">✔️ IV uniques : OK</span></p>`;
  } else {
    html += `<p><span class="tooltip" title="Des IV dupliqués ont été détectés. Cela compromet totalement la sécurité des données associées.">❌ IV dupliqués détectés !</span></p>`;
    report.ivDuplicates.forEach(d => {
      html += `<p>- ${d.iv} utilisé par : ${d.entries.join(', ')}</p>`;
    });
  }

  // Master password strength
  if (report.masterPasswordStrength) {
    const s = report.masterPasswordStrength;
    html += `<p><span class="tooltip" title="La robustesse du mot de passe maître est estimée selon son entropie et sa composition.">🔐 Force du mot de passe : ${s.rating}</span></p>`;
    html += `<p><span class="tooltip" title="L'entropie mesure le niveau d'imprévisibilité du mot de passe. Supérieure à 80 bits = excellente.">🔢 Entropie : ${s.entropyBits.toFixed(1)} bits</span></p>`;
    html += `<p><span class="tooltip" title="Temps estimé pour casser ce mot de passe par force brute. Ces durées sont approximatives selon le matériel utilisé.">🕒 Temps de cassage estimé :</span><br>
      • CPU local : ${s.crackTime.local}<br>
      • GPU : ${s.crackTime.gpu}<br>
      • Cluster distribué : ${s.crackTime.cluster}</p>`;
  } else {
    html += `<p><em>🔐 Aucun mot de passe fourni pour l’analyse.</em></p>`;
  }

  // Salt
  if (report.saltReuse.saltHex) {
    html += `<p><span class="tooltip" title="Le salt est une valeur aléatoire ajoutée à la dérivation de clé pour éviter les attaques par table arc-en-ciel.">🧂 Salt détecté</span> (${report.saltReuse.saltBytesLength} octets)</p>`;
    html += `<p><span class="tooltip" title="Réutiliser le même salt sur plusieurs dérivations fragilise l’unicité des clés.">♻️ Réutilisation : ${report.saltReuse.reused ? 'Oui' : 'Non'}</span></p>`;
  }

  // PBKDF2 collision test
  html += `<p><span class="tooltip" title="Ce test vérifie que la fonction PBKDF2 réagit correctement : mêmes entrées = même clé ; entrées différentes = clés différentes.">🔄 Test PBKDF2 :</span><br>
    • Même mot de passe + même salt → ${report.pbkdf2CollisionTest.identicalPasswordKeysMatch ? '✔️ OK' : '❌ Problème'}<br>
    • Mots de passe différents → ${report.pbkdf2CollisionTest.differentPasswordKeysMatch ? '❌ Collision' : '✔️ Différent'}</p>`;

  html += `</div>`;
  return html;
}

function waitForAuditButtonAndAttach() {
  const btn = document.getElementById('launch-audit-ui');
  if (btn) {
    btn.addEventListener('click', openAuditModal);
    console.log('[✓] Audit UI connecté au bouton paramètres.');
  } else {
    requestAnimationFrame(waitForAuditButtonAndAttach);
  }
}
waitForAuditButtonAndAttach();
})();
