/**
 * Helper générique pour accéder à IndexedDB plus facilement.
 * N'est pas lié au vault uniquement — peut être réutilisé ailleurs.
 */
export class IDBHelper {
	constructor(dbName = 'VaultDB', version = 1) {
		this.dbName = dbName;
		this.version = version;
		this.db = null;
	}

	async open(schemaCallback) {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.version);
			request.onupgradeneeded = (event) => {
				const db = event.target.result;
				if (schemaCallback) schemaCallback(db);
			};
			request.onsuccess = (event) => {
				this.db = event.target.result;
				resolve(this.db);
			};
			request.onerror = (event) => {
				reject(new Error('Échec d’ouverture IndexedDB : ' + event.target.error));
			};
		});
	}

	async get(storeName, key) {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction(storeName, 'readonly');
			const store = tx.objectStore(storeName);
			const req = store.get(key);
			req.onsuccess = e => resolve(e.target.result);
			req.onerror = reject;
		});
	}

	async put(storeName, value) {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction(storeName, 'readwrite');
			const store = tx.objectStore(storeName);
			const req = store.put(value);
			req.onsuccess = resolve;
			req.onerror = reject;
		});
	}

	async clear(storeName) {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction(storeName, 'readwrite');
			const store = tx.objectStore(storeName);
			const req = store.clear();
			req.onsuccess = resolve;
			req.onerror = reject;
		});
	}
}

/**
 * Sauvegarde le profil utilisateur via IDBHelper
 */
export async function updateUserProfileInDB(profile) {
	const helper = new IDBHelper('vault-db', 1);
	await helper.open((db) => {
		if (!db.objectStoreNames.contains('settings')) {
			db.createObjectStore('settings', { keyPath: 'id' });
		}
	});

	const data = {
		id: 'user-profile',
		name: profile.name,
		email: profile.email,
		language: profile.language || 'fr'
	};

	return helper.put('settings', data);
}

/**
 * Charge les infos du profil utilisateur via IDBHelper
 */
export async function loadUserProfileFromDB() {
	const helper = new IDBHelper('vault-db', 1);
	await helper.open((db) => {
		if (!db.objectStoreNames.contains('settings')) {
			db.createObjectStore('settings', { keyPath: 'id' });
		}
	});

	return helper.get('settings', 'user-profile');
}
