import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const vaultListSource = fs.readFileSync('scripts/ui/vault-list/vault-list.js', 'utf8');
const managerSource = fs.readFileSync('scripts/core/vault/manager.js', 'utf8');

// Régression : l'UI ne doit plus écrire directement dans vault.entries + saveVault
assert(
  !vaultListSource.includes('const updated = vault.entries.map'),
  'Régression détectée: mutation directe de vault.entries dans l’UI.'
);
assert(
  vaultListSource.includes('window.vaultManager.updateEntry('),
  'Le flux sécurisé updateEntry n’est pas utilisé dans la sauvegarde d’édition.'
);

// Régression API : updateEntry doit être appelée avec (id, updatedEntry)
assert(
  managerSource.includes('this.vault.updateEntry(entryId, localEntry);'),
  'Signature updateEntry invalide dans markEntryAccessed.'
);

console.log('✅ Security regression checks passed.');
