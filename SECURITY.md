# Politique de sécurité — CryptoKeep

> **Document de référence, priorité haute.** Créé au Lot 10. Deux liens du
> `README.md` pointaient déjà vers ce fichier, qui n'existait pas.
>
> Ce document décrit ce que le code fait **réellement**, vérifié par les tests
> du dépôt. Il ne décrit aucune protection qui ne serait pas implémentée.

## 1. Périmètre

CryptoKeep est un coffre-fort de mots de passe **local**, exécuté dans le
navigateur, sans serveur applicatif, sans compte et sans synchronisation.
Il n'y a **pas de service en ligne** : il n'existe donc ni infrastructure à
signaler, ni programme de divulgation coordonnée avec un fournisseur.

## 2. Signaler une vulnérabilité

Ouvrez un ticket : <https://github.com/Giscolab/CryptoKeep/issues>

Si le rapport contient un scénario d'exploitation, indiquez-le clairement dans
le titre. Le dépôt étant public et l'application entièrement locale, il n'y a
pas de délai d'embargo imposé : le risque est porté par chaque utilisateur qui
exécute sa propre copie.

**N'incluez jamais de mot de passe réel, de fichier `.vault` réel ni d'export
de journal personnel dans un rapport.** Fabriquez un coffre de démonstration.

## 3. Ce qui est réellement implémenté

| Protection | Mise en œuvre | Vérifié par |
|---|---|---|
| Dérivation de clé | PBKDF2-HMAC-SHA-512, **220 000 itérations** (format v2) ; v1 historique à 150 000, migré à l'ouverture | `tests/crypto.spec.js`, `tests/vault-manager-migration.spec.js` |
| Chiffrement | AES-GCM 256 bits | `tests/crypto-integrity.spec.js` |
| IV | 12 octets, tirés par `crypto.getRandomValues`, **un par chiffrement** | `C1` (500 tirages), `C2`, `C3`, `L13` |
| Données authentifiées (AAD) | `vault-entry:<version>:<id>` et `vault-validation:<version>` | `C8` à `C11` |
| Clé maître | `CryptoKey` **non extractible** | `C14` |
| Sel | 16 octets aléatoires, unique par coffre | `C13`, `C15`, `L4` |
| Intégrité | Toute altération du ciphertext, du tag, de l'IV ou de l'AAD fait échouer l'ouverture | `C4` à `C7` |
| Authenticité du coffre | Bloc de validation chiffré, vérifié pour son **contenu** | `L18`, `L19` |
| Aucune source aléatoire faible | `crypto.getRandomValues` exclusivement ; aucun `Math.random` pour du matériel de sécurité | `tests/security-no-plaintext.spec.js` |
| Aucun clair persisté | Ni mot de passe, ni clé, ni entrée déchiffrée dans IndexedDB, `localStorage`, `sessionStorage` ou un journal | `L2`, `L12`, `B14`, `B15` |
| Verrouillage automatique | Inactivité configurable ; onglet masqué | `tests/autolock-controller.spec.js` |
| Purge de session | Clé, sel, entrées déchiffrées, groupes de réutilisation, cache HIBP, rapport d'audit | `L14` à `L17`, `B12` |
| Import hostile | Validation structurelle **puis** cryptographique, limites de taille, refus des propriétés inattendues | `tests/vault-import-*.spec.js`, `B10` |
| CSP | Aucune directive `unsafe-inline`, aucune `unsafe-eval` | `index.html` |
| Dépendances | **Aucune** : `dependencies: null`, aucun CDN | `package.json` |

## 4. Limites — à lire avant de faire confiance

Ces limites sont réelles et assumées. Aucune n'est un défaut à corriger « plus
tard » : ce sont des propriétés du contexte d'exécution.

### 4.1 Le transport local n'est pas chiffré

Le serveur local sert le projet en **HTTP en clair** sur `127.0.0.1`. Il n'y a
**aucun TLS**. Ne décrivez jamais cet accès comme HTTPS. La confidentialité au
repos repose exclusivement sur le chiffrement applicatif AES-GCM.

### 4.2 La mémoire JavaScript ne peut pas être effacée de façon fiable

Les références sont abandonnées et les tampons d'octets remis à zéro quand le
langage le permet. Les **chaînes** JavaScript sont immuables : un mot de passe
maître saisi reste dans la mémoire du processus jusqu'à ce que le ramasse-miettes
décide d'agir, ce qu'aucun code ne peut forcer. Un vidage mémoire du processus
peut donc contenir des secrets.

### 4.3 Le navigateur est dans la base de confiance

Une extension malveillante, un profil compromis ou un système infecté ont accès
à la page et à son stockage. L'application ne peut pas s'en protéger, et ne
prétend pas le faire. Elle ne détecte pas les environnements compromis.

### 4.4 La suppression n'est pas un effacement sécurisé

La suppression volontaire (Lot 8) retire les enregistrements des surfaces que la
page contrôle : IndexedDB et `localStorage`. Elle ne peut rien sur les fichiers
que vous avez exportés vous-même, les sauvegardes système, une synchronisation
cloud, ni les blocs déjà libérés sur le disque.

### 4.5 Le presse-papiers échappe à la page

L'effacement après copie est une **tentative**. Le navigateur peut refuser la
lecture, l'onglet peut perdre le focus, un autre programme peut avoir déjà copié
le contenu. L'application distingue toujours « tenté » de « réussi ».

### 4.6 Il n'y a aucune protection contre les canaux auxiliaires

Aucune mesure n'est prise contre les attaques par temps d'exécution, par cache
ou par consommation. Web Crypto fournit ce qu'il fournit.

### 4.7 La perte du mot de passe maître est définitive

Il n'est stocké nulle part, sous aucune forme. Il n'existe ni récupération, ni
question de secours, ni porte dérobée. **Exportez votre coffre régulièrement.**

## 5. Hors périmètre

- Le navigateur, le système d'exploitation et leurs extensions.
- Les fichiers exportés par l'utilisateur, une fois sortis de l'application.
- Le partage entre appareils : il n'existe aucune synchronisation.
- L'authentification biométrique et WebAuthn : **non implémentées**
  (voir `docs/2FA-WEBAUTHN-AUTOFILL.md` pour le modèle de menace associé).

## 6. Ce que le projet s'interdit

Ces règles sont vérifiées par les tests, pas seulement écrites ici :

- jamais `innerHTML` avec une donnée venue d'un coffre, d'un CSV, d'un profil,
  d'un journal ou d'un fichier importé ;
- jamais de secret dans `localStorage`, `sessionStorage`, un journal ou un
  message d'erreur ;
- jamais `Math.random()` pour un sel, un IV, une clé ou un identifiant de
  sécurité ;
- jamais de réutilisation d'IV ;
- jamais un résultat de sécurité positif affiché par un contrôle qui n'a
  analysé aucune donnée ;
- jamais de message d'échec d'authentification révélant la cause
  cryptographique.

## 7. Documents liés

- [`THREAT_MODEL.md`](THREAT_MODEL.md) — modèle de menace détaillé
- [`docs/LANCEMENT-SECURISE.md`](docs/LANCEMENT-SECURISE.md) — lancement sous Windows
- [`docs/FORMATS-DE-COFFRE.md`](docs/FORMATS-DE-COFFRE.md) — formats v1 et v2
- [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md) — migrations et sauvegarde/restauration
- [`docs/FONCTIONS-IMPLEMENTEES.md`](docs/FONCTIONS-IMPLEMENTEES.md) — inventaire vérifié
- [`docs/2FA-WEBAUTHN-AUTOFILL.md`](docs/2FA-WEBAUTHN-AUTOFILL.md) — pourquoi 2FA et
  remplissage automatique restent désactivés
