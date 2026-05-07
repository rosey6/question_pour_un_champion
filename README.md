# Question pour un Champion

Jeu de quiz multijoueur en temps réel inspiré de l'émission télévisée française.

## Modes de jeu

| Mode | Description |
|------|-------------|
| **Solo / Local** | 1 à 4 joueurs sur le même appareil |
| **Classique en ligne** | Chaque joueur sur son propre appareil, avance automatiquement |
| **Hôte TV** | Écran principal pour l'audience, joueurs sur téléphone |

## Scénarios (choix automatique selon le nombre de joueurs)

| Joueurs | Scénario | Manches |
|---------|----------|---------|
| 1 | Entraînement | Entraînement |
| 2 | Face-à-face direct | Face-à-face (12 pts) |
| 3 | Quatre à la suite puis finale | Quatre à la suite → Face-à-face |
| 4+ | Format TV complet | Neuf points → Quatre à la suite → Face-à-face |

## Manches

### Entraînement
- 1 joueur, série de questions, stats finales.

### Neuf points gagnants
- Tous les joueurs actifs répondent.
- Points progressifs : 1, 2, 3 pts par cycle de 3 questions.
- Les 3 premiers à atteindre 9 points sont qualifiés.

### Quatre à la suite
- Mesure la meilleure série de bonnes réponses consécutives.
- Les 2 premiers sont qualifiés pour la finale.

### Face-à-face (Finale)
- Premier à 12 points.
- Points par rapidité : ≤8s = 4 pts, ≤14s = 3 pts, ≤18s = 2 pts, >18s = 1 pt.

## Technologies

- **Frontend** : HTML5, CSS3, JavaScript ES6, Socket.IO client, Chart.js
- **Backend** : Node.js, Express 4, Socket.IO 4, Zod (validation), rate-limiter-flexible
- **IA** : Groq API (génération de questions)
- **Déploiement** : Render (backend), Vercel/Netlify (frontend)

## Structure utile

- `backend/` : serveur, logique métier, stockage et données backend.
- `frontend/` : pages, scripts, styles, assets audio et données du mode local.
- `docs/` : architecture et liste des fonctionnalités.
- `tools/question-enrichment/` : scripts d'enrichissement/génération de questions.

## Installation

```bash
# Cloner le dépôt
git clone <url>

# Installer les dépendances backend
cd backend
npm install
```

## Lancement backend

```bash
cd backend
node server.js
# ou
npm start
```

Le serveur écoute sur le port 3000 (configurable via la variable `PORT`).

## Lancement frontend

Servir les fichiers statiques du dossier `frontend/` depuis n'importe quel serveur HTTP.  
Exemple rapide :

```bash
npx serve frontend
# ou VS Code Live Server
```

## Variables d'environnement

| Variable | Requis | Description |
|----------|--------|-------------|
| `PORT` | Non | Port du serveur (défaut : 3000) |
| `GROQ_API_KEY` | Pour l'IA | Clé API Groq pour générer les questions |
| `ALLOWED_ORIGINS` | Non | Origines CORS autorisées (virgule-séparées) |

## Déploiement

- **Backend** : déployé sur Render — `https://questionpourunchampion-backend.onrender.com`
- **Frontend** : déployé sur Vercel ou Netlify, pointer `BACKEND_URL` dans les scripts frontend.

## Démonstration (soutenance)

1. Ouvrir `frontend/multijoueur-creer.html` — créer une partie en mode Hôte TV.
2. Scanner le QR code avec 3-4 téléphones ou onglets.
3. Démarrer : le scénario est sélectionné automatiquement.
4. Jouer les trois manches jusqu'au champion.
5. Afficher le podium, le graphe et les stats finales.
