# Fonctions absentes et évolutions possibles

Les fonctions disponibles sont dans [l'inventaire courant](FONCTIONS-IMPLEMENTEES.md).
Le code ne fournit actuellement pas les fonctions ci-dessous. Leur présence
dans cette liste ne constitue ni un engagement ni une échéance de livraison.

- Double authentification, biométrie et WebAuthn.
- Remplissage automatique des mots de passe dans d'autres sites ou applications.
- Synchronisation cloud ou P2P, partage entre utilisateurs et compte distant.
- Système de plugins et pièces jointes chiffrées.
- Import JSON et historique des mots de passe par entrée.
- Restauration `.vault` directe depuis l'écran initial d'un profil vierge.
- Migration automatique des coffres historiques dans le desktop.
- Gestion dédiée et validée de tous les événements de veille/verrouillage Windows.

Les contrôles 2FA et remplissage automatique de l'interface restent désactivés.
Voir [leur état technique](2FA-WEBAUTHN-AUTOFILL.md).

L'application Windows et les exports CSV/JSON existent déjà : ils ne doivent
plus apparaître comme des travaux futurs. Aucune ancienne feuille de route
datée n'est maintenue ; les décisions de développement passent par les issues
et les changements vérifiables du dépôt.
