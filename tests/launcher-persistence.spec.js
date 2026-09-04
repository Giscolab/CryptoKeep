/**
 * Lot 1 - Non-regression du cycle de vie de lancement.
 *
 * Ces verifications sont statiques : elles lisent les lanceurs et refusent le
 * retour des deux dangers verifies (profil ephemere, arret d'un processus
 * tiers par simple occupation du port). Elles ne lancent aucun serveur.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';

// LOT 9 : l'assertion maison est remplacee par `node:assert/strict`, qui
// s'appelle de la meme facon — assert(valeur, message) — mais apporte en
// plus `equal`, `deepEqual`, `rejects` et un diff lisible en cas d'echec.

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

/** Retire les lignes de commentaire d'un .bat : seul le code execute compte. */
function executableBatch(source) {
  return source
    .split(/\r?\n/)
    .filter((line) => !/^\s*(REM\b|::)/i.test(line))
    .join('\n');
}

try {
  console.log('=== TEST LAUNCHER PERSISTENCE ===');

  // 1. Conservation : aucun lanceur n'a disparu.
  const requiredFiles = [
    'start_vault_local.bat',
    'start_vault_secure.bat',
    'scripts/start_secure_server.ps1',
    'scripts/stop_secure_server.ps1',
    'scripts/secure_local_server.py'
  ];
  requiredFiles.forEach((file) => {
    assert(fs.existsSync(file), `Fichier requis absent : ${file}`);
  });

  const legacy = read('start_vault_local.bat');
  const secure = read('start_vault_secure.bat');
  const startPs = read('scripts/start_secure_server.ps1');
  const stopPs = read('scripts/stop_secure_server.ps1');

  // 2. Aucun lancement en profil ephemere.
  [['start_vault_local.bat', legacy], ['start_vault_secure.bat', secure]].forEach(([name, source]) => {
    assert(
      !/--incognito|--inprivate|-inprivate|--guest/i.test(executableBatch(source)),
      `${name} ne doit plus ouvrir le coffre dans un profil ephemere`
    );
    assert(
      /--user-data-dir=/.test(source),
      `${name} doit utiliser un profil navigateur persistant dedie`
    );
  });

  // 3. Profil deterministe et propre au projet, hors profil personnel.
  assert(
    secure.includes('%LOCALAPPDATA%' + String.fromCharCode(92) + 'CryptoKeep') && secure.includes('browser-profile'),
    'Le profil doit se trouver dans un emplacement deterministe propre au projet'
  );

  // 4. Plus aucun arret d'un processus tiers parce qu'il occupe le port.
  [['start_vault_local.bat', legacy], ['start_vault_secure.bat', secure]].forEach(([name, source]) => {
    assert(
      !/taskkill[^\n]*\/PID\s+%%/i.test(executableBatch(source)),
      `${name} ne doit plus tuer un processus identifie par le port`
    );
  });
  assert(
    !/Get-NetTCPConnection[\s\S]{0,400}Stop-Process/i.test(stopPs),
    'L arret ne doit jamais deriver le processus a tuer depuis le port'
  );

  // 5. Le PID du processus enfant est conserve et verifie avant tout arret.
  assert(/server\.json/.test(startPs), 'Le demarrage doit enregistrer un fichier d etat');
  assert(/\$proc\.Id/.test(startPs), 'Le demarrage doit conserver le PID de l enfant');
  assert(/StartTime/.test(startPs), 'Le demarrage doit conserver l heure de demarrage');

  assert(/StartTime/.test(stopPs), 'L arret doit verifier l heure de demarrage (reutilisation de PID)');
  assert(/secure_local_server\\.py/.test(stopPs), 'L arret doit verifier la ligne de commande du processus');
  assert(/Stop-Process\s+-Id\s+\$state\.Pid/.test(stopPs), 'Seul le PID enregistre doit etre arrete');

  // 6. Detection de port : correspondance exacte, pas un findstr permissif.
  assert(
    !/netstat -an \| findstr ":%PORT%"/.test(legacy),
    'La detection de port permissive doit avoir ete remplacee'
  );
  assert(
    /Get-NetTCPConnection/.test(legacy) || /LocalPort/.test(legacy),
    'La detection de port doit reposer sur une correspondance exacte'
  );

  // 7. Honnetete du transport : aucune promesse de HTTPS pour le serveur local.
  const docsToCheck = ['README.md', 'start_vault_local.bat', 'start_vault_secure.bat', 'scripts/secure_local_server.py'];
  docsToCheck.forEach((file) => {
    const source = read(file);
    assert(
      !/https:\/\/(localhost|127\.0\.0\.1)/i.test(source),
      `${file} ne doit pas presenter le serveur local comme HTTPS`
    );
  });

  // 8. Le lanceur securise refuse de demarrer si le port appartient a un tiers.
  assert(
    /n arrete jamais un processus qui ne lui appartient pas/.test(startPs),
    'Le demarrage doit refuser explicitement de tuer un processus tiers'
  );

  console.log('Launcher persistence tests passed.');
} catch (error) {
  console.error('Launcher persistence tests failed:', error);
  process.exitCode = 1;
}
