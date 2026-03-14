import {
	setupUILogger
} from './utils/logger.js';
setupUILogger();
import './utils/import-csv.js';
// === Logger de debug conditionnel
const DEBUG = false;

function debugLog(...args) {
	if (DEBUG) console.log('[LOG]', ...args);
}
// === Cryptographie
import {
	encryptData,
	decryptData,
	encryptDataWithWorker,
	decryptDataWithWorker
} from './core/crypto/aes-gcm.js';
import {
	deriveMasterKey,
	deriveMasterKeyWithWorker
} from './core/crypto/pbkdf2.js';
// === Stockage
import {
	openDB
} from './core/storage/indexeddb.js';
import {
	exportVault,
	importVault
} from './core/storage/backup.js';
import {
	VaultSchema
} from './core/storage/schema.js';
import {
	StorageManager
} from './core/storage/manager.js';
// === Vault
import {
	VaultManager
} from './core/vault/manager.js';
import {
	Vault
} from './core/vault/vault.js';
// === Sécurité
import {
	AutoLock,
	getStoredDelay
} from './security/autolock.js';
import {
	zeroize
} from './security/memory.js';
import {
	enforceCSP
} from './security/csp.js';
import {
	auditVault
} from './security/audit.js';
import {
	auditSecurityDashboard
} from './security/security-dashboard-audit.js';
import {
	getReuseGroupEntries
} from './security/password-reuse-groups.js';
// === UI
import {
	showAuthScreen,
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
	renderSecurityChart
} from './ui/security-chart.js';
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
	IDBHelper
} from './utils/idb-helper.js';
import {
	showToast
} from './utils/toast.js';
// === Sécurité CSP
enforceCSP();
// === INITIALISATION PRINCIPALE ===
const vaultManager = new VaultManager();
vaultManager.storage = new StorageManager();
vaultManager.isFirstTime = false;
window.vaultManager = vaultManager;
window.__VAULT_HIBP_ENABLED__ = false;

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
// === Ouverture IndexedDB et détection du premier lancement
vaultManager.storage.initializeDB().then(async () => {
	const existingVault = await vaultManager.storage.loadVault();
	updateSidebarProfile();
	if (!existingVault) {
		const restored = await vaultManager.storage.restoreFromLocalBackup();
		if (restored) {
			debugLog('[INIT] Vault restauré depuis backup localStorage.');
		} else {
			debugLog('[INIT] Aucun vault détecté — création du mot de passe maître requise.');
			const titleElement = document.getElementById('auth-title');
			const btnElement = document.getElementById('unlock-vault');
			if (titleElement) titleElement.textContent = 'Créer un mot de passe maître';
			if (btnElement) btnElement.textContent = 'Créer';
			vaultManager.isFirstTime = true;
		}
	} else {
		debugLog('[INIT] Vault détecté — déverrouillage nécessaire.');
	}
}).catch((err) => {
	console.error('[ERREUR] Impossible d’ouvrir la base IndexedDB :', err);
	showToast("Erreur critique : échec d’accès au stockage sécurisé.");
});
// AutoLock actif après authentification
const locker = new AutoLock(() => {
	vaultManager.masterKey = null;
	showAuthScreen();
	// SÉCURITÉ : on vide le champ mot de passe maître !
	const pwInput = document.getElementById('master-password');
	if (pwInput) pwInput.value = '';
	showToast('Session verrouillée automatiquement.', 'error');
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
	if (!password || password.length < 6) {
		showToast("Le mot de passe maître doit contenir au moins 6 caractères.", "error");
		return;
	}
	const vault = await vaultManager.storage.loadVault();
	if (!vault) {
		const salt = crypto.getRandomValues(new Uint8Array(16));
		const key = await deriveMasterKey(password, salt);
		vaultManager.masterKey = key;
		const validation = await encryptData({
			check: 'ok'
		}, key);
		await vaultManager.storage.saveVault(
			[], {
				salt: btoa(String.fromCharCode(...salt)),
				last_modified: new Date().toISOString(),
				validation
			});
		vaultManager.isFirstTime = false;
		showToast("Vault initialisé avec succès.", "success");
	} else {
		try {
			const salt = Uint8Array.from(atob(vault.meta.salt), c => c.charCodeAt(0));
			const key = await deriveMasterKey(password, salt);
			vaultManager.masterKey = key;
			if (DEBUG) {
				debugLog("Salt utilisé:", vault.meta.salt);
				if (vault.meta.validation) {
					debugLog("IV utilisé:", vault.meta.validation.iv);
					debugLog("Ciphertext:", vault.meta.validation.ciphertext);
				}
			}
			const validation = vault.meta.validation;
			const test = await decryptData(validation, key);
			if (!test || test.check !== 'ok') throw new Error('Validation échouée');
			await vaultManager.decryptAllEntries();
			renderRecentAccesses();
		} catch (err) {
			vaultManager.masterKey = null;
			showToast("Mot de passe maître incorrect.", "error");
			return;
		}
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
		document.getElementById('stats-info').innerHTML = `Améliorez votre score de sécurité en mettant à jour les mots de passe faibles et réutilisés. 
    Nous avons trouvé <span id="stats-weak-in-info">${stats.weak}</span> mots de passe qui nécessitent une attention particulière.`;
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
		const vault = await vaultManager.storage.loadVault();
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
		if (!data.meta || !data.meta.salt || !data.meta.validation) {
			showToast("Fichier .vault invalide ou incomplet.", "error");
			return;
		}
		const vaultToImport = {
			id: 'current',
			entries: Array.isArray(data.entries) ? data.entries : [],
			meta: data.meta
		};
		await vaultManager.storage.importFullVault(vaultToImport);
		showToast('Vault importé avec succès. Rechargez la page pour l’utiliser.', 'success');
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
			const stats = await vaultManager.getPasswordStats();
			document.getElementById('stats-section').innerText = `Total: ${stats.total} | Réutilisés: ${stats.reused} | Faibles: ${stats.weak}`;
			showToast("Entrée enregistrée avec succès.", "success");
		} catch (err) {
			console.error("Erreur lors de l'enregistrement :", err);
			showToast("Échec lors de l'enregistrement.", "error");
		}
	});
}
