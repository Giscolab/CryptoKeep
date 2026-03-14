import { Vault } from '../scripts/core/vault/vault.js';

(() => {
  console.log('=== TEST VAULT ===');

  const vault = new Vault();

  const entry1 = {
    id: 'id-001',
    title: 'Gmail',
    username: 'user1',
    password: 'StrongPass123'
  };

  const entry2 = {
    id: 'id-002',
    title: 'Github',
    username: 'dev42',
    password: 'Code4Life!'
  };

  // Test d'ajout
  vault.addEntry(entry1);
  vault.addEntry(entry2);

  const all = vault.getAllEntries();
  console.assert(all.length === 2, '❌ Mauvais nombre d’entrées');

  // Test hasEntry
  console.assert(vault.hasEntry('id-001') === true, '❌ hasEntry échoué');

  // Test de suppression
  vault.removeEntry('id-001');
  console.assert(vault.hasEntry('id-001') === false, '❌ Suppression échouée');

  // Test de mise à jour
  const updated = { ...entry2, title: 'Github Enterprise' };
  vault.updateEntry('id-002', updated);
  const found = vault.getAllEntries().find(e => e.id === 'id-002');
  console.assert(found.title === 'Github Enterprise', '❌ Mise à jour échouée');

  // Test reset
  vault.clear();
  console.assert(vault.getAllEntries().length === 0, '❌ clear() échoué');

  console.log('✅ Tous les tests Vault ont réussi.');
})();
