# Modules historiques conservés

> **Document de référence.** Créé au Lot 10.
>
> La règle du projet interdit toute suppression. Plusieurs modules ont été
> remplacés au fil des lots sans être retirés. Ce document dit, pour chacun,
> **pourquoi il est encore là** et **ce qui le remplace** — pour qu'un lecteur
> ne prenne jamais un module remplacé pour l'implémentation en vigueur.
>
> Tous ces fichiers sont couverts par `tests/syntax-all-files.spec.js`, même
> ceux qu'aucun module n'importe : une erreur de syntaxe y serait invisible
> jusqu'au jour où quelqu'un les rebranche. Le Lot 1 avait déjà trouvé un
> `security.js` invalide de cette façon.

## Légende des statuts

| Statut | Signification |
|---|---|
| **Remplacé, non chargé** | Aucun import, aucune balise. Conservé pour l'historique. |
| **Remplacé, encore importé** | Un appelant subsiste. À débrancher dans un lot ultérieur. |
| **Actif, complémentaire** | Ancien mais toujours utilisé, sans équivalent moderne. |

---

## 1. Cryptographie et stockage

| Fichier | Statut | Remplacé par | Lot |
|---|---|---|---|
| `scripts/crypto.js` | Remplacé, non chargé | `core/crypto/pbkdf2.js`, `core/crypto/aes-gcm.js` | 1 |
| `scripts/storage.js` | Remplacé, non chargé | `core/storage/manager.js` | 1 |
| `scripts/security.js` | Remplacé, non chargé — **brouillon** jamais fonctionnel | `security/` dans son ensemble | 1 |
| `scripts/core/storage/schema.js` | Remplacé, non chargé | `core/storage/vault-format.js` | 2 |
| `scripts/core/storage/backup.js` | Actif, complémentaire — s'appuie désormais sur le validateur strict | `core/storage/local-backup.js` pour l'écriture | 2 |

**Pourquoi `crypto.js` et `storage.js` sont dangereux à rebrancher** : ils
écrivent sans l'AAD du format v2 et sans la relecture canonique de vérification.
Un appel accidentel produirait un coffre que la version courante refuserait
d'ouvrir.

## 2. Audit de sécurité

| Fichier | Statut | Remplacé par | Lot |
|---|---|---|---|
| `scripts/security/audit.js` | Remplacé, encore importé | `security/audit-engine.js` | 6 |
| `scripts/security/security-dashboard-audit.js` | Remplacé, encore importé | `security/audit-engine.js` | 6, neutralisé au 7b |
| `scripts/ui/audit-panel.js` | Remplacé, non chargé | `ui/audit-report-view.js` | 6 |
| `scripts/security/password-reuse-groups.js` | Actif, complémentaire | `security/password-reuse.js` pour l'analyse en vigueur | 5 |

**`audit-panel.js`** ajoutait un bouton flottant ouvrant une fenêtre qui
**redemandait le mot de passe maître** pour lancer l'analyse, alors que la
session était déjà ouverte. C'est la raison de son débranchement : une
application ne doit pas habituer l'utilisateur à ressaisir son mot de passe
maître sans nécessité.

**`security-dashboard-audit.js`** s'appuie sur l'estimateur d'entropie naïf et
écrivait dans les conteneurs du rapport du Lot 6, écrasant le rapport véridique.
Au Lot 7b, une garde a été ajoutée dans `ui/security-dashboard.js` pour lui
interdire d'écrire dans ces conteneurs — vérifiée par les mutations M44 et N1.

**`password-reuse-groups.js`** est en revanche toujours correct. Il est conservé,
testé, et le scénario `R8` vérifie qu'il **désigne les mêmes entrées** que
`password-reuse.js` : un désaccord signalerait qu'il induit en erreur.

## 3. Interface

| Fichier | Statut | Remarque |
|---|---|---|
| `scripts/ui/security-report-init.js` | **Actif** — chargé directement par `index.html` | Seul module `.js` qu'aucun autre module n'importe, et c'est normal : c'est un point d'entrée |
| `scripts/security/memory.js` | Remplacé, non chargé | `zeroize` sur tampons d'octets. Voir `SECURITY.md` §4.2 sur ses limites réelles |

## 4. Lanceurs

| Fichier | Statut | Remarque |
|---|---|---|
| `start_vault_local.bat` | Actif, historique | Conservé et corrigé au Lot 1. `start_vault_secure.bat` est recommandé |
| `export_log.py` | Actif, sans interface | Appelé par le choix 3 du menu du lanceur |

## 5. Documentation

| Fichier | Statut | Remarque |
|---|---|---|
| `docs/index.html` + `docs/assets/` | **Site de documentation historique**, obsolète | Bundle compilé pointant vers `giscolab.github.io/vault-personal/`, alors que le dépôt est `Giscolab/CryptoKeep`. Voir `docs/SITE-HISTORIQUE.md` |
| `documentation-locale/` | Copie locale d'une fiche OWASP | Référence externe, non produite par le projet |
| `CHANGELOG.md` | Actif | Journal par lot |
| `THREAT_MODEL.md` | Actif | Complété par `SECURITY.md` |
| `docs/launcher.md` | Actif | Décisions techniques du lanceur ; `docs/LANCEMENT-SECURISE.md` couvre l'usage |

---

## Règle de conduite

Avant de rebrancher l'un de ces modules :

1. lire ce document et le lot qui l'a remplacé ;
2. vérifier que l'implémentation en vigueur ne couvre pas déjà le besoin ;
3. si le rebranchement est justifié, écrire d'abord le test qui prouve qu'il
   n'écrase pas le comportement courant.

Un module conservé n'est pas un module recommandé.
