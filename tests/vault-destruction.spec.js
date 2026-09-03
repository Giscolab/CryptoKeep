/**
 * Lot 8 - Suppression volontaire du coffre.
 *
 * ISOLEMENT DES DONNEES
 * Aucun test de ce fichier n'ouvre IndexedDB, ne lit un `.vault`, ni ne
 * touche `localStorage`. Toutes les bases sont des `FakeIdbRegistry`
 * construits dans le test lui-meme, tous les stockages sont des
 * `FakeLocalStorage`. Les enregistrements sont des objets fabriques sur
 * place : aucun ne provient d'un coffre reel.
 *
 * DECLENCHEMENT
 * `destroyVaultData` n'est appelee que par ces tests, explicitement, avec la
 * phrase de confirmation. Aucun test ne l'attache a un evenement.
 */
import assert from 'node:assert/strict';
import { FakeIdbRegistry } from './helpers/fake-idb-registry.js';
import { FakeLocalStorage } from './helpers/vault-fixtures.js';
import {
  DESTRUCTION_PHRASE,
  DESTRUCTION_SCOPES,
  DESTRUCTION_REFUSALS,
  confirmationMatches,
  targetsForScope,
  survivorsForScope,
  createDeleteFactory,
  destroyVaultData,
  VAULT_STORAGE_KEYS,
  PROFILE_STORAGE_KEYS
} from '../scripts/core/vault/vault-destruction.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

/** Enregistrement de coffre SYNTHETIQUE : aucune donnee reelle. */
function coffreSynthetique() {
  return {
    id: 'current',
    entries: [{ id: 'entree-test-1', iv: 'AAECAwQFBgcICQoL', data: 'donnee-chiffree-fictive' }],
    meta: { version: 2, salt: 'c2VsLWZpY3RpZg==', iterations: 220000 }
  };
}

function profilSynthetique() {
  return { id: 'user-profile', name: 'Profil de test', email: 'test@exemple.invalid', language: 'fr' };
}

/** Registre contenant les DEUX bases, comme l'application reelle. */
function registreComplet() {
  return new FakeIdbRegistry({
    VaultDB: { vault: [coffreSynthetique()] },
    'vault-db': { settings: [profilSynthetique()] }
  });
}

/** Descripteurs de bases branches sur le registre synthetique. */
function descripteurs(registre) {
  return [
    { name: 'VaultDB', stores: ['vault'], open: () => registre.open('VaultDB') },
    { name: 'vault-db', stores: ['settings'], open: () => registre.open('vault-db') }
  ];
}

/** Stockage contenant toutes les cles visees, avec des valeurs fictives. */
function stockageComplet() {
  const storage = new FakeLocalStorage();
  for (const cle of VAULT_STORAGE_KEYS) storage.setItem(cle, '{"synthetique":true}');
  for (const cle of PROFILE_STORAGE_KEYS) storage.setItem(cle, 'valeur-fictive');
  return storage;
}

function optionsDeBase(registre, storage, extra = {}) {
  return {
    confirmation: DESTRUCTION_PHRASE,
    databases: descripteurs(registre),
    storage,
    deleteFactory: createDeleteFactory(registre),
    ...extra
  };
}

// ===========================================================================
// 1. REFUS : aucune ecriture tant que la confirmation n'est pas exacte
// ===========================================================================

test('8.1 - sans la phrase exacte, RIEN n est supprime', async () => {
  const registre = registreComplet();
  const storage = stockageComplet();

  const tentatives = ['', '   ', 'supprimer definitivement', 'SUPPRIMER',
    'SUPPRIMER DÉFINITIVEMENT', 'SUPPRIMER  DEFINITIVEMENT', null, 42];

  for (const saisie of tentatives) {
    const rapport = await destroyVaultData(optionsDeBase(registre, storage, {
      scope: DESTRUCTION_SCOPES.ALL, confirmation: saisie
    }));
    assert.equal(rapport.status, 'refused', `Saisie acceptee a tort : ${JSON.stringify(saisie)}`);
    assert.equal(rapport.reason, DESTRUCTION_REFUSALS.CONFIRMATION_MISMATCH);
    assert.equal(rapport.erasedSomething, false);
  }

  assert.equal(registre.peek('VaultDB', 'vault').length, 1, 'Le coffre est intact');
  assert.equal(registre.peek('vault-db', 'settings').length, 1, 'Le profil est intact');
  assert.equal(storage.getItem('cryptokeep.backup.v1'), '{"synthetique":true}');
  assert.equal(registre.clears, 0, 'Aucun vidage n a meme ete tente');
});

test('8.2 - la phrase tolere les espaces de bordure, RIEN d autre', () => {
  assert.equal(confirmationMatches(DESTRUCTION_PHRASE), true);
  assert.equal(confirmationMatches(`  ${DESTRUCTION_PHRASE}\n`), true);
  assert.equal(confirmationMatches(DESTRUCTION_PHRASE.toLowerCase()), false,
    'La casse doit compter : sinon la confirmation devient une formalite');
  assert.equal(confirmationMatches('SUPPRIMER DEFINITIVEMENT TOUT'), false);
  assert.equal(confirmationMatches(undefined), false);
});

test('8.3 - portee inconnue : refus, sans aucune ecriture', async () => {
  const registre = registreComplet();
  const storage = stockageComplet();

  for (const portee of ['tout', '', null, 'VAULT', undefined]) {
    const rapport = await destroyVaultData(optionsDeBase(registre, storage, { scope: portee }));
    assert.equal(rapport.status, 'refused');
    assert.equal(rapport.reason, DESTRUCTION_REFUSALS.UNKNOWN_SCOPE);
  }
  assert.equal(registre.peek('VaultDB', 'vault').length, 1);
  assert.equal(registre.clears, 0);
});

test('8.4 - aucune surface atteignable : refus, jamais un faux succes', async () => {
  const rapport = await destroyVaultData({
    scope: DESTRUCTION_SCOPES.ALL,
    confirmation: DESTRUCTION_PHRASE,
    databases: [],
    storage: null
  });

  assert.equal(rapport.status, 'refused',
    'Sans surface a effacer, annoncer « suppression terminee » serait le meme '
    + 'mensonge qu un rapport de securite calcule sur zero entree');
  assert.equal(rapport.reason, DESTRUCTION_REFUSALS.NO_SURFACE);
  assert.equal(rapport.erasedSomething, false);
});

// ===========================================================================
// 2. DISTINCTION coffre / profil
// ===========================================================================

test('8.5 - portee « coffre » : le coffre part, le profil RESTE', async () => {
  const registre = registreComplet();
  const storage = stockageComplet();

  const rapport = await destroyVaultData(optionsDeBase(registre, storage, {
    scope: DESTRUCTION_SCOPES.VAULT
  }));

  assert.equal(rapport.status, 'completed');
  assert.equal(rapport.erasedSomething, true);
  assert.equal(registre.peek('VaultDB', 'vault'), null,
    'La base du coffre a ete videe puis supprimee');
  assert.deepEqual(registre.peek('vault-db', 'settings'), [profilSynthetique()],
    'Le profil ne doit PAS etre touche par la suppression du coffre');

  assert.equal(storage.getItem('cryptokeep.backup.v1'), null, 'Sauvegarde secondaire effacee');
  assert.equal(storage.getItem('vaultBackup'), null, 'Sauvegarde historique effacee');
  assert.equal(storage.getItem('selectedTheme'), 'valeur-fictive', 'Le theme est conserve');
  assert.equal(storage.getItem('cryptokeep.settings.v1'), 'valeur-fictive',
    'Les preferences appartiennent au profil, pas au coffre');
});

test('8.6 - portee « profil » : le profil part, le coffre RESTE', async () => {
  const registre = registreComplet();
  const storage = stockageComplet();

  const rapport = await destroyVaultData(optionsDeBase(registre, storage, {
    scope: DESTRUCTION_SCOPES.PROFILE
  }));

  assert.equal(rapport.status, 'completed');
  assert.deepEqual(registre.peek('VaultDB', 'vault'), [coffreSynthetique()],
    'Supprimer le profil ne doit JAMAIS toucher au coffre chiffre');
  assert.equal(registre.peek('vault-db', 'settings'), null, 'Le profil a disparu');

  assert.equal(storage.getItem('cryptokeep.backup.v1'), '{"synthetique":true}',
    'La sauvegarde du coffre est conservee');
  assert.equal(storage.getItem('selectedTheme'), null);
  assert.equal(storage.getItem('autolock-delay'), null);
  assert.equal(storage.getItem('cryptokeep.hibp.consent.v1'), null);
});

test('8.7 - portee « tout » : les deux bases et toutes les cles', async () => {
  const registre = registreComplet();
  const storage = stockageComplet();

  const rapport = await destroyVaultData(optionsDeBase(registre, storage, {
    scope: DESTRUCTION_SCOPES.ALL
  }));

  assert.equal(rapport.status, 'completed');
  assert.equal(registre.peek('VaultDB', 'vault'), null);
  assert.equal(registre.peek('vault-db', 'settings'), null);
  for (const cle of [...VAULT_STORAGE_KEYS, ...PROFILE_STORAGE_KEYS]) {
    assert.equal(storage.getItem(cle), null, `Cle restee en place : ${cle}`);
  }
  assert.equal(rapport.removedRecords, 2, 'Deux enregistrements reellement supprimes');
});

test('8.8 - chaque portee annonce aussi ce qu elle CONSERVE', () => {
  for (const portee of Object.values(DESTRUCTION_SCOPES)) {
    const conserves = survivorsForScope(portee);
    assert.ok(Array.isArray(conserves) && conserves.length > 0,
      `La portee « ${portee} » doit dire ce qu elle conserve`);
  }
  assert.ok(survivorsForScope('inconnue').length === 0);

  const cibles = targetsForScope(DESTRUCTION_SCOPES.VAULT);
  assert.ok(!cibles.storageKeys.includes('selectedTheme'),
    'Le theme n appartient pas au coffre');
  assert.ok(!targetsForScope(DESTRUCTION_SCOPES.PROFILE).storageKeys.includes('vaultBackup'),
    'La sauvegarde du coffre n appartient pas au profil');
});

// ===========================================================================
// 3. TRANSACTION ECHOUEE : les donnees restent, et le rapport le dit
// ===========================================================================

test('8.9 - transaction annulee : le coffre RESTE et le rapport est « partial »', async () => {
  const registre = registreComplet();
  const storage = stockageComplet();
  registre.abortNextWrites = 1;          // la premiere ecriture est annulee

  const rapport = await destroyVaultData(optionsDeBase(registre, storage, {
    scope: DESTRUCTION_SCOPES.VAULT
  }));

  assert.equal(rapport.status, 'partial',
    'Une transaction annulee ne peut pas produire un rapport « completed »');
  assert.equal(rapport.reason, 'targets_failed');

  const entree = rapport.targets.find((t) => t.kind === 'indexeddb' && t.database === 'VaultDB');
  assert.equal(entree.outcome, 'failed');
  assert.equal(entree.reason, 'transaction_failed');
  assert.equal(entree.verified, false);

  assert.deepEqual(registre.peek('VaultDB', 'vault'), [coffreSynthetique()],
    'Les donnees sont TOUJOURS la : c est ce que le rapport doit refleter');
});

test('8.10 - vidage echoue : la base n est SURTOUT pas supprimee ensuite', async () => {
  const registre = registreComplet();
  const storage = stockageComplet();
  registre.abortNextWrites = 1;

  const rapport = await destroyVaultData(optionsDeBase(registre, storage, {
    scope: DESTRUCTION_SCOPES.VAULT
  }));

  assert.ok(registre.hasBase('VaultDB'),
    'Supprimer la base apres avoir annonce l echec du vidage detruirait la '
    + 'donnee que le rapport declare conservee');
  assert.equal(registre.deleted.includes('VaultDB'), false);
  assert.ok(rapport.notes.some((n) => n.includes('VaultDB')),
    'L utilisateur doit etre informe que la base a ete conservee');
});

test('8.11 - vidage « reussi » mais relecture non vide : refus de conclure', async () => {
  const registre = registreComplet();
  const storage = stockageComplet();
  registre.pretendStillPresent = 1;      // la relecture montre 1 enregistrement

  const rapport = await destroyVaultData(optionsDeBase(registre, storage, {
    scope: DESTRUCTION_SCOPES.VAULT
  }));

  const entree = rapport.targets.find((t) => t.kind === 'indexeddb' && t.database === 'VaultDB');
  assert.equal(entree.outcome, 'failed');
  assert.equal(entree.reason, 'still_present');
  assert.equal(rapport.status, 'partial',
    'Sans verification concluante, aucun succes ne peut etre annonce');
  assert.equal(registre.deleted.includes('VaultDB'), false);
});

test('8.12 - base illisible : echec explicite, jamais confondu avec « vide »', async () => {
  const registre = registreComplet();
  const storage = stockageComplet();
  registre.failNextReads = 1;            // le comptage prealable echoue

  const rapport = await destroyVaultData(optionsDeBase(registre, storage, {
    scope: DESTRUCTION_SCOPES.VAULT
  }));

  const entree = rapport.targets.find((t) => t.kind === 'indexeddb' && t.database === 'VaultDB');
  assert.equal(entree.outcome, 'failed');
  assert.equal(entree.reason, 'read_failed',
    'Une base illisible n est pas une base vide (regle etablie au Lot 3c)');
  assert.deepEqual(registre.peek('VaultDB', 'vault'), [coffreSynthetique()]);
  assert.equal(registre.clears, 0, 'Aucun vidage n a ete tente sur une base illisible');
});

test('8.13 - ouverture impossible : rapporte, sans bloquer les autres cibles', async () => {
  const registre = registreComplet();
  const storage = stockageComplet();
  registre.refuseOpen.add('VaultDB');

  const rapport = await destroyVaultData(optionsDeBase(registre, storage, {
    scope: DESTRUCTION_SCOPES.ALL
  }));

  const coffre = rapport.targets.find((t) => t.kind === 'indexeddb' && t.database === 'VaultDB');
  assert.equal(coffre.outcome, 'failed');
  assert.equal(coffre.reason, 'open_failed');
  assert.equal(rapport.status, 'partial');

  assert.equal(registre.peek('vault-db', 'settings'), null,
    'L echec sur une base ne doit pas empecher le traitement des autres');
  assert.equal(storage.getItem('cryptokeep.settings.v1'), null);
});

// ===========================================================================
// 4. RIEN A SUPPRIMER : jamais annonce comme une suppression
// ===========================================================================

test('8.14 - deja vide : « absent », et rien n est presente comme supprime', async () => {
  const registre = new FakeIdbRegistry({ VaultDB: { vault: [] }, 'vault-db': { settings: [] } });
  const storage = new FakeLocalStorage();     // aucune cle

  const rapport = await destroyVaultData(optionsDeBase(registre, storage, {
    scope: DESTRUCTION_SCOPES.ALL
  }));

  assert.equal(rapport.status, 'completed', 'L etat final est bien celui demande');
  assert.equal(rapport.cleared, 0);
  assert.equal(rapport.removedRecords, 0);
  assert.equal(rapport.erasedSomething, false,
    'L interface doit pouvoir dire « rien a supprimer » plutot que « supprime »');
  assert.ok(rapport.targets.every((t) => t.kind === 'indexeddb-drop' || t.outcome === 'absent'));
  assert.equal(registre.clears, 0, 'Aucun vidage inutile n a ete emis');
});

test('8.15 - base absente du registre : creee vide puis retiree, sans faux positif', async () => {
  const registre = new FakeIdbRegistry({ VaultDB: { vault: [coffreSynthetique()] } });
  const storage = new FakeLocalStorage();

  const rapport = await destroyVaultData(optionsDeBase(registre, storage, {
    scope: DESTRUCTION_SCOPES.PROFILE
  }));

  const profil = rapport.targets.find((t) => t.kind === 'indexeddb' && t.database === 'vault-db');
  assert.equal(profil.outcome, 'absent');
  assert.equal(profil.reason, 'store_absent',
    'Un store inexistant n est pas un echec : il n y a rien a supprimer');
  assert.equal(rapport.status, 'completed');
  assert.equal(rapport.erasedSomething, false);
  assert.deepEqual(registre.peek('VaultDB', 'vault'), [coffreSynthetique()]);
});

// ===========================================================================
// 5. Suppression de la base : etape distincte, jamais confondue avec le vidage
// ===========================================================================

test('8.16 - base bloquee par un autre onglet : vidage acquis, retrait annonce comme bloque', async () => {
  const registre = registreComplet();
  const storage = stockageComplet();
  registre.deleteOutcome.set('VaultDB', 'blocked');

  const rapport = await destroyVaultData(optionsDeBase(registre, storage, {
    scope: DESTRUCTION_SCOPES.VAULT, dropTimeoutMs: 50
  }));

  const vidage = rapport.targets.find((t) => t.kind === 'indexeddb' && t.database === 'VaultDB');
  const retrait = rapport.targets.find((t) => t.kind === 'indexeddb-drop' && t.database === 'VaultDB');

  assert.equal(vidage.outcome, 'cleared');
  assert.equal(vidage.verified, true);
  assert.deepEqual(registre.peek('VaultDB', 'vault'), [],
    'Ce qui protege l utilisateur, c est que les enregistrements soient partis');
  assert.equal(retrait.outcome, 'blocked');
  assert.equal(rapport.status, 'completed',
    'Un nom de base qui subsiste sur une base VIDE n est pas un echec de suppression');
  assert.ok(rapport.notes.some((n) => n.includes('onglet')),
    'L utilisateur doit savoir quoi faire pour retirer le nom de la base');
});

test('8.17 - sans fabrique de suppression : etape « skipped », jamais « dropped »', async () => {
  const registre = registreComplet();
  const storage = stockageComplet();

  const rapport = await destroyVaultData({
    scope: DESTRUCTION_SCOPES.VAULT,
    confirmation: DESTRUCTION_PHRASE,
    databases: descripteurs(registre),
    storage,
    deleteFactory: null
  });

  const retrait = rapport.targets.find((t) => t.kind === 'indexeddb-drop');
  assert.equal(retrait.outcome, 'skipped');
  assert.equal(retrait.reason, 'no_factory');
  assert.deepEqual(registre.peek('VaultDB', 'vault'), [], 'Le vidage a bien eu lieu');
  assert.equal(rapport.status, 'completed');
});

test('8.18 - createDeleteFactory refuse un objet non conforme', () => {
  assert.equal(createDeleteFactory(null), null);
  assert.equal(createDeleteFactory({}), null);
  assert.equal(createDeleteFactory({ deleteDatabase: 'non' }), null);
  assert.ok(createDeleteFactory({ deleteDatabase() {} }));
});

// ===========================================================================
// 6. Session, presse-papiers, etat de premiere utilisation
// ===========================================================================

test('8.19 - la purge memoire est faite AVANT le stockage', async () => {
  const registre = registreComplet();
  const storage = stockageComplet();
  const ordre = [];

  await destroyVaultData(optionsDeBase(registre, storage, {
    scope: DESTRUCTION_SCOPES.VAULT,
    clearSession: async () => { ordre.push('session'); return { masterKeyNull: true, entryCount: 0 }; },
    databases: [{
      name: 'VaultDB', stores: ['vault'],
      open: () => { ordre.push('stockage'); return registre.open('VaultDB'); }
    }]
  }));

  assert.deepEqual(ordre, ['session', 'stockage'],
    'La cle maitre et les entrees dechiffrees partent en premier');
});

test('8.20 - purge memoire en echec : le stockage est traite quand meme', async () => {
  const registre = registreComplet();
  const storage = stockageComplet();

  const rapport = await destroyVaultData(optionsDeBase(registre, storage, {
    scope: DESTRUCTION_SCOPES.VAULT,
    clearSession: async () => { const e = new Error('x'); e.name = 'LockFailed'; throw e; }
  }));

  assert.equal(rapport.session.error, 'LockFailed');
  assert.deepEqual(registre.peek('VaultDB', 'vault'), null, 'Le coffre a tout de meme ete supprime');
  assert.ok(rapport.notes.some((n) => n.includes('purge memoire')));
});

test('8.21 - presse-papiers : tentative rapportee, jamais promise', async () => {
  const registre = registreComplet();
  const storage = stockageComplet();

  const echec = await destroyVaultData(optionsDeBase(registre, storage, {
    scope: DESTRUCTION_SCOPES.VAULT,
    clearClipboard: async () => ({ attempted: true, succeeded: false, reason: 'permission_denied' })
  }));
  assert.equal(echec.clipboard.attempted, true);
  assert.equal(echec.clipboard.succeeded, false);
  assert.equal(echec.clipboard.reason, 'permission_denied');
  assert.equal(echec.status, 'completed',
    'Le presse-papiers est hors du controle de la page : son echec ne rend pas '
    + 'la suppression du coffre partielle, mais il est rapporte tel quel');

  const registre2 = registreComplet();
  const absent = await destroyVaultData(optionsDeBase(registre2, stockageComplet(), {
    scope: DESTRUCTION_SCOPES.VAULT
  }));
  assert.deepEqual(absent.clipboard, { attempted: false, succeeded: false, reason: 'not_available' });
});

test('8.22 - etat de premiere utilisation : seulement si le coffre a REELLEMENT disparu', async () => {
  const registre = registreComplet();
  let restaure = 0;

  const succes = await destroyVaultData(optionsDeBase(registre, stockageComplet(), {
    scope: DESTRUCTION_SCOPES.VAULT,
    restoreFirstUse: () => { restaure += 1; return true; }
  }));
  assert.equal(succes.firstUseState, true);
  assert.equal(restaure, 1);

  // Echec de vidage : l'ecran de creation ne doit PAS revenir.
  const registre2 = registreComplet();
  registre2.abortNextWrites = 1;
  const echec = await destroyVaultData(optionsDeBase(registre2, stockageComplet(), {
    scope: DESTRUCTION_SCOPES.VAULT,
    restoreFirstUse: () => { restaure += 1; return true; }
  }));
  assert.equal(echec.firstUseState, false,
    'Afficher « Creer un mot de passe maitre » sur un coffre toujours present '
    + 'ferait croire a une suppression qui n a pas eu lieu');
  assert.equal(restaure, 1, 'Le retour a l etat initial n a meme pas ete tente');
});

test('8.23 - portee « profil » : l ecran de creation ne revient jamais', async () => {
  const registre = registreComplet();
  let restaure = 0;

  const rapport = await destroyVaultData(optionsDeBase(registre, stockageComplet(), {
    scope: DESTRUCTION_SCOPES.PROFILE,
    restoreFirstUse: () => { restaure += 1; return true; }
  }));

  assert.equal(rapport.firstUseState, false);
  assert.equal(restaure, 0, 'Le coffre est intact : rien ne justifie l ecran de creation');
});

// ===========================================================================
// 7. Les cibles declarees correspondent aux modules qui les possedent
// ---------------------------------------------------------------------------
// Le moteur declare ses cibles en clair plutot que d'importer huit modules :
// cela evite tout cycle d'import et garde le moteur sans dependance. Le prix
// a payer est une duplication, et ce test est ce qui l'empeche de deriver.
// ===========================================================================

test('8.24 - chaque cle visee correspond a la constante de son module', async () => {
  const { BACKUP_KEY_V1, LEGACY_BACKUP_KEY } = await import('../scripts/core/storage/local-backup.js');
  const { APP_SETTINGS_KEY } = await import('../scripts/utils/app-settings.js');
  const { VIEW_PREFERENCES_KEY } = await import('../scripts/utils/view-preferences.js');
  const { HIBP_CONSENT_KEY } = await import('../scripts/security/hibp-service.js');
  const { PERSISTENCE_MARKER_KEY } = await import('../scripts/security/storage-persistence.js');

  assert.ok(VAULT_STORAGE_KEYS.includes(BACKUP_KEY_V1), 'Sauvegarde versionnee manquante');
  assert.ok(VAULT_STORAGE_KEYS.includes(LEGACY_BACKUP_KEY), 'Sauvegarde historique manquante');
  assert.ok(PROFILE_STORAGE_KEYS.includes(APP_SETTINGS_KEY));
  assert.ok(PROFILE_STORAGE_KEYS.includes(VIEW_PREFERENCES_KEY));
  assert.ok(PROFILE_STORAGE_KEYS.includes(HIBP_CONSENT_KEY));
  assert.ok(PROFILE_STORAGE_KEYS.includes(PERSISTENCE_MARKER_KEY));
});

test('8.25 - aucune cle ecrite par l application n est oubliee', async () => {
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');

  const fichiers = [];
  (function parcourir(dossier) {
    for (const nom of readdirSync(dossier)) {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) {
        if (nom !== 'vendor' && nom !== '__pycache__') parcourir(chemin);
      } else if (nom.endsWith('.js')) fichiers.push(chemin);
    }
  }('scripts'));

  const connues = new Set([...VAULT_STORAGE_KEYS, ...PROFILE_STORAGE_KEYS]);
  const oubliees = [];

  for (const chemin of fichiers) {
    const source = readFileSync(chemin, 'utf8');
    // Ne retient que les cles reellement ECRITES : une lecture seule ne cree
    // aucune trace a effacer.
    for (const trouve of source.matchAll(/(?:localStorage|storage|store)\.setItem\(\s*(['"])([^'"]+)\1/g)) {
      const cle = trouve[2];
      if (!connues.has(cle)) oubliees.push(`${chemin} -> ${cle}`);
    }
  }

  assert.deepEqual(oubliees, [],
    'Une cle ecrite par l application et absente des cibles survivrait a une '
    + '« suppression definitive ». Ajoutez-la a la portee qui lui correspond.');
});

// ===========================================================================
// 8. Le moteur ne se declenche jamais tout seul
// ===========================================================================

test('8.26 - aucun module ne declenche la suppression a l import', async () => {
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');

  const appelants = [];
  (function parcourir(dossier) {
    for (const nom of readdirSync(dossier)) {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) {
        if (nom !== 'vendor' && nom !== '__pycache__') parcourir(chemin);
      } else if (nom.endsWith('.js') && !chemin.endsWith('vault-destruction.js')) {
        const source = readFileSync(chemin, 'utf8');
        if (/\bdestroyVaultData\s*\(/.test(source)) appelants.push(chemin);
      }
    }
  }('scripts'));

  assert.deepEqual(appelants, ['scripts/ui/vault-destruction-modal.js'],
    'Un seul module doit pouvoir declencher la suppression, et c est celui qui '
    + 'recueille la confirmation. Appelants trouves : ' + JSON.stringify(appelants));
});

// ===========================================================================
console.log('=== TEST VAULT DESTRUCTION (LOT 8) ===');
let echecs = 0;
for (const { label, fn } of cas) {
  try { await fn(); console.log(`  ok   ${label}`); }
  catch (error) {
    echecs += 1;
    console.error(`  ECHEC ${label}`);
    console.error(`        ${error && error.message}`);
  }
}
if (echecs > 0) {
  console.error(`Vault destruction tests failed: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`Vault destruction tests passed (${cas.length} scenarios).`);
}
