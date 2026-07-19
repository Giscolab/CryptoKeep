import './utils/import-csv.js';
import {
	exportVault,
	importVault
} from './core/storage/backup.js';
import {
	vaultManager
} from './core/vault/manager.js';
import { assertSecureWebCrypto } from './core/crypto/runtime.js';
import {
	AutoLock,
	getStoredDelay
} from './security/autolock.js';
import {
	lockVaultSession
} from './security/session-lock.js';
import { validateNewMasterPassword } from './security/master-password-policy.js';
import {
	auditSecurityDashboard
} from './security/security-dashboard-audit.js?v=20260719-1';
import {
	getReuseGroupEntries
} from './security/password-reuse-groups.js';
// === UI
import {
	hideAuthScreen
} from './ui/auth-screen/auth-screen.js';
import {
	evaluatePasswordStrength,
	renderStrengthMeter
} from './ui/password-meter/password-meter.js';
import {
	renderVaultEntries
} from './ui/vault-list/vault-list.js';
import {
	renderRecentAccesses
} from './ui/dashboard.js';
import {
	renderSecurityReport
} from './ui/security-report.js';
import {
	renderSecurityDashboardSections
} from './ui/security-dashboard.js';
import {
	openReuseResolver
} from './ui/reuse-resolver-modal.js';
import {
	showView
} from './ui/sidebar.js';
import {
	initThemeSelector
} from './ui/theme-selector.js';
import {
	initSettingsPanel
} from './ui/settings.js';
import {
	updateSidebarProfile
} from './ui/sidebar-profile.js';
// === Utilitaires
import {
	PasswordGenerator
} from './utils/password-generator.js';
import {
	showToast
} from './utils/toast.js';

try {
	assertSecureWebCrypto();
} catch (error) {
	console.error('[Vault] Secure Web Crypto is unavailable:', error);
	showToast('Web Crypto securise indisponible. Le coffre ne peut pas demarrer.', 'error', 10000);
	throw error;
}

vaultManager.isFirstTime = false;

document.addEventListener('vault:open-reuse-resolver', async (event) => {
	const { groupId, groupData } = event.detail || {};
	if (!groupId || !groupData) return;

	const allEntries = vaultManager.getEntries();
	const groupedEntries = getReuseGroupEntries(groupId, allEntries);
	if (!groupedEntries.length) {
		showToast('Impossible de retrouver les entrées de ce groupe.', 'warning');
		return;
	}

	const saveEntry = async (updatedEntry) => {
		await vaultManager.updateEntry(updatedEntry.id, updatedEntry);
		return true;
	};

	openReuseResolver(groupData, allEntries, saveEntry);
});

document.addEventListener('vault:security-updated', () => {
	const entries = vaultManager.getEntries();
	auditSecurityDashboard(entries).then((report) => {
		renderSecurityDashboardSections(report);
		renderSecurityReport();
	}).catch((err) => {
		console.warn('[Security Dashboard] Rafraîchissement indisponible :', err?.message || err);
	});
});

// === NAVIGATION PRINCIPALE (template tabs/views) ===
const navDashboard = document.getElementById('nav-dashboard');
const navPasswords = document.getElementById('nav-passwords');
const navSecurity = document.getElementById('nav-security');
const navSettings = document.getElementById('nav-settings');
// === Initialisation de l’interface utilisateur (thème, paramètres, etc.)
document.addEventListener('DOMContentLoaded', () => {
	initThemeSelector();
	initSettingsPanel();
});
// Dashboard
if (navDashboard) {
	navDashboard.addEventListener('click', () => showView('dashboard-view'));
}
// Passwords
if (navPasswords) {
	navPasswords.addEventListener('click', () => {
		showView('passwords-view');
		// <-- Ajout MAJEUR pour afficher la vraie liste
		const entries = vaultManager.getEntries();
		renderVaultEntries(entries);
	});
}
// Rapport de sécurité
if (navSecurity) {
	navSecurity.addEventListener('click', () => {
		showView('security-report-view');
		renderSecurityReport(); // met à jour dynamiquement à chaque affichage
		const entries = vaultManager.getEntries();
		auditSecurityDashboard(entries).then((report) => {
			renderSecurityDashboardSections(report);
		}).catch((err) => {
			console.warn('[Security Dashboard] Audit indisponible :', err?.message || err);
		});
	});
}
// Paramètres
if (navSettings) {
	navSettings.addEventListener('click', () => showView('settings-view'));
}
// === UI : Affichage/Masquage du mot de passe maître ===
document.getElementById('toggle-password-visibility').addEventListener('change', (e) => {
	const input = document.getElementById('master-password');
	input.type = e.target.checked ? 'text' : 'password';
});
// === Vérifie support IndexedDB ===
if (!window.indexedDB) {
	showToast("IndexedDB n’est pas supporté par ce navigateur ou ce mode.");
	throw new Error("IndexedDB not supported.");
}
// === Ouverture IndexedDB et detection du premier lancement
let vaultReady = false;
const unlockButton = document.getElementById('unlock-vault');
if (unlockButton) unlockButton.disabled = true;

vaultManager.initializeStorage().then(async () => {
	let hasVault = await vaultManager.hasVault();
	if (!hasVault) {
		hasVault = await vaultManager.restoreFromLocalBackup();
	}

	await updateSidebarProfile();
	if (!hasVault) {
		const titleElement = document.getElementById('auth-title');
		if (titleElement) titleElement.textContent = 'Creer un mot de passe maitre';
		if (unlockButton) unlockButton.textContent = 'Creer';
		vaultManager.isFirstTime = true;
	} else {
		vaultManager.isFirstTime = false;
	}

	vaultReady = true;
	if (unlockButton) unlockButton.disabled = false;
}).catch((err) => {
	console.error('[ERREUR] Impossible d’ouvrir la base IndexedDB :', err);
	showToast('Erreur critique : echec d acces au stockage securise.', 'error');
});
// AutoLock actif après authentification
void new AutoLock(() => {
	void lockVaultSession(vaultManager, {
		message: 'Session verrouillee automatiquement.',
		type: 'error'
	});
}, getStoredDelay() * 1000);
const generateBtn = document.getElementById('generate-password');
const passwordInput = document.getElementById('password');
if (generateBtn && passwordInput && typeof PasswordGenerator !== "undefined") {
	generateBtn.addEventListener('click', () => {
		const password = PasswordGenerator.generate();
		passwordInput.value = password;
	});
}
// Force du mot de passe en live
document.getElementById('password').addEventListener('input', (e) => {
	const strength = evaluatePasswordStrength(e.target.value);
	renderStrengthMeter(strength);
});
// Formulaire d'authentification
document.getElementById('auth-form').addEventListener('submit', async (e) => {
	e.preventDefault();
	const password = document.getElementById('master-password').value;
	if (!vaultReady) {
		showToast('Le stockage securise est encore en cours de chargement.', 'warning');
		return;
	}
	if (!password) {
		showToast('Le mot de passe maitre est requis.', 'error');
		return;
	}

	const hasVault = await vaultManager.hasVault();
	try {
		if (!hasVault) {
			const policy = validateNewMasterPassword(password);
			if (!policy.valid) {
				showToast(policy.message, 'error');
				return;
			}

			await vaultManager.createVault(password);
			vaultManager.isFirstTime = false;
			showToast('Coffre initialise avec succes.', 'success');
		} else {
			await vaultManager.unlock(password);
			await renderRecentAccesses();
		}
	} catch (err) {
		vaultManager.clearSession();
		console.warn('[Vault] Unlock or migration failed:', err);
		showToast('Impossible de deverrouiller ou migrer le coffre.', 'error');
		return;
	}
	hideAuthScreen();
	const stats = await vaultManager.getPasswordStats();
	// === MAJ DU SCORE DE SÉCURITÉ PRINCIPAL (block de la page d'accueil) ===
	if (document.getElementById('stats-score')) {
		document.getElementById('stats-score').innerText = stats.score + "%";
	}
	if (document.getElementById('stats-score-ring')) {
		document.getElementById('stats-score-ring').innerText = stats.score + "%";
	}
	// Niveau de sécurité (niveau dashboard)
	if (document.getElementById('stats-level')) {
		let level = "Sécurité faible";
		if (stats.score >= 80) level = "Sécurité forte";
		else if (stats.score >= 60) level = "Sécurité modérée";
		document.getElementById('stats-level').innerText = level;
	}
	// Message info sous le score
	if (document.getElementById('stats-info')) {
		const info = document.getElementById('stats-info');
		const weakCount = document.createElement('span');
		weakCount.id = 'stats-weak-in-info';
		weakCount.textContent = String(stats.weak);
		info.replaceChildren(
			document.createTextNode('Ameliorez votre score de securite en mettant a jour les mots de passe faibles et reutilises. Nous avons trouve '),
			weakCount,
			document.createTextNode(' mots de passe qui necessitent une attention particuliere.')
		);
	}
	// Nombres de métriques diverses
	if (document.getElementById('stats-total')) {
		document.getElementById('stats-total').innerText = stats.total;
	}
	if (document.getElementById('stats-weak')) {
		document.getElementById('stats-weak').innerText = stats.weak;
	}
	if (document.getElementById('stats-reused')) {
		document.getElementById('stats-reused').innerText = stats.reused;
	}
	if (document.getElementById('stats-old')) {
		document.getElementById('stats-old').innerText = stats.old;
	}
	// Mets à jour aussi dans la phrase info si besoin (évite les doublons si déjà fait au-dessus)
	const infoWeak = document.getElementById('stats-weak-in-info');
	if (infoWeak) infoWeak.innerText = stats.weak;
});
// === EXPORT DU COFFRE (.vault)
document.getElementById('btn-export').addEventListener('click', async () => {
	try {
		const vault = await vaultManager.exportVaultRecord();
		const blob = exportVault(vault);
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `vault_${new Date().toISOString().split('T')[0]}.vault`;
		a.click();
		URL.revokeObjectURL(url);
		showToast("Export du coffre terminé.", "success");
	} catch (err) {
		console.error('[Vault Export] Échec :', err);
		showToast("Erreur lors de l’export du coffre.", "error");
	}
});
// === DÉCLENCHE L’INPUT FICHIER (.vault)
document.getElementById('btn-import').addEventListener('click', () => {
	document.getElementById('file-import').click();
});
// === IMPORT DU COFFRE (.vault)
document.getElementById('file-import').addEventListener('change', async (e) => {
	const file = e.target.files[0];
	if (!file) return;
	const confirmation = confirm("Cette action écrasera le coffre actuel. Continuer ?");
	if (!confirmation) {
		showToast("Import annulé par l'utilisateur.", "warning");
		return;
	}
	try {
		const data = await importVault(file);
		await vaultManager.importVaultRecord(data);
		await lockVaultSession(vaultManager, { notify: false });
		showToast('Coffre importe. Deverrouillez-le avec son mot de passe maitre.', 'success');
	} catch (err) {
		console.error('[Vault Import] Échec :', err);
		showToast('Erreur à l’importation : vault invalide.', 'error');
	}
});
// Formulaire d'ajout d'entrée
const entryForm = document.getElementById('entry-form');
if (entryForm) {
	entryForm.addEventListener('submit', async (e) => {
		e.preventDefault();
		const title = document.getElementById('entry-title').value.trim();
		const username = document.getElementById('entry-username').value.trim();
		const password = document.getElementById('password').value;
		if (!title || !username || !password) {
			showToast("Tous les champs sont requis.", "error");
			return;
		}
		try {
		await vaultManager.addEntry({
				title,
				username,
				password
			});
			document.getElementById('entry-title').value = '';
			document.getElementById('entry-username').value = '';
		document.getElementById('password').value = '';
		renderVaultEntries(vaultManager.getEntries());
		await renderRecentAccesses();
			const stats = await vaultManager.getPasswordStats();
			document.getElementById('stats-section').innerText = `Total: ${stats.total} | Réutilisés: ${stats.reused} | Faibles: ${stats.weak}`;
			showToast("Entrée enregistrée avec succès.", "success");
		} catch (err) {
			console.error("Erreur lors de l'enregistrement :", err);
			showToast("Échec lors de l'enregistrement.", "error");
		}
	});
}
