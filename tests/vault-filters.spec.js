import { filterEntries, inferCategory, sortEntries } from '../scripts/utils/vault-filters.js';

(() => {
  console.log('=== TEST VAULT FILTERS ===');

  const entries = [
    { title: 'Banque SG', username: 'alice', url: 'https://sg.fr', updatedAt: 10 },
    { title: 'Gmail Perso', username: 'bob', url: 'https://mail.google.com', updatedAt: 30 },
    { title: 'Dropbox', username: 'charlie', url: 'https://dropbox.com', updatedAt: 20 }
  ];

  console.assert(inferCategory(entries[0]) === 'bank', '❌ Catégorie banque incorrecte');
  console.assert(inferCategory(entries[1]) === 'email', '❌ Catégorie email incorrecte');
  console.assert(inferCategory(entries[2]) === 'cloud', '❌ Catégorie cloud incorrecte');

  const queryResult = filterEntries(entries, { query: 'gmail', category: 'all' });
  console.assert(queryResult.length === 1, '❌ Filtre par recherche incorrect');

  const categoryResult = filterEntries(entries, { query: '', category: 'bank' });
  console.assert(categoryResult.length === 1, '❌ Filtre par catégorie incorrect');

  const sortedByTitle = sortEntries(entries, 'title-asc');
  console.assert(sortedByTitle[0].title === 'Banque SG', '❌ Tri alphabétique incorrect');

  const sortedByRecent = sortEntries(entries, 'recent');
  console.assert(sortedByRecent[0].title === 'Gmail Perso', '❌ Tri récent incorrect');

  console.log('✅ Tous les tests filtres ont réussi.');
})();
