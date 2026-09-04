/**
 * Parcours du depot pour les tests d ensemble (Lot 9).
 *
 * POURQUOI CE HELPER
 * Trois suites — controle de syntaxe, harnais, absence de plaintext —
 * doivent parcourir le depot. Chacune le faisait a sa maniere, ce qui
 * dupliquait la logique d exclusion et multipliait les avertissements
 * `security/detect-non-literal-fs-filename` sur des chemins qui, par nature,
 * ne peuvent pas etre litteraux : un controle « tous les fichiers » ne
 * connait pas ses chemins a l avance.
 *
 * Ces avertissements sont donc CONCENTRES ici, dans un fichier de test qui ne
 * lit que le depot lui-meme, jamais une entree utilisateur, jamais un chemin
 * venu du reseau. La regle n est ni desactivee, ni contournee : elle est
 * signalee a un seul endroit, ou elle est facile a auditer.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Dossiers jamais analyses : tiers, caches, dependances. */
export const DOSSIERS_EXCLUS = Object.freeze(['vendor', 'node_modules', '__pycache__']);

/**
 * Liste recursivement les fichiers d un dossier du depot.
 *
 * @param {string} racine dossier de depart, relatif a la racine du depot
 * @param {string[]} extensions extensions retenues, avec le point
 * @returns {string[]} chemins relatifs, tries
 */
export function listerFichiers(racine, extensions = ['.js', '.mjs']) {
  const resultat = [];

  const parcourir = (dossier) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      if (DOSSIERS_EXCLUS.includes(entree.name)) continue;
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) parcourir(chemin);
      else if (extensions.some((ext) => entree.name.endsWith(ext))) resultat.push(chemin);
    }
  };

  parcourir(racine);
  return resultat.sort();
}

/** Lit un fichier du depot en UTF-8. */
export function lireFichier(chemin) {
  return readFileSync(chemin, 'utf8');
}

/** Lit un fichier en retirant ses commentaires. */
export function lireCodeSansCommentaires(chemin) {
  return lireFichier(chemin)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Le chemin designe-t-il un fichier existant ? */
export function estUnFichier(chemin) {
  try { return statSync(chemin).isFile(); } catch { return false; }
}

export default { listerFichiers, lireFichier, lireCodeSansCommentaires, estUnFichier, DOSSIERS_EXCLUS };
