function showView(viewId) {
  document.querySelectorAll('.view').forEach(sec => sec.hidden = true);
  document.getElementById(viewId).hidden = false;

  document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));

  if (viewId === 'dashboard-view') {
    document.getElementById('nav-dashboard').classList.add('active');

    import('./vault-list/vault-list.js').then(async ({ renderRecentAccesses }) => {
      if (window.vaultManager.masterKey) {
        await window.vaultManager.decryptAllEntries();
      }
      renderRecentAccesses();
    });
  }

  if (viewId === 'passwords-view') {
    document.getElementById('nav-passwords').classList.add('active');

    import('./vault-list/vault-list.js').then(({ renderVaultEntries }) => {
      const entries = window.vaultManager.getEntries();
      renderVaultEntries(entries);
    });
  }

  if (viewId === 'security-report-view') {
    document.getElementById('nav-security').classList.add('active');
  }

  if (viewId === 'settings-view') {
    document.getElementById('nav-settings').classList.add('active');
  }
}

document.addEventListener('DOMContentLoaded', () => {
	document.getElementById('nav-dashboard').addEventListener('click', (e) => {
		e.preventDefault();
		showView('dashboard-view');
	});
	document.getElementById('nav-passwords').addEventListener('click', (e) => {
		e.preventDefault();
		showView('passwords-view');
	});
	document.getElementById('nav-security').addEventListener('click', (e) => {
		e.preventDefault();
		showView('security-report-view');
	});
	document.getElementById('nav-settings').addEventListener('click', (e) => {
		e.preventDefault();
		showView('settings-view');
	});
	// Fonctionnalité : gestion des boutons de navigation avec scroll
	const setupNavButton = (selector, delay = 300) => {
		const button = document.querySelector(selector);
		if (button) {
			button.addEventListener('click', (e) => {
				e.preventDefault();
				showView('passwords-view');
				setTimeout(() => {
					const target = document.querySelector('#vault-list');
					if (target) {
						target.scrollIntoView({
							behavior: 'smooth'
						});
						target.classList.add('highlight-scroll');
						setTimeout(() => target.classList.remove('highlight-scroll'), 1500);
					}
				}, delay);
			});
		}
	};
	// Initialisation des boutons
	setupNavButton('.view-all-passwords');
	setupNavButton('.update-weak-passwords');
	setupNavButton('.generate-reused-passwords', 200);
	setupNavButton('.view-old-passwords', 200);
	// Affiche la vue dashboard par défaut
	showView('dashboard-view');
});

export { showView };
