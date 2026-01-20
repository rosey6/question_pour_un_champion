/*
  Backend Socket.IO - mode en ligne (hostless)
  - Rooms (code 6 caracteres)
  - Tout le monde est joueur
  - Premier buzz => options uniquement pour ce joueur
  - Resultat diffuse a tous, puis question suivante

  Note: CommonJS volontaire pour eviter les problemes ESM sur Render.
*/

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: "1mb" }));

// CORS: autoriser le front (Cloudflare Workers) + tests locaux
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);
      return cb(null, allowedOrigins.includes(origin));
    },
    credentials: true,
  })
);

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: function (origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);
      return cb(null, allowedOrigins.includes(origin));
    },
    credentials: true,
  },
});

// ------------------------
// Questions (fallback)
// ------------------------

const DEFAULT_QUESTIONS = [
  {
    question: "Quelle est la capitale du Canada ?",
    options: ["Ottawa", "Toronto", "Montréal", "Vancouver"],
    answer: "Ottawa",
  },
  {
    question: "Quel pays est célèbre pour la tour Eiffel ?",
    options: ["France", "Italie", "Espagne", "Belgique"],
    answer: "France",
  },
];

function pickQuestions(n) {
  const src = DEFAULT_QUESTIONS;
  const out = [];
  for (let i = 0; i < n; i++) out.push(src[i % src.length]);
  return out;
}

// ------------------------
// State
// ------------------------

/** @type {Map<string, any>} */
const rooms = new Map();

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getScoreboard(room) {
  return Object.values(room.players)
    .map((p) => ({ id: p.id, name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score);
}

function emitRoomUpdate(room) {
  io.to(room.code).emit("room-update", {
    gameCode: room.code,
    state: room.state,
    settings: room.settings,
    players: getScoreboard(room),
  });
}

function clearTimers(room) {
  if (room.timers?.buzzer) clearTimeout(room.timers.buzzer);
  if (room.timers?.answer) clearTimeout(room.timers.answer);
  if (room.timers?.next) clearTimeout(room.timers.next);
  room.timers = { buzzer: null, answer: null, next: null };
}

function startRound(room) {
  clearTimers(room);
  room.buzzWinner = null;
  room.state = "playing";

  const q = room.questions[room.currentIndex];
  const payload = {
    gameCode: room.code,
    questionNumber: room.currentIndex + 1,
    totalQuestions: room.questions.length,
    question: q.question,
    imageUrl: q.imageUrl || null,
    illustrationTexte: q.illustrationTexte || null,
    buzzerSeconds: room.settings.buzzerSeconds,
  };

  io.to(room.code).emit("question", payload);

  // timer: personne ne buzz
  room.timers.buzzer = setTimeout(() => {
    finishRound(room, null, null);
  }, room.settings.buzzerSeconds * 1000);
}

function finishRound(room, winnerId, answer) {
  clearTimers(room);

  const q = room.questions[room.currentIndex];
  let winner = null;
  let isCorrect = false;

  if (winnerId && room.players[winnerId]) {
    winner = { id: winnerId, name: room.players[winnerId].name };
    isCorrect = answer != null && String(answer) === String(q.answer);
    room.players[winnerId].score += isCorrect ? room.settings.pointsCorrect : room.settings.pointsWrong;
  }

  const resultPayload = {
    gameCode: room.code,
    winner,
    answer: answer ?? null,
    correctAnswer: q.answer,
    isCorrect,
    pointsCorrect: room.settings.pointsCorrect,
    pointsWrong: room.settings.pointsWrong,
    questionNumber: room.currentIndex + 1,
    totalQuestions: room.questions.length,
    scoreboard: getScoreboard(room),
  };

  io.to(room.code).emit("round-result", resultPayload);

  // prochaine question
  room.timers.next = setTimeout(() => {
    room.currentIndex += 1;
    if (room.currentIndex >= room.questions.length) {
      room.state = "finished";
      io.to(room.code).emit("game-over", {
        gameCode: room.code,
        scoreboard: getScoreboard(room),
      });
      return;
    }
    startRound(room);
  }, 2500);
}

function startGame(room) {
  if (!room) return;
  if (room.state === "playing") return;

  room.state = "playing";
  room.currentIndex = 0;
  room.buzzWinner = null;
  clearTimers(room);

  // reset scores
  Object.values(room.players).forEach((p) => (p.score = 0));

  // questions
  room.questions = pickQuestions(room.settings.questionsCount);

  io.to(room.code).emit("game-started", {
    gameCode: room.code,
    totalQuestions: room.questions.length,
  });

  startRound(room);
}

io.on("connection", (socket) => {
  socket.on("create-room", ({ playerName, settings }) => {
    try {
      const name = String(playerName || "").trim().slice(0, 24);
      if (!name) return socket.emit("error-message", { message: "Nom invalide." });

      let code = makeCode();
      while (rooms.has(code)) code = makeCode();

      const s = {
        maxPlayers: clampInt(settings?.maxPlayers, 2, 4, 2),
        questionsCount: clampInt(settings?.questionsCount, 5, 50, 10),
        buzzerSeconds: clampInt(settings?.buzzerSeconds, 5, 90, 30),
        answerSeconds: clampInt(settings?.answerSeconds, 5, 60, 15),
        pointsCorrect: clampInt(settings?.pointsCorrect, 1, 50, 5),
        pointsWrong: clampInt(settings?.pointsWrong, -50, -1, -5),
      };

      const room = {
        code,
        settings: s,
        players: {},
        state: "waiting",
        questions: [],
        currentIndex: 0,
        buzzWinner: null,
        awaitingAnswerFor: null,
        timers: { buzzer: null, answer: null, next: null },
      };

      rooms.set(code, room);

      room.players[socket.id] = { id: socket.id, name, score: 0 };
      socket.join(code);

      socket.emit("room-created", { gameCode: code, settings: room.settings });
      emitRoomUpdate(room);
    } catch (e) {
      socket.emit("error-message", { message: "Erreur création partie." });
    }
  });

  socket.on("join-room", ({ gameCode, playerName }) => {
    const code = String(gameCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return socket.emit("error-message", { message: "Partie introuvable." });
    if (room.state !== "waiting") return socket.emit("error-message", { message: "Partie déjà commencée." });

    const name = String(playerName || "").trim().slice(0, 24);
    if (!name) return socket.emit("error-message", { message: "Nom invalide." });

    const count = Object.keys(room.players).length;
    if (count >= room.settings.maxPlayers) return socket.emit("error-message", { message: "Salle pleine." });

    room.players[socket.id] = { id: socket.id, name, score: 0 };
    socket.join(code);

    socket.emit("room-joined", { gameCode: code, settings: room.settings });
    emitRoomUpdate(room);
  });

  socket.on("leave-room", ({ gameCode }) => {
    const code = String(gameCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return;
    socket.leave(code);
    if (room.players[socket.id]) delete room.players[socket.id];

    // supprimer si vide
    if (Object.keys(room.players).length === 0) {
      clearTimers(room);
      rooms.delete(code);
      return;
    }
    emitRoomUpdate(room);
  });

  socket.on("start-game", ({ gameCode }) => {
    const code = String(gameCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return;
    if (room.state !== "waiting") return;
    if (Object.keys(room.players).length < 2) return;
    startGame(room);
  });

  socket.on("buzz", ({ gameCode }) => {
    const code = String(gameCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return;
    if (room.state !== "playing") return;
    if (room.buzzWinner) return;
    if (!room.players[socket.id]) return;

    room.buzzWinner = socket.id;
    room.awaitingAnswerFor = socket.id;

    // stop timer buzzer
    if (room.timers?.buzzer) clearTimeout(room.timers.buzzer);
    room.timers.buzzer = null;

    io.to(room.code).emit("buzz-winner", {
      gameCode: room.code,
      winner: { id: socket.id, name: room.players[socket.id].name },
    });

    const q = room.questions[room.currentIndex];
    // options uniquement au winner
    io.to(socket.id).emit("answer-options", {
      gameCode: room.code,
      options: q.options,
      answerSeconds: room.settings.answerSeconds,
    });

    // timer reponse
    room.timers.answer = setTimeout(() => {
      if (room.awaitingAnswerFor) {
        finishRound(room, room.awaitingAnswerFor, null);
        room.awaitingAnswerFor = null;
      }
    }, room.settings.answerSeconds * 1000);
  });

  socket.on("submit-answer", ({ gameCode, answer }) => {
    const code = String(gameCode || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return;
    if (room.state !== "playing") return;
    if (!room.awaitingAnswerFor) return;
    if (room.awaitingAnswerFor !== socket.id) return;

    room.awaitingAnswerFor = null;
    if (room.timers?.answer) clearTimeout(room.timers.answer);
    room.timers.answer = null;

    finishRound(room, socket.id, answer);
  });

  socket.on("disconnect", () => {
    // retirer de toutes les rooms
    for (const room of rooms.values()) {
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        if (room.awaitingAnswerFor === socket.id) {
          // si le winner part, on termine la manche comme "pas de reponse"
          room.awaitingAnswerFor = null;
          finishRound(room, null, null);
        }

        if (Object.keys(room.players).length === 0) {
          clearTimers(room);
          rooms.delete(room.code);
        } else {
          emitRoomUpdate(room);
        }
      }
    }
  });
});

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

server.listen(PORT, () => {
  console.log(`Backend listening on ${PORT}`);
});
