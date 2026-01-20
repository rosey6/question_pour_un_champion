/* global io */

// ------------------------------------------------------------
// Configuration
// ------------------------------------------------------------
const BACKEND_ORIGIN = "https://questionpourunchampion-backend.onrender.com";

// Cache busting safe: do not depend on query param versioning.

function $(id) {
  return document.getElementById(id);
}

function safeText(el, text) {
  if (!el) return;
  el.textContent = text;
}

function loadPlayerName() {
  const stored = (localStorage.getItem("qpuc_playerName") || "").trim();
  return stored || "Joueur";
}

function savePlayerName(name) {
  localStorage.setItem("qpuc_playerName", (name || "").trim());
}

function normalizeCode(code) {
  return (code || "").toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function connectSocket() {
  // Prefer websocket; allow fallback to polling to survive restrictive networks.
  return io(BACKEND_ORIGIN, {
    transports: ["websocket", "polling"],
    withCredentials: false,
  });
}

// ------------------------------------------------------------
// Home
// ------------------------------------------------------------
function initHome() {
  const nameInput = $("playerName");
  const btnGoCreate = $("goCreate");
  const btnGoJoin = $("goJoin");

  if (!nameInput || !btnGoCreate || !btnGoJoin) return;

  nameInput.value = loadPlayerName();

  function persistName() {
    savePlayerName(nameInput.value);
  }

  nameInput.addEventListener("input", persistName);
  nameInput.addEventListener("change", persistName);

  btnGoCreate.addEventListener("click", () => {
    persistName();
    window.location.href = "online-create.html";
  });

  btnGoJoin.addEventListener("click", () => {
    persistName();
    window.location.href = "online-join.html";
  });
}

// ------------------------------------------------------------
// Create
// ------------------------------------------------------------
function initCreate() {
  const btnCreate = $("btnCreate");
  const createStatus = $("createStatus");
  const selPlayers = $("playersCount");
  const selQuestions = $("questionsCount");
  const selBuzz = $("buzzSeconds");
  const selAnswer = $("answerSeconds");

  if (!btnCreate || !createStatus || !selPlayers || !selQuestions || !selBuzz || !selAnswer) return;

  const socket = connectSocket();
  let isBusy = false;

  socket.on("connect", () => {
    safeText(createStatus, "Connecte au serveur.");
  });

  socket.on("disconnect", () => {
    safeText(createStatus, "Deconnecte du serveur.");
  });

  socket.on("room:error", (payload) => {
    isBusy = false;
    btnCreate.disabled = false;
    safeText(createStatus, payload && payload.message ? payload.message : "Erreur.");
  });

  socket.on("room:created", (payload) => {
    isBusy = false;
    btnCreate.disabled = false;

    const code = payload && payload.code ? payload.code : "";
    if (!code) {
      safeText(createStatus, "Erreur: code non recu.");
      return;
    }
    localStorage.setItem("qpuc_gameCode", code);
    // Redirect to the room.
    window.location.href = "online-room.html?code=" + encodeURIComponent(code);
  });

  btnCreate.addEventListener("click", () => {
    if (isBusy) return;
    isBusy = true;
    btnCreate.disabled = true;

    const settings = {
      playersCount: parseInt(selPlayers.value, 10),
      questionsCount: parseInt(selQuestions.value, 10),
      buzzSeconds: parseInt(selBuzz.value, 10),
      answerSeconds: parseInt(selAnswer.value, 10),
    };

    const name = loadPlayerName();
    safeText(createStatus, "Creation en cours...");
    socket.emit("room:create", { name, settings });
  });
}

// ------------------------------------------------------------
// Join
// ------------------------------------------------------------
function initJoin() {
  const btnJoin = $("btnJoin");
  const codeInput = $("gameCode");
  const joinStatus = $("joinStatus");

  if (!btnJoin || !codeInput || !joinStatus) return;

  const socket = connectSocket();
  let isBusy = false;

  socket.on("connect", () => {
    safeText(joinStatus, "Connecte au serveur.");
  });

  socket.on("disconnect", () => {
    safeText(joinStatus, "Deconnecte du serveur.");
  });

  socket.on("room:error", (payload) => {
    isBusy = false;
    btnJoin.disabled = false;
    safeText(joinStatus, payload && payload.message ? payload.message : "Erreur.");
  });

  socket.on("room:joined", (payload) => {
    isBusy = false;
    btnJoin.disabled = false;

    const code = payload && payload.code ? payload.code : "";
    if (!code) {
      safeText(joinStatus, "Erreur: code non recu.");
      return;
    }
    localStorage.setItem("qpuc_gameCode", code);
    window.location.href = "online-room.html?code=" + encodeURIComponent(code);
  });

  btnJoin.addEventListener("click", () => {
    if (isBusy) return;
    const code = normalizeCode(codeInput.value);
    if (!code) {
      safeText(joinStatus, "Entrez un code valide.");
      return;
    }

    isBusy = true;
    btnJoin.disabled = true;

    const name = loadPlayerName();
    safeText(joinStatus, "Connexion a la partie...");
    socket.emit("room:join", { name, code });
  });
}

// ------------------------------------------------------------
// Room / Game
// ------------------------------------------------------------
function initRoom() {
  const viewLobby = $("viewLobby");
  const viewQuestion = $("viewQuestion");
  const viewResult = $("viewResult");

  if (!viewLobby || !viewQuestion || !viewResult) return;

  // Elements
  const lobbyCode = $("lobbyCode");
  const lobbyPlayers = $("lobbyPlayers");
  const lobbyStatus = $("lobbyStatus");
  const btnStart = $("btnStart");

  const qText = $("qText");
  const qNumber = $("qNumber");
  const qImage = $("qImage");
  const qIllustration = $("qIllustration");
  const buzzerBtn = $("buzzerBtn");
  const timerText = $("timerText");
  const answerArea = $("answerArea");

  const resultTitle = $("resultTitle");
  const resultCorrect = $("resultCorrect");
  const resultImage = $("resultImage");
  const resultIllustration = $("resultIllustration");
  const resultDelta = $("resultDelta");
  const resultScores = $("resultScores");
  const btnNext = $("btnNext");
  const btnQuit = $("btnQuit");

  const params = new URLSearchParams(window.location.search);
  const code = normalizeCode(params.get("code") || localStorage.getItem("qpuc_gameCode") || "");
  if (!code) {
    safeText(lobbyStatus, "Aucun code de partie.");
    return;
  }
  safeText(lobbyCode, code);

  const name = loadPlayerName();

  const socket = connectSocket();

  // Local state
  let state = {
    phase: "lobby", // lobby | buzz | answer | result
    players: [],
    settings: null,
    question: null,
    canBuzz: false,
    canAnswer: false,
    winnerId: null,
    winnerName: null,
    timer: null,
  };

  function showView(which) {
    viewLobby.style.display = which === "lobby" ? "block" : "none";
    viewQuestion.style.display = which === "question" ? "block" : "none";
    viewResult.style.display = which === "result" ? "block" : "none";
  }

  function renderPlayers() {
    if (!lobbyPlayers) return;
    lobbyPlayers.innerHTML = "";
    state.players.forEach((p) => {
      const li = document.createElement("li");
      li.textContent = (p && p.name ? p.name : "Joueur") + " - " + (p && typeof p.score === "number" ? p.score : 0) + " pts";
      lobbyPlayers.appendChild(li);
    });
  }

  function renderScores(scores) {
    if (!resultScores) return;
    resultScores.innerHTML = "";
    (scores || []).forEach((p) => {
      const box = document.createElement("div");
      box.className = "score-box";
      box.style.cssText = "flex:1;min-width:150px;padding:14px;border-radius:12px;background:rgba(255,255,255,0.06);text-align:center;";
      const n = document.createElement("div");
      n.style.fontWeight = "700";
      n.textContent = p.name;
      const s = document.createElement("div");
      s.style.marginTop = "6px";
      s.textContent = p.score + " points";
      box.appendChild(n);
      box.appendChild(s);
      resultScores.appendChild(box);
    });
  }

  function setTimer(seconds) {
    if (!timerText) return;
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    let remaining = seconds;
    timerText.textContent = String(remaining);
    state.timer = setInterval(() => {
      remaining -= 1;
      timerText.textContent = String(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(state.timer);
        state.timer = null;
      }
    }, 1000);
  }

  function resetAnswerArea() {
    if (!answerArea) return;
    answerArea.innerHTML = "";
  }

  function setBuzzerEnabled(enabled) {
    state.canBuzz = enabled;
    if (buzzerBtn) buzzerBtn.disabled = !enabled;
  }

  function showAnswerOptions(options) {
    resetAnswerArea();
    if (!answerArea) return;

    const opts = Array.isArray(options) ? options : [];
    if (opts.length === 0) {
      const p = document.createElement("p");
      p.textContent = "Options indisponibles.";
      answerArea.appendChild(p);
      return;
    }

    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:720px;margin:18px auto 0;";

    opts.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "bouton";
      btn.textContent = opt;
      btn.style.minHeight = "48px";
      btn.addEventListener("click", () => {
        if (!state.canAnswer) return;
        state.canAnswer = false;
        socket.emit("game:answer", { code, answer: opt });
        resetAnswerArea();
        const wait = document.createElement("p");
        wait.style.textAlign = "center";
        wait.style.marginTop = "14px";
        wait.textContent = "Reponse envoyee.";
        answerArea.appendChild(wait);
      });
      grid.appendChild(btn);
    });

    answerArea.appendChild(grid);
  }

  function showResult(payload) {
    // Result view for everyone
    showView("result");

    safeText(resultTitle, "Resultat");

    const correct = payload && payload.correctAnswer ? payload.correctAnswer : "";
    safeText(resultCorrect, correct ? "Reponse correcte: " + correct : "Reponse correcte: (non disponible)");

    if (resultImage) {
      if (payload && payload.imageUrl) {
        resultImage.src = payload.imageUrl;
        resultImage.style.display = "block";
      } else {
        resultImage.removeAttribute("src");
        resultImage.style.display = "none";
      }
    }

    safeText(resultIllustration, payload && payload.illustrationTexte ? payload.illustrationTexte : "");

    const responder = payload && payload.responderName ? payload.responderName : null;
    const delta = payload && typeof payload.delta === "number" ? payload.delta : 0;
    const isCorrect = payload && payload.isCorrect === true;

    if (!responder) {
      safeText(resultDelta, "Personne n'a repondu.");
    } else {
      if (isCorrect) {
        safeText(resultDelta, responder + ": Bonne reponse! +" + delta + " points");
      } else {
        safeText(resultDelta, responder + ": Mauvaise reponse! " + delta + " points");
      }
    }

    renderScores(payload && payload.scores ? payload.scores : []);

    // Auto next after a short delay (but allow manual too)
    if (btnNext) btnNext.disabled = false;
  }

  // ----------------------------------------------------------
  // Socket events
  // ----------------------------------------------------------
  socket.on("connect", () => {
    safeText(lobbyStatus, "Connexion en cours...");
    socket.emit("room:join", { name, code });
  });

  socket.on("room:joined", (payload) => {
    safeText(lobbyStatus, "Connecte. En attente des autres joueurs...");
    state.players = (payload && payload.players) || [];
    state.settings = payload && payload.settings ? payload.settings : null;
    renderPlayers();

    // Start button availability
    if (btnStart) {
      const target = state.settings && state.settings.playersCount ? state.settings.playersCount : 2;
      btnStart.disabled = !(state.players.length >= 2 && state.players.length <= target);
    }

    showView("lobby");
  });

  socket.on("room:update", (payload) => {
    state.players = (payload && payload.players) || state.players;
    state.settings = payload && payload.settings ? payload.settings : state.settings;
    renderPlayers();

    if (btnStart) {
      const target = state.settings && state.settings.playersCount ? state.settings.playersCount : 2;
      btnStart.disabled = !(state.players.length >= 2 && state.players.length <= target);
    }
  });

  socket.on("room:error", (payload) => {
    safeText(lobbyStatus, payload && payload.message ? payload.message : "Erreur.");
  });

  socket.on("game:question", (payload) => {
    state.phase = "buzz";
    state.question = payload;
    state.winnerId = null;
    state.winnerName = null;
    state.canAnswer = false;

    showView("question");

    safeText(qNumber, payload && payload.questionNumber ? "Question " + payload.questionNumber + " / " + payload.totalQuestions : "");
    safeText(qText, payload && payload.question ? payload.question : "");

    if (qImage) {
      if (payload && payload.imageUrl) {
        qImage.src = payload.imageUrl;
        qImage.style.display = "block";
      } else {
        qImage.removeAttribute("src");
        qImage.style.display = "none";
      }
    }
    safeText(qIllustration, payload && payload.illustrationTexte ? payload.illustrationTexte : "");

    resetAnswerArea();
    setBuzzerEnabled(true);

    const buzzSeconds = payload && payload.buzzSeconds ? payload.buzzSeconds : 30;
    setTimer(buzzSeconds);
  });

  socket.on("game:buzzed", (payload) => {
    // Someone buzzed - lock buzzers for everyone.
    state.phase = "answer";
    state.winnerId = payload && payload.playerId ? payload.playerId : null;
    state.winnerName = payload && payload.playerName ? payload.playerName : null;

    setBuzzerEnabled(false);

    // Winner sees options; others see waiting message.
    resetAnswerArea();
    if (!answerArea) return;

    const p = document.createElement("p");
    p.style.textAlign = "center";
    p.style.marginTop = "14px";
    p.textContent = state.winnerName ? (state.winnerName + " va repondre") : "Un joueur va repondre";
    answerArea.appendChild(p);
  });

  socket.on("game:answer:request", (payload) => {
    // Only winner receives this.
    if (!payload) return;
    state.phase = "answer";
    state.canAnswer = true;

    const answerSeconds = payload && payload.answerSeconds ? payload.answerSeconds : 15;
    setTimer(answerSeconds);

    // Hide everything except buzzer + options as requested
    // We keep the question text visible; the user can request only buzzer later.
    showAnswerOptions(payload.options);
  });

  socket.on("game:result", (payload) => {
    state.phase = "result";
    state.canAnswer = false;
    setBuzzerEnabled(false);
    resetAnswerArea();
    showResult(payload);

    // Update lobby list scores too (if players returned)
    if (payload && payload.scores) {
      state.players = payload.scores;
      renderPlayers();
    }
  });

  socket.on("game:ended", (payload) => {
    showView("result");
    safeText(resultTitle, "Fin de partie");
    safeText(resultCorrect, "");
    if (resultImage) resultImage.style.display = "none";
    safeText(resultIllustration, payload && payload.reason ? payload.reason : "Partie terminee.");
    renderScores(payload && payload.scores ? payload.scores : []);
    safeText(resultDelta, "");
    if (btnNext) btnNext.disabled = true;
  });

  // ----------------------------------------------------------
  // UI events
  // ----------------------------------------------------------
  if (btnStart) {
    btnStart.addEventListener("click", () => {
      btnStart.disabled = true;
      safeText(lobbyStatus, "Demarrage...");
      socket.emit("game:start", { code });
    });
  }

  if (buzzerBtn) {
    buzzerBtn.addEventListener("click", () => {
      if (!state.canBuzz) return;
      setBuzzerEnabled(false);
      socket.emit("game:buzz", { code });
    });
  }

  if (btnNext) {
    btnNext.addEventListener("click", () => {
      btnNext.disabled = true;
      socket.emit("game:next", { code });
    });
  }

  if (btnQuit) {
    btnQuit.addEventListener("click", () => {
      window.location.href = "online-home.html";
    });
  }

  // Init UI
  showView("lobby");
  setBuzzerEnabled(false);
  safeText(timerText, "-");
}

// ------------------------------------------------------------
// Boot
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  initHome();
  initCreate();
  initJoin();
  initRoom();
});
