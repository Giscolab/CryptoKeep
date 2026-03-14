// scripts/tools/audit-runner.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { auditVault, getPasswordEntropy } from '../security/audit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fichier à charger
const vaultFilePath = path.resolve(__dirname, '../../tests/vault.sample.json'); // <-- à modifier si besoin

// Charger et parser le fichier
let entries;
try {
  const raw = fs.readFileSync(vaultFilePath, 'utf-8');
  entries = JSON.parse(raw);
} catch (err) {
  console.error('❌ Erreur chargement du fichier vault:', err.message);
  process.exit(1);
}

// Exécuter l’audit
const report = auditVault(entries);

// Affichage du rapport
console.log('\n🔐 Audit de Vault Personal');
console.log('──────────────────────────────');
console.log(`Total entrées     : ${report.total}`);
console.log(`Mots de passe faibles : ${report.weak}`);
console.log(`Réutilisations         : ${report.reused}`);
console.log(`Score global       : ${report.score}/100`);
console.log(`Niveau sécurité    : ${report.level}`);

if (report.duplicates.length > 0) {
  console.log('\n🔁 Doublons détectés :');
  report.duplicates.forEach(d => {
    console.log(`- ${d.title} ↔ ${d.duplicateWith}`);
  });
}

// Bonus : entropie
console.log('\n🔢 Entropie des mots de passe :');
entries.forEach(e => {
  const entropy = getPasswordEntropy(e.password);
  console.log(`- ${e.title} : ${entropy} bits`);
});
