# Architecture technique

## Vue d'ensemble

```
question_pour_un_champion/
├── backend/
│   ├── server.js              # Point d'entrée — Express + Socket.IO
│   ├── data/
│   │   └── questions.json     # Questions locales (fallback)
│   ├── package.json
│   ├── logique/
│   │   ├── jeu.js             # Calcul des scores et classements
│   │   ├── manches.js         # Machine d'état des manches
│   │   ├── scenarios.js       # Choix du scénario selon joueurs
│   │   └── questions.js       # Gestion et génération des questions
│   ├── tests/                 # Tests Vitest
│   └── stockage/
│       └── redis.js           # Persistance Redis (disponible, non activée)
└── frontend/
    ├── assets/audio/          # Sons du jeu
    ├── data/questions.json    # Questions du mode local
    ├── css/style.css          # Variables CSS globales
    ├── index.html             # Page d'accueil
    ├── multijoueur.html       # Menu multijoueur
    ├── multijoueur-creer.html # Création de partie
    ├── multijoueur-code.html  # Salle d'attente hôte (QR code)
    ├── multijoueur-rejoindre.html # Rejoindre une partie
    ├── multijoueur-jeu.html   # Écran de jeu
    └── spectate.html          # Vue spectateur TV
```

## Frontend

Le frontend est entièrement statique (pas de framework, modules ES natifs).  
Chaque page HTML est autonome et communique avec le backend via Socket.IO.

**Flux de navigation :**
```
index.html → multijoueur-creer.html → multijoueur-code.html → multijoueur-jeu.html
                                    ↘
              multijoueur-rejoindre.html → multijoueur-jeu.html
```

**État partagé :** `sessionStorage.multiGameData` transmet les tokens et la configuration entre pages.

## Backend

Le backend est un serveur Express unique avec Socket.IO.  
Tout l'état des parties est en mémoire (`parties{}` et `joueurs{}`).

**Cycle de vie d'une partie :**
```
waiting → playing → finished
```

**Hiérarchie des modules :**
```
server.js
  └─ logique/scenarios.js   (choix du scénario)
  └─ logique/manches.js     (machine d'état des manches)
  └─ logique/jeu.js         (calcul des scores)
  └─ logique/questions.js   (sélection / génération questions)
```

## Logique métier

### Séparation des concepts

| Concept | Fichier | Rôle |
|---------|---------|------|
| **Scénario** | `scenarios.js` | Parcours de compétition selon nombre de joueurs |
| **Manche** | `manches.js` | Étape interne avec ses règles propres |
| **Score général** | `partie.scores` | Classement global toute la partie |
| **Score de manche** | `manche.scoresManche` | Score propre à l'étape courante |

### Scénarios et manches

```
choisirScenario(mode, nombreJoueurs)
  → ENTRAINEMENT           → [ENTRAINEMENT]
  → FACE_A_FACE_DIRECT     → [FACE_A_FACE]
  → QUATRE_A_LA_SUITE_...  → [QUATRE_A_LA_SUITE, FACE_A_FACE]
  → FORMAT_TV_COMPLET      → [NEUF_POINTS, QUATRE_A_LA_SUITE, FACE_A_FACE]
```

### Machine d'état des manches

`appliquerResultatsManche(partie, resultats)` retourne `true` quand la manche se termine.  
Dans ce cas, `manches.js` met à jour `partie.manche` avec la manche suivante.  
`server.js` émet alors `manche-ended` + pause de 8s + `manche-started`.

### Calcul des scores (jeu.js)

- Bonnes réponses : points par rang [10, 8, 6, 5, 4, 3, 2, 1]
- Bonus série : +2 pts si 3 bonnes réponses consécutives
- Malus mauvaise réponse : -3 pts (plancher à 0)
- Score de manche (NEUF_POINTS) : 1/2/3 pts par cycle
- Score de manche (FACE_A_FACE) : 4/3/2/1 pts par rapidité

## Socket.IO

### Événements Client → Serveur

| Événement | Rôle |
|-----------|------|
| `create-game` | Créer une partie |
| `join-game` | Rejoindre une partie |
| `rejoin-as-host` | Reconnexion hôte |
| `rejoin-game` | Reconnexion joueur |
| `start-game` | Démarrer (hôte) |
| `submit-answer` | Soumettre une réponse |
| `next-question` | Question suivante (hôte) |
| `end-game` | Terminer (hôte) |
| `start-theme-vote` | Lancer le vote de thème |
| `vote-theme` | Voter pour un thème |
| `spectate-join` | Rejoindre en spectateur |

### Événements Serveur → Clients

| Événement | Rôle |
|-----------|------|
| `game-created` | Partie créée (tokens) |
| `join-success` | Joueur rejoint |
| `game-started` | Partie démarrée (scénario inclus) |
| `scenario-selected` | Scénario choisi (affiché 5s) |
| `manche-started` | Nouvelle manche commence |
| `manche-ended` | Manche terminée (qualifiés/éliminés) |
| `new-question` | Nouvelle question |
| `player-answered` | Compteur de réponses |
| `question-results` | Résultats d'une question |
| `game-finished` | Partie terminée |
| `theme-vote-started` | Vote de thème lancé |
| `theme-vote-update` | Mise à jour des votes |
| `theme-vote-result` | Résultat du vote |
| `questions-ready` | Questions IA générées |

## Données

### Structure `partie`

```javascript
{
  code, hostId, hostToken, hostName,
  mode: "classic" | "spectator",
  state: "waiting" | "playing" | "finished",
  scenario: "FORMAT_TV_COMPLET",        // nouveau
  settings: { maxPlayers, questionsCount, timePerQuestion, timePerAnswer },
  players: { [socketId]: { id, name, score, isHost, hasAnswered } },
  scores: { [socketId]: number },
  streaks: { [socketId]: number },
  manche: {
    nom: "NEUF_POINTS",
    titre: "Neuf points gagnants",
    numero: 1,
    joueursActifs: [socketId, ...],
    qualifies: [],
    elimines: [],
    scoresManche: { [socketId]: number },
    streaksManche: { [socketId]: number },
    objectif: 9,
    champion: null,
  },
  questions: [...],
  currentQuestionIndex: 0,
  currentQuestion: { question, options, correctAnswer, imageUrl },
  questionHistory: [...],
}
```

## Sécurité

- **CORS** : liste blanche d'origines
- **Helmet** : headers HTTP sécurisés
- **Zod** : validation de tous les payloads entrants
- **Rate limiting** : protection contre les abus par IP et par socket
- **Tokens** : 256 bits d'entropie, comparaison timing-safe
- **Hôte TV** : l'hôte est exclu des réponses (`isHost && mode === "spectator"`)
