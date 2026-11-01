import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../../src-tauri/tauri.installer.conf.json', import.meta.url), 'utf8'));
const template = readFileSync(new URL('../../src-tauri/windows/installer-preserve-data.nsi', import.meta.url), 'utf8');
const production = JSON.parse(readFileSync(new URL('../../src-tauri/tauri.production.conf.json', import.meta.url), 'utf8'));

assert.equal(config.identifier, 'fr.giscolab.cryptokeep.test');
assert.equal(config.bundle.active, true);
assert.deepEqual(config.bundle.targets, ['nsis']);
assert.equal(config.bundle.windows.nsis.template, 'windows/installer-preserve-data.nsi');
assert.equal(config.bundle.windows.nsis.installMode, 'currentUser');
assert.equal(production.identifier, 'fr.giscolab.cryptokeep');
assert.equal(production.productName, 'CryptoKeep');
assert.notEqual(production.identifier, config.identifier);
assert.equal(production.bundle.active, true);
assert.deepEqual(production.bundle.targets, ['nsis']);
assert.equal(production.bundle.windows.nsis.template, config.bundle.windows.nsis.template);
assert.equal(production.bundle.windows.nsis.installMode, 'currentUser');
assert.match(template, /Section Uninstall/);
assert.doesNotMatch(template, /DeleteAppData|deleteAppData/i, 'No data-removal option or state may remain');
assert.doesNotMatch(template, /\bRMDir\s+\/r\b/i, 'No recursive removal in the installer or uninstaller');
assert.doesNotMatch(template, /^\s*(?:Delete|RMDir)\b[^\r\n]*\$(?:LOCALAPPDATA|APPDATA)/im, 'User data directories must never be deleted');
assert.match(template, /Delete "\$INSTDIR\\\$\{MAINBINARYNAME\}\.exe"/, 'Application executable must still be uninstallable');
console.log('PASS installer: separate production/test channels; no profile deletion in interactive or silent uninstall');
