export class Vault {
  constructor(entries = []) {
    this.entries = entries;
  }

  addEntry(entry) {
    this.entries.push(entry);
  }

  removeEntry(id) {
    this.entries = this.entries.filter(e => e.id !== id);
  }

  getAllEntries() {
    return [...this.entries];
  }

  updateEntry(id, updatedEntry) {
    this.entries = this.entries.map(e => (e.id === id ? updatedEntry : e));
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
    return this.entries.find(e => e.id === id) || null;
  }

  clear() {
    this.entries = [];
  }
}
