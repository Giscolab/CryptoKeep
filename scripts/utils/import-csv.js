document.addEventListener('DOMContentLoaded', () => {

  const importBtn = document.getElementById('btn-csv-import');
  const fileInput = document.getElementById('csv-import');

  if (!importBtn || !fileInput) {
    console.warn('[CSV Import] Boutons non trouvés dans le DOM.');
    return;
  }

  // Déclenche l’import CSV
  importBtn.addEventListener('click', () => {
    fileInput.click();
  });

  // Traitement du fichier CSV Edge
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

    const nameIdx = headers.indexOf('name');
    const urlIdx = headers.indexOf('url');
    const usernameIdx = headers.indexOf('username');
    const passwordIdx = headers.indexOf('password');

    if (nameIdx === -1 || usernameIdx === -1 || passwordIdx === -1) {
      showToast("Format CSV invalide (colonnes manquantes).", "error");
      return;
    }

    const entries = [];

    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const title = raw[nameIdx] || raw[urlIdx] || 'Sans nom';
      const username = raw[usernameIdx];
      const password = raw[passwordIdx];

      if (title && username && password) {
        entries.push({ title, username, password });
      }
    }

    if (!entries.length) {
      showToast("Aucune entrée valide dans le CSV.", "warning");
      return;
    }

    try {
      for (const entry of entries) {
        await vaultManager.addEntry(entry);
      }

      const stats = await vaultManager.getPasswordStats();
      document.getElementById('stats-section').innerText =
        `Total: ${stats.total} | Réutilisés: ${stats.reused} | Faibles: ${stats.weak}`;

      const updated = await vaultManager.decryptAllEntries();
      renderVaultEntries(updated);

      showToast(`${entries.length} mots de passe importés.`, "success");
    } catch (err) {
      console.error("[CSV Import] Échec :", err);
      showToast("Erreur lors de l’importation CSV.", "error");
    }
  });
});
