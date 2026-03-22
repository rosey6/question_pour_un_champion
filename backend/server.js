// ============================================
// server.js — Point d'entree du serveur
// Init Express, Socket.IO, middlewares, routes HTTP et handlers Socket.IO
// ============================================

"use strict";

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const { z } = require("zod");
const { RateLimiterMemory } = require("rate-limiter-flexible");

// Modules internes
const { calculerScore, obtenirClassement, POINTS_PAR_RANG } = require("./logique/jeu");
const { melangerTableau, piocherQuestion, genererQuestionsViaGroq } = require("./logique/questions");
const { sauvegarderPartie, recupererPartie, supprimerPartie } = require("./stockage/redis");
// Le minuteur serveur est disponible mais non utilise dans ce flux (le timer est gere via setTimeout existant)
// const { gererMinuteur, arreterMinuteur } = require("./logique/minuteur");

const app = express();
const server = http.createServer(app);

// ============================================
// CORS / ORIGINS
// ============================================
function obtenirOriginesAutorisees() {
  const brut = (process.env.ALLOWED_ORIGINS || "").trim();
  if (brut) {
    return brut
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [
    "https://question-pour-un-champion-murex.vercel.app",
    "https://question-pour-un-championv2.bambaa148.workers.dev",
    "https://questionpourunchampion.netlify.app",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5500",
  ];
}

const originesAutorisees = obtenirOriginesAutorisees();

// Configuration Socket.IO
const io = socketIo(server, {
  cors: {
    origin: originesAutorisees,
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

// ============================================
// HELMET — En-tetes de securite HTTP
// ============================================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://commons.wikimedia.org", "https://cdnjs.cloudflare.com"],
        connectSrc: ["'self'", ...originesAutorisees],
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: originesAutorisees,
    methods: ["GET", "POST"],
  })
);
app.use(express.json());

// ============================================
// SCHEMAS DE VALIDATION ZOD
// ============================================

const schemaRejoindrePartie = z.object({
  gameCode: z.string().regex(/^[A-Z0-9]{4,6}$/, "Code partie : 4-6 caracteres alphanumeriques majuscules"),
  playerName: z.string().min(1, "Nom de joueur requis").max(20, "Nom de joueur : 20 caracteres maximum"),
});

const schemaSoumettreReponse = z.object({
  gameCode: z.string().min(1),
  answer: z.string().max(200, "Reponse : 200 caracteres maximum"),
});

const schemaVoteTheme = z.object({
  gameCode: z.string().min(1),
  theme: z.string().min(1, "Theme requis"),
});

const schemaDemarrerPartie = z.object({
  gameCode: z.string().min(1),
  settings: z.any().optional(),
});

/**
 * validerPayload — Valide un payload avec un schema Zod.
 * @param {z.ZodSchema} schema
 * @param {any} donnees
 * @returns {{ valide: boolean, erreur: string|null, donnees: any }}
 */
function validerPayload(schema, donnees) {
  const resultat = schema.safeParse(donnees);
  if (resultat.success) {
    return { valide: true, erreur: null, donnees: resultat.data };
  }
  const messagesErreur = resultat.error.issues.map((i) => i.message).join(", ");
  return { valide: false, erreur: messagesErreur, donnees: null };
}

// ============================================
// LIMITEURS DE DEBIT (rate-limiter-flexible)
// ============================================

const limiteurRejoindre = new RateLimiterMemory({ points: 10, duration: 60, keyPrefix: "rejoindre" });
const limiteurReponse = new RateLimiterMemory({ points: 5, duration: 10, keyPrefix: "reponse" });
const limiteurVote = new RateLimiterMemory({ points: 3, duration: 30, keyPrefix: "vote" });
const limiteurDemarrer = new RateLimiterMemory({ points: 5, duration: 60, keyPrefix: "demarrer" });

/**
 * verifierLimite — Verifie si une action est autorisee par le limiteur.
 * @param {RateLimiterMemory} limiteur
 * @param {string} cle
 * @returns {Promise<{ autorise: boolean, attente: number }>}
 */
async function verifierLimite(limiteur, cle) {
  try {
    await limiteur.consume(cle, 1);
    return { autorise: true, attente: 0 };
  } catch (resultatRejet) {
    const attente = Math.ceil((resultatRejet.msBeforeNext || 1000) / 1000);
    return { autorise: false, attente };
  }
}

// ============================================
// THEMES PREDEFINIS
// ============================================

const THEMES_PREDEFINIS = [
  "Histoire",
  "Géographie",
  "Sciences",
  "Littérature",
  "Cinéma",
  "Sport",
  "Musique",
  "Gastronomie",
];

// ============================================
// ROUTES HTTP
// ============================================

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    service: "Question pour un Champion - Serveur Multijoueur",
    timestamp: new Date().toISOString(),
    activeGames: Object.keys(parties).length,
    activePlayers: Object.keys(joueurs).length,
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
    totalGames: Object.keys(parties).length,
    totalPlayers: Object.keys(joueurs).length,
    uptime: process.uptime(),
  });
});

app.get("/api/themes", (req, res) => {
  res.json({ themes: THEMES_PREDEFINIS });
});

app.post("/api/generate-questions", async (req, res) => {
  const { theme, count = 10 } = req.body;

  if (!theme) {
    return res.status(400).json({ success: false, error: "Le theme est requis" });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({
      success: false,
      error: "La cle API Groq n'est pas configuree. Creez un compte gratuit sur https://console.groq.com",
    });
  }

  try {
    const questionsEnrichies = await genererQuestionsViaGroq(theme, count);
    res.json({ success: true, theme, count: questionsEnrichies.length, questions: questionsEnrichies });
  } catch (erreur) {
    console.error("Erreur generation questions:", erreur);
    res.status(500).json({ success: false, error: erreur.message || "Erreur lors de la generation des questions" });
  }
});

// ============================================
// CHARGEMENT DES QUESTIONS (backup JSON local)
// ============================================

let toutesLesQuestions = [];

function chargerQuestions() {
  try {
    const cheminQuestions = path.join(__dirname, "questions.json");
    if (fs.existsSync(cheminQuestions)) {
      const donnees = fs.readFileSync(cheminQuestions, "utf8");
      toutesLesQuestions = JSON.parse(donnees);
      console.log(`${toutesLesQuestions.length} questions chargees depuis questions.json`);
    } else {
      console.log("Aucun fichier questions.json trouve dans le backend");
      toutesLesQuestions = [];
    }
  } catch (erreur) {
    console.error("Erreur de chargement des questions:", erreur);
    toutesLesQuestions = [];
  }
}

chargerQuestions();

// ============================================
// FONCTIONS UTILITAIRES SERVEUR
// ============================================

function genererCodePartie() {
  const caracteres = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
  }
  return code;
}

function obtenirQuestionsAleatoires(nombre) {
  if (nombre <= 0 || toutesLesQuestions.length === 0) {
    return [
      { question: "Quelle est la capitale de la France ?", options: ["Paris", "Londres", "Berlin", "Madrid"], reponseCorrecte: "Paris" },
      { question: "Quel est le plus grand ocean du monde ?", options: ["Atlantique", "Indien", "Pacifique", "Arctique"], reponseCorrecte: "Pacifique" },
    ].slice(0, Math.min(nombre, 2));
  }
  const nombreEffectif = Math.min(nombre, toutesLesQuestions.length);
  return melangerTableau([...toutesLesQuestions]).slice(0, nombreEffectif);
}

// ============================================
// STOCKAGE DES PARTIES EN MEMOIRE
// ============================================

const parties = {};
const joueurs = {};

function annulerTimersPartie(partie) {
  if (!partie) return;
  if (partie._buzzerTimer) {
    clearTimeout(partie._buzzerTimer);
    partie._buzzerTimer = null;
  }
  if (partie._answerTimer) {
    clearTimeout(partie._answerTimer);
    partie._answerTimer = null;
  }
}

// ============================================
// LOGIQUE INTERNE DE JEU
// ============================================

/**
 * normaliserParametres — Normalise les parametres de partie envoyes par le client.
 * @param {Object} bruts - Parametres bruts (plusieurs noms de champs possibles)
 * @returns {{ maxPlayers, questionsCount, timePerQuestion, timePerAnswer }}
 */
function normaliserParametres(bruts = {}) {
  const maxJoueurs = Number(bruts.maxPlayers ?? bruts.playersCount ?? bruts.nombreJoueurs ?? 4);
  const nombreQuestions = Number(bruts.questionsCount ?? bruts.nombreQuestions ?? 10);
  const dureeQuestion = Number(bruts.timePerQuestion ?? bruts.dureeQuestion ?? 30);
  const dureeReponse = Number(bruts.timePerAnswer ?? bruts.dureeReponse ?? 15);
  return {
    maxPlayers: Number.isFinite(maxJoueurs) && maxJoueurs > 0 ? maxJoueurs : 4,
    questionsCount: Number.isFinite(nombreQuestions) ? nombreQuestions : 10,
    timePerQuestion: Number.isFinite(dureeQuestion) ? dureeQuestion : 30,
    timePerAnswer: Number.isFinite(dureeReponse) ? dureeReponse : 15,
  };
}

/**
 * demarrerPartieInterne — Initialise et lance une partie.
 * @param {string} codePartie
 * @param {Object|null} parametresBruts
 */
function demarrerPartieInterne(codePartie, parametresBruts = null) {
  const partie = parties[codePartie];
  if (!partie || partie.state !== "waiting") return;

  const parametres = normaliserParametres(parametresBruts || partie.settings || {});
  partie.settings = parametres;

  if (partie.providedQuestions && partie.providedQuestions.length > 0) {
    partie.questions = partie.providedQuestions.slice(0, parametres.questionsCount);
    console.log(`Partie ${codePartie}: utilisation de ${partie.questions.length} questions IA`);
  } else {
    partie.questions = obtenirQuestionsAleatoires(parametres.questionsCount);
    console.log(`Partie ${codePartie}: utilisation de ${partie.questions.length} questions locales`);
  }

  partie.currentQuestionIndex = 0;
  partie.state = "playing";
  partie.questionOpen = false;
  partie.answers = [];
  partie.questionHistory = [];
  partie.streaks = {};

  Object.keys(partie.players).forEach((idJoueur) => {
    partie.players[idJoueur].hasAnswered = false;
    if (typeof partie.scores[idJoueur] !== "number") partie.scores[idJoueur] = 0;
    partie.streaks[idJoueur] = 0;
  });

  io.to(codePartie).emit("game-started", {
    gameCode: codePartie,
    mode: partie.mode || "spectator",
    settings: partie.settings,
    players: Object.values(partie.players).map((j) => ({
      id: j.id,
      name: j.name,
      score: partie.scores[j.id] ?? 0,
      isHost: j.isHost || false,
    })),
  });

  envoyerQuestionATous(codePartie);
}

function envoyerQuestionATous(codePartie) {
  const partie = parties[codePartie];
  if (!partie || partie.state !== "playing") return;

  if (partie.currentQuestionIndex >= partie.questions.length) {
    terminerPartie(codePartie);
    return;
  }

  const donneesQuestion = piocherQuestion(partie.questions, partie.currentQuestionIndex);
  if (!donneesQuestion) {
    terminerPartie(codePartie);
    return;
  }

  partie.currentQuestion = {
    question: donneesQuestion.question,
    options: donneesQuestion.options,
    correctAnswer: donneesQuestion.reponseCorrecte,
    imageUrl: donneesQuestion.imageUrl || null,
    illustrationTexte: donneesQuestion.illustrationTexte || null,
  };
  annulerTimersPartie(partie);

  partie.questionOpen = true;
  partie.answers = [];
  partie.questionStartedAt = Date.now();

  Object.keys(partie.players).forEach((idJoueur) => {
    if (joueurs[idJoueur]) {
      joueurs[idJoueur].hasAnswered = false;
    }
  });

  const optionsMelangees = melangerTableau([...donneesQuestion.options]);

  io.to(codePartie).emit("new-question", {
    question: donneesQuestion.question,
    options: optionsMelangees,
    timeLimit: partie.settings.timePerQuestion * 1000,
    questionNumber: partie.currentQuestionIndex + 1,
    totalQuestions: partie.questions.length,
    imageUrl: donneesQuestion.imageUrl || null,
    illustrationTexte: donneesQuestion.illustrationTexte || null,
  });

  console.log(`Question ${partie.currentQuestionIndex + 1}/${partie.questions.length} envoyee`);

  partie._buzzerTimer = setTimeout(() => {
    if (parties[codePartie] && partie.questionOpen) {
      finaliserQuestion(codePartie);
    }
  }, partie.settings.timePerQuestion * 1000);
}

function finaliserQuestion(codePartie) {
  const partie = parties[codePartie];
  if (!partie || !partie.questionOpen) return;

  partie.questionOpen = false;
  annulerTimersPartie(partie);

  const reponseCorrecte = partie.currentQuestion.correctAnswer;

  // Trier les bonnes reponses par ordre d'arrivee
  const bonnesReponses = partie.answers
    .filter((a) => String(a.answer) === String(reponseCorrecte))
    .sort((a, b) => a.timestamp - b.timestamp);

  const mauvaisesReponses = partie.answers.filter(
    (a) => String(a.answer) !== String(reponseCorrecte)
  );

  const idsAyantRepondu = new Set(partie.answers.map((a) => a.playerId));
  const resultatsReponses = [];

  // Points pour les bonnes reponses (rang = ordre d'arrivee)
  bonnesReponses.forEach((ans, rang) => {
    const joueur = joueurs[ans.playerId];
    if (!joueur) return;

    const streakActuel = partie.streaks[ans.playerId] || 0;
    const scoreActuel = partie.scores[ans.playerId] || 0;
    const { pointsGagnes, nouveauStreak } = calculerScore(rang, true, streakActuel, scoreActuel);

    partie.streaks[ans.playerId] = nouveauStreak;
    joueur.score = scoreActuel + pointsGagnes;
    partie.scores[ans.playerId] = joueur.score;

    resultatsReponses.push({
      playerId: ans.playerId,
      playerName: ans.playerName,
      answer: ans.answer,
      isCorrect: true,
      pointsEarned: pointsGagnes,
      rank: rang + 1,
      responseTimeMs: ans.timestamp - partie.questionStartedAt,
    });
  });

  // Malus pour les mauvaises reponses
  mauvaisesReponses.forEach((ans) => {
    const joueur = joueurs[ans.playerId];
    if (!joueur) return;

    const scoreActuel = partie.scores[ans.playerId] || 0;
    const { pointsGagnes, nouveauStreak } = calculerScore(-1, false, 0, scoreActuel);

    partie.streaks[ans.playerId] = nouveauStreak;
    joueur.score = Math.max(0, scoreActuel + pointsGagnes);
    partie.scores[ans.playerId] = joueur.score;

    resultatsReponses.push({
      playerId: ans.playerId,
      playerName: ans.playerName,
      answer: ans.answer,
      isCorrect: false,
      pointsEarned: pointsGagnes,
      rank: null,
      responseTimeMs: ans.timestamp - partie.questionStartedAt,
    });
  });

  // Pas de reponse
  Object.values(partie.players).forEach((j) => {
    if (!idsAyantRepondu.has(j.id)) {
      partie.streaks[j.id] = 0;
      resultatsReponses.push({
        playerId: j.id,
        playerName: j.name,
        answer: null,
        isCorrect: false,
        pointsEarned: 0,
        rank: null,
        responseTimeMs: null,
      });
    }
  });

  const classement = obtenirClassement(partie.players, partie.scores, partie.streaks);

  partie.questionHistory.push({
    question: partie.currentQuestion.question,
    correctAnswer: reponseCorrecte,
    answers: resultatsReponses,
  });

  io.to(codePartie).emit("question-results", {
    correctAnswer: reponseCorrecte,
    question: partie.currentQuestion.question,
    imageUrl: partie.currentQuestion.imageUrl || null,
    illustrationTexte: partie.currentQuestion.illustrationTexte || null,
    answers: resultatsReponses,
    rankings: classement,
  });

  // Mode classique : avancer automatiquement apres 5s
  if (partie.mode === "classic") {
    setTimeout(() => {
      if (parties[codePartie]) questionSuivante(codePartie);
    }, 5000);
  }
}

function questionSuivante(codePartie) {
  const partie = parties[codePartie];
  if (!partie) return;

  partie.currentQuestionIndex++;

  if (partie.currentQuestionIndex >= partie.questions.length) {
    terminerPartie(codePartie);
  } else {
    setTimeout(() => {
      envoyerQuestionATous(codePartie);
    }, 2000);
  }
}

function terminerPartie(codePartie) {
  const partie = parties[codePartie];
  if (!partie) return;

  partie.state = "finished";

  const classement = obtenirClassement(partie.players, partie.scores, partie.streaks);

  io.to(codePartie).emit("game-finished", {
    rankings: classement,
    history: partie.questionHistory || [],
  });

  console.log(`Partie ${codePartie} terminee. Gagnant: ${classement[0]?.name || "Aucun"}`);

  // Nettoyage apres 5 minutes
  setTimeout(() => {
    if (parties[codePartie]) {
      Object.keys(partie.players).forEach((idJoueur) => {
        delete joueurs[idJoueur];
      });
      delete parties[codePartie];
    }
  }, 5 * 60 * 1000);
}

// ============================================
// HANDLERS SOCKET.IO
// ============================================

io.on("connection", (socket) => {
  console.log("Nouveau joueur connecte:", socket.id);

  // Creer une partie
  socket.on("create-game", ({ playerName, settings, mode, questions }) => {
    const codePartie = genererCodePartie();
    const parametres = normaliserParametres(settings || {});
    const modeJeu = mode || "spectator";
    const questionsAI = Array.isArray(questions) ? questions : null;

    parties[codePartie] = {
      code: codePartie,
      hostId: socket.id,
      hostName: playerName,
      mode: modeJeu,
      players: {},
      state: "waiting",
      settings: parametres,
      currentQuestionIndex: 0,
      questions: [],
      providedQuestions: questionsAI,
      scores: {},
      questionOpen: false,
      answers: [],
      questionHistory: [],
      streaks: {},
      createdAt: Date.now(),
    };

    if (questionsAI) {
      console.log(`Partie ${codePartie}: ${questionsAI.length} questions IA fournies`);
    }

    joueurs[socket.id] = {
      id: socket.id,
      gameCode: codePartie,
      name: playerName,
      score: 0,
      isHost: modeJeu === "spectator",
      hasAnswered: false,
    };

    parties[codePartie].players[socket.id] = joueurs[socket.id];
    parties[codePartie].scores[socket.id] = 0;

    socket.join(codePartie);

    socket.emit("game-created", {
      success: true,
      gameCode: codePartie,
      mode: modeJeu,
      message: "Partie creee avec succes",
    });

    console.log(`Partie creee: ${codePartie} par ${playerName} (mode: ${modeJeu})`);
  });

  // Rejoindre en tant qu'hote (reconnexion apres navigation)
  socket.on("rejoin-as-host", ({ gameCode, playerName }) => {
    const partie = parties[gameCode];

    if (!partie) {
      socket.emit("rejoin-error", { message: "Partie introuvable" });
      return;
    }

    const ancienIdHote = partie.hostId;
    partie.hostId = socket.id;
    delete partie.hostDisconnectedAt;

    const estHoteJoueur = partie.mode === "spectator";

    if (ancienIdHote && partie.players[ancienIdHote]) {
      const ancienJoueur = partie.players[ancienIdHote];
      joueurs[socket.id] = {
        id: socket.id,
        gameCode,
        name: playerName || ancienJoueur.name,
        score: ancienJoueur.score || 0,
        isHost: estHoteJoueur,
        hasAnswered: ancienJoueur.hasAnswered || false,
      };
      partie.players[socket.id] = joueurs[socket.id];
      partie.scores[socket.id] = ancienJoueur.score || 0;
      delete partie.players[ancienIdHote];
      delete partie.scores[ancienIdHote];
      delete joueurs[ancienIdHote];
    } else {
      joueurs[socket.id] = { id: socket.id, gameCode, name: playerName, score: 0, isHost: estHoteJoueur, hasAnswered: false };
      partie.players[socket.id] = joueurs[socket.id];
      partie.scores[socket.id] = 0;
    }

    socket.join(gameCode);

    socket.emit("rejoin-success", {
      gameCode,
      hostName: partie.hostName,
      mode: partie.mode || "spectator",
      players: Object.values(partie.players).map((j) => ({ id: j.id, name: j.name, score: j.score || 0, isHost: j.isHost || false })),
      settings: partie.settings,
    });

    if (partie.state === "playing" && partie.currentQuestion) {
      const optionsMelangees = melangerTableau([...partie.currentQuestion.options]);
      socket.emit("new-question", {
        question: partie.currentQuestion.question,
        options: optionsMelangees,
        timeLimit: partie.settings.timePerQuestion * 1000,
        questionNumber: partie.currentQuestionIndex + 1,
        totalQuestions: partie.questions.length,
        imageUrl: partie.currentQuestion.imageUrl || null,
        illustrationTexte: partie.currentQuestion.illustrationTexte || null,
      });
    }

    console.log(`${estHoteJoueur ? "Hote" : "Createur-joueur"} ${playerName} reconnecte a ${gameCode}`);
  });

  // Rejoindre une partie (salle d'attente)
  socket.on("join-game", async ({ gameCode, playerName }) => {
    const { valide, erreur, donnees } = validerPayload(schemaRejoindrePartie, { gameCode, playerName });
    if (!valide) {
      socket.emit("erreur-validation", { message: erreur });
      return;
    }
    gameCode = donnees.gameCode;
    playerName = donnees.playerName;

    const adresseIp = socket.handshake.address || "inconnu";
    const { autorise, attente } = await verifierLimite(limiteurRejoindre, adresseIp);
    if (!autorise) {
      socket.emit("erreur-limite", { message: `Trop de tentatives. Reessayez dans ${attente}s.` });
      return;
    }

    const partie = parties[gameCode];

    if (!partie) {
      socket.emit("join-error", { message: "Code de partie invalide" });
      return;
    }
    if (partie.state !== "waiting") {
      socket.emit("join-error", { message: "La partie a deja commence" });
      return;
    }

    const maxJoueurs = Number(partie.settings?.maxPlayers ?? 4);
    if (Object.keys(partie.players).length >= maxJoueurs) {
      socket.emit("join-error", { message: `La partie est complete (max ${maxJoueurs} joueurs)` });
      return;
    }

    const joueurExistant = Object.values(partie.players).find(
      (j) => j.name.toLowerCase() === playerName.toLowerCase()
    );
    if (joueurExistant) {
      socket.emit("join-error", { message: "Ce nom est deja pris" });
      return;
    }

    joueurs[socket.id] = { id: socket.id, gameCode, name: playerName, score: 0, isHost: false, hasAnswered: false };
    partie.players[socket.id] = joueurs[socket.id];
    partie.scores[socket.id] = 0;

    socket.join(gameCode);

    io.to(gameCode).emit("player-joined", {
      playerId: socket.id,
      playerName,
      players: Object.values(partie.players).map((j) => ({ id: j.id, name: j.name, score: j.score, isHost: j.isHost })),
    });

    socket.emit("join-success", {
      gameCode,
      hostName: partie.hostName,
      mode: partie.mode || "spectator",
      players: Object.values(partie.players).map((j) => ({ id: j.id, name: j.name, score: j.score, isHost: j.isHost })),
      settings: partie.settings,
    });

    console.log(`${playerName} a rejoint ${gameCode}`);

    if (Object.keys(partie.players).length >= maxJoueurs) {
      demarrerPartieInterne(gameCode);
    }
  });

  // Reconnexion en cours de partie
  socket.on("rejoin-game", ({ gameCode, playerName }) => {
    const partie = parties[gameCode];

    if (!partie) {
      socket.emit("rejoin-error", { message: "Partie introuvable" });
      return;
    }

    const entreeExistante = Object.entries(partie.players).find(
      ([, j]) => j.name.toLowerCase() === playerName.toLowerCase()
    );

    if (entreeExistante) {
      const [ancienId, ancienJoueur] = entreeExistante;
      joueurs[socket.id] = { id: socket.id, gameCode, name: playerName, score: ancienJoueur.score || 0, isHost: false, hasAnswered: ancienJoueur.hasAnswered || false };
      partie.players[socket.id] = joueurs[socket.id];
      partie.scores[socket.id] = ancienJoueur.score || 0;
      if (ancienId !== socket.id) {
        delete partie.players[ancienId];
        delete partie.scores[ancienId];
        delete joueurs[ancienId];
      }
    } else {
      joueurs[socket.id] = { id: socket.id, gameCode, name: playerName, score: 0, isHost: false, hasAnswered: false };
      partie.players[socket.id] = joueurs[socket.id];
      partie.scores[socket.id] = 0;
    }

    socket.join(gameCode);

    socket.emit("rejoin-success", {
      gameCode,
      hostName: partie.hostName,
      mode: partie.mode || "spectator",
      players: Object.values(partie.players).map((j) => ({ id: j.id, name: j.name, score: partie.scores[j.id] || j.score || 0, isHost: j.isHost || false })),
      settings: partie.settings,
      gameState: partie.state,
      currentQuestionIndex: partie.currentQuestionIndex,
    });

    if (partie.state === "playing" && partie.currentQuestion) {
      const optionsMelangees = melangerTableau([...partie.currentQuestion.options]);
      socket.emit("new-question", {
        question: partie.currentQuestion.question,
        options: optionsMelangees,
        timeLimit: partie.settings.timePerQuestion * 1000,
        questionNumber: partie.currentQuestionIndex + 1,
        totalQuestions: partie.questions.length,
        imageUrl: partie.currentQuestion.imageUrl || null,
        illustrationTexte: partie.currentQuestion.illustrationTexte || null,
      });
    }

    console.log(`${playerName} reconnecte a ${gameCode}`);
  });

  // Demarrer la partie (hote)
  socket.on("start-game", async ({ gameCode, settings }) => {
    const { valide, erreur } = validerPayload(schemaDemarrerPartie, { gameCode, settings });
    if (!valide) {
      socket.emit("erreur-validation", { message: erreur });
      return;
    }

    const { autorise, attente } = await verifierLimite(limiteurDemarrer, socket.id);
    if (!autorise) {
      socket.emit("erreur-limite", { message: `Trop de tentatives de demarrage. Reessayez dans ${attente}s.` });
      return;
    }

    const partie = parties[gameCode];
    if (!partie) {
      socket.emit("error", { message: "Code de partie invalide" });
      return;
    }
    if (socket.id !== partie.hostId) {
      socket.emit("erreur-validation", { message: "Seul l'hote peut demarrer la partie" });
      return;
    }
    if (partie.state !== "waiting") return;

    if (settings) {
      partie.settings = normaliserParametres(settings);
    }

    if (Object.keys(partie.players).length < 2) {
      socket.emit("error", { message: "Au moins 2 joueurs requis" });
      return;
    }

    demarrerPartieInterne(gameCode);
  });

  // Soumettre une reponse
  socket.on("submit-answer", async ({ gameCode, answer }) => {
    const { valide, erreur } = validerPayload(schemaSoumettreReponse, { gameCode, answer });
    if (!valide) {
      socket.emit("erreur-validation", { message: erreur });
      return;
    }

    const { autorise, attente } = await verifierLimite(limiteurReponse, socket.id);
    if (!autorise) {
      socket.emit("erreur-limite", { message: `Trop de soumissions. Reessayez dans ${attente}s.` });
      return;
    }

    const partie = parties[gameCode];
    const joueur = joueurs[socket.id];

    if (!partie || !joueur || !partie.questionOpen) return;
    if (joueur.hasAnswered) return;

    joueur.hasAnswered = true;
    partie.answers.push({ playerId: socket.id, playerName: joueur.name, answer, timestamp: Date.now() });

    io.to(gameCode).emit("player-answered", {
      playerId: socket.id,
      playerName: joueur.name,
      totalAnswered: partie.answers.length,
      totalPlayers: Object.keys(partie.players).filter((id) => !partie.players[id].isHost).length,
    });

    const joueursActifs = Object.values(partie.players).filter(
      (j) => partie.mode !== "spectator" || !j.isHost
    );
    const tousOntRepondu = joueursActifs.every((j) => j.hasAnswered);
    if (tousOntRepondu) {
      annulerTimersPartie(partie);
      finaliserQuestion(gameCode);
    }
  });

  // Question suivante (hote)
  socket.on("next-question", ({ gameCode }) => {
    const partie = parties[gameCode];
    if (!partie || socket.id !== partie.hostId) return;
    questionSuivante(gameCode);
  });

  // Rejoindre en tant que spectateur TV (lecture seule)
  socket.on("spectate-join", ({ gameCode }) => {
    const partie = parties[gameCode];
    if (!partie) {
      socket.emit("error", { message: "Partie introuvable" });
      return;
    }

    socket.join(gameCode);

    socket.emit("spectate-joined", {
      gameCode,
      hostName: partie.hostName,
      mode: partie.mode,
      state: partie.state,
      settings: partie.settings,
      players: Object.values(partie.players)
        .filter((j) => partie.mode !== "spectator" || !j.isHost)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .map((j) => ({ name: j.name, score: partie.scores[j.id] || 0 })),
    });

    if (partie.state === "playing" && partie.currentQuestion) {
      const optionsMelangees = melangerTableau([...partie.currentQuestion.options]);
      socket.emit("new-question", {
        question: partie.currentQuestion.question,
        options: optionsMelangees,
        timeLimit: partie.settings.timePerQuestion * 1000,
        questionNumber: partie.currentQuestionIndex + 1,
        totalQuestions: partie.questions.length,
        imageUrl: partie.currentQuestion.imageUrl || null,
        illustrationTexte: partie.currentQuestion.illustrationTexte || null,
      });
    }

    console.log(`Spectateur connecte a ${gameCode}`);
  });

  // Terminer la partie (hote)
  socket.on("end-game", ({ gameCode }) => {
    const partie = parties[gameCode];
    if (!partie || socket.id !== partie.hostId) return;
    terminerPartie(gameCode);
  });

  // Lancer le vote du theme (hote, mode IA)
  socket.on("start-theme-vote", async ({ gameCode }) => {
    const partie = parties[gameCode];
    if (!partie || partie.state !== "waiting" || socket.id !== partie.hostId) return;

    const themes = melangerTableau([...THEMES_PREDEFINIS]).slice(0, 3);

    partie.themeVoteActive = true;
    partie.themeVotes = {};
    themes.forEach((t) => { partie.themeVotes[t] = 0; });
    partie.themeVoteOptions = themes;
    partie.themeVotedBy = {};

    io.to(gameCode).emit("theme-vote-started", { themes, duration: 20 });
    console.log(`Vote de theme lance pour ${gameCode}: ${themes.join(", ")}`);

    partie._themeVoteTimer = setTimeout(async () => {
      partie.themeVoteActive = false;

      const votes = partie.themeVotes;
      const maxVotes = Math.max(...Object.values(votes));
      const candidats = Object.keys(votes).filter((t) => votes[t] === maxVotes);
      const gagnant = candidats[Math.floor(Math.random() * candidats.length)];

      io.to(gameCode).emit("theme-vote-result", { winner: gagnant, votes });
      console.log(`Vote termine pour ${gameCode}, theme gagnant: ${gagnant}`);

      try {
        const questions = await genererQuestionsViaGroq(gagnant, partie.settings.questionsCount || 10);
        partie.providedQuestions = questions;
        io.to(gameCode).emit("questions-ready", { count: questions.length, theme: gagnant });
        console.log(`Questions pretes pour ${gameCode}: ${questions.length} questions sur "${gagnant}"`);
      } catch (erreur) {
        console.error(`Erreur generation questions pour ${gameCode}:`, erreur.message);
        io.to(gameCode).emit("questions-error", { message: "Erreur lors de la generation des questions" });
      }
    }, 20000);
  });

  // Voter pour un theme
  socket.on("vote-theme", async ({ gameCode, theme }) => {
    const { valide, erreur } = validerPayload(schemaVoteTheme, { gameCode, theme });
    if (!valide) {
      socket.emit("erreur-validation", { message: erreur });
      return;
    }

    const { autorise, attente } = await verifierLimite(limiteurVote, socket.id);
    if (!autorise) {
      socket.emit("erreur-limite", { message: `Trop de votes. Reessayez dans ${attente}s.` });
      return;
    }

    const partie = parties[gameCode];
    if (!partie || !partie.themeVoteActive) return;

    if (!partie.themeVoteOptions || !partie.themeVoteOptions.includes(theme)) {
      socket.emit("erreur-validation", { message: "Theme invalide : ne fait pas partie des options proposees" });
      return;
    }

    if (partie.themeVotedBy[socket.id]) return;

    partie.themeVotedBy[socket.id] = theme;
    partie.themeVotes[theme]++;

    io.to(gameCode).emit("theme-vote-update", {
      votes: partie.themeVotes,
      total: Object.keys(partie.themeVotedBy).length,
    });
  });

  // Deconnexion
  socket.on("disconnect", () => {
    console.log("Deconnexion:", socket.id);

    const joueur = joueurs[socket.id];
    if (joueur) {
      const codePartie = joueur.gameCode;
      const partie = parties[codePartie];

      if (partie) {
        delete partie.players[socket.id];
        delete partie.scores[socket.id];

        if (joueur.isHost) {
          console.log(`Hote deconnecte de ${codePartie}, attente de reconnexion...`);
          partie.hostDisconnectedAt = Date.now();

          setTimeout(() => {
            if (parties[codePartie] && parties[codePartie].hostDisconnectedAt) {
              console.log(`Hote non reconnecte, suppression de ${codePartie}`);
              io.to(codePartie).emit("host-disconnected");
              delete parties[codePartie];
            }
          }, 10000);
        } else {
          io.to(codePartie).emit("player-left", {
            playerId: socket.id,
            playerName: joueur.name,
            players: Object.values(partie.players).map((j) => ({ id: j.id, name: j.name, score: j.score })),
          });
        }
      }

      delete joueurs[socket.id];
    }
  });
});

// ============================================
// DEMARRAGE DU SERVEUR
// ============================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur demarre sur le port ${PORT}`);
  if (toutesLesQuestions.length > 0) {
    console.log(`${toutesLesQuestions.length} questions pretes (backup)`);
  } else {
    console.log("Aucune question dans le backend, attente des questions du frontend");
  }
});
