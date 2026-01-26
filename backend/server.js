const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
// Groq API (gratuit) - pas besoin de SDK, on utilise fetch

const app = express();
const server = http.createServer(app);

// ============================================
// CORS / ORIGINS
// ============================================
// But: permettre la migration du frontend (ex: Cloudflare Workers) sans casser Socket.IO.
// - Si ALLOWED_ORIGINS est défini (liste séparée par des virgules), on applique cette allow-list.
// - Sinon, on garde une liste raisonnable par défaut (Vercel historique + localhost + Workers).
function getAllowedOrigins() {
  const raw = (process.env.ALLOWED_ORIGINS || "").trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [
    "https://question-pour-un-champion-murex.vercel.app",
    "https://question-pour-un-championv2.bambaa148.workers.dev",
    "http://localhost:3000",
    "http://localhost:5173",
  ];
}

const allowedOrigins = getAllowedOrigins();

// Configuration Socket.io
const io = socketIo(server, {
  cors: {
    // Autoriser uniquement les origines listées.
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

// Middleware
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  })
);
app.use(express.json());

// Route de santé pour Render
app.get("/health", (req, res) => {
  res.json({
    status: "online",
    service: "Question pour un Champion - Serveur Multijoueur",
    timestamp: new Date().toISOString(),
    activeGames: Object.keys(games).length,
    activePlayers: Object.keys(players).length,
  });
});

app.get("/", (req, res) => {
  res.json({
    message: "Bienvenue sur Question pour un Champion - Serveur Multijoueur",
    endpoints: {
      health: "/health",
      stats: "/stats",
      websocket: "ws://" + req.get("host") + "/socket.io/",
    },
  });
});

app.get("/stats", (req, res) => {
  res.json({
    totalGames: Object.keys(games).length,
    totalPlayers: Object.keys(players).length,
    uptime: process.uptime(),
  });
});

// ============================================
// GÉNÉRATION DE QUESTIONS VIA IA (Groq API - GRATUIT)
// ============================================

// Groq est gratuit ! Créer un compte sur https://console.groq.com
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Thèmes prédéfinis
const THEMES_PREDEFINIS = [
  "Histoire",
  "Géographie",
  "Sciences",
  "Littérature",
  "Cinéma",
  "Sport",
  "Musique",
  "Gastronomie"
];

// Fonction pour générer le prompt
function generateQuestionsPrompt(theme, count) {
  return `Génère exactement ${count} questions de quiz de culture générale sur le thème "${theme}".

IMPORTANT: Ta réponse doit être UNIQUEMENT un tableau JSON valide, sans aucun texte avant ou après.

Format JSON requis:
[
  {
    "question": "La question complète en français avec un point d'interrogation",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "reponseCorrecte": "La bonne réponse (doit être exactement une des 4 options)"
  }
]

Règles strictes:
- Exactement ${count} questions
- Questions en français
- Chaque question a exactement 4 options
- Une seule réponse correcte par question
- La reponseCorrecte doit correspondre EXACTEMENT à une des options
- Difficulté variée (facile, moyen, difficile)
- Questions factuelles avec des réponses vérifiables
- Évite les questions trop obscures ou controversées

Génère maintenant les ${count} questions sur "${theme}":`;
}

// Fonction pour extraire les mots-clés pour Wikidata
function buildSearchQuery(question, answer) {
  const q = String(question || "").toLowerCase();
  const a = String(answer || "").trim();
  const tags = [];

  if (q.includes("capitale")) tags.push("capitale");
  if (q.includes("pays")) tags.push("pays");
  if (q.includes("océan") || q.includes("ocean")) tags.push("océan");
  if (q.includes("fleuve") || q.includes("rivière")) tags.push("fleuve");
  if (q.includes("planète") || q.includes("planete")) tags.push("planète");
  if (q.includes("symbole chimique")) tags.push("élément chimique symbole");
  if (q.includes("élément chimique")) tags.push("élément chimique");
  if (q.includes("monnaie")) tags.push("monnaie");
  if (q.includes("langue")) tags.push("langue");
  if (q.includes("désert")) tags.push("désert");
  if (q.includes("monument")) tags.push("monument");

  // Si c'est une année, inclure le contexte
  if (/^\d{3,4}$/.test(a)) {
    return `${question} ${a}`.trim();
  }

  const extra = tags.length ? " " + tags.join(" ") : "";
  return (a + extra).trim();
}

// Fonction pour chercher sur Wikidata
async function searchWikidata(query) {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=fr&uselang=fr&format=json&limit=5&origin=*`;
    const response = await fetch(url, {
      headers: { "User-Agent": "qpu-champion-backend/1.0" }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.search?.[0] || null;
  } catch {
    return null;
  }
}

// Fonction pour obtenir l'image depuis Wikidata
async function getWikidataImage(entityId) {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&props=claims&format=json&origin=*`;
    const response = await fetch(url, {
      headers: { "User-Agent": "qpu-champion-backend/1.0" }
    });
    if (!response.ok) return null;
    const data = await response.json();
    const entity = data.entities?.[entityId];
    if (!entity) return null;

    // Chercher les propriétés d'image
    const imageProps = ["P18", "P41", "P154", "P94", "P242"];
    for (const prop of imageProps) {
      const claim = entity.claims?.[prop]?.[0];
      const fileName = claim?.mainsnak?.datavalue?.value;
      if (fileName) {
        return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=900`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Fonction pour créer un placeholder SVG
function makePlaceholder(answer) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#72DDF7"/>
      <stop offset="35%" stop-color="#8093F1"/>
      <stop offset="70%" stop-color="#B388EB"/>
      <stop offset="100%" stop-color="#F7AEF8"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="64" fill="#111">
    ${String(answer).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
  </text>
</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

// Fonction pour enrichir une question
async function enrichQuestion(questionObj) {
  const question = questionObj.question || "";
  const answer = questionObj.reponseCorrecte || "";
  const query = buildSearchQuery(question, answer);

  try {
    const entity = await searchWikidata(query);
    if (entity?.id) {
      const imageUrl = await getWikidataImage(entity.id);
      return {
        ...questionObj,
        wikidataId: entity.id,
        wikidataLabel: entity.label,
        illustrationTexte: entity.description
          ? `${answer} — ${entity.description}`.slice(0, 140)
          : answer,
        imageUrl: imageUrl || makePlaceholder(answer)
      };
    }
  } catch (e) {
    console.log("Erreur enrichissement:", e.message);
  }

  // Fallback: placeholder
  return {
    ...questionObj,
    wikidataId: null,
    wikidataLabel: null,
    illustrationTexte: answer,
    imageUrl: makePlaceholder(answer)
  };
}

// Endpoint POST /api/generate-questions
app.post("/api/generate-questions", async (req, res) => {
  const { theme, count = 10 } = req.body;

  if (!theme) {
    return res.status(400).json({
      success: false,
      error: "Le thème est requis"
    });
  }

  if (!GROQ_API_KEY) {
    return res.status(500).json({
      success: false,
      error: "La clé API Groq n'est pas configurée. Créez un compte gratuit sur https://console.groq.com"
    });
  }

  const questionCount = Math.min(Math.max(1, parseInt(count) || 10), 30);

  try {
    console.log(`Génération de ${questionCount} questions sur "${theme}" via Groq...`);

    // Appel à l'API Groq (gratuit, compatible OpenAI)
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", // Modèle gratuit et puissant
        messages: [
          {
            role: "user",
            content: generateQuestionsPrompt(theme, questionCount)
          }
        ],
        max_tokens: 4096,
        temperature: 0.7
      })
    });

    if (!groqResponse.ok) {
      const errorData = await groqResponse.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Erreur Groq: ${groqResponse.status}`);
    }

    const groqData = await groqResponse.json();
    let responseText = groqData.choices?.[0]?.message?.content?.trim() || "";

    if (!responseText) {
      throw new Error("Réponse vide de Groq");
    }

    // Nettoyer les backticks markdown si présents
    if (responseText.startsWith("```")) {
      const lines = responseText.split("\n");
      const jsonLines = [];
      let inJson = false;
      for (const line of lines) {
        if (line.startsWith("```") && !inJson) {
          inJson = true;
          continue;
        } else if (line.startsWith("```") && inJson) {
          break;
        } else if (inJson) {
          jsonLines.push(line);
        }
      }
      responseText = jsonLines.join("\n");
    }

    const questions = JSON.parse(responseText);

    if (!Array.isArray(questions)) {
      throw new Error("La réponse n'est pas un tableau JSON");
    }

    // Valider et corriger les questions
    for (const q of questions) {
      if (!q.question || !q.options || !q.reponseCorrecte) {
        throw new Error("Question mal formatée");
      }
      if (q.options.length !== 4) {
        throw new Error("Chaque question doit avoir 4 options");
      }
      if (!q.options.includes(q.reponseCorrecte)) {
        q.reponseCorrecte = q.options[0];
      }
    }

    console.log(`✓ ${questions.length} questions générées, enrichissement...`);

    // Enrichir les questions (en parallèle, max 3 à la fois)
    const enrichedQuestions = [];
    for (let i = 0; i < questions.length; i += 3) {
      const batch = questions.slice(i, i + 3);
      const enrichedBatch = await Promise.all(batch.map(enrichQuestion));
      enrichedQuestions.push(...enrichedBatch);
      // Petit délai pour éviter le rate limiting Wikidata
      if (i + 3 < questions.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`✓ Questions enrichies avec succès`);

    res.json({
      success: true,
      theme,
      count: enrichedQuestions.length,
      questions: enrichedQuestions
    });

  } catch (error) {
    console.error("Erreur génération questions:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Erreur lors de la génération des questions"
    });
  }
});

// Endpoint GET /api/themes (liste des thèmes prédéfinis)
app.get("/api/themes", (req, res) => {
  res.json({
    themes: THEMES_PREDEFINIS
  });
});

// ============================================
// CHARGEMENT DES QUESTIONS (Optionnel - backup)
// ============================================

let allQuestions = [];

function loadQuestions() {
  try {
    const questionsPath = path.join(__dirname, "questions.json");
    if (fs.existsSync(questionsPath)) {
      const data = fs.readFileSync(questionsPath, "utf8");
      allQuestions = JSON.parse(data);
      console.log(
        `✅ ${allQuestions.length} questions chargées depuis questions.json`
      );
    } else {
      console.log("ℹ️ Aucun fichier questions.json trouvé dans le backend");
      allQuestions = [];
    }
  } catch (error) {
    console.error("❌ Erreur de chargement des questions:", error);
    allQuestions = [];
  }
}

// Charger les questions au démarrage
loadQuestions();

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function generateGameCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getRandomQuestions(count) {
  if (count <= 0 || allQuestions.length === 0) {
    // Questions par défaut si aucune disponible
    return [
      {
        question: "Quelle est la capitale de la France ?",
        options: ["Paris", "Londres", "Berlin", "Madrid"],
        reponseCorrecte: "Paris",
      },
      {
        question: "Quel est le plus grand océan du monde ?",
        options: ["Atlantique", "Indien", "Pacifique", "Arctique"],
        reponseCorrecte: "Pacifique",
      },
    ].slice(0, Math.min(count, 2));
  }

  if (count > allQuestions.length) {
    count = allQuestions.length;
  }

  // Créer une copie mélangée
  const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);

  // Retourner le nombre demandé
  return shuffled.slice(0, count);
}

// ============================================
// STOCKAGE DES PARTIES
// ============================================

const games = {};
const players = {};

// Nettoyage défensif des timers (buzzer/answer) par partie
function clearGameTimers(game) {
  if (!game) return;
  if (game._buzzerTimer) {
    clearTimeout(game._buzzerTimer);
    game._buzzerTimer = null;
  }
  if (game._answerTimer) {
    clearTimeout(game._answerTimer);
    game._answerTimer = null;
  }
}

// ============================================
// GESTION SOCKET.IO
// ============================================

io.on("connection", (socket) => {
  console.log("Nouveau joueur connecté:", socket.id);

  // Normalise les paramètres envoyés par le frontend (plusieurs noms possibles selon les versions)
  function normalizeSettings(raw = {}) {
    const maxPlayers = Number(raw.maxPlayers ?? raw.playersCount ?? raw.nombreJoueurs ?? 4);
    const questionsCount = Number(raw.questionsCount ?? raw.nombreQuestions ?? 10);
    const timePerQuestion = Number(raw.timePerQuestion ?? raw.dureeQuestion ?? 30);
    const timePerAnswer = Number(raw.timePerAnswer ?? raw.dureeReponse ?? 15);
    return {
      maxPlayers: Number.isFinite(maxPlayers) && maxPlayers > 0 ? maxPlayers : 4,
      questionsCount: Number.isFinite(questionsCount) ? questionsCount : 10,
      timePerQuestion: Number.isFinite(timePerQuestion) ? timePerQuestion : 30,
      timePerAnswer: Number.isFinite(timePerAnswer) ? timePerAnswer : 15,
    };
  }

  // Démarre une partie (sans concept d'hôte : n'importe quel joueur peut déclencher, et on démarre aussi automatiquement quand la salle est pleine)
  function startGameInternal(gameCode, rawSettings = null) {
    const game = games[gameCode];
    if (!game || game.state !== "waiting") return;

    const normalizedSettings = normalizeSettings(rawSettings || game.settings || {});
    game.settings = normalizedSettings;

    // Utiliser les questions IA si fournies, sinon questions locales
    if (game.providedQuestions && game.providedQuestions.length > 0) {
      game.questions = game.providedQuestions.slice(0, normalizedSettings.questionsCount);
      console.log(`Partie ${gameCode}: utilisation de ${game.questions.length} questions IA`);
    } else {
      game.questions = getRandomQuestions(normalizedSettings.questionsCount);
      console.log(`Partie ${gameCode}: utilisation de ${game.questions.length} questions locales`);
    }
    game.currentQuestionIndex = 0;
    game.state = "playing";
    game.buzzerActive = true;
    game.buzzerWinner = null;

    // Reset réponses/score structure
    Object.keys(game.players).forEach((pid) => {
      game.players[pid].hasAnswered = false;
      if (typeof game.scores[pid] !== "number") game.scores[pid] = 0;
    });

    io.to(gameCode).emit("game-started", {
      gameCode: gameCode,
      mode: game.mode || "spectator", // Inclure le mode
      settings: game.settings,
      players: Object.values(game.players).map((p) => ({
        id: p.id,
        name: p.name,
        score: game.scores[p.id] ?? 0,
        isHost: p.isHost || false,
      })),
    });

    // Lancer première question
    sendQuestionToAll(gameCode);
  }

  // Créer une partie
  socket.on("create-game", ({ playerName, settings, mode, questions }) => {
    const gameCode = generateGameCode();

    const normalizedSettings = normalizeSettings(settings || {});
    const gameMode = mode || "spectator"; // "spectator" ou "classic"

    // Si des questions IA sont fournies, les stocker
    const providedQuestions = Array.isArray(questions) ? questions : null;

    games[gameCode] = {
      code: gameCode,
      // compat : conservé pour l'UI (affiche le créateur), mais aucun privilège spécial côté serveur
      hostId: socket.id,
      hostName: playerName,
      mode: gameMode, // Mode de jeu
      players: {},
      state: "waiting",
      settings: normalizedSettings,
      currentQuestionIndex: 0,
      questions: [], // Sera rempli au démarrage
      providedQuestions: providedQuestions, // Questions IA fournies par le client
      scores: {},
      buzzerActive: false,
      buzzerWinner: null,
      createdAt: Date.now(),
    };

    if (providedQuestions) {
      console.log(`Partie ${gameCode}: ${providedQuestions.length} questions IA fournies`);
    }

    // Le créateur est un joueur comme les autres (surtout en mode classic)
    players[socket.id] = {
      id: socket.id,
      gameCode: gameCode,
      name: playerName,
      score: 0,
      isHost: gameMode === "spectator", // En mode spectator, le créateur est hôte, en classic il est joueur
      hasAnswered: false,
    };

    games[gameCode].players[socket.id] = players[socket.id];
    games[gameCode].scores[socket.id] = 0;

    socket.join(gameCode);

    socket.emit("game-created", {
      success: true,
      gameCode: gameCode,
      mode: gameMode,
      message: "Partie créée avec succès",
    });

    console.log(`Partie créée: ${gameCode} par ${playerName} (mode: ${gameMode})`);
  });

  // Rejoindre en tant qu'hôte (reconnexion après navigation)
  socket.on("rejoin-as-host", ({ gameCode, playerName }) => {
    const game = games[gameCode];

    if (!game) {
      socket.emit("rejoin-error", { message: "Partie introuvable" });
      return;
    }

    // Trouver l'ancien socket de l'hôte et le remplacer
    const oldHostId = game.hostId;

    // Mettre à jour l'hôte avec le nouveau socket
    game.hostId = socket.id;

    // Annuler le timer de suppression si l'hôte se reconnecte
    delete game.hostDisconnectedAt;

    // Transférer ou recréer le joueur hôte
    if (oldHostId && game.players[oldHostId]) {
      // Copier les données de l'ancien socket vers le nouveau
      const oldPlayerData = game.players[oldHostId];
      players[socket.id] = {
        id: socket.id,
        gameCode: gameCode,
        name: playerName || oldPlayerData.name,
        score: oldPlayerData.score || 0,
        isHost: true,
        hasAnswered: oldPlayerData.hasAnswered || false,
      };
      game.players[socket.id] = players[socket.id];
      game.scores[socket.id] = oldPlayerData.score || 0;

      // Supprimer l'ancien
      delete game.players[oldHostId];
      delete game.scores[oldHostId];
      delete players[oldHostId];
    } else {
      // Créer le joueur hôte s'il n'existait pas
      players[socket.id] = {
        id: socket.id,
        gameCode: gameCode,
        name: playerName,
        score: 0,
        isHost: true,
        hasAnswered: false,
      };
      game.players[socket.id] = players[socket.id];
      game.scores[socket.id] = 0;
    }

    socket.join(gameCode);

    socket.emit("rejoin-success", {
      gameCode: gameCode,
      hostName: game.hostName,
      mode: game.mode || "spectator",
      players: Object.values(game.players).map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score || 0,
        isHost: p.isHost || false,
      })),
      settings: game.settings,
    });

    // Si le jeu est en cours et qu'il y a une question active, l'envoyer à l'hôte qui rejoint
    if (game.state === "playing" && game.currentQuestion) {
      const shuffledOptions = shuffleArray([...game.currentQuestion.options]);
      socket.emit("new-question", {
        question: game.currentQuestion.question,
        options: shuffledOptions,
        correctAnswer: game.currentQuestion.correctAnswer,
        timeLimit: game.settings.timePerQuestion * 1000,
        questionNumber: game.currentQuestionIndex + 1,
        totalQuestions: game.questions.length,
        imageUrl: game.currentQuestion.imageUrl || null,
        illustrationTexte: game.currentQuestion.illustrationTexte || null,
      });
    }

    console.log(`Hôte ${playerName} reconnecté à la partie ${gameCode}`);
  });

  // Rejoindre une partie
  socket.on("join-game", ({ gameCode, playerName }) => {
    const game = games[gameCode];

    if (!game) {
      socket.emit("join-error", { message: "Code de partie invalide" });
      return;
    }

    if (game.state !== "waiting") {
      socket.emit("join-error", { message: "La partie a déjà commencé" });
      return;
    }

    const maxPlayers = Number(game.settings?.maxPlayers ?? 4);
    if (Object.keys(game.players).length >= maxPlayers) {
      socket.emit("join-error", {
        message: `La partie est complète (max ${maxPlayers} joueurs)`,
      });
      return;
    }

    // Vérifier nom unique
    const existingPlayer = Object.values(game.players).find(
      (p) => p.name.toLowerCase() === playerName.toLowerCase()
    );

    if (existingPlayer) {
      socket.emit("join-error", { message: "Ce nom est déjà pris" });
      return;
    }

    // Ajouter le joueur
    players[socket.id] = {
      id: socket.id,
      gameCode: gameCode,
      name: playerName,
      score: 0,
      isHost: false,
      hasAnswered: false,
    };

    game.players[socket.id] = players[socket.id];
    game.scores[socket.id] = 0;

    socket.join(gameCode);

    // Informer tous les joueurs
    io.to(gameCode).emit("player-joined", {
      playerId: socket.id,
      playerName: playerName,
      players: Object.values(game.players).map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        isHost: p.isHost,
      })),
    });

    socket.emit("join-success", {
      gameCode: gameCode,
      hostName: game.hostName,
      mode: game.mode || "spectator", // Envoyer le mode au joueur qui rejoint
      players: Object.values(game.players).map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        isHost: p.isHost,
      })),
      settings: game.settings,
    });

    console.log(`${playerName} a rejoint ${gameCode}`);

    // Démarrage automatique dès que la salle est pleine
    if (Object.keys(game.players).length >= maxPlayers) {
      startGameInternal(gameCode);
    }
  });

  // Rejoindre une partie en cours (reconnexion après navigation)
  socket.on("rejoin-game", ({ gameCode, playerName }) => {
    const game = games[gameCode];

    if (!game) {
      socket.emit("rejoin-error", { message: "Partie introuvable" });
      return;
    }

    // Chercher le joueur existant par son nom
    const existingPlayerEntry = Object.entries(game.players).find(
      ([id, p]) => p.name.toLowerCase() === playerName.toLowerCase()
    );

    if (existingPlayerEntry) {
      const [oldPlayerId, oldPlayerData] = existingPlayerEntry;

      // Transférer les données vers le nouveau socket
      players[socket.id] = {
        id: socket.id,
        gameCode: gameCode,
        name: playerName,
        score: oldPlayerData.score || 0,
        isHost: false,
        hasAnswered: oldPlayerData.hasAnswered || false,
      };

      game.players[socket.id] = players[socket.id];
      game.scores[socket.id] = oldPlayerData.score || 0;

      // Supprimer l'ancien socket
      if (oldPlayerId !== socket.id) {
        delete game.players[oldPlayerId];
        delete game.scores[oldPlayerId];
        delete players[oldPlayerId];
      }
    } else {
      // Nouveau joueur qui rejoint en cours de partie (s'il y a de la place)
      players[socket.id] = {
        id: socket.id,
        gameCode: gameCode,
        name: playerName,
        score: 0,
        isHost: false,
        hasAnswered: false,
      };

      game.players[socket.id] = players[socket.id];
      game.scores[socket.id] = 0;
    }

    socket.join(gameCode);

    socket.emit("rejoin-success", {
      gameCode: gameCode,
      hostName: game.hostName,
      mode: game.mode || "spectator",
      players: Object.values(game.players).map((p) => ({
        id: p.id,
        name: p.name,
        score: game.scores[p.id] || p.score || 0,
        isHost: p.isHost || false,
      })),
      settings: game.settings,
      gameState: game.state,
      currentQuestionIndex: game.currentQuestionIndex,
    });

    // Si le jeu est en cours et qu'il y a une question active, l'envoyer au joueur qui rejoint
    if (game.state === "playing" && game.currentQuestion) {
      const shuffledOptions = shuffleArray([...game.currentQuestion.options]);
      socket.emit("new-question", {
        question: game.currentQuestion.question,
        options: shuffledOptions,
        correctAnswer: game.currentQuestion.correctAnswer,
        timeLimit: game.settings.timePerQuestion * 1000,
        questionNumber: game.currentQuestionIndex + 1,
        totalQuestions: game.questions.length,
        imageUrl: game.currentQuestion.imageUrl || null,
        illustrationTexte: game.currentQuestion.illustrationTexte || null,
      });
    }

    console.log(`${playerName} reconnecté à la partie ${gameCode}`);
  });

  // Démarrer la partie
  socket.on("start-game", ({ gameCode, settings }) => {
    const game = games[gameCode];
    if (!game) {
      socket.emit("error", { message: "Code de partie invalide" });
      return;
    }

    // Déjà en cours
    if (game.state !== "waiting") {
      return;
    }

    // Mettre à jour/normaliser les paramètres (si fournis)
    if (settings) {
      game.settings = normalizeSettings(settings);
    }

    // Démarrage uniquement si au moins 2 joueurs (évite une partie vide)
    if (Object.keys(game.players).length < 2) {
      socket.emit("error", { message: "Au moins 2 joueurs requis" });
      return;
    }

    // Démarrer la partie de manière centralisée (questions côté serveur)
    startGameInternal(gameCode);
  });

  // Envoyer une question (pour l'hôte qui contrôle manuellement)
  socket.on(
    "send-question",
    ({
      gameCode,
      question,
      options,
      correctAnswer,
      questionNumber,
      totalQuestions,
      timeLimit,
    }) => {
      const game = games[gameCode];

      if (!game || socket.id !== game.hostId) return;

      // Activer le buzzer
      game.buzzerActive = true;
      game.buzzerWinner = null;
      game.buzzerWinnerAnswered = false;
      game.currentQuestion = {
        question,
        options,
        correctAnswer,
      };

      clearGameTimers(game);

      // Réinitialiser les réponses
      Object.keys(game.players).forEach((playerId) => {
        if (players[playerId]) {
          players[playerId].hasAnswered = false;
        }
      });

      io.to(gameCode).emit("new-question", {
        question: question,
        options: shuffleArray([...options]),
        correctAnswer: correctAnswer,
        timeLimit: timeLimit || game.settings.timePerQuestion * 1000,
        questionNumber: questionNumber || game.currentQuestionIndex + 1,
        totalQuestions: totalQuestions || game.totalQuestions,
      });

      console.log(`Question envoyée par l'hôte dans ${gameCode}`);

      // Désactiver le buzzer après le temps
      game._buzzerTimer = setTimeout(() => {
        if (games[gameCode] && game.buzzerActive) {
          game.buzzerActive = false;
          io.to(gameCode).emit("buzzer-timeout");
        }
      }, timeLimit || game.settings.timePerQuestion * 1000);
    }
  );

  // Buzzer
  socket.on("buzz", ({ gameCode }) => {
    const game = games[gameCode];
    const player = players[socket.id];

    if (!game || !player || !game.buzzerActive || game.buzzerWinner) return;

    game.buzzerWinner = socket.id;
    game.buzzerActive = false;
    game.buzzerWinnerAnswered = false;

    // Timer de réponse: si le joueur ne répond pas, on considère la réponse comme incorrecte et on passe à la suite.
    clearGameTimers(game);
    game._answerTimer = setTimeout(() => {
      const g = games[gameCode];
      if (!g) return;
      if (g.buzzerWinner === socket.id && !g.buzzerWinnerAnswered) {
        const p = players[socket.id];
        if (!p) return;
        // Pas de réponse -> incorrect (0 point minimum)
        p.score = Math.max(0, (p.score || 0) - 5);
        g.scores[socket.id] = p.score;
        g.buzzerWinnerAnswered = true;

        const rankings = Object.values(g.players)
          .sort((a, b) => (b.score || 0) - (a.score || 0))
          .map((pl, idx) => ({ position: idx + 1, name: pl.name, score: pl.score || 0, isHost: pl.isHost || false }));

        io.to(gameCode).emit("answer-result", {
          playerId: socket.id,
          playerName: p.name,
          answer: null,
          isCorrect: false,
          score: p.score,
          correctAnswer: g.currentQuestion?.correctAnswer || null,
          question: g.currentQuestion?.question || null,
          rankings,
          reason: "timeout",
        });

        setTimeout(() => nextQuestion(gameCode), 2500);
      }
    }, (game.settings.timePerAnswer || 15) * 1000);

    console.log(`${player.name} a buzzé dans ${gameCode}`);

    io.to(gameCode).emit("player-buzzed", {
      playerId: socket.id,
      playerName: player.name,
    });

    // Donner du temps pour répondre (2 secondes avant d'afficher l'écran de réponse)
    setTimeout(() => {
      if (games[gameCode] && game.buzzerWinner === socket.id) {
        // Options envoyées au moment de l'écran de réponse pour éviter tout état "undefined" côté client.
        const safeOptions = Array.isArray(game.currentQuestion?.options)
          ? shuffleArray([...game.currentQuestion.options])
          : [];

        io.to(gameCode).emit("show-answer-screen", {
          answeringPlayer: player.name,
          options: safeOptions,
        });

        // Event redondant (si le client préfère écouter un canal dédié)
        io.to(socket.id).emit("answer-options", { options: safeOptions });
      }
    }, 2000);
  });

  // Demande explicite des options de réponse (uniquement le gagnant du buzzer)
  socket.on("request-answer-options", ({ gameCode }) => {
    const game = games[gameCode];
    if (!game) return;
    if (!game.buzzerWinner || game.buzzerWinner !== socket.id) return;

    const safeOptions = Array.isArray(game.currentQuestion?.options)
      ? shuffleArray([...game.currentQuestion.options])
      : [];

    io.to(socket.id).emit("answer-options", { options: safeOptions });
  });

  // Soumettre une réponse
  socket.on("submit-answer", ({ gameCode, answer }) => {
    const game = games[gameCode];
    const player = players[socket.id];

    if (!game || !player) return;

    // Seul le vainqueur du buzzer est autorisé à répondre.
    if (!game.buzzerWinner || game.buzzerWinner !== socket.id) return;
    if (game.buzzerWinnerAnswered) return;

    game.buzzerWinnerAnswered = true;
    clearGameTimers(game);

    const correctAnswer = game.currentQuestion?.correctAnswer;
    const isCorrect = typeof correctAnswer === "string" && String(answer) === correctAnswer;

    if (isCorrect) {
      player.score = (player.score || 0) + 10;
    } else {
      player.score = Math.max(0, (player.score || 0) - 5);
    }
    game.scores[socket.id] = player.score;

    const rankings = Object.values(game.players)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .map((pl, idx) => ({ position: idx + 1, name: pl.name, score: pl.score || 0, isHost: pl.isHost || false }));

    // Informer tous les joueurs
    io.to(gameCode).emit("answer-result", {
      playerId: socket.id,
      playerName: player.name,
      answer: answer,
      isCorrect: isCorrect,
      score: player.score,
      correctAnswer: correctAnswer || null,
      question: game.currentQuestion?.question || null,
      imageUrl: game.currentQuestion?.imageUrl || null,
      illustrationTexte: game.currentQuestion?.illustrationTexte || null,
      rankings,
    });

    // En mode classique, passer automatiquement à la question suivante après 5 secondes
    // En mode spectateur, l'hôte décide quand passer à la suite
    if (game.mode === "classic") {
      setTimeout(() => {
        if (games[gameCode]) {
          nextQuestion(gameCode);
        }
      }, 5000);
    }
  });

  // Passer à la question suivante (hôte seulement)
  socket.on("next-question", ({ gameCode }) => {
    const game = games[gameCode];
    if (!game || socket.id !== game.hostId) return;

    nextQuestion(gameCode);
  });

  // Terminer la partie
  socket.on("end-game", ({ gameCode }) => {
    const game = games[gameCode];
    if (!game || socket.id !== game.hostId) return;

    endGame(gameCode);
  });

  // Déconnexion
  socket.on("disconnect", () => {
    console.log("Déconnexion:", socket.id);

    const player = players[socket.id];
    if (player) {
      const gameCode = player.gameCode;
      const game = games[gameCode];

      if (game) {
        delete game.players[socket.id];
        delete game.scores[socket.id];

        if (player.isHost) {
          // Grace period: attendre 10 secondes avant de supprimer la partie
          // Cela permet à l'hôte de se reconnecter après navigation
          console.log(`Hôte déconnecté de ${gameCode}, attente de reconnexion...`);

          const disconnectedHostId = socket.id;
          game.hostDisconnectedAt = Date.now();

          setTimeout(() => {
            // Vérifier si la partie existe toujours et si l'hôte ne s'est pas reconnecté
            if (games[gameCode] && games[gameCode].hostDisconnectedAt) {
              // L'hôte ne s'est pas reconnecté dans le délai
              console.log(`Hôte non reconnecté, suppression de ${gameCode}`);
              io.to(gameCode).emit("host-disconnected");
              delete games[gameCode];
            }
          }, 10000); // 10 secondes de grace period
        } else {
          io.to(gameCode).emit("player-left", {
            playerId: socket.id,
            playerName: player.name,
            players: Object.values(game.players).map((p) => ({
              id: p.id,
              name: p.name,
              score: p.score,
            })),
          });
        }
      }

      delete players[socket.id];
    }
  });
});

// ============================================
// FONCTIONS INTERNES
// ============================================

function sendQuestionToAll(gameCode) {
  const game = games[gameCode];

  if (!game || game.state !== "playing") return;

  // Vérifier s'il reste des questions
  if (game.currentQuestionIndex >= game.questions.length) {
    endGame(gameCode);
    return;
  }

  const questionData = game.questions[game.currentQuestionIndex];

  // Conserver la question courante côté serveur (évite de faire confiance au client pour la correction)
  game.currentQuestion = {
    question: questionData.question,
    options: questionData.options,
    correctAnswer: questionData.reponseCorrecte,
    imageUrl: questionData.imageUrl || null,
    illustrationTexte: questionData.illustrationTexte || null,
  };
  game.buzzerWinnerAnswered = false;
  clearGameTimers(game);

  // Activer le buzzer
  game.buzzerActive = true;
  game.buzzerWinner = null;

  // Réinitialiser les réponses
  Object.keys(game.players).forEach((playerId) => {
    if (players[playerId]) {
      players[playerId].hasAnswered = false;
    }
  });

  // Mélanger les options
  const shuffledOptions = shuffleArray([...questionData.options]);

  // Envoyer à tous les joueurs
  io.to(gameCode).emit("new-question", {
    question: questionData.question,
    options: shuffledOptions,
    correctAnswer: questionData.reponseCorrecte,
    timeLimit: game.settings.timePerQuestion * 1000,
    questionNumber: game.currentQuestionIndex + 1,
    totalQuestions: game.questions.length,
    // Illustration pour l'écran de résultat
    imageUrl: questionData.imageUrl || null,
    illustrationTexte: questionData.illustrationTexte || null,
  });

  console.log(
    `Question ${game.currentQuestionIndex + 1}/${game.questions.length} envoyée`
  );

  // Désactiver le buzzer après le temps
  game._buzzerTimer = setTimeout(() => {
    if (games[gameCode] && game.buzzerActive) {
      game.buzzerActive = false;
      
      // Afficher les résultats même si personne n'a buzzé
      const correctAnswer = game.currentQuestion?.correctAnswer;
      const rankings = Object.values(game.players)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .map((pl, idx) => ({ 
          position: idx + 1, 
          name: pl.name, 
          score: pl.score || 0, 
          isHost: pl.isHost || false 
        }));
      
      // Informer tous les joueurs qu'il y a un timeout et montrer la réponse
      io.to(gameCode).emit("buzzer-timeout-result", {
        correctAnswer: correctAnswer || null,
        question: game.currentQuestion?.question || null,
        imageUrl: game.currentQuestion?.imageUrl || null,
        illustrationTexte: game.currentQuestion?.illustrationTexte || null,
        rankings,
      });

      // Passer à la question suivante après 5 secondes (temps pour voir les résultats)
      setTimeout(() => {
        if (games[gameCode]) {
          if (game.mode === "classic") {
            nextQuestion(gameCode);
          }
          // En mode spectateur, attendre que l'hôte clique sur "Question suivante"
        }
      }, 5000);
    }
  }, game.settings.timePerQuestion * 1000);
}

function nextQuestion(gameCode) {
  const game = games[gameCode];
  if (!game) return;

  game.currentQuestionIndex++;

  if (game.currentQuestionIndex >= game.questions.length) {
    endGame(gameCode);
  } else {
    setTimeout(() => {
      sendQuestionToAll(gameCode);
    }, 2000);
  }
}

function endGame(gameCode) {
  const game = games[gameCode];
  if (!game) return;

  game.state = "finished";

  // Calculer les classements
  const rankings = Object.values(game.players)
    .sort((a, b) => b.score - a.score)
    .map((player, index) => ({
      position: index + 1,
      name: player.name,
      score: player.score,
      isHost: player.isHost || false,
    }));

  io.to(gameCode).emit("game-finished", {
    rankings: rankings,
  });

  console.log(
    `Partie ${gameCode} terminée. Gagnant: ${rankings[0]?.name || "Aucun"}`
  );

  // Nettoyer après 5 minutes
  setTimeout(() => {
    if (games[gameCode]) {
      Object.keys(game.players).forEach((playerId) => {
        delete players[playerId];
      });
      delete games[gameCode];
    }
  }, 5 * 60 * 1000);
}

// ============================================
// DÉMARRAGE DU SERVEUR
// ============================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur le port ${PORT}`);
  if (allQuestions.length > 0) {
    console.log(`✅ ${allQuestions.length} questions prêtes (backup)`);
  } else {
    console.log(
      `ℹ️ Aucune question dans le backend, attente des questions du frontend`
    );
  }
});
