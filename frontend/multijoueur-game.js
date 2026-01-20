// ============================================
// MULTIJOUEUR-GAME.JS
// Gestion complète du mode multijoueur
// ============================================

const BACKEND_URL = "https://questionpourunchampion-backend.onrender.com";
let socket = null;
let currentGameCode = null;
let currentPlayerName = null;
let isHost = false;
let multiplayerMode = "spectator"; // 'spectator' ou 'hostplay'
let currentQuestionData = null;
let gameSettings = null;

// État du jeu multijoueur
let multiState = {
  players: [],
  scores: {},
  currentQuestionIndex: 0,
  totalQuestions: 10,
  buzzerEnabled: false,
  answeringPlayer: null,
};

// ============================================
// INITIALISATION SOCKET.IO
// ============================================

function initializeSocket() {
  if (socket && socket.connected) {
    console.log("Socket déjà connecté");
    return;
  }

  console.log("Connexion au serveur:", BACKEND_URL);

  socket = io(BACKEND_URL, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
    timeout: 20000,
  });

  socket.on("connect", () => {
    console.log("✅ Connecté au serveur multijoueur - ID:", socket.id);
    showNotification("Connecté au serveur", "success");
  });

  socket.on("disconnect", (reason) => {
    console.log("❌ Déconnecté du serveur:", reason);
    showNotification("Déconnecté du serveur", "error");
  });

  socket.on("connect_error", (error) => {
    console.error("Erreur de connexion:", error);
    showNotification("Impossible de se connecter au serveur", "error");
  });

  setupSocketListeners();
}

// ============================================
// ÉCOUTEURS SOCKET.IO
// ============================================

function setupSocketListeners() {
  // Partie créée avec succès
  socket.on("game-created", (data) => {
    console.log("✅ Partie créée:", data);
    currentGameCode = data.gameCode;
    isHost = true;

    const codeEl = document.getElementById("code-partie");
    if (codeEl) codeEl.textContent = data.gameCode;

    const container = document.getElementById("code-partie-container");
    if (container) container.classList.remove("hidden");

    generateQRCode(data.gameCode);
    updatePlayersList([]);

    showNotification(`Partie créée: ${data.gameCode}`, "success");
  });

  // Joueur a rejoint
  socket.on("player-joined", (data) => {
    console.log("👤 Joueur rejoint:", data);
    multiState.players = data.players;
    updatePlayersList(data.players);

    const btn = document.getElementById("btn-demarrer-partie");
    if (btn) {
      const playerCount = data.players.length;
      btn.disabled = playerCount < 2;
      btn.innerHTML = `<i class="fas fa-play"></i> Démarrer (${playerCount}/4)`;
    }

    showNotification(`${data.playerName} a rejoint`, "info");
  });

  // Succès de rejoindre
  socket.on("join-success", (data) => {
    console.log("✅ Rejoint avec succès:", data);
    currentGameCode = data.gameCode;
    isHost = false;
    multiState.players = data.players;

    const codeEl = document.getElementById("code-salle-jointe");
    const hoteEl = document.getElementById("nom-hote");
    const salleEl = document.getElementById("salle-attente");

    if (codeEl) codeEl.textContent = data.gameCode;
    if (hoteEl) hoteEl.textContent = data.hostName;
    if (salleEl) salleEl.classList.remove("hidden");

    updateWaitingPlayersList(data.players);
    showNotification("Partie rejointe avec succès", "success");
  });

  // Erreur de rejoindre
  socket.on("join-error", (data) => {
    console.error("❌ Erreur rejoindre:", data);
    showNotification(
      data.message || "Impossible de rejoindre la partie",
      "error",
    );
  });

  // Joueur a quitté
  socket.on("player-left", (data) => {
    console.log("👋 Joueur parti:", data);
    multiState.players = data.players;
    updatePlayersList(data.players);
    showNotification(`${data.playerName} a quitté`, "warning");
  });

  // Partie démarrée
  socket.on("game-started", (data) => {
    console.log("🎮 Partie démarrée:", data);
    gameSettings = data.settings;
    multiState.players = data.players;
    multiState.totalQuestions = data.settings.questionsCount;

    initializeScores(data.players);
    startMultiplayerGame();
  });

  // Nouvelle question
  socket.on("new-question", (data) => {
    console.log("❓ Nouvelle question:", data);
    currentQuestionData = data;
    multiState.currentQuestionIndex = data.questionNumber - 1;
    multiState.buzzerEnabled = true;
    multiState.answeringPlayer = null;

    displayNewQuestion(data);
    startQuestionTimer(data.timeLimit);
  });

  // Joueur a buzzé
  socket.on("player-buzzed", (data) => {
    console.log("🔔 Joueur buzzé:", data);
    multiState.buzzerEnabled = false;
    multiState.answeringPlayer = data.playerId;

    handlePlayerBuzzed(data);
  });

  // Afficher écran de réponse
  socket.on("show-answer-screen", (data) => {
    console.log("📝 Écran réponse:", data);
    showAnswerScreen(data);
  });

  // Options de réponse (pour le joueur qui a buzzé)
  socket.on("answer-options", (data) => {
    console.log("📋 Options reçues:", data);
    displayAnswerOptions(data.options);
  });

  // Résultat de réponse
  socket.on("answer-result", (data) => {
    console.log("✔️ Résultat:", data);
    updateScores(data.rankings);
    displayAnswerResult(data);
  });

  // Timeout buzzer
  socket.on("buzzer-timeout", () => {
    console.log("⏰ Buzzer timeout");
    multiState.buzzerEnabled = false;
    showNotification("Temps écoulé ! Personne n'a buzzé.", "warning");
  });

  // Partie terminée
  socket.on("game-finished", (data) => {
    console.log("🏆 Partie terminée:", data);
    showFinalResults(data);
  });

  // Hôte déconnecté
  socket.on("host-disconnected", () => {
    console.log("❌ Hôte déconnecté");
    showNotification(
      "L'hôte s'est déconnecté. La partie est annulée.",
      "error",
    );
    setTimeout(() => {
      window.location.href = "index.html";
    }, 3000);
  });

  // Erreur générale
  socket.on("error", (data) => {
    console.error("❌ Erreur:", data);
    showNotification(data.message || "Une erreur est survenue", "error");
  });
}

// ============================================
// CRÉATION DE PARTIE
// ============================================

function setupCreateGameButton() {
  const btn = document.getElementById("btn-creer-partie");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const nameInput = document.getElementById("nom-createur");
    const playerName = nameInput ? nameInput.value.trim() : "";

    if (!playerName) {
      showNotification("Veuillez entrer votre nom", "warning");
      if (nameInput) nameInput.focus();
      return;
    }

    const modeSelect = document.getElementById("multi-mode");
    multiplayerMode = modeSelect ? modeSelect.value : "spectator";

    const settings = {
      maxPlayers: 4,
      questionsCount: parseInt(
        document.getElementById("multi-nombre-questions")?.value || "10",
      ),
      timePerQuestion: parseInt(
        document.getElementById("multi-duree-question")?.value || "30",
      ),
      timePerAnswer: parseInt(
        document.getElementById("multi-duree-reponse")?.value || "15",
      ),
    };

    currentPlayerName = playerName;
    gameSettings = settings;

    initializeSocket();

    // Attendre que la connexion soit établie
    if (socket.connected) {
      socket.emit("create-game", {
        playerName: playerName,
        settings: settings,
      });
    } else {
      socket.once("connect", () => {
        socket.emit("create-game", {
          playerName: playerName,
          settings: settings,
        });
      });
    }

    btn.disabled = true;
    btn.textContent = "Création en cours...";
  });
}

// ============================================
// REJOINDRE UNE PARTIE
// ============================================

function setupJoinGameButton() {
  const btn = document.getElementById("btn-rejoindre-partie");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const nameInput = document.getElementById("nom-joueur");
    const codeInput = document.getElementById("code-rejoindre");

    const playerName = nameInput ? nameInput.value.trim() : "";
    const gameCode = codeInput ? codeInput.value.trim().toUpperCase() : "";

    if (!playerName) {
      showNotification("Veuillez entrer votre nom", "warning");
      if (nameInput) nameInput.focus();
      return;
    }

    if (!gameCode || gameCode.length !== 6) {
      showNotification(
        "Veuillez entrer un code de partie valide (6 caractères)",
        "warning",
      );
      if (codeInput) codeInput.focus();
      return;
    }

    currentPlayerName = playerName;
    initializeSocket();

    // Attendre que la connexion soit établie
    if (socket.connected) {
      socket.emit("join-game", {
        gameCode: gameCode,
        playerName: playerName,
      });
    } else {
      socket.once("connect", () => {
        socket.emit("join-game", {
          gameCode: gameCode,
          playerName: playerName,
        });
      });
    }

    btn.disabled = true;
    btn.textContent = "Connexion...";
  });
}

// ============================================
// DÉMARRER LA PARTIE
// ============================================

function setupStartGameButton() {
  const btn = document.getElementById("btn-demarrer-partie");
  if (!btn) return;

  btn.addEventListener("click", () => {
    if (!currentGameCode) {
      showNotification("Erreur: Code de partie manquant", "error");
      return;
    }

    const settings = {
      questionsCount: parseInt(
        document.getElementById("multi-nombre-questions")?.value || "10",
      ),
      timePerQuestion: parseInt(
        document.getElementById("multi-duree-question")?.value || "30",
      ),
      timePerAnswer: parseInt(
        document.getElementById("multi-duree-reponse")?.value || "15",
      ),
    };

    socket.emit("start-game", {
      gameCode: currentGameCode,
      settings: settings,
    });

    btn.disabled = true;
    btn.textContent = "Démarrage...";
  });
}

// ============================================
// GÉNÉRATION QR CODE
// ============================================

function generateQRCode(gameCode) {
  const qrContainer = document.getElementById("qr-code");
  if (!qrContainer) return;

  qrContainer.innerHTML = "";

  const baseUrl =
    window.location.origin +
    window.location.pathname.replace("multijoueur.html", "");
  const url = `${baseUrl}multijoueur.html?join=${gameCode}`;

  try {
    new QRCode(qrContainer, {
      text: url,
      width: 200,
      height: 200,
      colorDark: "#8093F1",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H,
    });
    console.log("✅ QR Code généré:", url);
  } catch (error) {
    console.error("❌ Erreur génération QR:", error);
  }
}

// ============================================
// MISE À JOUR LISTES JOUEURS
// ============================================

function updatePlayersList(players) {
  const container = document.getElementById("liste-joueurs-salle");
  if (!container) return;

  container.innerHTML = "";

  if (!players || players.length === 0) {
    container.innerHTML =
      '<p class="texte-secondaire">Aucun joueur pour le moment...</p>';
    return;
  }

  players.forEach((player) => {
    const div = document.createElement("div");
    div.className = "joueur-item";
    div.innerHTML = `
      <i class="fas fa-user"></i>
      <span>${player.name}</span>
      ${player.isHost ? '<span style="color: var(--p-violet);">(Hôte)</span>' : ""}
    `;
    container.appendChild(div);
  });
}

function updateWaitingPlayersList(players) {
  const container = document.getElementById("joueurs-attente");
  if (!container) return;

  container.innerHTML = "<h3>Joueurs présents :</h3>";

  if (!players || players.length === 0) {
    container.innerHTML += '<p class="texte-secondaire">Aucun joueur...</p>';
    return;
  }

  players.forEach((player) => {
    const div = document.createElement("div");
    div.className = "joueur-item";
    div.innerHTML = `
      <i class="fas fa-user-check"></i>
      <span>${player.name}</span>
    `;
    container.appendChild(div);
  });
}

// ============================================
// DÉMARRAGE JEU MULTIJOUEUR
// ============================================

function startMultiplayerGame() {
  console.log("🎮 Démarrage du jeu multijoueur");
  console.log("Mode:", multiplayerMode);
  console.log("Host:", isHost);

  changerEcranMulti("jeu-multijoueur");

  const vueHote = document.getElementById("vue-hote-multi");
  const vueJoueur = document.getElementById("vue-joueur-multi");
  const hostPanel = document.getElementById("host-player-panel");

  // Afficher la vue appropriée
  if (isHost && multiplayerMode === "spectator") {
    // Hôte spectateur (PC) - Affiche tout sauf le panneau joueur
    if (vueHote) vueHote.classList.remove("hidden");
    if (vueJoueur) vueJoueur.classList.add("hidden");
    if (hostPanel) hostPanel.classList.add("hidden");
    console.log("Vue: Hôte spectateur");
  } else if (isHost && multiplayerMode === "hostplay") {
    // Hôte joueur (PC) - Affiche tout y compris le panneau joueur
    if (vueHote) vueHote.classList.remove("hidden");
    if (vueJoueur) vueJoueur.classList.add("hidden");
    if (hostPanel) hostPanel.classList.remove("hidden");
    console.log("Vue: Hôte joueur");
  } else {
    // Joueur (téléphone) - Affiche uniquement la vue joueur
    if (vueHote) vueHote.classList.add("hidden");
    if (vueJoueur) vueJoueur.classList.remove("hidden");
    if (hostPanel) hostPanel.classList.add("hidden");
    console.log("Vue: Joueur mobile");
  }

  updateMultiScores(multiState.players);
  updatePlayerCount(multiState.players.length);
}

// ============================================
// AFFICHAGE NOUVELLE QUESTION
// ============================================

function displayNewQuestion(data) {
  console.log("📝 Affichage question:", data.questionNumber);

  // Masquer les écrans précédents
  hideElement("ecran-reponse-multi");
  hideElement("ecran-resultat-multi");
  hideElement("resultat-joueur-multi");

  // Mettre à jour le chronomètre et l'info
  const tempsEl = document.getElementById("temps-multijoueur");
  const infoEl = document.getElementById("info-question-multi");

  if (tempsEl) tempsEl.textContent = Math.floor(data.timeLimit / 1000);
  if (infoEl)
    infoEl.textContent = `Question ${data.questionNumber}/${data.totalQuestions}`;

  // Afficher la question (vue hôte)
  const questionEl = document.getElementById("question-multijoueur");
  if (questionEl) {
    questionEl.textContent = data.question;
    questionEl.classList.add("fade-in");
  }

  // Afficher les options (hôte spectateur uniquement pour référence)
  const optionsContainer = document.getElementById("options-host-multi");
  if (optionsContainer) {
    optionsContainer.innerHTML = "";
    if (data.options && Array.isArray(data.options)) {
      data.options.forEach((opt) => {
        const div = document.createElement("div");
        div.className = "option-host";
        div.textContent = opt;
        optionsContainer.appendChild(div);
      });
    }
  }

  // Réinitialiser et activer les buzzers
  resetBuzzers();
  enableBuzzers();

  updatePlayerCount(multiState.players.length);
}

// ============================================
// GESTION BUZZER
// ============================================

function setupBuzzers() {
  // Buzzer joueur mobile
  const btnBuzzPlayer = document.getElementById("btn-buzz-player");
  if (btnBuzzPlayer) {
    btnBuzzPlayer.addEventListener("click", () => {
      if (!currentGameCode || !multiState.buzzerEnabled) return;

      socket.emit("buzz", { gameCode: currentGameCode });
      btnBuzzPlayer.disabled = true;
      btnBuzzPlayer.style.opacity = "0.5";
      btnBuzzPlayer.textContent = "BUZZÉ !";

      console.log("🔔 Buzzer envoyé");
    });
  }

  // Buzzer hôte (mode hostplay)
  const btnBuzzHost = document.getElementById("btn-buzz-host");
  if (btnBuzzHost) {
    btnBuzzHost.addEventListener("click", () => {
      if (!currentGameCode || !multiState.buzzerEnabled) return;

      socket.emit("buzz", { gameCode: currentGameCode });
      btnBuzzHost.disabled = true;
      btnBuzzHost.style.opacity = "0.5";
      btnBuzzHost.textContent = "BUZZÉ !";

      console.log("🔔 Buzzer hôte envoyé");
    });
  }
}

function resetBuzzers() {
  const buzzers = [
    document.getElementById("btn-buzz-player"),
    document.getElementById("btn-buzz-host"),
  ];

  buzzers.forEach((btn) => {
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.textContent = "BUZZ";
    }
  });

  const etatPlayer = document.getElementById("etat-buzzer-player");
  const etatHost = document.getElementById("etat-buzzer-host");

  if (etatPlayer)
    etatPlayer.textContent = "Appuyez pour buzzer dès que vous êtes prêt.";
  if (etatHost) etatHost.textContent = "Appuyez pour buzzer.";
}

function enableBuzzers() {
  multiState.buzzerEnabled = true;
}

function disableBuzzers() {
  multiState.buzzerEnabled = false;

  const buzzers = [
    document.getElementById("btn-buzz-player"),
    document.getElementById("btn-buzz-host"),
  ];

  buzzers.forEach((btn) => {
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = "0.5";
    }
  });
}

function handlePlayerBuzzed(data) {
  console.log(`🔔 ${data.playerName} a buzzé !`);

  disableBuzzers();

  // Afficher notification
  const etatPlayer = document.getElementById("etat-buzzer-player");
  const etatHost = document.getElementById("etat-buzzer-host");

  if (etatPlayer) {
    etatPlayer.textContent = `${data.playerName} a buzzé !`;
    etatPlayer.style.color = "var(--p-violet)";
    etatPlayer.style.fontWeight = "bold";
  }
  if (etatHost) {
    etatHost.textContent = `${data.playerName} a buzzé !`;
    etatHost.style.color = "var(--p-violet)";
    etatHost.style.fontWeight = "bold";
  }

  showNotification(`${data.playerName} a buzzé !`, "info");
}

// ============================================
// ÉCRAN DE RÉPONSE
// ============================================

function showAnswerScreen(data) {
  console.log("📝 Affichage écran réponse pour:", data.answeringPlayer);

  // Vue hôte
  const reponseScreen = document.getElementById("ecran-reponse-multi");
  const nomRepondant = document.getElementById("nom-repondant-multi");

  if (reponseScreen && isHost) {
    if (nomRepondant) nomRepondant.textContent = data.answeringPlayer;
    reponseScreen.classList.remove("hidden");
  }

  // Demander les options si c'est le joueur qui a buzzé
  if (socket && currentGameCode) {
    socket.emit("request-answer-options", { gameCode: currentGameCode });
  }

  // Démarrer le chronomètre de réponse
  startAnswerTimer(gameSettings?.timePerAnswer || 15);
}

function displayAnswerOptions(options) {
  console.log("📋 Affichage options:", options);

  const containers = [
    document.getElementById("options-reponse-multi"), // Vue joueur
    document.getElementById("options-reponse-hostlocal"), // Vue hôte joueur
  ];

  containers.forEach((container) => {
    if (!container) return;

    container.innerHTML = "";

    if (!options || !Array.isArray(options)) {
      console.error("Options invalides:", options);
      return;
    }

    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "option-reponse-multi";
      btn.textContent = opt;
      btn.type = "button";

      btn.addEventListener("click", () => {
        // Envoyer la réponse
        socket.emit("submit-answer", {
          gameCode: currentGameCode,
          answer: opt,
        });

        // Désactiver tous les boutons
        container.querySelectorAll(".option-reponse-multi").forEach((b) => {
          b.disabled = true;
          b.style.opacity = "0.5";
        });

        // Highlight la réponse choisie
        btn.style.background = "rgba(128, 147, 241, 0.5)";
        btn.style.borderColor = "var(--p-indigo)";
        btn.style.transform = "scale(1.05)";

        console.log("📤 Réponse envoyée:", opt);
      });

      container.appendChild(btn);
    });
  });
}

// ============================================
// RÉSULTAT DE RÉPONSE
// ============================================

function displayAnswerResult(data) {
  console.log("✔️ Affichage résultat:", data);

  // Mise à jour scores
  updateScores(data.rankings);

  // Vue hôte
  if (isHost) {
    const resultatScreen = document.getElementById("ecran-resultat-multi");
    const bonneReponse = document.getElementById("resultat-multi-bonne");
    const reponseScreen = document.getElementById("ecran-reponse-multi");

    if (reponseScreen) reponseScreen.classList.add("hidden");

    if (bonneReponse) {
      bonneReponse.textContent = `Réponse correcte : ${data.correctAnswer}`;
      bonneReponse.style.color = data.isCorrect
        ? "var(--p-bleu)"
        : "var(--p-rose)";
    }

    if (resultatScreen) resultatScreen.classList.remove("hidden");
  }
  // Vue joueur
  else {
    const resultatJoueur = document.getElementById("resultat-joueur-multi");
    const titre = document.getElementById("titre-resultat-joueur");
    const correct = document.getElementById("resultat-joueur-correct");

    if (titre) {
      titre.textContent = data.isCorrect
        ? "✅ Bonne réponse !"
        : "❌ Mauvaise réponse";
      titre.style.color = data.isCorrect ? "var(--p-bleu)" : "var(--p-rose)";
    }

    if (correct) {
      correct.textContent = `Réponse correcte : ${data.correctAnswer}`;
    }

    if (resultatJoueur) resultatJoueur.classList.remove("hidden");

    // Masquer les options
    hideElement("options-reponse-multi");
  }

  // Auto-masquer après délai (le serveur gère la transition)
  setTimeout(() => {
    hideElement("ecran-resultat-multi");
    hideElement("resultat-joueur-multi");
  }, 3000);
}

// ============================================
// MISE À JOUR SCORES
// ============================================

function initializeScores(players) {
  multiState.scores = {};
  players.forEach((player) => {
    multiState.scores[player.id] = player.score || 0;
  });
}

function updateScores(rankings) {
  if (!rankings || !Array.isArray(rankings)) return;

  multiState.players = rankings.map((rank, idx) => ({
    id: `player-${idx}`,
    name: rank.name,
    score: rank.score,
  }));

  updateMultiScores(multiState.players);
}

function updateMultiScores(players) {
  const container = document.getElementById("grille-scores-multi");
  if (!container) return;

  container.innerHTML = "";

  if (!players || players.length === 0) return;

  // Trier par score décroissant
  const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));

  sorted.forEach((player, idx) => {
    const div = document.createElement("div");
    div.className = "carte-joueur-multi";
    if (idx === 0 && player.score > 0) div.classList.add("hote"); // Leader

    div.innerHTML = `
      <h3>${player.name}</h3>
      <div class="points">${player.score || 0} pts</div>
    `;
    container.appendChild(div);
  });
}

function updatePlayerCount(count) {
  const el = document.getElementById("joueurs-connectes");
  if (el) el.textContent = `${count} joueur${count > 1 ? "s" : ""}`;
}

// ============================================
// RÉSULTATS FINAUX
// ============================================

function showFinalResults(data) {
  console.log("🏆 Résultats finaux:", data);

  changerEcranMulti("resultat-multijoueur");

  const container = document.getElementById("grille-scores-resultat-multi");
  if (!container) return;

  container.innerHTML = "";

  if (!data.rankings || !Array.isArray(data.rankings)) return;

  data.rankings.forEach((player, idx) => {
    const div = document.createElement("div");
    div.className = "carte-joueur";

    let medal = "";
    if (idx === 0) medal = "🥇";
    else if (idx === 1) medal = "🥈";
    else if (idx === 2) medal = "🥉";

    div.innerHTML = `
      <h3>${medal} #${idx + 1} - ${player.name}</h3>
      <div class="points">${player.score} points</div>
    `;
    container.appendChild(div);
  });

  // Auto-redirection après 10 secondes
  let countdown = 10;
  const countdownInterval = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      window.location.href = "index.html";
    }
  }, 1000);
}

// ============================================
// TIMERS
// ============================================

let questionTimerInterval = null;
let answerTimerInterval = null;

function startQuestionTimer(timeLimit) {
  if (questionTimerInterval) clearInterval(questionTimerInterval);

  let remaining = Math.floor(timeLimit / 1000);
  const tempsEl = document.getElementById("temps-multijoueur");

  if (tempsEl) tempsEl.textContent = remaining;

  questionTimerInterval = setInterval(() => {
    remaining--;
    if (tempsEl) tempsEl.textContent = remaining;

    if (remaining <= 0) {
      clearInterval(questionTimerInterval);
    }
  }, 1000);
}

function startAnswerTimer(timeLimit) {
  if (answerTimerInterval) clearInterval(answerTimerInterval);

  let remaining = timeLimit;
  const tempsEl = document.getElementById("temps-reponse-multi");

  if (tempsEl) tempsEl.textContent = remaining;

  answerTimerInterval = setInterval(() => {
    remaining--;
    if (tempsEl) tempsEl.textContent = remaining;

    if (remaining <= 0) {
      clearInterval(answerTimerInterval);
    }
  }, 1000);
}

// ============================================
// UTILITAIRES UI
// ============================================

function changerEcranMulti(idEcran) {
  document.querySelectorAll(".ecran").forEach((ecran) => {
    ecran.classList.remove("actif");
  });

  const ecranCible = document.getElementById(idEcran);
  if (ecranCible) {
    ecranCible.classList.add("actif");
    console.log("📺 Écran actif:", idEcran);
  }
}

function hideElement(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

function showElement(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function showNotification(message, type = "info") {
  console.log(`[${type.toUpperCase()}] ${message}`);

  // Créer une notification visuelle
  const notif = document.createElement("div");
  notif.className = `notification notification-${type}`;
  notif.textContent = message;
  notif.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 25px;
    background: ${type === "success" ? "#4caf50" : type === "error" ? "#f44336" : type === "warning" ? "#ff9800" : "#2196f3"};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    animation: slideIn 0.3s ease;
    font-weight: bold;
  `;

  document.body.appendChild(notif);

  setTimeout(() => {
    notif.style.animation = "slideOut 0.3s ease";
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

// ============================================
// AUTO-JOIN VIA URL
// ============================================

function checkAutoJoin() {
  const urlParams = new URLSearchParams(window.location.search);
  const joinCode = urlParams.get("join");

  if (joinCode) {
    console.log("🔗 Auto-join détecté:", joinCode);
    const codeInput = document.getElementById("code-rejoindre");
    if (codeInput) {
      codeInput.value = joinCode.toUpperCase();
      // Scroll vers la section rejoindre
      codeInput.scrollIntoView({ behavior: "smooth", block: "center" });
      codeInput.focus();
    }
  }
}

// ============================================
// BOUTONS RETOUR/CONTINUER
// ============================================

function setupNavigationButtons() {
  const btnResultatContinuer = document.getElementById(
    "btn-resultat-multi-continuer",
  );
  if (btnResultatContinuer) {
    btnResultatContinuer.addEventListener("click", () => {
      hideElement("ecran-resultat-multi");
    });
  }
}

// ============================================
// INITIALISATION
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("🎮 Initialisation Multijoueur Game");

  setupCreateGameButton();
  setupJoinGameButton();
  setupStartGameButton();
  setupBuzzers();
  setupNavigationButtons();
  checkAutoJoin();

  console.log("✅ Multijoueur Game initialisé");
});

// Styles pour les animations
const style = document.createElement("style");
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }

  @keyframes fade-in {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .fade-in {
    animation: fade-in 0.5s ease;
  }
`;
document.head.appendChild(style);

console.log("✅ multijoueur-game.js chargé");
