/**
 * Lot 3 - Pipeline recherche / categorie / tri, et preferences d'affichage.
 * Donnees synthetiques uniquement.
 */
import assert from 'node:assert/strict';
import {
  inferCategory,
  resolveCategory,
  hasPersistedCategory,
  filterEntries,
  sortEntries,
  buildVisibleEntries,
  normalizeSearchText,
  SEARCHABLE_FIELDS,
  FALLBACK_CATEGORY
} from '../scripts/utils/vault-filters.js';
import {
  readViewPreferences,
  writeViewPreferences,
  sanitizeViewPreferences,
  VIEW_PREFERENCES_KEY,
  DEFAULT_VIEW_PREFERENCES
} from '../scripts/utils/view-preferences.js';
import { FakeLocalStorage } from './helpers/vault-fixtures.js';

const titres = (entries) => entries.map((entry) => entry.title);

try {
  console.log('=== TEST VAULT VIEW PIPELINE ===');

  // ========== CATEGORIES =================================================
  // 38. la categorie persistee est prioritaire sur l'inference
  {
    // Le titre « Gmail » serait infere `email`, mais l'entree declare `work`.
    const entree = { id: 'a', title: 'Gmail Pro', category: 'work' };
    assert.equal(inferCategory(entree), 'email', 'L inference dirait email');
    assert.equal(resolveCategory(entree), 'work',
      'La categorie persistee doit primer sur l inference');
    assert.equal(hasPersistedCategory(entree), true);
  }

  // 39 et 40. ancienne entree sans categorie : inference en REPLI seulement
  {
    const ancienne = { id: 'b', title: 'Ma Banque', username: 'alice' };
    assert.equal(hasPersistedCategory(ancienne), false);
    assert.equal(resolveCategory(ancienne), 'bank', 'L inference sert de repli');
    assert.equal('category' in ancienne, false,
      'Resoudre la categorie ne doit JAMAIS ecrire dans l entree');

    const inconnue = { id: 'c', title: 'Service obscur' };
    assert.equal(resolveCategory(inconnue), FALLBACK_CATEGORY,
      'Sans indice, le repli documente s applique');
  }

  // Une categorie persistee invalide retombe sur l inference
  {
    const bizarre = { id: 'd', title: 'Ma Banque', category: 'categorie-inventee' };
    assert.equal(hasPersistedCategory(bizarre), false);
    assert.equal(resolveCategory(bizarre), 'bank',
      'Une categorie persistee hors liste ne doit pas etre utilisee');
  }

  // 42. filtre de categorie fonctionnel, melangeant persiste et infere
  {
    const entrees = [
      { id: '1', title: 'Gmail Pro', category: 'work' },
      { id: '2', title: 'Ma Banque' },
      { id: '3', title: 'Dropbox', category: 'cloud' },
      { id: '4', title: 'Service obscur' }
    ];
    assert.deepEqual(titres(filterEntries(entrees, { category: 'work' })), ['Gmail Pro']);
    assert.deepEqual(titres(filterEntries(entrees, { category: 'bank' })), ['Ma Banque']);
    assert.deepEqual(titres(filterEntries(entrees, { category: 'cloud' })), ['Dropbox']);
    assert.deepEqual(titres(filterEntries(entrees, { category: 'other' })), ['Service obscur']);
    assert.equal(filterEntries(entrees, { category: 'all' }).length, 4);
  }

  // ========== RECHERCHE ==================================================
  // 44 et 45. casse et accents
  {
    const entrees = [
      { id: '1', title: 'École Polytechnique', username: 'eleve' },
      { id: '2', title: 'Café du Commerce', username: 'client' },
      { id: '3', title: 'Résumé Pro', username: 'user' },
      { id: '4', title: 'Sans accent', username: 'plain' }
    ];

    const cas = [
      ['ecole', 'École Polytechnique'],
      ['École', 'École Polytechnique'],
      ['ECOLE', 'École Polytechnique'],
      ['cafe', 'Café du Commerce'],
      ['CAFE', 'Café du Commerce'],
      ['Café', 'Café du Commerce'],
      ['resume', 'Résumé Pro'],
      ['Résumé', 'Résumé Pro'],
      ['RESUME', 'Résumé Pro']
    ];
    cas.forEach(([requete, attendu]) => {
      const resultat = filterEntries(entrees, { query: requete });
      assert.equal(resultat.length, 1, `Recherche « ${requete} » : une entree attendue`);
      assert.equal(resultat[0].title, attendu, `Recherche « ${requete} »`);
    });

    assert.equal(normalizeSearchText('Café'), 'cafe');
    assert.equal(normalizeSearchText('ÉCOLE'), 'ecole');
    assert.equal(normalizeSearchText('  Résumé  '), 'resume');
  }

  // 46. champ absent : aucune erreur
  {
    const entrees = [
      { id: '1', title: 'Avec URL', url: 'https://exemple.test' },
      { id: '2', title: 'Sans URL' },
      { id: '3' },
      { id: '4', title: null, username: undefined }
    ];
    assert.equal(filterEntries(entrees, { query: 'exemple' }).length, 1);
    assert.equal(filterEntries(entrees, { query: 'sans' }).length, 1);
    assert.equal(filterEntries(entrees, { query: '' }).length, 4);
  }

  // Le mot de passe et les notes ne sont PAS recherchables
  {
    assert.ok(!SEARCHABLE_FIELDS.includes('password'),
      'Le mot de passe ne doit jamais etre un champ recherchable');
    assert.ok(!SEARCHABLE_FIELDS.includes('notes'),
      'Les notes ne doivent jamais etre un champ recherchable');

    const entrees = [{ id: '1', title: 'Service', password: 'MotDePasseUnique', notes: 'NoteUnique' }];
    assert.equal(filterEntries(entrees, { query: 'motdepasseunique' }).length, 0,
      'Taper un mot de passe ne doit pas reveler l entree');
    assert.equal(filterEntries(entrees, { query: 'noteunique' }).length, 0,
      'Taper une note ne doit pas reveler l entree');
  }

  // Les etiquettes et la categorie sont recherchables
  {
    const entrees = [{ id: '1', title: 'X', category: 'bank', tags: ['perso', 'important'] }];
    assert.equal(filterEntries(entrees, { query: 'important' }).length, 1);
    assert.equal(filterEntries(entrees, { query: 'bank' }).length, 1);
  }

  // ========== TRI ========================================================
  // 48 et 51. stabilite : ordre deterministe pour des cles egales
  {
    const entrees = [
      { id: 'c', title: 'Identique' },
      { id: 'a', title: 'Identique' },
      { id: 'b', title: 'Identique' }
    ];
    const attendu = ['a', 'b', 'c'];

    const premier = sortEntries(entrees, 'title-asc').map((e) => e.id);
    assert.deepEqual(premier, attendu, 'Cles egales : ordre determine par l identifiant');

    // Le meme jeu presente dans un autre ordre source doit donner le meme
    // resultat : c'est cela, la stabilite utile.
    const melange = sortEntries([entrees[1], entrees[2], entrees[0]], 'title-asc').map((e) => e.id);
    assert.deepEqual(melange, attendu, 'Le resultat ne doit pas dependre de l ordre source');

    // Idempotence : retrier un resultat deja trie ne le change pas.
    const deuxFois = sortEntries(sortEntries(entrees, 'title-asc'), 'title-asc').map((e) => e.id);
    assert.deepEqual(deuxFois, attendu, 'Le tri doit etre idempotent');
  }

  // 49 et 50. accents et casse dans le tri
  {
    const entrees = [
      { id: '1', title: 'Zebre' },
      { id: '2', title: 'Éclair' },
      { id: '3', title: 'avion' },
      { id: '4', title: 'Ecole' },
      { id: '5', title: 'école' }
    ];
    const ordre = titres(sortEntries(entrees, 'title-asc'));
    assert.equal(ordre[0], 'avion', 'La casse ne doit pas primer sur l alphabet');
    assert.equal(ordre[ordre.length - 1], 'Zebre');
    // « Ecole » et « école » sont equivalents : leur ordre relatif est
    // determine par l identifiant, de facon stable.
    const iEcole = ordre.indexOf('Ecole');
    const iEcoleAccent = ordre.indexOf('école');
    assert.ok(Math.abs(iEcole - iEcoleAccent) === 1,
      'Les variantes accentuees doivent se suivre');
    assert.ok(iEcole < iEcoleAccent, 'A egalite, l identifiant tranche (4 avant 5)');
  }

  // 52. valeurs absentes
  {
    const entrees = [
      { id: '1', title: 'Beta' },
      { id: '2' },
      { id: '3', title: null },
      { id: '4', title: 'Alpha' }
    ];
    const ordre = sortEntries(entrees, 'title-asc');
    assert.equal(ordre.length, 4, 'Aucune entree ne doit disparaitre');
    assert.equal(ordre[ordre.length - 1].title, 'Beta');
    assert.equal(ordre[ordre.length - 2].title, 'Alpha');
  }

  // Tri par date : last_modified est le champ reellement stocke
  {
    const entrees = [
      { id: '1', title: 'Ancien', last_modified: '2026-01-01T00:00:00.000Z' },
      { id: '2', title: 'Recent', last_modified: '2026-06-01T00:00:00.000Z' },
      { id: '3', title: 'Milieu', last_modified: '2026-03-01T00:00:00.000Z' },
      { id: '4', title: 'Sans date' }
    ];
    const ordre = titres(sortEntries(entrees, 'recent'));
    assert.deepEqual(ordre.slice(0, 3), ['Recent', 'Milieu', 'Ancien'],
      'Le tri par date doit lire last_modified');
    assert.equal(ordre[3], 'Sans date', 'Une entree sans date se place en dernier');
  }

  // 53. pipeline complet : recherche + categorie + tri
  {
    const entrees = [
      { id: '1', title: 'Café Banque', category: 'bank', last_modified: '2026-01-01T00:00:00.000Z' },
      { id: '2', title: 'Cafe Cloud', category: 'cloud' },
      { id: '3', title: 'Banque Populaire', category: 'bank' },
      { id: '4', title: 'Autre Café', category: 'bank' },
      { id: '5', title: 'Café Social', category: 'social' }
    ];

    const visibles = buildVisibleEntries(entrees, {
      query: 'cafe', category: 'bank', sortMode: 'title-asc'
    });
    assert.deepEqual(titres(visibles), ['Autre Café', 'Café Banque'],
      'Recherche, filtre et tri doivent se combiner');

    // Changer un seul controle ne casse pas les autres.
    assert.equal(buildVisibleEntries(entrees, { query: 'cafe', category: 'all' }).length, 4);
    assert.equal(buildVisibleEntries(entrees, { query: '', category: 'bank' }).length, 3);
    assert.equal(buildVisibleEntries(entrees, {}).length, 5);

    // 43. LOT 3B - TEST CORRIGE. La version precedente comparait
    // `buildVisibleEntries(entrees, vue)` avec LUI-MEME : elle etait
    // tautologique et serait restee verte quelle que soit l'implementation.
    //
    // Ce qui doit reellement etre prouve, c'est que le pipeline est
    // INDEPENDANT de l'ordre d'arrivee des entrees : deux vues qui recoivent
    // la meme liste dans un ordre different doivent afficher exactement la
    // meme chose. C'est la condition pour que le tableau de bord et la vue
    // des mots de passe ne divergent jamais.
    //
    // La coherence des deux vues REELLES — memes conteneurs, memes boutons —
    // est verifiee au niveau application dans tests/lot3b-integration.spec.js
    // (scenarios E1 a E5).
    const vue = { query: 'cafe', category: 'bank', sortMode: 'title-asc' };
    const ordreInverse = [...entrees].reverse();
    const melange = [entrees[2], entrees[0], entrees[4], entrees[3], entrees[1]];

    const reference = buildVisibleEntries(entrees, vue).map((e) => e.id);
    assert.deepEqual(reference, ['4', '1'], 'Resultat attendu du pipeline');
    assert.deepEqual(
      buildVisibleEntries(ordreInverse, vue).map((e) => e.id),
      reference,
      'Inverser l ordre source ne doit pas changer le rendu'
    );
    assert.deepEqual(
      buildVisibleEntries(melange, vue).map((e) => e.id),
      reference,
      'Melanger l ordre source ne doit pas changer le rendu'
    );

    // Et le pipeline doit rester sensible a ses parametres : un test qui ne
    // distingue pas deux etats differents ne prouve rien.
    assert.notDeepEqual(
      buildVisibleEntries(entrees, { ...vue, category: 'all' }).map((e) => e.id),
      reference,
      'Changer de categorie doit changer le resultat'
    );
    assert.notDeepEqual(
      buildVisibleEntries(entrees, { ...vue, query: '' }).map((e) => e.id),
      reference,
      'Changer la recherche doit changer le resultat'
    );
  }

  // ========== PREFERENCES D'AFFICHAGE ====================================
  // 54. un filtre explicitement non sensible peut etre conserve
  {
    const store = new FakeLocalStorage();
    const rapport = writeViewPreferences(
      { category: 'bank', sortMode: 'recent', sortDirection: 'desc' },
      { storage: store }
    );
    assert.equal(rapport.written, true);

    const relu = readViewPreferences({ storage: store });
    assert.deepEqual(relu, { category: 'bank', sortMode: 'recent', sortDirection: 'desc' });
    assert.equal(store.map.size, 1, 'Une seule cle de preferences');
  }

  // 55. le terme de recherche n'est JAMAIS persiste
  {
    const store = new FakeLocalStorage();
    writeViewPreferences({
      category: 'bank',
      query: 'MonIdentifiantPrive',
      search: 'https://banque-privee.test',
      password: 'MotDePasseSecret',
      username: 'alice@prive.test',
      notes: 'note confidentielle',
      url: 'https://secret.test',
      title: 'Titre prive',
      tags: ['prive']
    }, { storage: store });

    const brut = store.getItem(VIEW_PREFERENCES_KEY);
    const interdits = [
      'MonIdentifiantPrive', 'banque-privee', 'MotDePasseSecret',
      'alice@prive.test', 'note confidentielle', 'secret.test', 'Titre prive', 'prive'
    ];
    interdits.forEach((valeur) => {
      assert.ok(!brut.includes(valeur),
        `Aucune donnee libre ne doit etre persistee (${valeur})`);
    });

    const stocke = JSON.parse(brut);
    assert.deepEqual(Object.keys(stocke).sort(), ['category', 'sortDirection', 'sortMode'],
      'Seuls les trois champs autorises sont ecrits');
    assert.equal(stocke.category, 'bank');
  }

  // 56. aucune valeur hors liste fermee ne peut entrer
  {
    const store = new FakeLocalStorage();
    writeViewPreferences({
      category: 'categorie-injectee',
      sortMode: 'mode-injecte',
      sortDirection: 'direction-injectee'
    }, { storage: store });

    const relu = readViewPreferences({ storage: store });
    assert.deepEqual(relu, DEFAULT_VIEW_PREFERENCES,
      'Une valeur hors liste doit retomber sur les defauts');

    // Une cle localStorage alteree ne doit pas injecter de valeur.
    store.setItem(VIEW_PREFERENCES_KEY, JSON.stringify({ category: '<script>' }));
    assert.deepEqual(readViewPreferences({ storage: store }), DEFAULT_VIEW_PREFERENCES);

    store.setItem(VIEW_PREFERENCES_KEY, 'pas du json');
    assert.deepEqual(readViewPreferences({ storage: store }), DEFAULT_VIEW_PREFERENCES,
      'Une valeur illisible retombe sur les defauts');

    assert.deepEqual(sanitizeViewPreferences(null), DEFAULT_VIEW_PREFERENCES);
    assert.deepEqual(sanitizeViewPreferences([1, 2]), DEFAULT_VIEW_PREFERENCES);
  }

  // Stockage absent ou en echec : aucune exception
  {
    assert.deepEqual(readViewPreferences({ storage: null }), DEFAULT_VIEW_PREFERENCES);
    const store = new FakeLocalStorage();
    store.quotaExceeded = true;
    const rapport = writeViewPreferences({ category: 'bank' }, { storage: store });
    assert.equal(rapport.written, false, 'Un quota depasse ne doit pas lever');
    assert.equal(rapport.stored.category, 'bank');
  }

  console.log('Vault view pipeline tests passed.');
} catch (error) {
  console.error('Vault view pipeline tests failed:', error);
  process.exitCode = 1;
}
