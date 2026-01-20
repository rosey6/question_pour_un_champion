/*
  Mode en ligne (hostless):
  - Tout le monde est joueur
  - Tout le monde a un buzzer
  - Le premier qui buzz reçoit les options
  - Un écran "résultat" s'affiche à chaque fin de manche (buzz + réponse ou pas de buzz)

  Important: ce fichier est indépendant de script.js (solo). Ne pas modifier script.js.
*/

(function () {
  const BACKEND_URL = (window.QPC && window.QPC.BACKEND_URL) || "https://questionpourunchampion-backend.onrender.com";

  // -------------------------
  // DOM helpers
  // -------------------------
  const $ = (id) => document.getElementById(id);
  const show = (id) => ($(id).style.display = "block");
  const hide = (id) => ($(id).style.display = "none");

  function setText(id, text) {
    const el = $(id);
    if (!el) return;
    el.textContent = String(text);
  }

  function setError(msg) {
    const box = $("home-error");
    if (!box) return;
    if (!msg) {
      box.style.display = "none";
      box.textContent = "";
      return;
    }
    box.style.display = "block";
    box.textContent = msg;
  }

  function switchScreen(name) {
    const screens = ["screen-home", "screen-lobby", "screen-game", "screen-result"];
    for (const s of screens) $(s).style.display = s === name ? "block" : "none";
  }

  function normalizeCode(raw) {
    return String(raw || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
  }

  // -------------------------
  // State
  // -------------------------
  let socket = null;
  let gameCode = null;
  let me = { id: null, name: null };
  let settings = null;

  let currentQuestion = null;
  let amIBuzzWinner = false;
  let buzzerEnabled = false;
  let timerInterval = null;

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function startTimer(seconds) {
    stopTimer();
    let remaining = Math.max(0, Number(seconds) || 0);
    setText("temps-multijoueur", remaining);
    timerInterval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        remaining = 0;
        stopTimer();
      }
      setText("temps-multijoueur", remaining);
    }, 1000);
  }

  function setBuzzerState(enabled) {
    buzzerEnabled = !!enabled;
    const btn = $("btn-buzzer");
    if (btn) btn.disabled = !buzzerEnabled;
  }

  function showBuzzerOnly() {
    amIBuzzWinner = false;
    hide("answers-zone");
    show("buzzer-zone");
    setBuzzerState(true);
  }

  function showAnswerUI(options) {
    amIBuzzWinner = true;
    hide("buzzer-zone");
    show("answers-zone");

    const list = $("answers-list");
    list.innerHTML = "";

    (options || []).forEach((opt) => {
      const b = document.createElement("button");
      b.className = "option-joueur";
      b.type = "button";
      b.textContent = opt;
      b.addEventListener("click", () => {
        if (!socket || !gameCode) return;
        // verrou: éviter double click
        Array.from(list.querySelectorAll("button")).forEach((x) => (x.disabled = true));
        socket.emit("submit-answer", { gameCode, answer: opt });
      });
      list.appendChild(b);
    });
  }

  function renderPlayers(playersArr) {
    const list = $("players-list");
    list.innerHTML = "";
    (playersArr || []).forEach((p) => {
      const row = document.createElement("div");
      row.className = "historique-item";
      row.innerHTML = `
        <div class="historique-info">
          <div class="historique-titre">${escapeHtml(p.name)}</div>
          <div class="historique-date">${p.id === me.id ? "Vous" : "Joueur"}</div>
        </div>
        <div class="historique-score">${Number(p.score || 0)}</div>
      `;
      list.appendChild(row);
    });
  }

  function renderScores(scoreboard) {
    const box = $("scores-table");
    box.innerHTML = "";
    (scoreboard || []).forEach((p) => {
      const row = document.createElement("div");
      row.className = "historique-item";
      row.innerHTML = `
        <div class="historique-info">
          <div class="historique-titre">${escapeHtml(p.name)}</div>
          <div class="historique-date">${p.id === me.id ? "Vous" : "Joueur"}</div>
        </div>
        <div class="historique-score">${Number(p.score || 0)}</div>
      `;
      box.appendChild(row);
    });
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // -------------------------
  // Socket
  // -------------------------
  function connectSocket() {
    if (socket) return socket;

    socket = window.io(BACKEND_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      timeout: 20000,
    });

    socket.on("connect", () => {
      me.id = socket.id;
    });

    socket.on("disconnect", () => {
      // on laisse l'UI en place, le backend gère
    });

    socket.on("error-message", ({ message }) => {
      setError(message || "Erreur.");
    });

    socket.on("room-created", (payload) => {
      gameCode = payload.gameCode;
      settings = payload.settings;
      setText("lobby-code", gameCode);
      setText("lobby-max", settings.maxPlayers);
      switchScreen("screen-lobby");
      setError("");
    });

    socket.on("room-joined", (payload) => {
      gameCode = payload.gameCode;
      settings = payload.settings;
      setText("lobby-code", gameCode);
      setText("lobby-max", settings.maxPlayers);
      switchScreen("screen-lobby");
      setError("");
    });

    socket.on("room-update", (payload) => {
      if (!payload || payload.gameCode !== gameCode) return;
      setText("lobby-count", payload.players.length);
      setText("lobby-max", payload.settings.maxPlayers);
      renderPlayers(payload.players);

      // auto-start quand complet
      if (payload.state === "waiting" && payload.players.length >= payload.settings.maxPlayers) {
        // n'importe qui peut demander le start; backend protège contre doubles
        socket.emit("start-game", { gameCode });
      }
    });

    socket.on("game-started", (payload) => {
      if (!payload || payload.gameCode !== gameCode) return;
      setText("game-qtotal", payload.totalQuestions);
      switchScreen("screen-game");
      showBuzzerOnly();
    });

    socket.on("question", (payload) => {
      currentQuestion = payload;
      setText("game-qnum", payload.questionNumber);
      setText("game-qtotal", payload.totalQuestions);
      setText("game-question", payload.question);

      // image/illustration
      const img = $("game-image");
      const ill = $("game-illustration");
      if (payload.imageUrl) {
        img.src = payload.imageUrl;
        img.style.display = "block";
      } else {
        img.removeAttribute("src");
        img.style.display = "none";
      }
      if (payload.illustrationTexte) {
        ill.textContent = payload.illustrationTexte;
        ill.style.display = "block";
      } else {
        ill.textContent = "";
        ill.style.display = "none";
      }

      // UI
      switchScreen("screen-game");
      showBuzzerOnly();
      startTimer(payload.buzzerSeconds);
    });

    socket.on("buzz-winner", (payload) => {
      if (!payload || payload.gameCode !== gameCode) return;
      setBuzzerState(false);
      // si je suis le winner, j'attends answer-options
    });

    socket.on("answer-options", (payload) => {
      if (!payload || payload.gameCode !== gameCode) return;
      // options uniquement au winner
      startTimer(payload.answerSeconds);
      showAnswerUI(payload.options);
    });

    socket.on("round-result", (payload) => {
      if (!payload || payload.gameCode !== gameCode) return;
      stopTimer();
      setBuzzerState(false);

      // Titre + sous-titre
      const t = payload.winner
        ? payload.isCorrect
          ? `${payload.winner.name} : Bonne réponse (+${payload.pointsCorrect})`
          : `${payload.winner.name} : Mauvaise réponse (${payload.pointsWrong})`
        : "Personne n'a buzzé";

      setText("result-title", "Résultat");
      setText("result-sub", t);

      renderScores(payload.scoreboard);
      switchScreen("screen-result");
    });

    socket.on("game-over", (payload) => {
      if (!payload || payload.gameCode !== gameCode) return;
      stopTimer();
      setText("result-title", "Partie terminée");
      setText("result-sub", "Scores finaux");
      renderScores(payload.scoreboard);
      switchScreen("screen-result");
    });

    return socket;
  }

  // -------------------------
  // UI actions
  // -------------------------
  function getName() {
    const name = String($("player-name").value || "").trim();
    return name;
  }

  function readSettingsFromForm() {
    const maxPlayers = Number(($("online-players")?.value) || 2);
    const questionsCount = Number(($("online-questions")?.value) || 10);
    const buzzerSeconds = Number(($("online-time-question")?.value) || 30);
    const answerSeconds = Number(($("online-time-answer")?.value) || 15);

    return {
      maxPlayers,
      questionsCount,
      buzzerSeconds,
      answerSeconds,
      pointsCorrect: 5,
      pointsWrong: -5,
    };
  }

  function createRoom() {
    setError("");
    const name = getName();
    if (!name) return setError("Veuillez saisir votre nom.");

    me.name = name;
    const s = readSettingsFromForm();

    connectSocket();
    socket.emit("create-room", { playerName: name, settings: s });
  }

  function joinRoom() {
    setError("");
    const name = getName();
    if (!name) return setError("Veuillez saisir votre nom.");
    const code = normalizeCode(($('join-code')?.value) || '');
    if (code.length !== 6) return setError("Veuillez saisir un code de 6 caractères.");

    me.name = name;
    connectSocket();
    socket.emit("join-room", { gameCode: code, playerName: name });
  }

  function startGameManual() {
    if (!socket || !gameCode) return;
    socket.emit("start-game", { gameCode });
  }

  function leaveRoom() {
    if (socket && gameCode) socket.emit("leave-room", { gameCode });
    gameCode = null;
    currentQuestion = null;
    stopTimer();
    switchScreen("screen-home");
  }

  function buzz() {
    if (!socket || !gameCode || !buzzerEnabled) return;
    setBuzzerState(false);
    socket.emit("buzz", { gameCode });
  }

  // -------------------------
  // Init
  // -------------------------
  function bind() {
    const on = (id, evt, fn) => {
      const el = $(id);
      if (el) el.addEventListener(evt, fn);
    };

    on('btn-create', 'click', createRoom);
    on('btn-join', 'click', joinRoom);
    on('btn-start', 'click', startGameManual);
    on('btn-leave', 'click', leaveRoom);
    on('btn-back-lobby', 'click', () => switchScreen('screen-lobby'));
    on('btn-buzzer', 'click', buzz);

    const joinCode = $('join-code');
    if (joinCode) {
      joinCode.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') joinRoom();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    bind();
    switchScreen("screen-home");
    setText("lobby-max", "0");
    setText("lobby-count", "0");
  });
})();
