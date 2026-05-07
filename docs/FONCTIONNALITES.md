# Fonctionnalités

## Fonctionnalités existantes (opérationnelles)

### Multijoueur en temps réel
- Création de partie avec code à 6 caractères
- QR code d'invitation pour rejoindre rapidement
- Reconnexion automatique après déconnexion (tokens de session)
- Support jusqu'à 12 joueurs simultanés
- Mode spectateur TV (hôte non-joueur)

### Jeu
- Questions à 4 choix avec mélange des options
- Chronomètre de question côté serveur
- Soumission de réponse avec horodatage précis
- Compteur de réponses en temps réel
- Feedback immédiat (correct / incorrect / temps écoulé)

### Scénarios (nouveau)
- Sélection automatique selon le nombre de joueurs
- Affichage du scénario au démarrage de la partie
- 4 scénarios : Entraînement, Face-à-face, Quatre à la suite, Format TV

### Manches
- **Neuf points gagnants** : 1/2/3 pts par cycle, qualification à 9 pts
- **Quatre à la suite** : séries de bonnes réponses consécutives, objectif = 4
- **Face-à-face** : points par rapidité (4/3/2/1 pts), objectif = 12 pts
- **Entraînement** : mode solo sans élimination
- Transitions annoncées avec overlay (qualifiés / éliminés)
- Pause de 8 secondes entre manches

### Scores
- Points par rang de rapidité [10, 8, 6, 5, 4, 3, 2, 1]
- Bonus série (+2 pts après 3 bonnes réponses consécutives)
- Malus mauvaise réponse (-3 pts, plancher à 0)
- Classement mis à jour en temps réel

### Résultats finaux
- Podium top 3 animé (ordre 2-1-3)
- Graphe d'évolution des scores (Chart.js)
- Bannière champion
- Stat cards : meilleure série, joueur le plus rapide

### Questions IA
- Génération via Groq API (thème libre)
- Vote du thème entre 3 options tirées aléatoirement (timer 20s)
- Barres de progression du vote en temps réel

### Sécurité
- Validation Zod de tous les payloads Socket.IO
- Rate limiting par IP et par socket
- Tokens de session 256 bits (timing-safe)
- Headers HTTP sécurisés (Helmet)

## Fonctionnalités avancées

### Mode Hôte TV
- Écran principal sans interaction (lecture seule)
- L'hôte ne compte pas comme candidat
- Les joueurs répondent depuis leurs téléphones
- Affichage synchronisé des questions, scores, manches

### Reconnexion
- L'hôte peut recharger la page et reprendre le contrôle
- Un joueur peut revenir en cours de partie avec son token
- Les scores sont conservés en mémoire

### Questions enrichies
- Images Wikimedia pour illustrer les réponses
- Description textuelle optionnelle

## Fonctionnalités à venir (structure prête)

### Persistance
- Module Redis disponible (`backend/stockage/redis.js`)
- Activation nécessite la variable `REDIS_URL`
- Historique des parties et statistiques : à implémenter

### Mode Solo / Local
- La logique de scénario est définie côté serveur
- Une interface dédiée locale (sans Socket.IO) peut être créée
- Les règles des manches peuvent être réutilisées côté client

### Statistiques joueur
- Historique personnel des parties
- Tableau des scores cumulés
- Classement général : nécessite une base de données

## Gestion des égalités (Quatre à la suite)

En cas d'égalité pour la qualification en Quatre à la suite :
1. Le joueur avec le meilleur score général l'emporte.
2. Si égalité parfaite, le joueur ayant répondu correctement en dernier est retenu.

Ce choix est documenté dans `manches.js` via la fonction `obtenirQualificationCible`.
