# 2FA, WebAuthn et remplissage automatique

## État actuel

Aucune de ces fonctions n'est implémentée. Les bascules correspondantes dans
`index.html` sont désactivées. Le générateur de mots de passe est une fonction
distincte, disponible ; il ne remplit pas les formulaires d'autres applications.

## Pourquoi une bascule ne suffit pas

Le coffre est local et sa clé est dérivée du mot de passe maître. Une seconde
vérification purement visuelle ne change pas la dérivation de clé et ne protège
pas un fichier chiffré copié hors de l'application.

Une intégration WebAuthn exigerait notamment une conception de la liaison à la
clé, de la récupération, de la compatibilité et de l'import/export. Aucun de ces
parcours n'est livré. Il ne faut donc pas annoncer une protection supplémentaire.

## Remplissage automatique

Une page locale ne dispose pas d'un accès général aux formulaires d'autres
sites. Le desktop n'expose pas non plus une telle intégration. Une extension
ou une intégration système serait un composant supplémentaire, avec ses propres
permissions et son modèle de menace.

Voir [les limites de sécurité](../SECURITY.md),
[le modèle de menace](../THREAT_MODEL.md) et
[les fonctions disponibles](FONCTIONS-IMPLEMENTEES.md).
