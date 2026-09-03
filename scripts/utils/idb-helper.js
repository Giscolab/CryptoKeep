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
 * Base et store du PROFIL utilisateur.
 *
 * LOT 8 - Nommes explicitement. Le profil vit dans une base DIFFERENTE de
 * celle du coffre (`VaultDB`), malgre la ressemblance des deux noms. La
 * suppression volontaire distingue les deux, et cette distinction ne doit pas
 * reposer sur des chaines recopiees a trois endroits.
 */
export const PROFILE_DB_NAME = 'vault-db';
export const PROFILE_STORE_NAME = 'settings';
export const PROFILE_RECORD_ID = 'user-profile';

/** Helper ouvert sur la base du profil, schema garanti. */
async function createProfileHelper() {
	const helper = new IDBHelper(PROFILE_DB_NAME, 1);
	await helper.open((db) => {
		if (!db.objectStoreNames.contains(PROFILE_STORE_NAME)) {
			db.createObjectStore(PROFILE_STORE_NAME, { keyPath: 'id' });
		}
	});
	return helper;
}

/**
 * Ouvre la base du profil et renvoie la connexion.
 *
 * LOT 8 : utilisee par la suppression volontaire, qui a besoin de la
 * connexion elle-meme pour vider le store et la refermer ensuite.
 */
export async function openProfileDatabase() {
	const helper = await createProfileHelper();
	return helper.db;
}

/**
 * Sauvegarde le profil utilisateur via IDBHelper
 */
export async function updateUserProfileInDB(profile) {
	const helper = await createProfileHelper();

	const data = {
		id: PROFILE_RECORD_ID,
		name: profile.name,
		email: profile.email,
		language: profile.language || 'fr'
	};

	return helper.put(PROFILE_STORE_NAME, data);
}

/**
 * Charge les infos du profil utilisateur via IDBHelper
 */
export async function loadUserProfileFromDB() {
	const helper = await createProfileHelper();
	return helper.get(PROFILE_STORE_NAME, PROFILE_RECORD_ID);
}
