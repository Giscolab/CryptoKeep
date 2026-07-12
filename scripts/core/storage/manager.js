import {
	openDB
} from './indexeddb.js';
import { validateVaultRecord } from './vault-format.js';

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
		const tx = this.db.transaction('vault', 'readwrite');
		const store = tx.objectStore('vault');
		store.put(vaultRecord);
		await waitForTransaction(tx);
		this.saveToLocalBackup(vaultRecord.entries, vaultRecord.meta);
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
		this.saveToLocalBackup(vaultRecord.entries, vaultRecord.meta);
	}
	/**
	 * Restaure le vault à partir du backup local dans localStorage (si présent).
	 * @returns {boolean} true si restauration réussie, false sinon
	 */
	async restoreFromLocalBackup() {
		const encoded = localStorage.getItem('vaultBackup');
		if (!encoded) return false;
		try {
			const json = atob(encoded);
			const vaultData = JSON.parse(json);
			await this.importFullVault(vaultData);
			return true;
		} catch (err) {
			console.warn('[Vault Backup] Local backup restoration failed:', err);
			return false;
		}
	}
	/**
	 * Sauvegarde automatique locale chiffrée (backup redondant).
	 * @param {Array} entries - Données chiffrées.
	 * @param {Object} meta - Métadonnées avec salt.
	 */
	async saveToLocalBackup(entries, meta) {
		try {
			const backupData = {
				id: 'current',
				entries,
				meta
			};
			const json = JSON.stringify(backupData);
			const encoded = btoa(json); // Simple backup encodé base64
			localStorage.setItem('vaultBackup', encoded);
		} catch (err) {
			console.warn('[Vault Backup] Local backup save failed:', err);
		}
	}
	/**
	 * Charge manuellement les données brutes du vault.
	 * @returns {Promise<Object|null>}
	 */
	 
}
