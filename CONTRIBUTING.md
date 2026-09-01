# 🤝 Contribuer au projet CryptoKeep

Ce projet est conçu pour un usage personnel ultra sécurisé, sans dépendance externe.

## 🛠 Règles
- Aucun ajout de dépendance externe (zéro CDN/lib)
- Tous les fichiers doivent respecter l’architecture actuelle
- Les fonctions sensibles doivent être testées (`/tests`)

## 📂 Modules
- `core/crypto/` : logique de chiffrement, workers
- `core/storage/` : IndexedDB, backup
- `core/vault/` : structure logique du coffre
- `security/` : protection runtime
- `ui/` : composants front-end
- `utils/` : outils auxiliaires

## ✅ Tests
Ajouter un fichier dans `/tests` si une fonction critique est modifiée.

Merci de respecter le design, la sécurité, et l'autonomie du projet.
