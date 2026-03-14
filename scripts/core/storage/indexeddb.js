/**
 * Initialise ou ouvre la base de données IndexedDB du gestionnaire.
 * Utilise le nom "VaultDB" et un store "vault" avec clé primaire "id".
 * @returns {Promise<IDBDatabase>} - Instance de base de données ouverte.
 */
export function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('VaultDB', 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains('vault')) {
                const store = db.createObjectStore('vault', { keyPath: 'id' });
                store.createIndex('iv', 'iv', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
    console.error('[IndexedDB] Erreur détectée :', event.target.error);
    reject(new Error(`IndexedDB init error: ${event.target.error}`));
};

    });
}
