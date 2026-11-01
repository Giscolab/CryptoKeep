# Modules legacy et maintenance

Le dépôt conserve plusieurs implémentations antérieures. Un fichier présent
n'est pas nécessairement une entrée active ; vérifier ses imports et ses
balises de chargement avant de l'utiliser ou de le supprimer. Cette liste
documente une dette de maintenance, pas des fonctionnalités supplémentaires.

| Modules | Implémentation à consulter pour le comportement courant |
|---|---|
| `scripts/crypto.js` | `scripts/core/crypto/pbkdf2.js`, `scripts/core/crypto/aes-gcm.js` |
| `scripts/storage.js` | `scripts/core/storage/manager.js` |
| `scripts/security.js` | Modules de `scripts/security/` appelés par l'entrée actuelle |
| `scripts/core/storage/schema.js` | `scripts/core/storage/vault-format.js` |
| `scripts/security/audit.js`, `scripts/security/security-dashboard-audit.js` | `scripts/security/audit-engine.js` pour le rapport courant ; des appelants historiques subsistent |
| `scripts/ui/audit-panel.js` | `scripts/ui/audit-report-view.js` pour le rapport courant |
| `scripts/security/memory.js` | Nettoyage effectif des tampons et de la session dans les chemins actifs |

`scripts/core/storage/backup.js` et certains anciens helpers restent des
interfaces de compatibilité : leur nom ou leur ancienneté ne justifient pas
un retrait automatique. `scripts/ui/security-report-init.js` constitue un
point d'entrée web direct, même s'il n'est pas importé par un autre module.
`start_vault_local.bat` reste un lanceur web historique ; il n'est pas le
programme Windows Tauri. `export_log.py` reste un outil de diagnostic local.

Avant de rebrancher une ancienne implémentation, vérifier le format v2, l'AAD,
les écritures atomiques et les invariants de session. Les modules source et les
tests ne sont pas retirés par un simple nettoyage documentaire. L'historique
des anciennes présentations est conservé dans Git ; il n'a pas à être reproduit
dans la documentation utilisateur actuelle.
