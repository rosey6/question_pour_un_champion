const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

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

// ============================================
// GESTION SOCKET.IO
// ============================================

io.on("connection", (socket) => {
  console.log("Nouveau joueur connecté:", socket.id);

  // Créer une partie
  socket.on("create-game", ({ playerName, settings }) => {
    const gameCode = generateGameCode();

    const rawSettings = settings || {};
    const normalizedSettings = {
      questionsCount: Number(rawSettings.questionsCount ?? rawSettings.nombreQuestions ?? 10),
      timePerQuestion: Number(rawSettings.timePerQuestion ?? rawSettings.dureeQuestion ?? 30),
      timePerAnswer: Number(rawSettings.timePerAnswer ?? rawSettings.dureeReponse ?? 15),
    };

    games[gameCode] = {
      code: gameCode,
      hostId: socket.id,
      hostName: playerName,
      players: {},
      state: "waiting",
      settings: normalizedSettings,
      currentQuestionIndex: 0,
      questions: [],
      scores: {},
      buzzerActive: false,
      buzzerWinner: null,
      createdAt: Date.now(),
    };

    // Hôte = spectateur (pas un joueur)
    players[socket.id] = {
      id: socket.id,
      gameCode: gameCode,
      name: playerName,
      isHost: true,
    };

    socket.join(gameCode);

    socket.emit("game-created", {
      success: true,
      gameCode: gameCode,
      message: "Partie créée avec succès",
    });

    console.log(`Partie créée: ${gameCode} par ${playerName}`);
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

    if (Object.keys(game.players).length >= 4) {
      socket.emit("join-error", {
        message: "La partie est complète (max 4 joueurs)",
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
      players: Object.values(game.players).map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        isHost: p.isHost,
      })),
      settings: game.settings,
    });

    console.log(`${playerName} a rejoint ${gameCode}`);
  });

  // Démarrer la partie
  socket.on("start-game", ({ gameCode, settings, questions }) => {
    const game = games[gameCode];

    if (!game || socket.id !== game.hostId) {
      socket.emit("error", { message: "Non autorisé" });
      return;
    }

    if (Object.keys(game.players).length < 1) {
      socket.emit("error", { message: "Au moins 1 joueur requis" });
      return;
    }

    game.state = "playing";

    // Normaliser les settings (compat anciennes clés)
    if (settings) {
      const rawSettings = settings || {};
      game.settings = {
        questionsCount: Number(
          rawSettings.questionsCount ?? rawSettings.nombreQuestions ?? 10
        ),
        timePerQuestion: Number(
          rawSettings.timePerQuestion ?? rawSettings.dureeQuestion ?? 30
        ),
        timePerAnswer: Number(
          rawSettings.timePerAnswer ?? rawSettings.dureeReponse ?? 15
        ),
      };
    }

    // Utiliser les questions envoyées par l'hôte ou générer des questions locales
    if (questions && questions.length > 0) {
      game.questions = questions;
    } else {
      const questionsCount = game.settings.questionsCount || 10;
      game.questions = getRandomQuestions(questionsCount);
    }

    game.currentQuestionIndex = 0;
    game.totalQuestions = game.questions.length;

    console.log(
      `Partie ${gameCode} démarrée avec ${game.totalQuestions} questions`
    );

    io.to(gameCode).emit("game-started", {
      players: Object.values(game.players).map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
      })),
      settings: game.settings,
      questions: game.questions,
      totalQuestions: game.totalQuestions,
    });

    // Envoyer la première question après 2 secondes
    setTimeout(() => {
      sendQuestionToAll(gameCode);
    }, 2000);
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
      setTimeout(() => {
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

    console.log(`${player.name} a buzzé dans ${gameCode}`);

    io.to(gameCode).emit("player-buzzed", {
      playerId: socket.id,
      playerName: player.name,
    });

    // Donner du temps pour répondre (2 secondes avant d'afficher l'écran de réponse)
    setTimeout(() => {
      if (games[gameCode] && game.buzzerWinner === socket.id) {
        io.to(gameCode).emit("show-answer-screen", {
          answeringPlayer: player.name,
        });
      }
    }, 2000);
  });

  // Soumettre une réponse
  socket.on("submit-answer", ({ gameCode, answer, isCorrect }) => {
    const game = games[gameCode];
    const player = players[socket.id];

    if (!game || !player) return;

    player.hasAnswered = true;

    if (isCorrect) {
      player.score += 10;
      game.scores[socket.id] = player.score;
    } else {
      player.score -= 5;
      if (player.score < 0) player.score = 0;
      game.scores[socket.id] = player.score;
    }

    // Informer tous les joueurs
    io.to(gameCode).emit("answer-result", {
      playerId: socket.id,
      playerName: player.name,
      answer: answer,
      isCorrect: isCorrect,
      score: player.score,
    });

    // Vérifier si tous ont répondu
    const allAnswered = Object.values(game.players).every((p) => p.hasAnswered);
    if (allAnswered) {
      setTimeout(() => {
        nextQuestion(gameCode);
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
          io.to(gameCode).emit("host-disconnected");
          delete games[gameCode];
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
    totalQuestions: game.totalQuestions,
  });

  console.log(
    `Question ${game.currentQuestionIndex + 1}/${game.totalQuestions} envoyée`
  );

  // Désactiver le buzzer après le temps
  setTimeout(() => {
    if (games[gameCode] && game.buzzerActive) {
      game.buzzerActive = false;
      io.to(gameCode).emit("buzzer-timeout");

      // Si personne n'a buzzé, passer à la question suivante après 2 secondes
      setTimeout(() => {
        if (games[gameCode]) {
          nextQuestion(gameCode);
        }
      }, 2000);
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
