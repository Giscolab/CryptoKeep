/**
 * CryptoKeep - Couche de compatibilite pour Chart.js (Lot 6).
 *
 * LE PROBLEME
 * `Chart.min.js` est charge par une balise `<script>` de index.html. Le nom
 * du fichier commence par une MAJUSCULE. Sur Windows et macOS, dont les
 * systemes de fichiers sont insensibles a la casse, une reference ecrite
 * `chart.min.js` fonctionne quand meme ; sur Linux, sur un serveur, ou dans
 * un conteneur, elle echoue silencieusement. Le commentaire d'en-tete de
 * security-chart.js indiquait d'ailleurs la variante minuscule, ce qui
 * conduisait droit dans le piege.
 *
 * Quand le chargement echouait, la page n'affichait rien : un canevas vide,
 * un avertissement dans la console, et aucune indication a l'utilisateur.
 *
 * CE MODULE
 * - resout la bibliotheque quel que soit le nom sous lequel elle s'est
 *   enregistree ;
 * - si elle est absente, tente un chargement de secours en essayant les
 *   variantes de casse connues, dans l'ordre ;
 * - ne charge QUE depuis la meme origine, ce que `script-src 'self'`
 *   autorise. Aucun CDN, aucune dependance reseau ;
 * - renvoie un etat HONNETE : l'appelant sait si la bibliotheque est la, et
 *   peut afficher un message plutot qu'un cadre vide.
 *
 * Le fichier `scripts/vendor/Chart.min.js` est conserve tel quel : aucune
 * copie, aucun renommage, aucun octet modifie.
 */

/** Variantes de casse essayees, dans l'ordre. */
export const CHART_PATHS = Object.freeze([
  'scripts/vendor/Chart.min.js',
  'scripts/vendor/chart.min.js'
]);

let chargementEnCours = null;

/** La bibliotheque est-elle deja disponible ? */
export function resolveChart(scope = globalThis) {
  if (scope && typeof scope.Chart === 'function') return scope.Chart;
  // Certaines constructions exposent la bibliotheque sous un autre nom.
  if (scope && scope.Chart && typeof scope.Chart.Chart === 'function') return scope.Chart.Chart;
  return null;
}

/** Injecte un script de MEME ORIGINE et attend son chargement. */
function injecter(doc, chemin) {
  const hote = doc.head || doc.body || doc.documentElement;
  // Un document qui ne sait pas recevoir de script n'est pas une erreur :
  // c'est simplement un contexte ou le chargement de secours est impossible.
  if (!hote || typeof hote.appendChild !== 'function'
    || typeof doc.createElement !== 'function') {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const script = doc.createElement('script');
    script.src = chemin;
    script.async = false;
    script.addEventListener('load', () => resolve(true), { once: true });
    script.addEventListener('error', () => resolve(false), { once: true });
    hote.appendChild(script);
  });
}

/**
 * Garantit la disponibilite de Chart.js, ou dit pourquoi elle manque.
 *
 * @returns {Promise<{available: boolean, source: string, triedPaths: Array}>}
 */
export async function ensureChart(options = {}) {
  const scope = options.scope || globalThis;
  const doc = options.doc || (typeof document !== 'undefined' ? document : null);

  const dejaLa = resolveChart(scope);
  if (dejaLa) return { available: true, source: 'already_loaded', triedPaths: [] };

  if (!doc || typeof doc.createElement !== 'function') {
    return { available: false, source: 'no_document', triedPaths: [] };
  }

  // Un seul chargement de secours a la fois, meme si plusieurs vues le
  // demandent simultanement.
  if (chargementEnCours) return chargementEnCours;

  chargementEnCours = (async () => {
    const essayes = [];
    for (const chemin of (options.paths || CHART_PATHS)) {
      essayes.push(chemin);
      const charge = await injecter(doc, chemin);
      if (charge && resolveChart(scope)) {
        return { available: true, source: chemin, triedPaths: essayes };
      }
    }
    return { available: false, source: 'not_found', triedPaths: essayes };
  })().finally(() => { chargementEnCours = null; });

  return chargementEnCours;
}

export default { ensureChart, resolveChart, CHART_PATHS };
