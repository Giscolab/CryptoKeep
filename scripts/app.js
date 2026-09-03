import './utils/import-csv.js';
// `importVault` reste exportee par ./core/storage/backup.js et delegue
// desormais au service securise. app.js appelle directement le flux complet
// `importVaultFile`, qui verifie la cryptographie avant toute ecriture.
import {
	exportVault
} from './core/storage/backup.js';
import {
	vaultManager
} from './core/vault/manager.js';
import { assertSecureWebCrypto } from './core/crypto/runtime.js';
// L'implementation historique AutoLock reste disponible dans
// ./security/autolock.js et reste couverte par les tests. Elle n'est
// plus instanciee ici : voir SessionAutoLock ci-dessous (Lot 1).
import {
	lockVaultSession
} from './security/session-lock.js';
import { SessionAutoLock } from './security/autolock-controller.js';
import {
	consumeMasterPassword,
	clearMasterPasswordField,
	getMasterPasswordField,
	installMasterPasswordHygiene
} from './security/master-password-field.js';
import { initLogoutControl } from './security/logout.js';
import { importVaultFile } from './core/storage/vault-import-service.js';
import {
	inspectRestoreSituation,
	restoreBackupWhenPrimaryMissing
} from './core/storage/backup-restore-service.js';
import {
	migrateLegacyBackupVerified,
	inspectLegacyBackup
} from './core/storage/legacy-backup-migration.js';
import { requestPasswordDialog, confirmDialog } from './ui/secure-dialogs.js';
import { initEntryModal } from './ui/entry-modal.js';
import { initMasterPasswordModal } from './ui/master-password-modal.js';
import {
	initDashboardMetricActions,
	renderAuditReport,
	getLastAuditReport
} from './ui/audit-report-view.js';
import { initSettingsControls } from './ui/settings-controls.js';
import { installVaultViewRefresh, refreshVaultViews } from './ui/vault-view-refresh.js';
import {
	probeStoragePersistence,
	describePersistenceIssue
} from './security/storage-persistence.js';
import { validateNewMasterPassword } from './security/master-password-policy.js';
import {
	auditSecurityDashboard
} from './security/security-dashboard-audit.js?v=20260719-1';
import {
	getReuseGroupEntries
} from './security/password-reuse.js';
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
// Lot 6 : `renderSecurityReport` n'est plus importe ici. Le module
// scripts/ui/security-report.js est CONSERVE et documente comme historique ;
// il n'est simplement plus branche sur l'affichage.
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
// `PasswordGenerator` n'est plus importe ici : depuis le Lot 3b, le seul
// consommateur applicatif du generateur est scripts/ui/entry-modal.js.
// Le module scripts/utils/password-generator.js est inchange, toujours
// exporte et toujours teste.
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
		// Lot 6 : `renderSecurityReport()` retire d'ici pour la meme raison.
		// Le rapport de securite ne se rafraichit que sur demande explicite.
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
		// Lot 6 : `renderSecurityReport()` n'est plus appele ici. Il ecrivait
		// dans les memes cartes que le nouveau rapport, avec les compteurs
		// naifs de `getPasswordStats()`, et redessinait le graphique a partir
		// de `getMonthlyStats()`, une « evolution » reconstituee mois par mois
		// alors que le coffre ne conserve aucun historique.
		// L'audit reel se lance par le bouton « Lancer l'audit ». Afficher la
		// vue ne declenche donc plus aucun calcul automatique : l'utilisateur
		// voit l'etat honnete du dernier audit, ou « non encore execute ».
		// Le dernier etat connu est re-affiche, sans relancer de calcul.
		renderAuditReport(getLastAuditReport());
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
// La reference du champ maitre est resolue UNE SEULE FOIS (Lot 1).
const masterPasswordField = getMasterPasswordField();
installMasterPasswordHygiene();
if (masterPasswordField && masterPasswordField.toggle) {
	masterPasswordField.toggle.addEventListener('change', (e) => {
		masterPasswordField.input.type = e.target.checked ? 'text' : 'password';
	});
}
// === Vérifie support IndexedDB ===
if (!window.indexedDB) {
	showToast("IndexedDB n’est pas supporté par ce navigateur ou ce mode.");
	throw new Error("IndexedDB not supported.");
}
// === Sonde de persistance (Lot 1) ===
// Avertit si le navigateur refuse IndexedDB ou si l'ecriture echoue.
// Aucun resultat positif n'est annonce tant qu'aucun redemarrage n'a
// ete observe : le statut reste alors explicitement inconnu.
void probeStoragePersistence().then((report) => {
	const issue = describePersistenceIssue(report);
	if (issue) {
		showToast(issue.text, issue.severity, 15000);
		console.warn('[Vault] Persistance du stockage :', report.status);
	}
}).catch((err) => {
	console.warn('[Vault] Sonde de persistance indisponible :', err?.message || err);
});
// === Migration VERIFIEE de la sauvegarde historique (Lot 2, partie 2) ===
// N'est proposee que si une ancienne cle `vaultBackup` existe reellement.
// Aucune suppression n'a lieu avant verification cryptographique complete.
async function runVerifiedLegacyMigration() {
	try {
		const inspection = inspectLegacyBackup({ storage: localStorage });
		if (!inspection.present) return false;

		if (!inspection.structurallyValid) {
			console.warn('[Vault Backup] Sauvegarde historique illisible : conservee telle quelle.');
			return false;
		}

		const proceed = await confirmDialog({
			title: 'Migrer votre ancienne sauvegarde locale ?',
			message: 'Une sauvegarde au format historique a ete detectee. Sa migration exige son mot de passe afin de verifier qu\'elle est reellement dechiffrable.',
			lines: [
				['Format detecte', String(inspection.format)],
				['Entrees', String(inspection.entryCount)],
				['Format du coffre', `v${inspection.formatVersion}`]
			],
			warning: 'Tant que la verification n\'a pas reussi, l\'ancienne sauvegarde est conservee intacte.',
			confirmLabel: 'Verifier et migrer'
		});
		if (!proceed) return false;

		const report = await migrateLegacyBackupVerified({
			storage: localStorage,
			requestPassword: requestPasswordDialog
		});

		if (report.migrated) {
			showToast(`Sauvegarde historique (${report.sourceFormat}) migree et verifiee.`, 'success');
			return true;
		}

		if (report.reason === 'verification_failed') {
			showToast(
				'Verification impossible : l\'ancienne sauvegarde est conservee, rien n\'a ete supprime.',
				'error', 10000
			);
		}
		return false;
	} catch (err) {
		console.warn('[Vault Backup] Migration historique refusee :', err?.code || 'inconnu');
		return false;
	}
}

// === Restauration CONTROLEE de la sauvegarde secondaire (Lot 2) ===
// Cette fonction PROPOSE. Elle n'ecrit rien sans confirmation explicite,
// mot de passe et verification cryptographique complete.
async function proposeBackupRestoreIfNeeded() {
	try {
		const situation = await inspectRestoreSituation({
			storage: vaultManager.storage,
			localStorageRef: localStorage
		});

		if (!situation.offerRestore) return false;

		const report = await restoreBackupWhenPrimaryMissing({
			storage: vaultManager.storage,
			localStorageRef: localStorage,
			requestPassword: requestPasswordDialog,
			confirmRestore: (info) => confirmDialog({
				title: 'Restaurer la sauvegarde locale ?',
				message: 'Aucun coffre exploitable n\'a ete trouve dans le stockage principal.',
				lines: [
					['Entrees sauvegardees', String(info.entryCount)],
					['Date de la sauvegarde', String(info.backupCreatedAt)],
					['Format du coffre', `v${info.formatVersion}`]
				],
				warning: situation.stale
					? 'Cette sauvegarde semble plus ancienne que le dernier etat connu. Les horodatages ne sont pas authentifies.'
					: '',
				confirmLabel: 'Restaurer'
			})
		});

		showToast(`Coffre restaure : ${report.entryCount} entree(s). Deverrouillez-le.`, 'success');
		return true;
	} catch (err) {
		if (err?.code === 'cancelled') {
			showToast('Restauration annulee. Le stockage principal est inchange.', 'warning');
		} else if (err?.code && err.code !== 'no_backup') {
			console.warn('[Vault Backup] Restauration impossible :', err.code);
			showToast('Restauration impossible.', 'error');
		}
		return false;
	}
}

// === Ouverture IndexedDB et detection du premier lancement
let vaultReady = false;
const unlockButton = document.getElementById('unlock-vault');
if (unlockButton) unlockButton.disabled = true;

vaultManager.initializeStorage().then(async () => {
	const hasVault = await vaultManager.hasVault();

	// === Lot 2 : plus AUCUNE restauration automatique au demarrage ===
	// L'appel precedent a vaultManager.restoreFromLocalBackup() ecrasait le
	// coffre principal par une sauvegarde secondaire potentiellement obsolete,
	// sans confirmation ni verification cryptographique. La methode est
	// conservee dans StorageManager mais n'est plus declenchee seule.
	//
	// A la place : migration VERIFIEE de l'ancienne cle vers l'enveloppe
	// versionnee, puis simple PROPOSITION si le coffre principal manque.
	//
	// Lot 2 partie 2 : la migration exigeait auparavant la seule validite
	// structurelle. Une sauvegarde bien formee mais indechiffrable pouvait
	// donc etre promue en enveloppe « validee » et l'originale supprimee.
	// Elle exige desormais le mot de passe et une verification
	// cryptographique complete. En cas d'echec, `vaultBackup` est conserve.
	void runVerifiedLegacyMigration();

	if (!hasVault) {
		void proposeBackupRestoreIfNeeded();
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
// === Verrouillage automatique (Lot 1) ===
// L'implementation historique `AutoLock` (scripts/security/autolock.js)
// est conservee et toujours testee. Le controleur ci-dessous la remplace
// dans l'application : il respecte le reglage d'activation, ne demarre
// qu'apres authentification et n'entretient qu'un seul minuteur.
const autoLock = new SessionAutoLock(async (reason) => {
	await lockVaultSession(vaultManager, {
		message: reason === 'hidden'
			? 'Session verrouillee : onglet passe en arriere-plan.'
			: 'Session verrouillee automatiquement.',
		type: 'error'
	});
	clearMasterPasswordField();
});

// === Deconnexion manuelle (Lot 1) ===
// Le bouton existant dans la barre laterale n'etait raccorde a rien.
document.addEventListener('DOMContentLoaded', () => {
	initLogoutControl(vaultManager, {
		onLogout: () => autoLock.disarm()
	});
});
// === Generateur de mot de passe (Lot 3b) ===
// DEFAUT CORRIGE : un SECOND ecouteur `click` etait installe ici sur le meme
// bouton #generate-password que scripts/ui/entry-modal.js. Un clic unique
// generait donc deux mots de passe, dont un jete immediatement, et la valeur
// finalement affichee dependait de l'ordre d'installation des ecouteurs.
//
// L'ecouteur UNIQUE vit desormais dans scripts/ui/entry-modal.js, section
// « --- generateur --- ». Il utilise le meme PasswordGenerator, donc la meme
// source exclusive crypto.getRandomValues, et diffuse en plus un evenement
// `input` pour que l'indicateur de solidite ci-dessous soit reactualise.
//
// Le code retire est conserve a l'identique dans
// logs/app-generator-listener.avant-lot3b.txt (dossier ignore par git).
// Force du mot de passe en live
document.getElementById('password').addEventListener('input', (e) => {
	const strength = evaluatePasswordStrength(e.target.value);
	renderStrengthMeter(strength);
});
// Formulaire d'authentification
document.getElementById('auth-form').addEventListener('submit', async (e) => {
	e.preventDefault();
	if (!vaultReady) {
		showToast('Le stockage securise est encore en cours de chargement.', 'warning');
		return;
	}

	const field = masterPasswordField || getMasterPasswordField();
	if (!field || !field.input.value) {
		showToast('Le mot de passe maitre est requis.', 'error');
		return;
	}

	// `consumeMasterPassword` vide le champ, retablit type="password" et
	// decoche l'affichage dans un `finally` : reussite comme echec.
	// La valeur n'est jamais journalisee ni retournee a l'appelant.
	let unlocked = false;
	try {
		await consumeMasterPassword(async (password) => {
			const hasVault = await vaultManager.hasVault();
			if (!hasVault) {
				const policy = validateNewMasterPassword(password);
				if (!policy.valid) {
					showToast(policy.message, 'error');
					return;
				}

				await vaultManager.createVault(password);
				vaultManager.isFirstTime = false;
				showToast('Coffre initialise avec succes.', 'success');
				unlocked = true;
				return;
			}

			await vaultManager.unlock(password);
			await renderRecentAccesses();
			unlocked = true;
		}, { field });
	} catch (err) {
		vaultManager.clearSession();
		console.warn('[Vault] Unlock or migration failed:', err?.name || 'error');
		showToast('Impossible de deverrouiller ou migrer le coffre.', 'error');
		return;
	}

	if (!unlocked) return;

	// Le verrouillage automatique ne s'arme qu'apres authentification.
	autoLock.arm();
	hideAuthScreen();

	// Rafraichissement centralise juste apres le deverrouillage : liste,
	// acces recents, compteurs et statistiques repartent du meme etat.
	void refreshVaultViews().catch(() => { /* rafraichissement best-effort */ });
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
// Lot 2 : le coffre courant n'est plus remplace avant validation structurelle
// ET cryptographique complete, puis confirmation explicite. Le confirm()
// natif prealable est remplace par un resume verifie presente APRES
// dechiffrement integral du fichier importe.
document.getElementById('file-import').addEventListener('change', async (e) => {
	const input = e.target;
	const file = input.files[0];
	if (!file) return;

	try {
		const report = await importVaultFile(file, {
			storage: vaultManager.storage,
			requestPassword: requestPasswordDialog,
			confirmImport: (summary) => confirmDialog({
				title: 'Remplacer le coffre actuel ?',
				message: 'Le fichier a ete valide et entierement dechiffre. Le coffre actuel sera remplace.',
				lines: [
					['Entrees importees', String(summary.entryCount)],
					['Format du coffre', `v${summary.formatVersion}`],
					['Derivation', `${summary.kdf} - ${summary.iterations} iterations`],
					['IV distincts verifies', String(summary.distinctIvCount)],
					['Derniere modification', summary.lastModified || 'inconnue']
				],
				warning: 'Cette action remplace le coffre actuel. Exportez-le avant si besoin.',
				confirmLabel: 'Remplacer le coffre'
			}),
			localStorageRef: localStorage
		});

		// Le coffre a change : la session en cours ne correspond plus.
		await lockVaultSession(vaultManager, { notify: false });
		autoLock.disarm();

		if (report.backup && !report.backup.written) {
			showToast(report.backup.message, 'warning', 10000);
		}
		showToast(
			`Coffre importe (${report.summary.entryCount} entrees). Deverrouillez-le avec son mot de passe.`,
			'success'
		);
	} catch (err) {
		// Aucun detail exploitable n'est journalise : seul le code de refus.
		console.warn('[Vault Import] Refus :', err?.code || 'inconnu');
		if (err?.code === 'cancelled') {
			showToast('Import annule. Le coffre actuel est inchange.', 'warning');
		} else {
			showToast(err?.message || 'Import impossible : fichier refuse.', 'error', 8000);
		}
	} finally {
		// Le champ fichier est reinitialise : reselectionner le meme fichier
		// doit redeclencher l'evenement.
		try { input.value = ''; } catch { /* nettoyage best-effort */ }
	}
});
// Formulaire d'ajout d'entrée
// === Formulaire d'entree (Lot 3) =========================================
// GESTIONNAIRE REMPLACE. L'ancien lisait uniquement le titre, le nom
// d'utilisateur et le mot de passe : #website et #category etaient presents
// dans le markup mais JAMAIS persistes. Il n'etait de toute facon jamais
// atteignable, la fenetre #passwordModal n'ayant aucun gestionnaire
// d'ouverture. Son code est conserve pour reference dans
// logs/app-entry-form.avant-lot3.txt (dossier ignore par git).
//
// Le flux complet — ouverture, validation, generateur, categorie, notes,
// etiquettes, ecriture atomique verifiee — vit desormais dans
// scripts/ui/entry-modal.js, qui delegue a entry-operations.js.
document.addEventListener('DOMContentLoaded', () => {
	const modal = initEntryModal();
	if (!modal.bound && modal.reason === 'modal_absent') {
		console.warn('[Vault] Fenetre d\'entree introuvable dans le document.');
	}

	// Abonnement UNIQUE : toute mutation d'entree rafraichit les memes vues.
	installVaultViewRefresh();

	// Lot 4 : la fenetre de changement du mot de passe maitre existait dans
	// index.html sans aucun gestionnaire ; elle ne s'ouvrait jamais.
	const changeModal = initMasterPasswordModal();
	if (!changeModal.bound && changeModal.reason === 'modal_absent') {
		console.warn('[Vault] Fenetre de changement de mot de passe introuvable.');
	}

	// Lot 6 : les quatre actions des cartes du tableau de bord etaient des
	// <div> inertes. Elles sont desormais raccordees.
	initDashboardMetricActions();

	// Lot 7 : cinq bascules du panneau des reglages n'avaient ni identifiant
	// ni gestionnaire, dont trois cochees par defaut.
	const reglages = initSettingsControls();
	if (!reglages.bound && reglages.reason === 'view_absent') {
		console.warn('[Vault] Panneau des reglages introuvable.');
	}
});

// Lot 7 : navigation demandee par un module qui ne depend pas de la barre
// laterale (panneau des reglages).
document.addEventListener('vault:navigate', (event) => {
	const vue = event?.detail?.view;
	if (typeof vue === 'string' && vue.length > 0) showView(vue);
});

// Lot 6 : navigation reelle depuis les cartes du tableau de bord.
document.addEventListener('vault:metric-action', (event) => {
	const action = event?.detail?.action;
	if (action === 'reused') {
		showView('security-report-view');
		return;
	}
	showView('passwords-view');
});
