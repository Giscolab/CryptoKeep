/**
 * Serveur statique minimal pour les tests navigateur (Lot 9).
 *
 * AUCUNE DEPENDANCE : uniquement `node:http` et `node:fs`. Le projet interdit
 * toute bibliotheque applicative et tout CDN ; cette regle vaut aussi pour
 * l outillage, sans quoi « zero dependance » ne serait vrai que sur le papier.
 *
 * Ce serveur ne sert QUE le depot, sur 127.0.0.1, et refuse tout chemin qui
 * sort de la racine. Il ne remplace pas `scripts/secure_local_server.py` :
 * il existe pour que la suite navigateur ne dependen pas de Python.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';

const TYPES = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
}));

export async function startStaticServer(racine, port = 0) {
  const base = resolve(racine);

  const serveur = createServer(async (requete, reponse) => {
    try {
      const chemin = decodeURIComponent((requete.url || '/').split('?')[0]);
      const cible = resolve(join(base, normalize(chemin === '/' ? '/index.html' : chemin)));

      // Refus de toute sortie de la racine servie.
      if (!cible.startsWith(base)) {
        reponse.writeHead(403).end('Interdit');
        return;
      }

      const info = await stat(cible);
      const fichier = info.isDirectory() ? join(cible, 'index.html') : cible;
      const contenu = await readFile(fichier);

      reponse.writeHead(200, {
        'Content-Type': TYPES.get(extname(fichier)) || 'application/octet-stream',
        'Cache-Control': 'no-store'
      }).end(contenu);
    } catch {
      reponse.writeHead(404).end('Introuvable');
    }
  });

  await new Promise((res) => serveur.listen(port, '127.0.0.1', res));
  const { port: reel } = serveur.address();

  return {
    origin: `http://127.0.0.1:${reel}`,
    async close() { await new Promise((res) => serveur.close(res)); }
  };
}

export default { startStaticServer };
