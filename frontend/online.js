/*
  Mode en ligne
  - Création: génère un code de partie via event `create-game`.
  - Rejoindre: rejoint via `join-game`.
  - Démarrage: le créateur (host logique) clique "Démarrer" quand tout le monde est prêt.
  - Gameplay: tout le monde a un buzzer; seul le 1er qui buzz voit les 4 choix.
  - Résultats: écran résultat après réponse ou si personne ne buzz (timeout).

  Note: on ne modifie pas script.js. Ce module est autonome pour les pages online-*.html
*/

(function () {
  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (sel) => document.querySelector(sel);
  const safeText = (v) => (v == null ? "" : String(v));
  const clampInt = (v, def) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : def;
  };

  const BACKEND_URL = (window.BACKEND_URL || "").trim();
  if (!BACKEND_URL) {
    console.error("❌ BACKEND_URL manquant. Définissez window.BACKEND_URL dans config.js");
    return;
  }

  // -----------------------------
  // Socket
  // -----------------------------
  const socket = window.io(BACKEND_URL, {
    transports: ["websocket", "polling"],
    withCredentials: false,
  });

  socket.on("connect", () => {
    console.log("✅ Connecté au serveur:", socket.id);
    notify("success", "Connecté au serveur");
  });

  socket.on("connect_error", (err) => {
    console.error("❌ Erreur connexion:", err);
    notify("error", "Erreur de connexion au serveur");
  });

  // -----------------------------
  // UI: notifications (simple)
  // -----------------------------
  function notify(type, message) {
    const el = $("#online-notice");
    if (!el) return;
    el.style.display = "block";
    el.textContent = message;
    el.dataset.type = type;
  }

  // -----------------------------
  // Etat
  // -----------------------------
  let currentGameCode = null;
  let isCreator = false;
  let players = [];
  let settings = null;
  let currentQuestion = null; // {question, options[], correctAnswer, timeLimit, ...}
  let buzzerWinnerId = null;
  let lastAnsweringPlayerId = null;

  // -----------------------------
  // Pages: create / join / game
  // -----------------------------
  const page = document.body?.dataset?.page || "";

  if (page === "online-create") {
    wireCreatePage();
  } else if (page === "online-join") {
    wireJoinPage();
  } else {
    // online-home: rien
  }

  // -----------------------------
  // Socket events
  // -----------------------------
  socket.on("game-created", (payload) => {
    // { gameCode, game }
    isCreator = true;
    currentGameCode = payload?.gameCode || null;
    settings = payload?.game?.settings || null;
    players = normalizePlayers(payload?.game?.players);

    renderLobby({
      mode: "create",
      gameCode: currentGameCode,
      players,
      settings,
    });

    // Afficher code dans input si présent
    const codeEl = $("#online-game-code");
    if (codeEl) codeEl.value = safeText(currentGameCode);

    notify("success", `Partie créée : ${currentGameCode}`);
  });

  socket.on("game-joined", (payload) => {
    // { gameCode, game }
    isCreator = false;
    currentGameCode = payload?.gameCode || null;
    settings = payload?.game?.settings || null;
    players = normalizePlayers(payload?.game?.players);

    renderLobby({
      mode: "join",
      gameCode: currentGameCode,
      players,
      settings,
    });

    notify("success", `Rejoint : ${currentGameCode}`);
  });

  socket.on("game-update", (payload) => {
    // { gameCode, game }
    if (!currentGameCode || payload?.gameCode !== currentGameCode) return;
    players = normalizePlayers(payload?.game?.players);
    // Mettre à jour la liste lobby si visible
    updateLobbyPlayers(players);
  });

  socket.on("game-started", (payload) => {
    if (!currentGameCode || payload?.gameCode !== currentGameCode) return;
    settings = payload?.settings || settings;
    players = Array.isArray(payload?.players) ? payload.players : players;

    // Basculer UI en mode jeu (buzzer)
    showGameScreen();

    notify("success", "La partie commence !");
  });

  socket.on("new-question", (q) => {
    currentQuestion = q || null;
    buzzerWinnerId = null;
    lastAnsweringPlayerId = null;

    renderQuestion(q);
    enableBuzzer(true);
    hideAnswerOptions();
    hideResultPanel();
  });

  socket.on("player-buzzed", ({ playerId, playerName }) => {
    buzzerWinnerId = playerId || null;
    enableBuzzer(false);

    // Afficher info côté joueurs qui n'ont pas buzz
    if (socket.id !== buzzerWinnerId) {
      showWaitingForAnswer(playerName || "Un joueur");
    }
  });

  socket.on("show-answer-screen", ({ answeringPlayer }) => {
    // backend broadcast à tous. On montre les options seulement au gagnant.
    lastAnsweringPlayerId = findPlayerIdByName(answeringPlayer, players) || lastAnsweringPlayerId;

    if (socket.id === buzzerWinnerId) {
      showAnswerOptions();
    } else {
      showWaitingForAnswer(answeringPlayer || "Un joueur");
    }
  });

  socket.on("answer-result", (res) => {
    // { playerId, playerName, answer, isCorrect, score, correctAnswer }
    // MAJ scores depuis game-update si backend l'envoie, sinon on patch local
    showResultPanel(res);
  });

  socket.on("buzzer-timeout", () => {
    enableBuzzer(false);
    showResultPanel({
      timeout: true,
      playerName: null,
      isCorrect: false,
      answer: null,
      correctAnswer: currentQuestion?.correctAnswer,
    });
  });

  socket.on("error-message", (msg) => {
    notify("error", safeText(msg));
  });

  // -----------------------------
  // Create page
  // -----------------------------
  function wireCreatePage() {
    // Mark body
    if (document.body) document.body.dataset.page = "online-create";

    const btnCreate = $("#online-btn-create");
    const nameInput = $("#online-name");

    if (btnCreate) {
      btnCreate.addEventListener("click", () => {
        const playerName = (nameInput?.value || "").trim() || "Joueur";

        const rawSettings = {
          maxPlayers: clampInt($("#online-players")?.value, 2),
          questionCount: clampInt($("#online-questions")?.value, 10),
          timePerQuestion: clampInt($("#online-time-question")?.value, 30),
          timePerAnswer: clampInt($("#online-time-answer")?.value, 15),
        };

        socket.emit("create-game", { playerName, settings: rawSettings });
      });
    }

    const lobbyStartBtn = $("#online-start");
    if (lobbyStartBtn) {
      lobbyStartBtn.addEventListener("click", () => {
        if (!currentGameCode) return;
        socket.emit("start-game", { gameCode: currentGameCode });
      });
    }
  }

  // -----------------------------
  // Join page
  // -----------------------------
  function wireJoinPage() {
    if (document.body) document.body.dataset.page = "online-join";

    const btnJoin = $("#online-btn-join");
    const nameInput = $("#online-name");
    const codeInput = $("#online-code");

    if (btnJoin) {
      btnJoin.addEventListener("click", () => {
        const playerName = (nameInput?.value || "").trim() || "Joueur";
        const gameCode = (codeInput?.value || "").trim().toUpperCase();
        if (!gameCode) {
          notify("error", "Entrez un code de partie.");
          return;
        }
        socket.emit("join-game", { gameCode, playerName });
      });
    }
  }

  // -----------------------------
  // Lobby rendering
  // -----------------------------
  function normalizePlayers(playersObj) {
    if (!playersObj || typeof playersObj !== "object") return [];
    return Object.entries(playersObj).map(([id, p]) => ({
      id,
      name: p?.name || "Joueur",
      score: clampInt(p?.score, 0),
      isHost: !!p?.isHost,
    }));
  }

  function renderLobby({ mode, gameCode, players, settings }) {
    const root = $("#online-root");
    if (!root) return;

    root.innerHTML = `
      <div class="card" style="padding: 18px;">
        <h2 style="margin-top:0;">Lobby</h2>
        <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
          <div style="font-weight:700;">Code : <span id="online-code-text">${safeText(gameCode)}</span></div>
          <input id="online-game-code" value="${safeText(gameCode)}" readonly style="max-width:140px;" />
          <button class="btn" id="online-copy" type="button">Copier</button>
        </div>

        <div style="margin-top:14px;">
          <div style="opacity:.9; margin-bottom:8px;">Joueurs (${players.length}${settings?.maxPlayers ? "/" + settings.maxPlayers : ""})</div>
          <ul id="online-players-list" style="margin:0; padding-left:18px;"></ul>
        </div>

        <div style="margin-top:14px; opacity:.9;">
          <div>Questions: ${safeText(settings?.questionCount ?? "-")}</div>
          <div>Temps buzzer: ${safeText(settings?.timePerQuestion ?? "-")}s</div>
          <div>Temps réponse: ${safeText(settings?.timePerAnswer ?? "-")}s</div>
        </div>

        <div style="margin-top:18px; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
          ${mode === "create" ? `<button class="btn" id="online-start" type="button">Démarrer</button>` : `<div style="opacity:.9;">En attente du démarrage…</div>`}
          <a class="btn" href="online-home.html" style="text-decoration:none; opacity:.85;">Quitter</a>
        </div>
      </div>

      <div id="online-game" style="display:none;"></div>
    `;

    updateLobbyPlayers(players);

    const copyBtn = $("#online-copy");
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(safeText(gameCode));
          notify("success", "Code copié.");
        } catch {
          notify("error", "Impossible de copier (permission navigateur). ");
        }
      });
    }

    // Démarrer (creator)
    const startBtn = $("#online-start");
    if (startBtn) {
      startBtn.addEventListener("click", () => {
        if (!currentGameCode) return;
        socket.emit("start-game", { gameCode: currentGameCode });
      });
    }
  }

  function updateLobbyPlayers(players) {
    const list = $("#online-players-list");
    if (!list) return;
    list.innerHTML = "";
    players.forEach((p) => {
      const li = document.createElement("li");
      li.textContent = `${p.name} — ${p.score} pts${p.isHost ? " (créateur)" : ""}`;
      list.appendChild(li);
    });
  }

  // -----------------------------
  // Game screen
  // -----------------------------
  function showGameScreen() {
    const root = $("#online-root");
    if (!root) return;

    const game = $("#online-game");
    if (!game) return;
    game.style.display = "block";

    game.innerHTML = `
      <div class="card" style="padding: 18px; margin-top: 14px;">
        <h2 style="margin-top:0;">Partie</h2>

        <div id="online-question-box" style="margin-top: 10px;"></div>

        <div id="online-buzzer-zone" style="margin-top: 16px; display:flex; justify-content:center;">
          <button id="online-buzzer" type="button" class="btn" style="width: 180px; height: 180px; border-radius: 999px; font-size: 22px;">BUZZ !</button>
        </div>

        <div id="online-answer-zone" style="margin-top: 16px; display:none;"></div>
        <div id="online-wait-zone" style="margin-top: 12px; opacity:.9; display:none;"></div>

        <div id="online-result-zone" style="margin-top: 16px; display:none;"></div>
      </div>
    `;

    const buzzer = $("#online-buzzer");
    if (buzzer) {
      buzzer.addEventListener("click", () => {
        if (!currentGameCode) return;
        socket.emit("buzz", { gameCode: currentGameCode });
      });
    }
  }

  function renderQuestion(q) {
    const box = $("#online-question-box");
    if (!box) return;

    const num = q?.questionNumber ? `${q.questionNumber}/${q.totalQuestions || "?"}` : "";

    box.innerHTML = `
      <div style="text-align:center; opacity:.9;">Question ${safeText(num)}</div>
      <div style="font-size: 20px; font-weight: 700; text-align:center; margin-top: 8px;">${safeText(q?.question)}</div>
    `;
  }

  function enableBuzzer(enabled) {
    const buzzer = $("#online-buzzer");
    if (!buzzer) return;
    buzzer.disabled = !enabled;
    buzzer.style.opacity = enabled ? "1" : "0.6";
  }

  function hideAnswerOptions() {
    const zone = $("#online-answer-zone");
    if (!zone) return;
    zone.style.display = "none";
    zone.innerHTML = "";
  }

  function showWaitingForAnswer(playerName) {
    const wait = $("#online-wait-zone");
    if (!wait) return;
    wait.style.display = "block";
    wait.textContent = `${safeText(playerName)} va répondre…`;
    hideAnswerOptions();
  }

  function showAnswerOptions() {
    const zone = $("#online-answer-zone");
    const wait = $("#online-wait-zone");
    if (wait) wait.style.display = "none";
    if (!zone) return;

    const opts = currentQuestion?.options;
    if (!Array.isArray(opts) || opts.length === 0) {
      // Empêche le crash (votre erreur forEach)
      console.error("❌ Options manquantes dans currentQuestion:", currentQuestion);
      notify("error", "Options de réponse indisponibles.");
      return;
    }

    zone.style.display = "block";

    zone.innerHTML = `
      <div style="text-align:center; font-weight:700; margin-bottom: 10px;">Choisissez votre réponse</div>
      <div style="display:grid; gap: 10px; grid-template-columns: 1fr 1fr;">
        ${opts
          .map(
            (o, idx) =>
              `<button class="btn" type="button" data-opt="${idx}" style="padding: 14px; border-radius: 14px;">${safeText(o)}</button>`
          )
          .join("")}
      </div>
    `;

    zone.querySelectorAll("button[data-opt]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idx = Number(btn.dataset.opt);
        const answer = opts[idx];
        const correct = currentQuestion?.correctAnswer;
        const isCorrect = answer != null && correct != null && String(answer) === String(correct);

        // désactiver pour éviter double envoi
        zone.querySelectorAll("button").forEach((b) => (b.disabled = true));

        socket.emit("submit-answer", {
          gameCode: currentGameCode,
          answer,
          isCorrect,
        });
      });
    });
  }

  function showResultPanel(res) {
    const zone = $("#online-result-zone");
    if (!zone) return;

    const correct = currentQuestion?.correctAnswer ?? res?.correctAnswer;
    const isTimeout = !!res?.timeout;
    const playerName = res?.playerName;
    const isCorrect = !!res?.isCorrect;

    zone.style.display = "block";

    let title = "Résultat";
    let line = "";

    if (isTimeout) {
      line = "Personne n'a buzzé.";
    } else if (playerName) {
      line = `${safeText(playerName)} : ${isCorrect ? "Bonne réponse" : "Mauvaise réponse"}`;
    }

    zone.innerHTML = `
      <div style="text-align:center; font-size: 20px; font-weight: 800;">${title}</div>
      <div style="text-align:center; margin-top: 8px; opacity:.95;">${safeText(line)}</div>
      <div style="text-align:center; margin-top: 10px; opacity:.9;">Réponse correcte : <strong>${safeText(correct)}</strong></div>
    `;

    hideAnswerOptions();

    // On laisse le backend enchaîner automatiquement (timeout ou nextQuestion).
  }

  function hideResultPanel() {
    const zone = $("#online-result-zone");
    if (!zone) return;
    zone.style.display = "none";
    zone.innerHTML = "";
  }

  function findPlayerIdByName(name, list) {
    if (!name) return null;
    const n = String(name);
    const p = (list || []).find((x) => String(x.name) === n);
    return p ? p.id : null;
  }
})();
