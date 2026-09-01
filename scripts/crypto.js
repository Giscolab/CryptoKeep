/**
 * CryptoKeep - Moteur cryptographique HISTORIQUE.
 *
 * STATUT : conserve pour reference et compatibilite. Aucun module ne
 * l importe et index.html ne le charge pas. L implementation active est
 * scripts/core/crypto/pbkdf2.js et scripts/core/crypto/aes-gcm.js.
 *
 * La classe est desormais EXPORTEE plutot que laissee morte au niveau du
 * module : elle fait partie de la surface publique du fichier, ce que le
 * lint constate. Aucun raccordement n est effectue et aucun comportement
 * ne change.
 *
 * NE PAS RACCORDER EN L ETAT : les parametres KDF n y sont pas versionnes
 * et ne suivent pas le format de coffre courant (voir vault-format.js).
 */
export class VaultCrypto {
    static async deriveMasterKey(password, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            enc.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 150000,
                hash: 'SHA-512'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    static async encryptEntry(data, key) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder();
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            enc.encode(JSON.stringify(data))
        );
        return { iv: this.arrayToBase64(iv), ciphertext: this.arrayToBase64(ciphertext) };
    }

    static async decryptEntry(entry, key) {
        const iv = this.base64ToArray(entry.iv);
        const ciphertext = this.base64ToArray(entry.ciphertext);
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );
        return JSON.parse(new TextDecoder().decode(decrypted));
    }

    // Helpers de conversion
    static arrayToBase64(buffer) {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)));
    }

    static base64ToArray(base64) {
        return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    }
}