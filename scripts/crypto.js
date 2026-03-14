class VaultCrypto {
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