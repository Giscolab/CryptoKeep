/**
 * CryptoKeep - Brouillon HISTORIQUE non raccorde.
 *
 * STATUT : ce fichier n est importe par aucun module et n est charge par
 * aucune balise de index.html. Il est conserve tel quel pour l historique.
 *
 * DEFAUT CORRIGE (Lot 1) : la classe n etait pas fermee, ce qui rendait le
 * fichier syntaxiquement invalide et cassait toute analyse portant sur
 * l ensemble du depot (eslint, node --check). Seule l accolade fermante a
 * ete ajoutee. Aucune ligne existante n a ete modifiee ni supprimee.
 *
 * NE PAS RACCORDER EN L ETAT : `this.decryptAllEntries()` n existe pas sur
 * cette classe, et l heuristique de faiblesse ci-dessous est plus pauvre que
 * celle de scripts/security/audit.js, deja utilisee par l application.
 */
// La classe est EXPORTEE plutot que laissee morte au niveau du module :
// elle fait partie de la surface publique du fichier. Aucune regle de
// lint n est desactivee et aucun raccordement n est effectue.
export class SecurityManager {
    async getPasswordStats() {
    const entries = await this.decryptAllEntries();
    const stats = {
        total: entries.length,
        reused: 0,
        weak: 0
    };

    const seen = new Map();
    for (let entry of entries) {
        const pwd = entry.data.password;
        if (seen.has(pwd)) {
            stats.reused++;
        } else {
            seen.set(pwd, true);
        }
        if (pwd.length < 10 || !/[0-9]/.test(pwd) || !/[A-Z]/.test(pwd)) {
            stats.weak++;
        }
    }
    return stats;
}
}
