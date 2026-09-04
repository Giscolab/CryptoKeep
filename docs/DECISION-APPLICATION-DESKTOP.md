# Décision — application desktop

> **Document de décision.** Créé au Lot 10. Statut : **ouvert, non tranché.**
>
> Ce document ne décide rien à la place du mainteneur. Il pose le problème, les
> options et leurs conséquences, pour que la décision soit prise sur des faits
> plutôt que sur une ligne de feuille de route.

## 1. Pourquoi la question se pose

Le `README.md` annonçait « Application Desktop » pour août 2025. Rien n'a été
écrit. Ce n'est pas un retard : la question n'avait jamais été instruite.

Trois limites réelles de la version navigateur la motivent :

1. **Le profil peut disparaître.** Un nettoyage de profil, une réinstallation
   ou une politique d'entreprise effacent IndexedDB — donc le coffre. Le
   lanceur atténue le risque avec un profil dédié ; il ne le supprime pas.
2. **Le navigateur est dans la base de confiance.** Une extension a accès à la
   page et à son stockage. Une application native réduit cette surface.
3. **Le remplissage automatique est hors de portée d'une page web.** Il exige
   une extension ou une intégration système.

## 2. Ce qui ne doit pas changer

Quelle que soit l'option retenue :

- le format de coffre reste celui documenté dans
  [`FORMATS-DE-COFFRE.md`](FORMATS-DE-COFFRE.md), avec migration compatible ;
- aucune donnée ne quitte la machine ; aucun compte ; aucune synchronisation ;
- la clé maître reste non extractible et dérivée par PBKDF2-HMAC-SHA-512 ;
- la version navigateur **continue de fonctionner**. Une application desktop
  serait un ajout, jamais un remplacement.

## 3. Options

### Option A — Ne rien faire

Conserver la version navigateur, et retirer l'annonce du `README`. **Fait au
Lot 10.**

| Pour | Contre |
|---|---|
| Aucune dépendance, aucune surface nouvelle | Les trois limites du §1 demeurent |
| Le projet reste auditable en une lecture | Pas de remplissage automatique |

### Option B — Extension navigateur

| Pour | Contre |
|---|---|
| Rend le remplissage automatique possible | Ne résout ni la fragilité du profil ni la confiance dans le navigateur |
| Réutilise tout le code existant | Soumission à des magasins, révision, signature |
| Effort modéré | Les permissions d'une extension de mots de passe sont larges par nature |

### Option C — Application Tauri

| Pour | Contre |
|---|---|
| Réutilise l'interface web telle quelle | Ajoute Rust et une chaîne de compilation |
| Stockage sur le système de fichiers, hors profil navigateur | Web Crypto doit être remplacé ou reproduit côté natif |
| Binaire léger (quelques Mo) | Signature de code nécessaire pour éviter les alertes Windows |
| Peut fournir le remplissage automatique | Nouvelle surface : IPC entre la vue web et le noyau natif |

### Option D — Application Electron

| Pour | Contre |
|---|---|
| Chemin le plus court depuis le code existant | ~150 Mo par installation |
| Web Crypto disponible tel quel | Embarque Chromium : mises à jour de sécurité à suivre |
| Outillage mûr | Contredit frontalement la sobriété du projet |

## 4. Critères de décision proposés

Une option n'est retenue que si elle satisfait **tous** ces critères :

1. le coffre existant s'ouvre sans perte, par migration documentée ;
2. la clé maître reste non extractible dans l'implémentation retenue ;
3. aucune dépendance réseau à l'exécution ;
4. la chaîne de compilation est reproductible et vérifiable ;
5. la version navigateur continue de fonctionner sans régression ;
6. la suite de tests actuelle continue de passer intégralement.

Le critère 2 est le plus contraignant : hors navigateur, il faut un équivalent
crédible de `CryptoKey` non extractible, ou une justification honnête de ce qui
est perdu.

## 5. Ce qui reste à instruire avant de trancher

- Comment Tauri expose-t-il la cryptographie, et une clé non extractible y
  est-elle réellement atteignable ?
- Le remplissage automatique justifie-t-il à lui seul une extension, sachant
  l'étendue des permissions qu'elle réclame ?
- Le mainteneur souhaite-t-il assumer une signature de code et des
  publications ?

## 6. Statut

**Aucune option n'est retenue.** L'option A est l'état de fait actuel. Le
`README.md` n'annonce plus d'application desktop ; cette page est le seul
endroit où la question est suivie.
