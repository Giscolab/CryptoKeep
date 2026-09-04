# Fonctions prévues, envisagées, et écartées

> **Document de référence, priorité haute.** Créé au Lot 10.
>
> Rien de ce qui figure ici n'existe dans le code. C'est la contrepartie de
> `docs/FONCTIONS-IMPLEMENTEES.md` : ce qui est disponible est là-bas, ce qui
> est souhaité est ici. Aucune date n'est annoncée — le projet avance par lots,
> et une feuille de route datée s'est déjà révélée fausse (voir §4).

## 1. Prévues, avec un travail préparatoire déjà fait

| Fonction | Ce qui existe déjà | Ce qui manque |
|---|---|---|
| **Application desktop** | Décision documentée, critères posés | Tout. Voir [`DECISION-APPLICATION-DESKTOP.md`](DECISION-APPLICATION-DESKTOP.md) |
| **Double authentification (WebAuthn)** | Modèle de menace écrit, bascule présente et **désactivée** | Enregistrement d'authentificateur, stockage du descripteur, liaison à la clé maître. Voir [`2FA-WEBAUTHN-AUTOFILL.md`](2FA-WEBAUTHN-AUTOFILL.md) |
| **Remplissage automatique** | Modèle de menace écrit, bascule présente et **désactivée** | Une extension navigateur, hors du périmètre d'une page web. Voir le même document |

## 2. Envisagées, sans travail commencé

- **Étiquettes et collections** — au-delà des catégories déduites actuelles.
- **Export CSV** — l'import CSV existe, l'export n'existe pas.
- **Historique des mots de passe** par entrée.
- **Champs personnalisés** et pièces jointes chiffrées.
- **Verrouillage sur mise en veille du système** — aujourd'hui limité à
  l'inactivité dans l'onglet et au passage en arrière-plan.

## 3. Écartées, avec la raison

| Fonction | Pourquoi elle est écartée |
|---|---|
| Synchronisation cloud | Introduirait un serveur, un compte et une surface réseau permanente. Contredit la propriété centrale du projet. |
| Synchronisation P2P chiffrée de bout en bout | Même objection sur la surface réseau, avec en plus une complexité cryptographique que le projet ne peut pas auditer sérieusement. |
| Partage d'entrées entre utilisateurs | Suppose une identité et une distribution de clés : un autre projet. |
| Système de plugins | Exécuter du code tiers dans la page ruinerait la CSP et le modèle de confiance. |
| Installation PWA complète | Demanderait un service worker, donc un cache d'application. Le gain est faible face au risque de servir une version périmée du code cryptographique. Le manifeste existe pour l'icône et le nom, rien de plus. |

## 4. Sur l'ancienne feuille de route

Le `README.md` affichait un diagramme de Gantt « Roadmap Stratégique
2025-2026 » annonçant WebAuthn en Q3 2025, l'application desktop en août 2025,
le partage chiffré en Q4 2025 et une synchronisation P2P en 2026. Toutes ces
dates sont passées et **aucune** de ces fonctions n'a été implémentée.

Ce diagramme a été retiré du `README.md` au Lot 10 et remplacé par un renvoi
vers le présent document. Il est **conservé** dans l'historique Git et cité ici
pour mémoire, parce qu'une feuille de route fausse est plus trompeuse qu'une
absence de feuille de route.

Le projet n'annonce plus de dates. Il annonce des lots, livrés puis audités.
