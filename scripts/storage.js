
class VaultStorage {
    constructor() {
        this.db = null;
        this.initializeDB();
    }

    initializeDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('VaultDB', 1);

            request.onupgradeneeded = (e) => {
                this.db = e.target.result;
                if (!this.db.objectStoreNames.contains('vault')) {
                    const store = this.db.createObjectStore('vault', { keyPath: 'id' });
                    store.createIndex('iv', 'iv', { unique: false });
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };

            request.onerror = reject;
        });
    }

    async saveVault(entries, meta) {
        if (!this.db) throw new Error("IndexedDB non initialisée.");

        const tx = this.db.transaction('vault', 'readwrite');
        const store = tx.objectStore('vault');

        await store.clear();
        await store.put({
            id: 'current',
            entries: entries.map(e => ({
                ...e,
                ciphertext: e.ciphertext
            })),
            meta
        });
    }

    async loadVault() {
        if (!this.db) throw new Error("IndexedDB non initialisée.");

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('vault', 'readonly');
            const store = tx.objectStore('vault');
            const request = store.get('current');

            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = reject;
        });
    }

    async importFullVault(vaultData) {
        if (!this.db) throw new Error("IndexedDB non initialisée.");

        const tx = this.db.transaction('vault', 'readwrite');
        const store = tx.objectStore('vault');

        await store.clear();

        // Validation minimale
        if (!vaultData.entries || !Array.isArray(vaultData.entries) || !vaultData.meta) {
            throw new Error("Format de coffre invalide.");
        }

        if (!vaultData.id) vaultData.id = 'current';

        await store.put(vaultData);
    }
}
