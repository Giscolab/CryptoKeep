# Utiliser CryptoKeep

## Créer ou ouvrir un coffre

Sur un profil vierge, saisir un mot de passe maître et sélectionner **Créer**.
La politique de robustesse peut refuser un mot de passe insuffisant. Au
lancement suivant, déverrouiller le coffre avec le même mot de passe.
Il n'existe aucun mot de passe prédéfini ni procédure de récupération fournie
par le projet.

Si un coffre attendu n'apparaît pas, vérifier d'abord le canal et le profil
utilisés. Ne pas effacer le profil ni remplacer un coffre sans sauvegarde.

## Gérer les entrées

Depuis le coffre déverrouillé, ajouter ou modifier les identifiants, mots de
passe, URL et notes. Utiliser la recherche, les catégories et les tris pour
retrouver les entrées. Le générateur fournit des mots de passe dont la longueur
et certaines options se règlent dans les paramètres.

L'analyse locale relève la robustesse, la réutilisation et les informations
disponibles sur les entrées. Elle ne constitue ni une certification ni une
preuve qu'un mot de passe n'a jamais été compromis.

## Verrouillage et presse-papiers

Verrouiller ou se déconnecter lorsqu'on quitte l'application. Le verrouillage
automatique est configurable et peut réagir à l'inactivité ou au masquage de
la page selon les réglages. Il n'est pas une preuve de prise en charge de tous
les événements de veille ou de verrouillage Windows.

L'effacement conditionnel du presse-papiers dépend des permissions et du focus.
Il peut échouer et ne retire pas les copies déjà réalisées par d'autres programmes.

## Sauvegarder et importer

Dans **Paramètres → Exporter les données**, choisir **VAULT**, puis **Exporter**.
Le fichier `.vault` est chiffré et exige le mot de passe du coffre qui l'a produit.
Le conserver hors du profil local. CSV et JSON sont en clair après confirmation.
Voir [EXPORTS.md](EXPORTS.md).

L'import `.vault` remplace un coffre après validation et confirmation. L'interface
actuelle exige une session déverrouillée ; il n'existe pas de bouton de
restauration directe depuis le premier écran d'un profil vierge. Les modalités
et les restrictions desktop sont décrites dans [MIGRATIONS.md](MIGRATIONS.md).

## Fonctions absentes et suppression

La 2FA/WebAuthn et le remplissage automatique restent désactivés. Aucune
synchronisation entre appareils n'est disponible. HIBP est désactivé dans
l'application desktop ; dans le web, son activation exige un consentement.

La suppression volontaire du coffre dans les paramètres retire les données
applicatives prises en charge. Elle ne supprime ni les exports ni les sauvegardes
externes, et ne réalise pas un effacement sécurisé du disque.
