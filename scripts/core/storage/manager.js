import {
	openDB
} from './indexeddb.js';
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
		console.log('[Vault DEBUG] Données à sauvegarder :', entries, meta);
		const tx = this.db.transaction('vault', 'readwrite');
		const store = tx.objectStore('vault');
		await store.clear();
		await store.put({
			id: 'current',
			entries,
			meta
		});
		// 🔐 Sauvegarde aussi dans localStorage
		await this.saveToLocalBackup(entries, meta);
	}
	/**
	 * Efface toutes les données du vault.
	 */
	async clearVault() {
		if (!this.db) this.db = await openDB();
		const tx = this.db.transaction('vault', 'readwrite');
		const store = tx.objectStore('vault');
		return store.clear();
	}
	/**
	 * Importe un fichier `.vault` complet dans la base de données.
	 * @param {Object} vaultData - Le contenu complet (entries + meta).
	 */
	async importFullVault(vaultData) {
		if (!this.db) this.db = await openDB();
		console.log('[Vault DEBUG] Import en base :', vaultData);
		const tx = this.db.transaction('vault', 'readwrite');
		const store = tx.objectStore('vault');
		await store.clear();
		if (!vaultData.id) vaultData.id = 'current';
		await store.put(vaultData);
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
			console.log('[Vault Backup] Vault restauré depuis localStorage.');
			return true;
		} catch (err) {
			console.warn('[Vault Backup] Échec de restauration locale :', err);
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
			console.log('[Vault Backup] Copie sauvegardée dans localStorage.');
		} catch (err) {
			console.warn('[Vault Backup] Échec de la sauvegarde locale :', err);
		}
	}
	/**
	 * Charge manuellement les données brutes du vault.
	 * @returns {Promise<Object|null>}
	 */
	 
}