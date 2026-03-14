async getPasswordStats() {
    const entries = await this.decryptAllEntries();
    const stats = {
        total: entries.length,
        reused: 0,
        weak: 0
    };

    const seen = new Map();
    for (let entry of entries) {
        const pwd = entry.data.password;
        if (seen.has(pwd)) {
            stats.reused++;
        } else {
            seen.set(pwd, true);
        }
        if (pwd.length < 10 || !/[0-9]/.test(pwd) || !/[A-Z]/.test(pwd)) {
            stats.weak++;
        }
    }
    return stats;
}
