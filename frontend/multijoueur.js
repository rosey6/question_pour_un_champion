// ============================================
// CONFIGURATION SOCKET.IO
// ============================================

const BACKEND_URL = "https://questionpourunchampion-backend.onrender.com";
let socket = null;
let currentGameCode = null;
let currentPlayerName = null;
let isHost = false;
let multiplayerMode = "spectator"; // 'spectator' ou 'hostplay'

// ============================================
// INITIALISATION SOCKET
// ============================================

function initializeSocket() {
  if (socket && socket.connected) return;

  socket = io(BACKEND_URL, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });

  socket.on("connect", () => {
    console.log("✅ Connecté au serveur multijoueur");
  });

  socket.on("disconnect", () => {
    console.log("❌ Déconnecté du serveur");
  });

  socket.on("connect_error", (error) => {
    console.error("Erreur de connexion:", error);
    alert("Impossible de se connecter au serveur. Veuillez réessayer.");
  });

  setupSocketListeners();
}

// ============================================
// ÉCOUTEURS D'ÉVÉNEMENTS SOCKET
// ============================================

function setupSocketListeners() {
  // Partie créée avec succès
  socket.on("game-created", (data) => {
    console.log("Partie créée:", data);
    currentGameCode = data.gameCode;
    isHost = true;

    document.getElementById("code-partie").textContent = data.gameCode;
    document.getElementById("code-partie-container").classList.remove("hidden");

    generateQRCode(data.gameCode);
    updatePlayersList([]);
  });

  // Joueur a rejoint
  socket.on("player-joined", (data) => {
    console.log("Joueur rejoint:", data);
    updatePlayersList(data.players);

    const btn = document.getElementById("btn-demarrer-partie");
    if (btn) {
      btn.disabled = data.players.length < 2;
      btn.textContent = `Démarrer (${data.players.length}/4)`;
    }
  });

  // Succès de rejoindre
  socket.on("join-success", (data) => {
    console.log("Rejoint avec succès:", data);
    currentGameCode = data.gameCode;

    document.getElementById("code-salle-jointe").textContent = data.gameCode;
    document.getElementById("nom-hote").textContent = data.hostName;
    document.getElementById("salle-attente").classList.remove("hidden");

    updateWaitingPlayersList(data.players);
  });

  // Erreur de rejoindre
  socket.on("join-error", (data) => {
    console.error("Erreur rejoindre:", data);
    alert(data.message || "Impossible de rejoindre la partie");
  });

  // Joueur a quitté
  socket.on("player-left", (data) => {
    console.log("Joueur parti:", data);
    updatePlayersList(data.players);
  });

  // Partie démarrée
  socket.on("game-started", (data) => {
    console.log("Partie démarrée:", data);
    startMultiplayerGame(data);
  });

  // Nouvelle question
  socket.on("new-question", (data) => {
    console.log("Nouvelle question:", data);
    handleNewQuestion(data);
  });

  // Joueur a buzzer
  socket.on("player-buzzed", (data) => {
    console.log("Joueur buzzer:", data);
    handlePlayerBuzzed(data);
  });

  // Afficher écran de réponse
  socket.on("show-answer-screen", (data) => {
    console.log("Écran réponse:", data);
    showAnswerScreen(data);
  });

  // Options de réponse
  socket.on("answer-options", (data) => {
    console.log("Options reçues:", data);
    displayAnswerOptions(data.options);
  });

  // Résultat de réponse
  socket.on("answer-result", (data) => {
    console.log("Résultat:", data);
    handleAnswerResult(data);
  });

  // Timeout buzzer
  socket.on("buzzer-timeout", () => {
    console.log("Buzzer timeout");
    alert("Temps écoulé ! Personne n'a buzzer.");
  });

  // Partie terminée
  socket.on("game-finished", (data) => {
    console.log("Partie terminée:", data);
    showFinalResults(data);
  });

  // Hôte déconnecté
  socket.on("host-disconnected", () => {
    alert("L'hôte s'est déconnecté. La partie est annulée.");
    changerEcran("accueil");
  });
}

// ============================================
// CRÉATION DE PARTIE
// ============================================

document.getElementById("btn-creer-partie")?.addEventListener("click", () => {
  const playerName = document.getElementById("nom-createur").value.trim();
  multiplayerMode = document.getElementById("multi-mode").value;

  if (!playerName) {
    alert("Veuillez entrer votre nom");
    return;
  }

  const settings = {
    maxPlayers: 4,
    questionsCount: parseInt(
      document.getElementById("multi-nombre-questions").value,
    ),
    timePerQuestion: parseInt(
      document.getElementById("multi-duree-question").value,
    ),
    timePerAnswer: parseInt(
      document.getElementById("multi-duree-reponse").value,
    ),
  };

  currentPlayerName = playerName;
  initializeSocket();

  socket.emit("create-game", {
    playerName: playerName,
    settings: settings,
  });
});

// ============================================
// REJOINDRE UNE PARTIE
// ============================================

document
  .getElementById("btn-rejoindre-partie")
  ?.addEventListener("click", () => {
    const playerName = document.getElementById("nom-joueur").value.trim();
    const gameCode = document
      .getElementById("code-rejoindre")
      .value.trim()
      .toUpperCase();

    if (!playerName) {
      alert("Veuillez entrer votre nom");
      return;
    }

    if (!gameCode || gameCode.length !== 6) {
      alert("Veuillez entrer un code de partie valide (6 caractères)");
      return;
    }

    currentPlayerName = playerName;
    initializeSocket();

    socket.emit("join-game", {
      gameCode: gameCode,
      playerName: playerName,
    });
  });

// ============================================
// DÉMARRER LA PARTIE
// ============================================

document
  .getElementById("btn-demarrer-partie")
  ?.addEventListener("click", () => {
    if (!currentGameCode) return;

    const settings = {
      questionsCount: parseInt(
        document.getElementById("multi-nombre-questions").value,
      ),
      timePerQuestion: parseInt(
        document.getElementById("multi-duree-question").value,
      ),
      timePerAnswer: parseInt(
        document.getElementById("multi-duree-reponse").value,
      ),
    };

    socket.emit("start-game", {
      gameCode: currentGameCode,
      settings: settings,
    });
  });

// ============================================
// GÉNÉRATION QR CODE
// ============================================

function generateQRCode(gameCode) {
  const qrContainer = document.getElementById("qr-code");
  if (!qrContainer) return;

  qrContainer.innerHTML = "";

  const url = `${window.location.origin}/online-home.html?join=${gameCode}`;

  new QRCode(qrContainer, {
    text: url,
    width: 200,
    height: 200,
    colorDark: "#8093F1",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H,
  });
}

// ============================================
// MISE À JOUR LISTE JOUEURS
// ============================================

function updatePlayersList(players) {
  const container = document.getElementById("liste-joueurs-salle");
  if (!container) return;

  container.innerHTML = "";

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

  players.forEach((player) => {
    const div = document.createElement("div");
    div.className = "joueur-item";
    div.innerHTML = `
      <i class="fas fa-user"></i>
      <span>${player.name}</span>
    `;
    container.appendChild(div);
  });
}

// ============================================
// DÉMARRAGE JEU MULTIJOUEUR
// ============================================

function startMultiplayerGame(data) {
  // Initialiser les scores
  jeu.nomsJoueurs = data.players.map((p) => p.name);
  jeu.scores = data.players.map((p) => p.score || 0);
  jeu.nombreJoueurs = data.players.length;

  changerEcran("jeu-multijoueur");

  // Afficher vue appropriée
  if (isHost && multiplayerMode === "spectator") {
    document.getElementById("vue-hote-multi").classList.remove("hidden");
    document.getElementById("vue-joueur-multi").classList.add("hidden");
    document.getElementById("host-player-panel").classList.add("hidden");
  } else if (isHost && multiplayerMode === "hostplay") {
    document.getElementById("vue-hote-multi").classList.remove("hidden");
    document.getElementById("vue-joueur-multi").classList.add("hidden");
    document.getElementById("host-player-panel").classList.remove("hidden");
  } else {
    document.getElementById("vue-hote-multi").classList.add("hidden");
    document.getElementById("vue-joueur-multi").classList.remove("hidden");
  }

  updateMultiScores(data.players);
}

// ============================================
// NOUVELLE QUESTION
// ============================================

function handleNewQuestion(data) {
  // Mettre à jour chrono
  document.getElementById("temps-multijoueur").textContent = Math.floor(
    data.timeLimit / 1000,
  );
  document.getElementById("info-question-multi").textContent =
    `Question ${data.questionNumber}/${data.totalQuestions}`;

  // Afficher question (hôte)
  const questionEl = document.getElementById("question-multijoueur");
  if (questionEl) {
    questionEl.textContent = data.question;
  }

  // Afficher options (hôte spectateur)
  const optionsContainer = document.getElementById("options-host-multi");
  if (optionsContainer) {
    optionsContainer.innerHTML = "";
    data.options.forEach((opt) => {
      const div = document.createElement("div");
      div.className = "option-host";
      div.textContent = opt;
      optionsContainer.appendChild(div);
    });
  }

  // Réinitialiser buzzer
  const btnBuzzPlayer = document.getElementById("btn-buzz-player");
  const btnBuzzHost = document.getElementById("btn-buzz-host");

  if (btnBuzzPlayer) {
    btnBuzzPlayer.disabled = false;
    btnBuzzPlayer.style.opacity = "1";
  }
  if (btnBuzzHost) {
    btnBuzzHost.disabled = false;
    btnBuzzHost.style.opacity = "1";
  }

  // Masquer écrans précédents
  document.getElementById("ecran-reponse-multi")?.classList.add("hidden");
  document.getElementById("ecran-resultat-multi")?.classList.add("hidden");
  document.getElementById("resultat-joueur-multi")?.classList.add("hidden");
}

// ============================================
// BUZZER
// ============================================

document.getElementById("btn-buzz-player")?.addEventListener("click", () => {
  if (!currentGameCode) return;
  socket.emit("buzz", { gameCode: currentGameCode });
  document.getElementById("btn-buzz-player").disabled = true;
});

document.getElementById("btn-buzz-host")?.addEventListener("click", () => {
  if (!currentGameCode) return;
  socket.emit("buzz", { gameCode: currentGameCode });
  document.getElementById("btn-buzz-host").disabled = true;
});

// ============================================
// JOUEUR A BUZZÉ
// ============================================

function handlePlayerBuzzed(data) {
  console.log(`${data.playerName} a buzzé !`);

  // Désactiver tous les buzzers
  document.querySelectorAll(".bouton-buzzer-mobile").forEach((btn) => {
    btn.disabled = true;
    btn.style.opacity = "0.5";
  });

  // Afficher notification
  const etatBuzzer = document.getElementById("etat-buzzer-player");
  if (etatBuzzer) {
    etatBuzzer.textContent = `${data.playerName} a buzzé !`;
    etatBuzzer.style.color = "var(--p-violet)";
  }
}

// ============================================
// ÉCRAN DE RÉPONSE
// ============================================

function showAnswerScreen(data) {
  const vueHote = document.getElementById("vue-hote-multi");
  const reponseScreen = document.getElementById("ecran-reponse-multi");

  if (vueHote && reponseScreen) {
    document.getElementById("nom-repondant-multi").textContent =
      data.answeringPlayer;
    reponseScreen.classList.remove("hidden");
  }

  // Demander les options si c'est le joueur qui a buzzé
  if (socket && currentGameCode) {
    socket.emit("request-answer-options", { gameCode: currentGameCode });
  }
}

function displayAnswerOptions(options) {
  const container = document.getElementById("options-reponse-multi");
  const containerHost = document.getElementById("options-reponse-hostlocal");

  [container, containerHost].forEach((cont) => {
    if (!cont) return;
    cont.innerHTML = "";

    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "option-reponse-multi";
      btn.textContent = opt;
      btn.addEventListener("click", () => {
        socket.emit("submit-answer", {
          gameCode: currentGameCode,
          answer: opt,
        });
        // Désactiver tous les boutons
        cont
          .querySelectorAll(".option-reponse-multi")
          .forEach((b) => (b.disabled = true));
      });
      cont.appendChild(btn);
    });
  });
}

// ============================================
// RÉSULTAT RÉPONSE
// ============================================

function handleAnswerResult(data) {
  console.log("Résultat:", data);

  // Mise à jour scores
  updateMultiScores(data.rankings);

  // Afficher résultat (hôte)
  if (isHost) {
    const resultatScreen = document.getElementById("ecran-resultat-multi");
    if (resultatScreen) {
      document.getElementById("ecran-reponse-multi")?.classList.add("hidden");

      const bonneReponse = document.getElementById("resultat-multi-bonne");
      if (bonneReponse) {
        bonneReponse.textContent = `Réponse correcte : ${data.correctAnswer}`;
        bonneReponse.style.color = data.isCorrect
          ? "var(--p-bleu)"
          : "var(--p-rose)";
      }

      resultatScreen.classList.remove("hidden");
    }
  } else {
    // Vue joueur
    const resultatJoueur = document.getElementById("resultat-joueur-multi");
    if (resultatJoueur) {
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

      resultatJoueur.classList.remove("hidden");
    }
  }
}

// ============================================
// MISE À JOUR SCORES
// ============================================

function updateMultiScores(rankings) {
  const container = document.getElementById("grille-scores-multi");
  if (!container) return;

  container.innerHTML = "";

  rankings.forEach((player, idx) => {
    const div = document.createElement("div");
    div.className = "carte-joueur-multi";
    if (idx === 0) div.classList.add("hote");

    div.innerHTML = `
      <h3>${player.name}</h3>
      <div class="points">${player.score} pts</div>
    `;
    container.appendChild(div);
  });
}

// ============================================
// RÉSULTATS FINAUX
// ============================================

function showFinalResults(data) {
  changerEcran("resultat-multijoueur");

  const container = document.getElementById("grille-scores-resultat-multi");
  if (!container) return;

  container.innerHTML = "";

  data.rankings.forEach((player, idx) => {
    const div = document.createElement("div");
    div.className = "carte-joueur";
    div.innerHTML = `
      <h3>#${idx + 1} - ${player.name}</h3>
      <div class="points">${player.score} points</div>
    `;
    container.appendChild(div);
  });
}

// ============================================
// BOUTONS RETOUR
// ============================================

document
  .getElementById("btn-retour-multijoueur")
  ?.addEventListener("click", () => {
    if (socket) {
      socket.disconnect();
    }
    changerEcran("accueil");
  });

document
  .getElementById("btn-retour-accueil-multi")
  ?.addEventListener("click", () => {
    if (socket) {
      socket.disconnect();
    }
    changerEcran("accueil");
  });

document
  .getElementById("btn-resultat-multi-continuer")
  ?.addEventListener("click", () => {
    document.getElementById("ecran-resultat-multi")?.classList.add("hidden");
  });

document
  .getElementById("btn-resultat-multi-menu")
  ?.addEventListener("click", () => {
    if (socket) {
      socket.disconnect();
    }
    changerEcran("accueil");
  });

// ============================================
// AUTO-JOIN VIA URL
// ============================================

window.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const joinCode = urlParams.get("join");

  if (joinCode) {
    document.getElementById("code-rejoindre").value = joinCode.toUpperCase();
    changerEcran("multijoueur");
  }
});

console.log("✅ Multijoueur.js chargé");
