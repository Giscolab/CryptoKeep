# Sécurité de CryptoKeep

Le code source est la référence sur les protections implémentées. Ce document
décrit leur portée et leurs limites ; il ne constitue ni un audit indépendant
ni une certification. La Release Windows 0.1.0 est une préversion non signée.

## Signaler un problème

Utiliser les moyens proposés par le dépôt GitHub pour les signalements de
sécurité. Pour un problème non sensible, ouvrir une
[issue](https://github.com/Giscolab/CryptoKeep/issues). Ne joindre aucun mot de
passe, coffre personnel, secret ou journal sensible ; fournir un exemple synthétique.

## Protections implémentées

| Mécanisme | Portée et source |
|---|---|
| AES-GCM 256 bits | Chiffrement des entrées et bloc de validation ; `scripts/core/crypto/aes-gcm.js` |
| PBKDF2-HMAC-SHA512, 220 000 itérations | Paramètres des nouveaux coffres v2 ; `scripts/core/storage/vault-format.js` |
| Sel de 16 octets et IV de 12 octets | Tirages avec `crypto.getRandomValues` |
| Clé Web Crypto non extractible | Dérivation dans `scripts/core/crypto/pbkdf2.js` ; l'utilisation par un script autorisé reste possible |
| AAD liée à la version et à l'identifiant | Protection contre le déplacement d'une entrée chiffrée sous un autre identifiant |
| Imports structurés et vérifiés cryptographiquement | Taille, propriétés, bornes et vérification avant confirmation du remplacement |
| Web Locks, transactions et vérification des écritures | Coordination des écrivains et détection de remplacements concurrents |
| Verrouillage et invalidation de session | Retrait des références, des champs et des résultats sensibles contrôlés par l'application |
| CSP restrictive | Pas d'`unsafe-inline` ni d'`unsafe-eval` dans la politique applicative |
| Copie secondaire chiffrée | LocalStorage conserve un record déjà chiffré, pas une seconde sauvegarde indépendante |

Le frontend ne déclare pas de dépendances npm de production ; il utilise des
ressources tierces locales. Le desktop dépend de Tauri, de crates Rust et de
WebView2. Les verrous de dépendances et les analyses automatisées restent
nécessaires ; « aucun CDN » ne signifie pas « aucune dépendance ».

## Réseau et canaux

La version web locale utilise HTTP en clair sur `127.0.0.1`, sans TLS. Le
desktop utilise l'origine locale `https://tauri.localhost` dans WebView2 ; ce
n'est pas un service web distant. Son frontend bloque les requêtes distantes
et HIBP. Dans la version web, HIBP reste facultatif : seuls cinq caractères
hexadécimaux du SHA-1 sont envoyés après consentement, mais le service voit
l'adresse IP et l'heure de la requête.

L'installation de WebView2, Windows et le moteur lui-même peuvent avoir leurs
propres communications. Le seul code applicatif ne permet pas de garantir
une absence absolue de trafic de fond du système.

## Limites à connaître

- Un système compromis ou un script exécuté dans l'origine peut accéder aux
  données d'une session déverrouillée. Le navigateur et WebView2 sont dans la
  base de confiance.
- Une clé non extractible par l'API n'empêche pas son utilisation par un script
  compromis. Les modules JavaScript ne sont pas des processus isolés.
- Le nettoyage des références et des tampons ne garantit pas l'effacement
  des chaînes JavaScript, de la mémoire du processus ou des sauvegardes du système.
- L'effacement du presse-papiers est conditionnel ; les copies externes et
  l'historique du système ne sont pas sous le contrôle de l'application.
- La suppression du coffre n'est pas un effacement sécurisé du disque et ne
  supprime pas les fichiers exportés.
- CSV et JSON sont des fichiers en clair, téléchargés après confirmation.
  Toute personne qui y accède peut lire les mots de passe. Le CSV peut contenir
  des débuts de formule : ne pas l'ouvrir dans un tableur.
- Les préférences et le nom/courriel du profil local ne sont pas chiffrés.
  Ce sont des données personnelles ; ne pas y placer de secrets de coffre.
- La perte du mot de passe maître ne peut pas être compensée par le projet.
- Aucun mécanisme dédié de protection contre les canaux auxiliaires, de 2FA,
  de WebAuthn ou de détection d'environnement compromis n'est livré.

## Disponibilité et compatibilité

Le coffre et sa copie secondaire partagent un profil : une suppression du
profil, une éviction ou une panne peut détruire les deux. Conserver un export
`.vault` séparé. Les écritures exigent Web Locks. Le desktop refuse les
migrations automatiques des formats historiques ; le web suit un parcours
distinct. Voir [les formats](docs/FORMATS-DE-COFFRE.md) et
[les migrations](docs/MIGRATIONS.md).

Les profils de production et de test sont distincts. Le désinstalleur est
configuré pour conserver les données, mais cela ne remplace pas une sauvegarde.
Les résultats des contrôles automatisés doivent être lus sur le commit concerné.
Voir [le modèle de menace](THREAT_MODEL.md) et
[les contrôles automatisés](docs/AUTOMATED-SECURITY.md).
