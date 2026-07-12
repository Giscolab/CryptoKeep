export class Vault {
  constructor(entries = []) {
    this.entries = entries;
  }

  addEntry(entry) {
    this.entries.push({ ...entry });
  }

  removeEntry(id) {
    this.entries = this.entries.filter(e => e.id !== id);
  }

  getAllEntries() {
    return this.entries.map((entry) => ({ ...entry }));
  }

  updateEntry(id, updatedEntry) {
    this.entries = this.entries.map((entry) => (entry.id === id ? { ...updatedEntry } : entry));
  }

  hasEntry(id) {
    return this.entries.some(e => e.id === id);
  }

  /**
   * Retourne une entrée par son ID.
   * @param {string} id
   * @returns {Object|null}
   */
  getEntryById(id) {
    const entry = this.entries.find((candidate) => candidate.id === id);
    return entry ? { ...entry } : null;
  }

  clear() {
    this.entries = [];
  }
}
