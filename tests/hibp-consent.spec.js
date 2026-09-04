/**
 * Lot 5 partie 3 - Verification de compromission HIBP, optionnelle.
 *
 * AUCUN APPEL RESEAU REEL n'est effectue : `fetch` est toujours injecte.
 * Les mots de passe sont synthetiques.
 */
import '../tests/webcrypto-setup.js';
import assert from 'node:assert/strict';
import {
  isPasswordPwned,
  isHibpEnabled,
  getHibpConsent,
  setHibpConsent,
  clearHibpCache,
  getHibpCacheSize,
  HIBP_NOTICE,
  HIBP_CONSENT_KEY,
  HIBP_NOTICE_VERSION
} from '../scripts/security/hibp-service.js';
import { FakeLocalStorage } from './helpers/vault-fixtures.js';

const cas = [];
function test(label, fn) { cas.push({ label, fn }); }

const MDP = 'MotDePasse-Synthetique-Lot5-1!';

/** Consentement accorde sur un stockage synthetique. */
function stockageConsenti() {
  const store = new FakeLocalStorage();
  setHibpConsent(true, { storage: store });
  return store;
}

/** `fetch` synthetique qui journalise ce qui est reellement demande. */
function fauxFetch(reponse, journal = []) {
  return async (url, init) => {
    journal.push({ url: String(url), headers: init && init.headers });
    if (typeof reponse === 'function') return reponse(url, init);
    return reponse;
  };
}

const reponseOk = (corps) => ({ ok: true, status: 200, async text() { return corps; } });

test('3.1 - DESACTIVE PAR DEFAUT : aucune requete, et aucun resultat rassurant', async () => {
  const store = new FakeLocalStorage();
  assert.equal(isHibpEnabled({ storage: store }), false,
    'La fonction doit etre desactivee sans consentement');
  assert.equal(getHibpConsent({ storage: store }).reason, 'not_asked');

  const journal = [];
  const resultat = await isPasswordPwned(MDP, {
    storage: store,
    fetchImpl: fauxFetch(reponseOk(''), journal)
  });

  assert.deepEqual(journal, [], 'AUCUNE requete ne doit partir sans consentement');
  assert.equal(resultat.checked, false, 'Rien n a ete verifie');
  assert.equal(resultat.pwned, null,
    'DEFAUT CORRIGE : `pwned` doit valoir null, jamais false — '
    + 'une absence de verification n est pas une absence de fuite');
  assert.equal(resultat.reason, 'disabled');
});

test('3.2 - le texte de consentement explique reellement le k-anonymity', () => {
  const texte = HIBP_NOTICE.body.join(' ');
  assert.equal(HIBP_NOTICE.version, HIBP_NOTICE_VERSION);
  assert.match(texte, /jamais envoye/i, 'Doit dire que le mot de passe n est pas envoye');
  assert.match(texte, /SHA-1/, 'Doit nommer la fonction de hachage');
  assert.match(texte, /5 premiers caracteres/i, 'Doit dire ce qui est reellement transmis');
  assert.match(texte, /adresse IP/i,
    'Doit dire honnetement ce que le service voit malgre le k-anonymity');
  assert.match(texte, /desactivee par defaut/i);
});

test('3.3 - consentement explicite requis : aucune valeur approchante n active', () => {
  for (const valeur of [false, 'true', 1, null, undefined, {}]) {
    const store = new FakeLocalStorage();
    setHibpConsent(valeur, { storage: store });
    assert.equal(isHibpEnabled({ storage: store }), false,
      `« ${String(valeur)} » ne doit pas valoir consentement`);
  }

  const store = new FakeLocalStorage();
  setHibpConsent(true, { storage: store });
  assert.equal(isHibpEnabled({ storage: store }), true, 'Seul `true` active la fonction');
});

test('3.4 - consentement illisible, malforme ou perime = refus', () => {
  for (const brut of ['pas du json', '{}', '{"accepted":true}', '{"accepted":true,"noticeVersion":0}']) {
    const store = new FakeLocalStorage();
    store.setItem(HIBP_CONSENT_KEY, brut);
    assert.equal(isHibpEnabled({ storage: store }), false,
      `« ${brut} » ne doit pas activer la fonction`);
  }

  const perime = new FakeLocalStorage();
  perime.setItem(HIBP_CONSENT_KEY, JSON.stringify({
    accepted: true, noticeVersion: HIBP_NOTICE_VERSION + 99
  }));
  assert.equal(getHibpConsent({ storage: perime }).reason, 'notice_changed',
    'Un texte modifie invalide le consentement precedent');
});

test('3.5 - SEUL le prefixe de 5 caracteres est transmis', async () => {
  const store = stockageConsenti();
  const journal = [];

  await isPasswordPwned(MDP, {
    storage: store,
    fetchImpl: fauxFetch(reponseOk('ABCDE:1'), journal)
  });

  assert.equal(journal.length, 1, 'Une seule requete');
  const url = journal[0].url;
  assert.ok(url.startsWith('https://api.pwnedpasswords.com/range/'),
    'Le seul hote autorise par la CSP doit etre utilise');

  const transmis = url.slice('https://api.pwnedpasswords.com/range/'.length);
  assert.equal(transmis.length, 5, 'Exactement 5 caracteres transmis');
  assert.match(transmis, /^[0-9A-F]{5}$/);

  // Ni le mot de passe, ni son condensat complet ne figurent dans l URL.
  assert.ok(!url.includes(MDP), 'Le mot de passe ne doit jamais partir');
  const sha1 = Array.from(new Uint8Array(
    await crypto.subtle.digest('SHA-1', new TextEncoder().encode(MDP))
  ), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  assert.ok(!url.includes(sha1), 'Le condensat COMPLET ne doit jamais partir');
  assert.equal(transmis, sha1.slice(0, 5), 'Le prefixe transmis est bien celui du condensat');

  assert.equal(journal[0].headers['Add-Padding'], 'true',
    'Le remplissage doit etre demande : la taille de la reponse ne doit rien apprendre');
  clearHibpCache();
});

test('3.6 - comparaison LOCALE du suffixe : fuite trouvee et non trouvee', async () => {
  const store = stockageConsenti();
  const sha1 = Array.from(new Uint8Array(
    await crypto.subtle.digest('SHA-1', new TextEncoder().encode(MDP))
  ), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const suffixe = sha1.slice(5);

  clearHibpCache();
  const trouve = await isPasswordPwned(MDP, {
    storage: store,
    fetchImpl: fauxFetch(reponseOk(`0000000000000000000000000000000000000:3\r\n${suffixe}:1234\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:7`))
  });
  assert.equal(trouve.checked, true);
  assert.equal(trouve.pwned, true);
  assert.equal(trouve.count, 1234);

  clearHibpCache();
  const absent = await isPasswordPwned(MDP, {
    storage: store,
    fetchImpl: fauxFetch(reponseOk('0000000000000000000000000000000000000:3\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:9'))
  });
  assert.equal(absent.checked, true, 'Une reponse a bien ete obtenue');
  assert.equal(absent.pwned, false, 'Et elle dit que ce mot de passe n y figure pas');
  assert.equal(absent.count, 0);
  clearHibpCache();
});

test('3.7 - delai depasse : echec explicite, jamais « non compromis »', async () => {
  const store = stockageConsenti();
  clearHibpCache();

  const resultat = await isPasswordPwned(MDP, {
    storage: store,
    timeoutMs: 20,
    // Le faux `fetch` se comporte comme le vrai : il verifie `aborted`
    // AVANT d'installer un ecouteur, sans quoi une annulation deja survenue
    // laisserait la promesse pendante.
    fetchImpl: (url, init) => new Promise((resolve, reject) => {
      const signal = init && init.signal;
      const abandonner = () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (signal && signal.aborted) { abandonner(); return; }
      if (signal) signal.addEventListener('abort', abandonner);
    })
  });

  assert.equal(resultat.checked, false);
  assert.equal(resultat.pwned, null, 'Un delai depasse ne doit pas ressembler a un succes');
  assert.equal(resultat.reason, 'timeout');
});

test('3.8 - annulation par l appelant', async () => {
  const store = stockageConsenti();
  clearHibpCache();
  const controller = new AbortController();

  const promesse = isPasswordPwned(MDP, {
    storage: store,
    signal: controller.signal,
    timeoutMs: 60000,
    // Le faux `fetch` se comporte comme le vrai : il verifie `aborted`
    // AVANT d'installer un ecouteur, sans quoi une annulation deja survenue
    // laisserait la promesse pendante.
    fetchImpl: (url, init) => new Promise((resolve, reject) => {
      const signal = init && init.signal;
      const abandonner = () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (signal && signal.aborted) { abandonner(); return; }
      if (signal) signal.addEventListener('abort', abandonner);
    })
  });

  controller.abort();
  const resultat = await promesse;
  assert.equal(resultat.checked, false);
  assert.equal(resultat.pwned, null);
  assert.equal(resultat.reason, 'aborted');
});

test('3.9 - hors ligne et erreur reseau : etats distincts, jamais rassurants', async () => {
  const store = stockageConsenti();

  clearHibpCache();
  // `navigator` est en lecture seule sous Node : on redefinit la propriete.
  const descripteur = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: false }, configurable: true, writable: true
  });
  let resultat;
  try {
    resultat = await isPasswordPwned(MDP, { storage: store, fetchImpl: fauxFetch(reponseOk('')) });
  } finally {
    if (descripteur) Object.defineProperty(globalThis, 'navigator', descripteur);
    else delete globalThis.navigator;
  }
  assert.equal(resultat.reason, 'offline', 'Hors ligne doit etre un etat distinct');
  assert.equal(resultat.pwned, null);

  clearHibpCache();
  const erreur = await isPasswordPwned(MDP, {
    storage: store,
    fetchImpl: async () => ({ ok: false, status: 503, async text() { return ''; } })
  });
  assert.equal(erreur.checked, false);
  assert.equal(erreur.pwned, null);
  assert.equal(erreur.reason, 'network_error');
  clearHibpCache();
});

test('3.10 - cache EN MEMOIRE, indexe par prefixe, efface au verrouillage', async () => {
  const store = stockageConsenti();
  clearHibpCache();
  const journal = [];
  const fetchImpl = fauxFetch(reponseOk('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:9'), journal);

  await isPasswordPwned(MDP, { storage: store, fetchImpl });
  assert.equal(journal.length, 1);
  assert.equal(getHibpCacheSize(), 1, 'Une plage mise en cache');

  const second = await isPasswordPwned(MDP, { storage: store, fetchImpl });
  assert.equal(journal.length, 1, 'La seconde verification ne doit pas refaire de requete');
  assert.equal(second.source, 'cache');

  // Le cache n'est indexe par AUCUN condensat complet de mot de passe.
  assert.ok(!JSON.stringify(store.map ? Array.from(store.map.entries()) : []).includes(MDP),
    'Aucun mot de passe sur disque');

  const rapport = clearHibpCache();
  assert.equal(rapport.cleared, 1, 'Le nettoyage doit etre verifiable');
  assert.equal(getHibpCacheSize(), 0);
});

test('3.11 - retirer le consentement vide le cache immediatement', async () => {
  const store = stockageConsenti();
  clearHibpCache();
  await isPasswordPwned(MDP, {
    storage: store,
    fetchImpl: fauxFetch(reponseOk('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:9'))
  });
  assert.equal(getHibpCacheSize(), 1);

  setHibpConsent(false, { storage: store });
  assert.equal(getHibpCacheSize(), 0, 'Refuser doit purger le cache sur-le-champ');
  assert.equal(isHibpEnabled({ storage: store }), false);
});

test('3.12 - aucun secret journalise, meme en cas d echec', async () => {
  const store = stockageConsenti();
  clearHibpCache();
  const captures = [];
  const capturer = (...args) => { captures.push(args.map(String).join(' ')); };
  const vraiWarn = console.warn;
  const vraiInfo = console.info;
  console.warn = capturer; console.info = capturer;

  try {
    await isPasswordPwned(MDP, {
      storage: store,
      fetchImpl: async () => { throw new Error(`echec sur ${MDP}`); }
    });
  } finally {
    console.warn = vraiWarn; console.info = vraiInfo;
  }

  const journal = captures.join('\n');
  assert.ok(!journal.includes(MDP), 'Le mot de passe ne doit jamais etre journalise');
  // CodeQL signalait « Incomplete URL substring sanitization » sur
  // `journal.includes('pwnedpasswords.com')`. La regle vise les controles qui
  // AUTORISENT une URL par sous-chaine — ou « evil-pwnedpasswords.com.x.net »
  // passerait. Ici le sens est inverse : on verifie une ABSENCE dans un
  // journal, et la correspondance par sous-chaine est la direction stricte.
  //
  // L assertion est neanmoins RENFORCEE : elle porte desormais sur le seul
  // radical, sans domaine de premier niveau. Elle echoue donc aussi sur
  // « pwnedpasswords.net », sur « api.pwnedpasswords.com/range/... » et sur
  // toute variante de casse.
  assert.ok(!/pwnedpasswords/i.test(journal),
    'Ni l URL, ni le domaine du service ne doivent apparaitre dans un journal');
  assert.ok(journal.includes('network_error'), 'Seule la categorie d echec est journalisee');
  clearHibpCache();
});

console.log('=== TEST HIBP CONSENT ===');
let echecs = 0;
for (const { label, fn } of cas) {
  try {
    await fn();
    console.log(`  ok   ${label}`);
  } catch (error) {
    echecs += 1;
    console.error(`  ECHEC ${label}`);
    console.error(`        ${error && error.message}`);
  }
}
if (echecs > 0) {
  console.error(`HIBP consent tests failed: ${echecs} scenario(s).`);
  process.exitCode = 1;
} else {
  console.log(`HIBP consent tests passed (${cas.length} scenarios).`);
}
