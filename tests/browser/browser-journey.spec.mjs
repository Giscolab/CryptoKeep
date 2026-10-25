/**
 * Lot 9 - Parcours navigateur de bout en bout.
 *
 * PARCOURS COUVERT
 *   premiere ouverture -> creation du coffre -> ajout d une entree ->
 *   fermeture -> redemarrage -> deverrouillage -> modification -> export ->
 *   import controle -> verrouillage -> deconnexion
 *
 * ISOLEMENT
 * Le navigateur demarre dans un profil TEMPORAIRE, jetable, distinct de celui
 * de `start_vault_secure.bat`. Aucun coffre reel n est ouvert, lu ni modifie.
 * Le mot de passe maitre et les entrees sont fabriques ici.
 *
 * ABSENCE DE NAVIGATEUR
 * Si aucun navigateur n est trouve, cette suite SORT EN ECHEC EXPLICITE
 * plutot que de se declarer reussie. Un parcours qui n a rien parcouru ne
 * prouve rien : c est la meme regle que pour les rapports de securite.
 * Pour l ignorer volontairement : CRYPTOKEEP_BROWSER_OPTIONAL=1.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startStaticServer } from './static-server.mjs';
import { lancerNavigateur, ClientCdp, trouverNavigateur } from './cdp-client.mjs';
import { parseCsvRows } from '../../scripts/utils/csv-parser.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MDP = 'Parcours-Navigateur-Synthetique-2026!';
const ENTREE_EXPORT = Object.freeze({
  title: 'Service export, "été"',
  url: 'https://export.invalid/connexion',
  username: 'utilisateur,"été"',
  password: '  =Secret-export,"été"\r\nligne suivante  ',
  notes: 'Note synthétique, "privée"\nDeuxième ligne',
  category: 'personal',
  tags: ['export', 'été']
});

const etapes = [];
function etape(label, fn) { etapes.push({ label, fn }); }

/** Contexte partage : navigateur, pages, evaluation. */
const ctx = { logs: [], erreurs: [] };

async function evaluerDansSession(session, expression) {
  const resultat = await ctx.cdp.envoyer('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true
  }, session);

  if (resultat.exceptionDetails) {
    const d = resultat.exceptionDetails;
    throw new Error(`Exception dans la page : ${d.exception?.description || d.text}`);
  }
  return resultat.result.value;
}

async function evaluer(expression) {
  return evaluerDansSession(ctx.session, expression);
}

async function naviguer() {
  await ctx.cdp.envoyer('Page.navigate', { url: `${ctx.origin}/index.html` }, ctx.session);
  await patienter(1200);
  await attendre(`!!document.getElementById('auth-form')`, 'chargement de la page');
}

function patienter(ms) { return new Promise((res) => setTimeout(res, ms)); }

/** Attend qu une condition devienne vraie DANS la page, sans delai fixe. */
async function attendre(expression, quoi, limiteMs = 8000) {
  return attendreDansSession(ctx.session, expression, quoi, limiteMs);
}

async function attendreDansSession(session, expression, quoi, limiteMs = 8000) {
  const echeance = Date.now() + limiteMs;
  while (Date.now() < echeance) {
    if (await evaluerDansSession(session, expression)) return true;
    await patienter(100);
  }
  throw new Error(`Delai depasse : ${quoi} (condition « ${expression} »)`);
}

async function soumettreMotDePasse(motDePasse) {
  return soumettreMotDePasseDansSession(ctx.session, motDePasse);
}

async function soumettreMotDePasseDansSession(session, motDePasse) {
  await evaluerDansSession(session, `(() => {
    const champ = document.getElementById('master-password');
    champ.value = ${JSON.stringify(motDePasse)};
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('auth-form')
      .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return true;
  })()`);
}

/** Etat du coffre PERSISTE, lu directement dans IndexedDB. */
function lireCoffrePersiste() {
  return evaluer(`new Promise((res) => {
    const r = indexedDB.open('VaultDB', 1);
    r.onsuccess = (e) => {
      const db = e.target.result;
      const q = db.transaction('vault', 'readonly').objectStore('vault').get('current');
      q.onsuccess = (x) => res(x.target.result ? JSON.stringify(x.target.result) : null);
      q.onerror = () => res('ERREUR_LECTURE');
    };
    r.onerror = () => res('ERREUR_OUVERTURE');
  })`);
}

/** Intercepte uniquement le telechargement : le vrai Blob reste en memoire. */
async function avecCapturesExport(action) {
  await evaluer(`(() => {
    const original = {
      create: URL.createObjectURL,
      revoke: URL.revokeObjectURL,
      click: HTMLAnchorElement.prototype.click
    };
    const capture = { original, blobs: [], downloads: [] };
    globalThis.__exportJourneyCapture = capture;
    URL.createObjectURL = function(blob) {
      const url = original.create.call(URL, blob);
      capture.blobs.push({ url, blob });
      return url;
    };
    HTMLAnchorElement.prototype.click = function() {
      if (this.download) {
        capture.downloads.push({ filename: this.download, url: this.href });
        return;
      }
      return original.click.call(this);
    };
    return true;
  })()`);

  try {
    return await action();
  } finally {
    await evaluer(`(async () => {
      const { closeSecureDialogs } = await import('/scripts/ui/secure-dialogs.js');
      closeSecureDialogs(document);
      const capture = globalThis.__exportJourneyCapture;
      URL.createObjectURL = capture.original.create;
      URL.revokeObjectURL = capture.original.revoke;
      HTMLAnchorElement.prototype.click = capture.original.click;
      capture.blobs.forEach(({ url }) => URL.revokeObjectURL(url));
      capture.blobs.length = 0;
      capture.downloads.length = 0;
      delete globalThis.__exportJourneyCapture;
      return true;
    })()`);
  }
}

async function lancerExportUi(format) {
  await evaluer(`(() => {
    document.getElementById('nav-settings').click();
    const format = document.getElementById('export-format');
    format.value = ${JSON.stringify(format)};
    format.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('btn-export').click();
    return true;
  })()`);
}

async function terminerConfirmationExport(accepter) {
  await attendre(`!!document.querySelector('.secure-dialog')`, 'avertissement avant export en clair');
  await evaluer(`(() => {
    const dialogue = document.querySelector('.secure-dialog');
    const bouton = [...dialogue.querySelectorAll('button')]
      .find((element) => element.textContent.trim() === ${JSON.stringify(accepter ? 'Exporter en clair' : 'Annuler')});
    if (!bouton) throw new Error('Action de confirmation export absente');
    bouton.click();
    return true;
  })()`);
  await attendre(`!document.querySelector('.secure-dialog')
    && !document.getElementById('btn-export').disabled`, 'fin de la confirmation export');
}

async function lireExportCapture() {
  await attendre(`globalThis.__exportJourneyCapture.downloads.length === 1`, 'telechargement export intercepte');
  return evaluer(`(async () => {
    const capture = globalThis.__exportJourneyCapture;
    const download = capture.downloads[0];
    const source = capture.blobs.find(({ url }) => url === download.url);
    return {
      filename: download.filename,
      type: source.blob.type,
      text: await source.blob.text()
    };
  })()`);
}

// ===========================================================================
// LE PARCOURS
// ===========================================================================

etape('B1 - PREMIERE OUVERTURE : ecran de creation, aucune alerte de stockage', async () => {
  await naviguer();

  assert.equal(await evaluer(`document.getElementById('unlock-vault').disabled`), false,
    'Le bouton doit etre utilisable une fois le stockage pret');
  assert.equal(await evaluer(`document.getElementById('auth-screen').hidden`), false,
    'L ecran d authentification doit etre visible');
  assert.equal(await evaluer(`document.getElementById('vault-ui').hidden`), true,
    'Le coffre ne doit pas etre visible avant ouverture');
  assert.equal(await evaluer(`document.getElementById('unlock-vault').textContent.trim()`), 'Creer',
    'Sans coffre existant, le bouton doit proposer la CREATION');

  // LOT 9 - REGRESSION DU DEMARRAGE. La sonde de persistance echouait a chaque
  // chargement (« Illegal invocation » sur des minuteurs captures sans leur
  // receveur) et affichait « Le navigateur refuse d ecrire dans IndexedDB
  // [...] Relancez avec start_vault_secure.bat » sur un stockage parfaitement
  // fonctionnel — en renvoyant vers le lanceur deja employe.
  //
  // La verification porte sur les alertes ET les avertissements. Ne regarder
  // que les erreurs laisserait passer la panne de sonde : la classification
  // corrigee la degraderait en avertissement, et le test conclurait a tort
  // que tout va bien alors que la sonde ne fonctionne plus.
  //
  // On laisse la sonde se resoudre, puis on verifie que l ecran reste muet.
  await patienter(2500);
  const alertes = await evaluer(`JSON.stringify(
    [...document.querySelectorAll('.toast')].map((n) => ({
      type: n.className,
      texte: (n.querySelector('.toast__message') || {}).textContent || ''
    })))`);
  const visibles = JSON.parse(alertes);

  const genantes = visibles.filter((t) => /toast--(error|warning)/.test(t.type));
  assert.deepEqual(genantes, [],
    'Aucune alerte ni avertissement ne doit s afficher au premier demarrage '
    + `sur un navigateur sain. Recu : ${alertes}`);

  const persistance = visibles.filter((t) => /persistance|IndexedDB|start_vault_secure/i.test(t.texte));
  assert.deepEqual(persistance, [],
    `La sonde de persistance ne doit rien avoir a signaler. Recu : ${alertes}`);
});

etape('B2 - CREATION DU COFFRE : le coffre chiffre est ecrit', async () => {
  await soumettreMotDePasse(MDP);
  await attendre(`document.getElementById('auth-screen').hidden === true`, 'ouverture du coffre');

  const persiste = await lireCoffrePersiste();
  assert.ok(persiste && persiste !== 'ERREUR_LECTURE' && persiste !== 'ERREUR_OUVERTURE',
    `Le coffre doit etre reellement ecrit dans IndexedDB. Recu : ${persiste}`);
  assert.ok(!persiste.includes(MDP),
    'Le mot de passe maitre ne doit apparaitre nulle part dans le coffre persiste');
});

etape('B2a - rapport de securite : sept cartes lisibles aux differentes largeurs', async () => {
  await evaluer("document.getElementById('nav-security').click()");
  await attendre("!document.getElementById('security-report-view').hidden",
    'ouverture du rapport de securite');

  // Le coffre est exclusivement synthetique et le rapport n'a pas ete lance.
  // On inspecte uniquement des rectangles de layout, jamais les entrees.
  try {
    for (const largeur of [375, 768, 1215, 1600]) {
      await ctx.cdp.envoyer('Emulation.setDeviceMetricsOverride', {
        width: largeur, height: 900, deviceScaleFactor: 1, mobile: false
      }, ctx.session);

      const layout = await evaluer(`(() => {
        const groupes = [...document.querySelectorAll('#security-report-view .score-overview')];
        const cartes = groupes.flatMap((groupe) => [...groupe.querySelectorAll('.score-card')]);
        const rectangles = cartes.map((carte) => carte.getBoundingClientRect());
        return {
          nombre: cartes.length,
          groupes: groupes.map((groupe) => groupe.querySelectorAll('.score-card').length),
          lignes: groupes.map((groupe) => new Set(
            [...groupe.querySelectorAll('.score-card')].map(
              (carte) => Math.round(carte.getBoundingClientRect().top))
          ).size),
          largeurMin: Math.min(...rectangles.map((rect) => rect.width)),
          dansConteneur: groupes.every((groupe) => {
            const borne = groupe.getBoundingClientRect();
            return [...groupe.querySelectorAll('.score-card')].every((carte) => {
              const rect = carte.getBoundingClientRect();
              return rect.left >= borne.left - 1 && rect.right <= borne.right + 1;
            });
          }),
          sansDebordement: cartes.every((carte) =>
            carte.scrollWidth <= carte.clientWidth + 1)
        };
      })()`);

      assert.equal(layout.nombre, 7, 'Les sept indicateurs doivent rester presents');
      assert.deepEqual(layout.groupes, [4, 3],
        'Restaurer la composition historique : quatre indicateurs principaux, trois complementaires');
      assert.ok(layout.dansConteneur && layout.sansDebordement,
        `Cartes coupees a ${largeur}px : ${JSON.stringify(layout)}`);
      assert.ok(layout.largeurMin >= 180,
        `Cartes trop etroites a ${largeur}px : ${JSON.stringify(layout)}`);
      if (largeur >= 1215) {
        assert.deepEqual(layout.lignes, [1, 1],
          `Retrouver quatre cartes puis trois sur deux rangees a ${largeur}px : ${JSON.stringify(layout)}`);
      }
    }
  } finally {
    await ctx.cdp.envoyer('Emulation.clearDeviceMetricsOverride', {}, ctx.session);
    await evaluer("document.getElementById('nav-dashboard').click()");
  }
});

etape('B3 - le champ du mot de passe maitre est vide apres usage', async () => {
  assert.equal(await evaluer(`document.getElementById('master-password').value`), '',
    'La saisie ne doit pas rester dans le champ');
  assert.equal(await evaluer(`document.getElementById('master-password').type`), 'password',
    'Le champ doit repasser en type password');
});

etape('B4 - AJOUT D UNE ENTREE : elle est chiffree et persistee', async () => {
  const ajout = await evaluer(`(async () => {
    const mod = await import('/scripts/core/vault/manager.js');
    const m = mod.vaultManager || mod.default;
    await m.addEntry({
      title: 'Service-Parcours-B4', username: 'utilisateur-b4',
      password: 'MotDePasse-Entree-B4!', url: 'https://exemple.invalid'
    });
    return m.getEntries().length;
  })()`);
  assert.ok(ajout >= 1, 'L entree doit exister en session');

  const persiste = await lireCoffrePersiste();
  assert.ok(persiste.includes('"entries"'), 'Le coffre persiste doit contenir des entrees');
  for (const clair of ['Service-Parcours-B4', 'utilisateur-b4', 'MotDePasse-Entree-B4!']) {
    assert.ok(!persiste.includes(clair), `Champ persiste EN CLAIR : « ${clair} »`);
  }
});

etape('B5 - FERMETURE puis REDEMARRAGE : le bouton propose le deverrouillage', async () => {
  await naviguer();

  assert.equal(await evaluer(`document.getElementById('unlock-vault').textContent.trim()`),
    'Déverrouiller le coffre',
    'Avec un coffre existant, le bouton doit proposer le DEVERROUILLAGE');
  assert.equal(await evaluer(`document.getElementById('unlock-vault').disabled`), false,
    'REGRESSION : le bouton restait desactive quand l initialisation du stockage echouait');
  assert.equal(await evaluer(`document.getElementById('vault-ui').hidden`), true,
    'Le coffre ne doit pas s ouvrir tout seul au redemarrage');
});

etape('B6 - MAUVAIS MOT DE PASSE : refus, coffre intact', async () => {
  const avant = await lireCoffrePersiste();

  await soumettreMotDePasse(`${MDP}-faux`);
  await patienter(1500);

  assert.equal(await evaluer(`document.getElementById('auth-screen').hidden`), false,
    'Un mauvais mot de passe ne doit pas ouvrir le coffre');
  assert.equal(await lireCoffrePersiste(), avant,
    'Un echec d ouverture ne doit rien ecrire');
});

etape('B7 - DEVERROUILLAGE : l entree ajoutee est retrouvee, dechiffree', async () => {
  await soumettreMotDePasse(MDP);
  await attendre(`document.getElementById('auth-screen').hidden === true`, 'deverrouillage');

  const titres = await evaluer(`(async () => {
    const mod = await import('/scripts/core/vault/manager.js');
    const m = mod.vaultManager || mod.default;
    return m.getEntries().map((e) => e.title);
  })()`);
  assert.ok(titres.includes('Service-Parcours-B4'),
    `L entree doit survivre au redemarrage. Recu : ${JSON.stringify(titres)}`);
});

etape('B7b - SECOND ONGLET : une seconde session ouvre le meme coffre synthetique', async () => {
  const { targetId } = await ctx.cdp.envoyer('Target.createTarget', {
    url: `${ctx.origin}/index.html`
  });
  await ctx.cdp.envoyer('Target.activateTarget', { targetId });
  const { sessionId } = await ctx.cdp.envoyer('Target.attachToTarget', {
    targetId,
    flatten: true
  });
  ctx.secondarySession = sessionId;
  await ctx.cdp.envoyer('Runtime.enable', {}, sessionId);
  await ctx.cdp.envoyer('Page.enable', {}, sessionId);
  await attendreDansSession(
    sessionId,
    `!!document.getElementById('auth-form')
      && document.getElementById('unlock-vault').disabled === false
      && document.getElementById('unlock-vault').textContent.includes('Déverrouiller')`,
    'initialisation du stockage dans le second onglet'
  );
  // Cette etape cible le gestionnaire de session et le transport
  // inter-onglets. Le parcours principal couvre deja le formulaire complet ;
  // ici l'ouverture directe evite que la politique de mise en veille d'une
  // cible CDP secondaire transforme le test de concurrence en test d'UI.
  const etat = await evaluerDansSession(sessionId, `(async () => {
    const { vaultManager } = await import('/scripts/core/vault/manager.js');
    try {
      await vaultManager.unlock(${JSON.stringify(MDP)});
    } catch (error) {
      return { erreur: error?.code || error?.name || 'unlock_failed' };
    }
    document.getElementById('auth-screen').hidden = true;
    document.getElementById('vault-ui').hidden = false;
    document.getElementById('searchInput').value = 'clair-temporaire-second-onglet';
    return {
      clePresente: vaultManager.masterKey !== null,
      entrees: vaultManager.getEntries().length
    };
  })()`);
  assert.equal(etat.erreur, undefined,
    `Le second onglet doit pouvoir ouvrir le coffre : ${JSON.stringify(etat)}`);
  assert.equal(etat.clePresente, true, 'Le second onglet doit posseder sa propre session');
  assert.ok(etat.entrees >= 1, 'Le second onglet doit avoir dechiffre le coffre synthetique');
});

etape('B8 - MODIFICATION : le changement est chiffre et persiste', async () => {
  await ctx.cdp.envoyer('Target.activateTarget', { targetId: ctx.primaryTarget });
  const resultat = await evaluer(`(async () => {
    const { vaultManager } = await import('/scripts/core/vault/manager.js');
    const entree = vaultManager.getEntries().find((e) => e.title === 'Service-Parcours-B4');
    await vaultManager.updateEntry(entree.id, {
      ...entree, title: 'Service-Parcours-B8-Modifie', password: 'MotDePasse-Modifie-B8!'
    });
    return vaultManager.getEntries().map((e) => e.title);
  })()`);

  assert.ok(resultat.includes('Service-Parcours-B8-Modifie'), 'La modification doit etre en session');
  assert.ok(!resultat.includes('Service-Parcours-B4'), 'L ancien titre ne doit pas subsister');

  const persiste = await lireCoffrePersiste();
  assert.ok(!persiste.includes('Service-Parcours-B8-Modifie'),
    'Le nouveau titre doit etre CHIFFRE dans le coffre persiste');
  assert.ok(!persiste.includes('MotDePasse-Modifie-B8!'));

  await attendreDansSession(
    ctx.secondarySession,
    `(async () => {
      const { vaultManager } = await import('/scripts/core/vault/manager.js');
      return vaultManager.masterKey === null
        && vaultManager.getEntries().length === 0
        && document.getElementById('auth-screen').hidden === false;
    })()`,
    'invalidation inter-onglets apres remplacement du coffre'
  );

  const secondOnglet = await evaluerDansSession(ctx.secondarySession, `({
    rechercheVide: document.getElementById('searchInput').value === '',
    tableauVide: document.getElementById('dashboardSearchInput').value === ''
  })`);
  assert.deepEqual(secondOnglet, { rechercheVide: true, tableauVide: true },
    'Le verrouillage distant doit aussi purger les champs en clair du second onglet');
});

etape('B9 - EXPORT : le fichier produit est chiffre, sans aucun clair', async () => {
  const exporte = await evaluer(`(async () => {
    const { vaultManager } = await import('/scripts/core/vault/manager.js');
    return JSON.stringify(await vaultManager.exportVaultRecord());
  })()`);

  assert.ok(exporte && exporte.length > 0, 'L export doit produire un contenu');
  for (const clair of ['Service-Parcours-B8-Modifie', 'MotDePasse-Modifie-B8!', MDP]) {
    assert.ok(!exporte.includes(clair), `L export contient du CLAIR : « ${clair} »`);
  }
  assert.ok(exporte.includes('"meta"') && exporte.includes('"entries"'),
    'L export doit conserver la structure du coffre');

  ctx.exportChiffre = exporte;
});

etape('B9a - EXPORT UI : VAULT reste le choix chiffre par defaut', async () => {
  assert.equal(await evaluer(`document.getElementById('export-format')?.value`), 'vault',
    'Le format chiffre doit etre propose par defaut');
  const avant = await lireCoffrePersiste();

  await avecCapturesExport(async () => {
    await lancerExportUi('vault');
    const fichier = await lireExportCapture();
    assert.match(fichier.filename, /\.vault$/);
    assert.equal(await evaluer(`!!document.querySelector('.secure-dialog')`), false,
      'La sauvegarde chiffree doit garder son parcours direct');
    for (const secret of [MDP, 'Service-Parcours-B8-Modifie', 'MotDePasse-Modifie-B8!']) {
      assert.ok(!fichier.text.includes(secret), 'La sauvegarde VAULT ne doit contenir aucun secret en clair');
    }
    const contenu = JSON.parse(fichier.text);
    assert.ok(Array.isArray(contenu.entries) && contenu.meta,
      'Le fichier VAULT doit conserver sa structure de sauvegarde');
  });

  assert.equal(await lireCoffrePersiste(), avant, 'Exporter ne doit pas modifier le coffre');
});

etape('B9b - EXPORT CSV : annulation sans fichier puis transfert exact des identifiants', async () => {
  await evaluer(`(async () => {
    const { vaultManager } = await import('/scripts/core/vault/manager.js');
    await vaultManager.addEntry(${JSON.stringify(ENTREE_EXPORT)});
    await vaultManager.addEntry({
      title: 'Entree sans site pour export', password: 'Secret-sans-site-B9!', url: ''
    });
    return true;
  })()`);
  const avant = await lireCoffrePersiste();

  await avecCapturesExport(async () => {
    await lancerExportUi('csv');
    await attendre(`!!document.querySelector('.secure-dialog')`, 'confirmation CSV');
    assert.deepEqual(await evaluer(`({
      blobs: globalThis.__exportJourneyCapture.blobs.length,
      downloads: globalThis.__exportJourneyCapture.downloads.length
    })`), { blobs: 0, downloads: 0 }, 'Aucun fichier ne doit exister avant consentement');
    await terminerConfirmationExport(false);
    assert.deepEqual(await evaluer(`({
      blobs: globalThis.__exportJourneyCapture.blobs.length,
      downloads: globalThis.__exportJourneyCapture.downloads.length
    })`), { blobs: 0, downloads: 0 }, 'Annuler doit empecher toute creation de fichier');

    await lancerExportUi('csv');
    await terminerConfirmationExport(true);
    const fichier = await lireExportCapture();
    assert.match(fichier.filename, /\.csv$/);
    assert.match(fichier.type, /^text\/csv/);
    assert.ok(fichier.text.includes('\r\n'), 'Le CSV doit employer les fins de ligne des navigateurs');
    const lignes = parseCsvRows(fichier.text).map((ligne) => ligne.cells);
    assert.deepEqual(lignes[0], ['name', 'url', 'username', 'password']);
    assert.equal(lignes.length, 3, 'Les deux identifiants web doivent etre exportes');
    assert.deepEqual(lignes.find((ligne) => ligne[0] === ENTREE_EXPORT.title), [
      ENTREE_EXPORT.title, ENTREE_EXPORT.url, ENTREE_EXPORT.username, ENTREE_EXPORT.password
    ], 'L export doit conserver les virgules, guillemets, Unicode, lignes et espaces du mot de passe');
    assert.ok(!fichier.text.includes('Secret-sans-site-B9!'), 'Le CSV navigateur doit omettre une entree sans site');
    assert.ok(!fichier.text.includes(ENTREE_EXPORT.notes), 'Le CSV navigateur doit rester limite aux identifiants');
  });

  assert.equal(await lireCoffrePersiste(), avant, 'L export CSV ne doit rien reecrire');
});

etape('B9c - EXPORT JSON : les donnees completes sont preservees apres consentement', async () => {
  const avant = await lireCoffrePersiste();
  await avecCapturesExport(async () => {
    await lancerExportUi('json');
    await attendre(`!!document.querySelector('.secure-dialog')`, 'confirmation JSON');
    assert.equal(await evaluer(`globalThis.__exportJourneyCapture.blobs.length`), 0,
      'Le JSON en clair ne doit pas etre construit avant consentement');
    await terminerConfirmationExport(true);
    const fichier = await lireExportCapture();
    assert.match(fichier.filename, /\.json$/);
    assert.match(fichier.type, /^application\/json/);
    const contenu = JSON.parse(fichier.text);
    assert.equal(contenu.format, 'cryptokeep-plaintext');
    assert.equal(contenu.version, 1);
    assert.equal(contenu.entries.length, 3, 'Le JSON doit aussi conserver les entrees sans URL');
    const entree = contenu.entries.find((element) => element.title === ENTREE_EXPORT.title);
    assert.ok(entree, 'L entree complete doit etre presente dans le JSON');
    for (const [champ, valeur] of Object.entries(ENTREE_EXPORT)) {
      assert.deepEqual(entree[champ], valeur, `Le champ ${champ} doit etre preserve dans le JSON`);
    }
    assert.ok(entree.id && entree.created_at && entree.last_modified,
      'Le JSON doit conserver les identifiants et dates des entrees');
    assert.ok(!Object.hasOwn(contenu, 'meta'), 'Un export en clair ne doit pas inclure les metadonnees cryptographiques');
    assert.ok(!fichier.text.includes(MDP), 'Le mot de passe maitre ne doit jamais etre exporte');
  });
  assert.equal(await lireCoffrePersiste(), avant, 'L export JSON ne doit rien reecrire');
});

etape('B9d - EXPORT SUSPENDU : verrouiller annule la confirmation sans fichier', async () => {
  const avant = await lireCoffrePersiste();
  try {
    await avecCapturesExport(async () => {
      await lancerExportUi('json');
      await attendre(`!!document.querySelector('.secure-dialog')`, 'confirmation avant verrouillage');
      await evaluer(`(async () => {
        const { vaultManager } = await import('/scripts/core/vault/manager.js');
        const { lockVaultSession } = await import('/scripts/security/session-lock.js');
        await lockVaultSession(vaultManager, { notify: false });
        return true;
      })()`);
      await attendre(`!document.querySelector('.secure-dialog')
        && !document.getElementById('btn-export').disabled`, 'annulation de l export au verrouillage');
      assert.deepEqual(await evaluer(`({
        blobs: globalThis.__exportJourneyCapture.blobs.length,
        downloads: globalThis.__exportJourneyCapture.downloads.length
      })`), { blobs: 0, downloads: 0 }, 'Une session verrouillee ne doit produire aucun export en clair');
      assert.equal(await evaluer(`document.getElementById('auth-screen').hidden`), false);
    });
    assert.equal(await lireCoffrePersiste(), avant, 'Annuler l export ne doit pas modifier le coffre');
  } finally {
    if (!await evaluer(`document.getElementById('auth-screen').hidden`)) {
      await soumettreMotDePasse(MDP);
      await attendre(`document.getElementById('auth-screen').hidden === true`, 'reouverture apres export annule');
    }
    await evaluer(`document.getElementById('nav-dashboard').click()`);
  }
});

etape('B10 - IMPORT CONTROLE : un fichier hostile est REFUSE', async () => {
  const avant = await lireCoffrePersiste();

  const refus = await evaluer(`(async () => {
    const { validateImportedVaultStructure } =
      await import('/scripts/core/storage/vault-import-validator.js');
    const hostiles = [
      { entries: [], meta: {}, __proto__: { pollue: true } },
      { entries: 'pas-un-tableau', meta: {} },
      { entries: [{ id: '<img src=x onerror=alert(1)>', iv: 'A', data: 'B' }] },
      {},
      null
    ];
    return hostiles.map((h) => {
      try { validateImportedVaultStructure(h); return 'ACCEPTE'; }
      catch { return 'refuse'; }
    });
  })()`);

  assert.ok(!refus.includes('ACCEPTE'),
    `Un fichier hostile a ete accepte. Verdicts : ${JSON.stringify(refus)}`);
  assert.equal(await lireCoffrePersiste(), avant,
    'Un import refuse ne doit RIEN modifier dans le coffre');
});

etape('B11 - IMPORT CONTROLE : le propre export du coffre est, lui, valide', async () => {
  const verdict = await evaluer(`(async () => {
    const { validateImportedVaultStructure } =
      await import('/scripts/core/storage/vault-import-validator.js');
    try { validateImportedVaultStructure(${JSON.stringify(ctx.exportChiffre)} && JSON.parse(${JSON.stringify(ctx.exportChiffre)})); return 'valide'; }
    catch (e) { return 'REFUSE: ' + e.message; }
  })()`);

  assert.equal(verdict, 'valide',
    'Un test de rejet sans controle positif ne prouve rien : le coffre doit '
    + `pouvoir se reimporter lui-meme. Recu : ${verdict}`);
});

etape('B12 - VERROUILLAGE : session purgee, coffre chiffre conserve', async () => {
  const avant = await lireCoffrePersiste();

  await evaluer(`(async () => {
    const { vaultManager } = await import('/scripts/core/vault/manager.js');
    const { lockVaultSession } = await import('/scripts/security/session-lock.js');
    await lockVaultSession(vaultManager, { notify: false });
    return true;
  })()`);

  const restant = await evaluer(`(async () => {
    const { vaultManager } = await import('/scripts/core/vault/manager.js');
    return { cle: vaultManager.masterKey === null, entrees: vaultManager.getEntries().length };
  })()`);

  assert.equal(restant.cle, true, 'La cle maitre doit etre liberee');
  assert.equal(restant.entrees, 0, 'Aucune entree dechiffree ne doit subsister');
  assert.equal(await evaluer(`document.getElementById('auth-screen').hidden`), false,
    'L ecran d authentification doit revenir');
  assert.equal(await lireCoffrePersiste(), avant,
    'Verrouiller n est pas supprimer : le coffre chiffre doit rester');
});

etape('B13 - DECONNEXION : rien de sensible ne reste dans le document', async () => {
  const rapport = await evaluer(`(async () => {
    const { vaultManager } = await import('/scripts/core/vault/manager.js');
    const { logoutVaultSession } = await import('/scripts/security/logout.js');
    const r = await logoutVaultSession(vaultManager, { notify: false });
    return JSON.stringify({
      cleNulle: r.masterKeyNull,
      entrees: r.entryCount,
      champVide: document.getElementById('master-password').value === '',
      texteDocument: document.body.textContent
    });
  })()`);

  const r = JSON.parse(rapport);
  assert.equal(r.cleNulle, true);
  assert.equal(r.entrees, 0);
  assert.equal(r.champVide, true, 'Le champ maitre doit etre vide apres deconnexion');

  for (const secret of [MDP, 'MotDePasse-Modifie-B8!', 'Service-Parcours-B8-Modifie',
    ENTREE_EXPORT.password, ENTREE_EXPORT.title, ENTREE_EXPORT.username, ENTREE_EXPORT.notes]) {
    assert.ok(!r.texteDocument.includes(secret),
      `Donnee sensible encore affichee apres deconnexion : « ${secret} »`);
  }
});

etape('B14 - AUCUN SECRET dans localStorage ni sessionStorage', async () => {
  const stockages = await evaluer(`JSON.stringify({
    local: Object.entries(localStorage).map(([k, v]) => k + '=' + v).join(' | '),
    session: Object.entries(sessionStorage).map(([k, v]) => k + '=' + v).join(' | ')
  })`);

  const s = JSON.parse(stockages);
  for (const secret of [MDP, 'MotDePasse-Entree-B4!', 'MotDePasse-Modifie-B8!',
    'Service-Parcours-B8-Modifie', 'utilisateur-b4', ENTREE_EXPORT.password,
    ENTREE_EXPORT.title, ENTREE_EXPORT.username, ENTREE_EXPORT.notes,
    'Secret-export', 'Secret-sans-site-B9!']) {
    assert.ok(!s.local.includes(secret), `SECRET dans localStorage : « ${secret} »`);
    assert.ok(!s.session.includes(secret), `SECRET dans sessionStorage : « ${secret} »`);
  }
});

etape('B15 - AUCUN SECRET journalise dans la console', async () => {
  const journal = ctx.logs.join(' \\n ');
  for (const secret of [MDP, 'MotDePasse-Entree-B4!', 'MotDePasse-Modifie-B8!',
    ENTREE_EXPORT.password, 'Secret-export', 'Secret-sans-site-B9!']) {
    assert.ok(!journal.includes(secret), `SECRET journalise : « ${secret} »`);
  }
});

etape('B16 - AUCUNE exception non rattrapee sur tout le parcours', () => {
  assert.deepEqual(ctx.erreurs, [],
    `Exceptions relevees pendant le parcours : ${JSON.stringify(ctx.erreurs, null, 2)}`);
});

// ===========================================================================
// EXECUTION
// ===========================================================================

console.log('=== PARCOURS NAVIGATEUR (LOT 9) ===');

const executable = trouverNavigateur();
if (!executable) {
  // Un parcours qui n a rien parcouru ne prouve rien. On le dit, et on sort
  // en echec — sauf demande explicite du contraire.
  const message = 'Aucun navigateur Chromium (Edge, Chrome, Chromium) trouve. '
    + 'Le parcours n a PAS ete execute : aucun resultat ne peut en etre tire. '
    + 'Indiquez le chemin via CRYPTOKEEP_BROWSER, ou posez '
    + 'CRYPTOKEEP_BROWSER_OPTIONAL=1 pour ignorer cette suite volontairement.';

  if (process.env.CRYPTOKEEP_BROWSER_OPTIONAL === '1') {
    console.warn(`  IGNORE  ${message}`);
  } else {
    console.error(`  ECHEC   ${message}`);
    process.exitCode = 1;
  }
} else {
  const serveur = await startStaticServer(RACINE);
  const navigateur = await lancerNavigateur({ executable });

  if (!navigateur.ok) {
    console.error(`  ECHEC   Navigateur injoignable (${navigateur.reason}).`);
    if (navigateur.details) console.error(`  Diagnostic Chrome : ${navigateur.details}`);
    process.exitCode = 1;
    await serveur.close();
  } else {
    ctx.origin = serveur.origin;
    ctx.cdp = await ClientCdp.connecter(navigateur.wsUrl);

    const { targetId } = await ctx.cdp.envoyer('Target.createTarget', { url: 'about:blank' });
    ctx.primaryTarget = targetId;
    const { sessionId } = await ctx.cdp.envoyer('Target.attachToTarget', { targetId, flatten: true });
    ctx.session = sessionId;

    ctx.cdp.ecouter((message) => {
      if (message.method === 'Runtime.consoleAPICalled') {
        ctx.logs.push(message.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const d = message.params.exceptionDetails;
        ctx.erreurs.push(d.exception?.description || d.text);
      }
    });

    await ctx.cdp.envoyer('Runtime.enable', {}, sessionId);
    await ctx.cdp.envoyer('Page.enable', {}, sessionId);

    console.log(`  Navigateur : ${executable}`);
    console.log(`  Serveur    : ${serveur.origin}`);
    console.log('');

    let echecs = 0;
    for (const { label, fn } of etapes) {
      try {
        await fn();
        console.log(`  ok   ${label}`);
      } catch (error) {
        echecs += 1;
        console.error(`  ECHEC ${label}`);
        console.error(`        ${error && error.message}`);
      }
    }

    ctx.cdp.fermer();
    await navigateur.close();
    await serveur.close();

    if (echecs > 0) {
      console.error(`Browser journey failed: ${echecs} etape(s).`);
      process.exitCode = 1;
    } else {
      console.log(`Browser journey passed (${etapes.length} etapes).`);
    }
  }
}
