import {
	openDB
} from './indexeddb.js';
import { validateVaultRecord } from './vault-format.js';
// `readLocalBackup` n'est plus importe ici : la lecture de la sauvegarde
// secondaire appartient desormais au seul service securise, qui la valide
// et la dechiffre avant tout usage.
import { writeLocalBackup } from './local-backup.js';
import {
	canonicalize,
	createEncryptedSnapshot,
	writeVaultRecordVerified
} from './vault-transaction.js';
import { restoreBackupWhenPrimaryMissing } from './backup-restore-service.js';

function waitForTransaction(transaction) {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'));
		transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
	});
}
/**
 * Gère les opérations de lecture/écriture sur IndexedDB pour le vault.
 */
export class StorageManager {
	constructor() {
		this.db = null;
	}
	/**
	 * Initialise la connexion à IndexedDB.
	 */
	async initializeDB() {
		this.db = await openDB();
	}
	/**
	 * Charge le vault actuel depuis IndexedDB.
	 * @returns {Promise<Object|null>}
	 */
	async loadVault() {
		if (!this.db) this.db = await openDB();
		const tx = this.db.transaction('vault', 'readonly');
		const store = tx.objectStore('vault');
		return new Promise((resolve, reject) => {
			const req = store.get('current');
			req.onsuccess = e => resolve(e.target.result || null);
			req.onerror = reject;
		});
	}
	/**
	 * Sauvegarde un vault complet dans la base.
	 * @param {Array} entries - Entrées chiffrées.
	 * @param {Object} meta - Métadonnées.
	 */
	async saveVault(entries, meta) {
		if (!this.db) this.db = await openDB();
		const vaultRecord = validateVaultRecord({
			id: 'current',
			entries,
			meta
		});

		// 0. INSTANTANE CHIFFRE du coffre courant, pris AVANT toute ecriture.
		//
		//    LOT 3B - DEFAUT CORRIGE. Cette methode validait la transaction,
		//    relisait, comparait, puis se contentait de LEVER une erreur en
		//    cas de divergence. Le stockage persistant restait alors sur le
		//    nouveau ciphertext alors que l'appelant recevait un echec et que
		//    l'etat en memoire conservait l'ancienne entree : un ajout, une
		//    modification ou une suppression signale comme echoue pouvait
		//    donc etre reellement persiste. La couche d'ecriture verifiee du
		//    Lot 2 (vault-transaction.js) existait deja mais n'etait pas
		//    utilisee par ce chemin.
		//
		//    L'instantane ne contient que { id, iv, ciphertext } et des
		//    metadonnees non secretes : aucune donnee dechiffree n'y figure.
		//    Son absence n'empeche jamais l'ecriture — un coffre inexistant,
		//    a la premiere creation, n'a simplement rien a restaurer — et
		//    l'echec de sa construction ne doit pas faire echouer une
		//    sauvegarde par ailleurs legitime.
		let snapshot = null;
		try {
			const current = await this.loadVault();
			if (current) snapshot = validateVaultRecord(createEncryptedSnapshot(current));
		} catch {
			snapshot = null;
		}

		// 1 a 4. ecriture dans UNE transaction, attente de la VALIDATION,
		//    relecture, comparaison canonique (cles triees ; une comparaison
		//    de taille ne suffirait pas). Si, et seulement si, la transaction
		//    a ete validee mais que la relecture diverge, l'instantane est
		//    reecrit puis cette restauration est elle-meme relue et verifiee.
		//    Apres une transaction ANNULEE, aucune restauration n'est tentee :
		//    l'ancien record est intact par construction et une ecriture
		//    supplementaire pourrait au contraire ecraser des donnees saines.
		await writeVaultRecordVerified(this, vaultRecord, snapshot);

		// 5. seulement ensuite : sauvegarde secondaire VERSIONNEE.
		this.lastBackupResult = this.saveToLocalBackup(vaultRecord.entries, vaultRecord.meta);
		return this.lastBackupResult;
	}
	/**
	 * Lot 2 : ecrit un record de coffre deja normalise dans UNE transaction
	 * IndexedDB, sans effet de bord.
	 *
	 * Difference avec saveVault() et importFullVault(), qui sont conserves :
	 * cette methode ne met PAS a jour la sauvegarde secondaire. La sauvegarde
	 * locale ne doit etre actualisee qu'apres verification de l'ecriture
	 * principale, ce que decide l'appelant (vault-transaction.js).
	 *
	 * Si la transaction est annulee, la promesse est rejetee et l'ancien
	 * record reste intact : IndexedDB garantit l'atomicite de la transaction.
	 *
	 * @param {Object} vaultRecord record deja valide et normalise
	 */
	async putVaultRecord(vaultRecord) {
		if (!this.db) this.db = await openDB();
		const normalized = validateVaultRecord(vaultRecord);
		const tx = this.db.transaction('vault', 'readwrite');
		const store = tx.objectStore('vault');
		store.put(normalized);
		await waitForTransaction(tx);
		return normalized;
	}
	/**
	 * Efface toutes les données du vault.
	 */
	async clearVault() {
		if (!this.db) this.db = await openDB();
		const tx = this.db.transaction('vault', 'readwrite');
		const store = tx.objectStore('vault');
		store.clear();
		await waitForTransaction(tx);
	}
	/**
	 * Importe un fichier `.vault` complet dans la base de données.
	 * @param {Object} vaultData - Le contenu complet (entries + meta).
	 */
	async importFullVault(vaultData) {
		if (!this.db) this.db = await openDB();
		const vaultRecord = validateVaultRecord(vaultData);
		const tx = this.db.transaction('vault', 'readwrite');
		const store = tx.objectStore('vault');
		store.put(vaultRecord);
		await waitForTransaction(tx);

		// Meme discipline que saveVault : relecture et comparaison canonique
		// AVANT toute mise a jour de la sauvegarde secondaire.
		const reread = await this.loadVault();
		if (canonicalize(reread) !== canonicalize(vaultRecord)) {
			throw new Error('Vault import verification failed: re-read record differs.');
		}

		this.lastBackupResult = this.saveToLocalBackup(vaultRecord.entries, vaultRecord.meta);
		return this.lastBackupResult;
	}
	/**
	 * Restaure le vault à partir du backup local dans localStorage (si présent).
	 * @returns {boolean} true si restauration réussie, false sinon
	 */
	async restoreFromLocalBackup(options = {}) {
		// === Lot 2 partie 2b : porte arriere fermee ======================
		//
		// METHODE CONSERVEE. Elle restaurait encore le coffre principal en
		// appelant directement importFullVault(), donc SANS mot de passe,
		// SANS confirmation, SANS verification du bloc cryptographique et
		// SANS authentification des entrees. Une sauvegarde structurellement
		// valide mais au ciphertext altere etait ecrite telle quelle.
		// Reproduction : restoreResult true, writes 1, restoredTampered true.
		//
		// Elle ne restaure plus rien par elle-meme. Deux comportements :
		//
		//  1. si les rappels obligatoires sont fournis, elle DELEGUE au
		//     service securise backup-restore-service.js, qui applique le
		//     contrat complet du Lot 2 : information, confirmation explicite,
		//     mot de passe, derivation, bloc de validation, dechiffrement
		//     authentifie de TOUTES les entrees, validation du plaintext,
		//     garde anti-course, transaction unique, relecture verifiee ;
		//
		//  2. sinon, elle refuse explicitement avec `secure_restore_required`
		//     et n'ecrit STRICTEMENT rien.
		//
		// CHANGEMENT DE CONTRAT ASSUME : la valeur de retour n'est plus un
		// booleen mais un objet portant `restored`. Aucun appelant du depot
		// n'utilisait la valeur booleenne (verifie par recherche).
		//
		// @param {{requestPassword?: Function, confirmRestore?: Function,
		//          localStorageRef?: object}} options
		// @returns {Promise<{restored: boolean, reason?: string}>}
		const { requestPassword, confirmRestore, localStorageRef } = options;

		if (typeof requestPassword !== 'function' || typeof confirmRestore !== 'function') {
			return Object.freeze({
				restored: false,
				reason: 'secure_restore_required',
				message: 'Restauration refusee : elle exige une confirmation explicite, le mot de passe du coffre et une verification cryptographique complete. Utilisez backup-restore-service.js.'
			});
		}

		return restoreBackupWhenPrimaryMissing({
			storage: this,
			localStorageRef: localStorageRef
				?? (typeof localStorage !== 'undefined' ? localStorage : null),
			requestPassword,
			confirmRestore
		});
	}
	/**
	 * Sauvegarde automatique locale chiffrée (backup redondant).
	 * @param {Array} entries - Données chiffrées.
	 * @param {Object} meta - Métadonnées avec salt.
	 */
	saveToLocalBackup(entries, meta) {
		// === Lot 2 partie 2 : delegation a la couche versionnee ===
		// METHODE CONSERVEE, signature inchangee. Elle ecrivait directement
		// localStorage['vaultBackup'] en base64, ce qui maintenait un second
		// mecanisme de sauvegarde concurrent a chaque ecriture ordinaire du
		// coffre. Elle alimente desormais la SEULE destination normale :
		// l'enveloppe versionnee cryptokeep.backup.v1.
		//
		// `vaultBackup` n'est plus jamais une destination d'ecriture. Il ne
		// subsiste que comme format historique detectable et migrable.
		//
		// Un echec de sauvegarde secondaire (quota par exemple) n'invalide pas
		// le coffre principal deja ecrit et verifie : le rapport est retourne
		// a l'appelant, qui decide d'en avertir l'utilisateur.
		return writeLocalBackup({ id: 'current', entries, meta });
	}
	/**
	 * Charge manuellement les données brutes du vault.
	 * @returns {Promise<Object|null>}
	 */
	 
}
