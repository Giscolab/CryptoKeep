# 2FA, WebAuthn et remplissage automatique — analyse préalable

**Statut : aucune de ces trois fonctions n'est implémentée.** Ce document
explique pourquoi, ce qu'il faudrait pour les implémenter honnêtement, et ce
qui a été fait à la place. Il est référencé depuis le panneau des réglages.

## 1. Pourquoi ce document existe

Le panneau des réglages proposait trois bascules :

| Bascule | État livré | Effet réel |
|---|---|---|
| Activer la 2FA | décochée | **aucun** |
| Services de remplissage automatique | **cochée** | **aucun** |
| Générateur de mots de passe avancé | **cochée** | **aucun** |

Ces bascules n'avaient ni identifiant HTML ni gestionnaire. Les activer ne
déclenchait rien. Deux d'entre elles étaient présentées comme **déjà actives**.

Une protection annoncée mais absente est plus dangereuse que son absence :
l'utilisateur ajuste son comportement à une sécurité qui n'existe pas. C'est
la raison pour laquelle ces contrôles ne sont pas simplement « à implémenter
plus tard » mais devaient être corrigés immédiatement, dans un sens ou dans
l'autre.

## 2. Modèle de menace applicable

CryptoKeep est une application **locale**, sans serveur, sans compte
distant. Le coffre est chiffré par une clé dérivée du mot de passe maître
(PBKDF2-HMAC-SHA-512, 220 000 itérations) et stocké dans IndexedDB.

Cette architecture détermine ce qu'un second facteur peut, ou ne peut pas,
apporter.

### 2.1 Attaquants considérés

| # | Attaquant | Capacité | Le second facteur aide-t-il ? |
|---|---|---|---|
| A1 | Accès physique à la machine, session ouverte | lit IndexedDB, lit le DOM | Non — voir 2.2 |
| A2 | Vol du fichier de coffre exporté | attaque hors ligne sur le `.vault` | **Seulement** si le facteur entre dans la dérivation de clé |
| A3 | Code malveillant dans la page (XSS) | exécute du JavaScript dans l'origine | Non — il agit après le déverrouillage |
| A4 | Extension de navigateur hostile | lit le DOM, le presse-papiers | Non |
| A5 | Observateur réseau | voit le trafic sortant | Sans objet : aucune donnée de coffre ne sort |

### 2.2 Ce qu'une 2FA « interface » n'apporte pas

Un second facteur vérifié **en JavaScript, côté client, après le
déchiffrement** est contournable par construction : il suffit d'ignorer le
contrôle et de lire directement IndexedDB, ou de dériver la clé depuis le mot
de passe maître. Aucune ligne de code de la page ne peut empêcher cela, parce
que l'attaquant contrôle l'exécution.

Autrement dit : contre A1, A3 et A4, une case à cocher est **décorative**.
Contre A2 elle est **inutile**, puisque le fichier volé se déchiffre sans
jamais passer par l'interface.

**Conclusion** : implémenter une 2FA qui ne participe pas à la dérivation de
la clé reviendrait à simuler une sécurité inexistante. C'est explicitement
exclu.

## 3. La seule 2FA qui aurait un sens ici

Un second facteur n'est utile que s'il devient **nécessaire au déchiffrement**.
Deux voies techniquement viables :

### 3.1 WebAuthn avec l'extension `prf`

L'extension `prf` (pseudo-random function) permet à un authentificateur
matériel de produire un secret stable et reproductible, lié à la clé physique.
Ce secret pourrait être combiné au mot de passe maître avant PBKDF2 :

```
clé_maître = PBKDF2(mot_de_passe ‖ secret_prf, sel, 220000)
```

Le coffre devient alors indéchiffrable sans la clé physique — y compris hors
ligne, donc y compris contre A2.

**Ce que cela impose, et qui n'est pas négociable :**

1. **Une migration du format de coffre.** Le bloc de validation et toutes les
   entrées doivent être rechiffrés sous la nouvelle clé. La mécanique existe
   (Lot 4, `master-password-change.js`) mais devrait être étendue.
2. **Un chemin de secours obligatoire.** Une clé physique se perd, se casse,
   est oubliée en voyage. Sans code de récupération, la perte de la clé
   signifie la **perte définitive du coffre**. Concevoir ce chemin sans
   rouvrir une porte dérobée est le vrai travail.
3. **Le support de `prf` n'est pas universel.** Il dépend du navigateur *et*
   de l'authentificateur. Un repli doit être prévu, et ne doit pas
   silencieusement dégrader la sécurité.
4. **Le format versionné doit distinguer les deux modes**, faute de quoi un
   coffre protégé par clé serait lisible en mode simple.

### 3.2 Un second facteur dérivé (TOTP) — écarté

Un code TOTP suppose un secret partagé stocké… dans l'application. Un
attaquant qui lit le coffre lit aussi ce secret. Cette voie n'apporte rien
contre les attaquants listés et n'est pas retenue.

## 4. Remplissage automatique

Une page web **ne peut pas** écrire dans les formulaires d'un autre site :
c'est la politique d'origine, et c'est une protection, pas une limitation à
contourner. Un remplissage automatique exigerait une **extension de
navigateur** distincte, avec :

- son propre canal de communication vers le coffre ;
- sa propre surface d'attaque (A4 devient un attaquant de premier plan) ;
- un modèle d'appariement d'URL résistant aux homographes et aux
  sous-domaines hostiles ;
- une distribution et une signature par un magasin d'extensions.

C'est un projet à part entière, pas un réglage. **Aucune extension ne sera
installée ou activée automatiquement.**

## 5. Ce qui a été fait à la place (Lot 7)

- Les bascules 2FA et remplissage automatique sont **conservées, visibles,
  désactivées** (`disabled`), avec le libellé « Non disponible » et un lien
  vers ce document. Elles ne peuvent plus être cochées.
- La bascule « générateur avancé », qui ne désignait rien de précis, est
  remplacée par les **réglages réels du générateur** — longueur, chiffres,
  symboles — appliqués à chaque génération.
- Aucune fonction réseau ni extension n'est activée automatiquement. La seule
  fonction réseau de l'application, la vérification de compromission, reste
  désactivée par défaut et exige un consentement explicite.

## 6. Critères pour lever le statut « non disponible »

La bascule 2FA ne sera activée que lorsque **tous** ces points seront tenus :

- [ ] dérivation de clé intégrant le secret `prf`, versionnée dans le format ;
- [ ] migration atomique et vérifiée, avec restauration en cas d'échec ;
- [ ] chemin de récupération documenté, testé, sans porte dérobée ;
- [ ] détection du support et repli explicite, jamais silencieux ;
- [ ] tests couvrant : inscription, déverrouillage, perte de la clé,
      récupération, refus de l'authentificateur, migration interrompue ;
- [ ] mise à jour de ce document et de `THREAT_MODEL.md`.

Tant qu'un seul de ces points manque, le contrôle reste désactivé.
