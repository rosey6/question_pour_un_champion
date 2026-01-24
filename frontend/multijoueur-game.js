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
// GESTIONNAIRE DE SONS MULTIJOUEUR
// ============================================

const sonsMulti = {
  buzzer: new Audio("buzzer.mp3"),
  applaudissements: new Audio("Applaudissements.mp3"),
  hue: new Audio("hue.mp3"),
};

// Précharger les sons
Object.values(sonsMulti).forEach((son) => {
  son.load();
  son.volume = 0.7;
});

function jouerSonMulti(nomSon) {
  try {
    const son = sonsMulti[nomSon];
    if (son) {
      son.currentTime = 0;
      son.play().catch((e) => console.log("Erreur audio:", e));
    }
  } catch (e) {
    console.log("Erreur son:", e);
  }
}

function arreterSonMulti(nomSon) {
  try {
    const son = sonsMulti[nomSon];
    if (son) {
      son.pause();
      son.currentTime = 0;
    }
  } catch (e) {}
}

function arreterTousLesSonsMulti() {
  Object.keys(sonsMulti).forEach((nomSon) => arreterSonMulti(nomSon));
}

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
    
    // En mode classique, le créateur est aussi un joueur (pas un hôte spectateur)
    isHost = (multiplayerMode !== "classic");

    const codeEl = document.getElementById("code-partie");
    if (codeEl) codeEl.textContent = data.gameCode;

    const container = document.getElementById("code-partie-container");
    if (container) container.classList.remove("hidden");

    generateQRCode(data.gameCode);
    
    // En mode classique, le créateur est dans la liste des joueurs
    if (multiplayerMode === "classic") {
      updatePlayersList([{ name: currentPlayerName, score: 0, isHost: false }]);
    } else {
      updatePlayersList([]);
    }

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
    
    // Récupérer le mode de la partie
    if (data.mode) {
      multiplayerMode = data.mode;
      console.log("📌 Mode de la partie:", multiplayerMode);
    }

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
    
    // Récupérer le mode de la partie
    if (data.mode) {
      multiplayerMode = data.mode;
      console.log("📌 Mode de la partie:", multiplayerMode);
    }

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
        mode: multiplayerMode, // Envoyer le mode au serveur
      });
    } else {
      socket.once("connect", () => {
        socket.emit("create-game", {
          playerName: playerName,
          settings: settings,
          mode: multiplayerMode, // Envoyer le mode au serveur
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
  
  // Simplement utiliser l'URL actuelle et ajouter le paramètre join
  const currentUrl = window.location.href.split('?')[0]; // Enlever les query params existants
  const url = `${currentUrl}?join=${gameCode}`;

  console.log("🔗 URL QR Code générée:", url);

  try {
    // Générer le QR code directement dans le conteneur
    new QRCode(qrContainer, {
      text: url,
      width: 220,
      height: 220,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.L,
    });
    console.log("✅ QR Code généré:", url);
    
  } catch (error) {
    console.error("❌ Erreur génération QR:", error);
    qrContainer.innerHTML = `
      <div style="text-align: center; padding: 1rem;">
        <p style="color: var(--p-rose);">QR Code indisponible</p>
        <p style="font-size: 0.9rem; margin: 1rem 0;">Code à entrer manuellement :</p>
        <strong style="font-size: 1.5rem; color: var(--p-bleu);">${gameCode}</strong>
      </div>
    `;
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
  const vueClassique = document.getElementById("vue-classique-multi");
  const hostPanel = document.getElementById("host-player-panel");
  const questionJoueurContainer = document.getElementById("question-joueur-container");

  // Masquer toutes les vues d'abord
  if (vueHote) vueHote.classList.add("hidden");
  if (vueJoueur) vueJoueur.classList.add("hidden");
  if (vueClassique) vueClassique.classList.add("hidden");
  if (hostPanel) hostPanel.classList.add("hidden");

  // Afficher la vue appropriée selon le mode
  if (multiplayerMode === "classic") {
    // Mode classique - chaque joueur voit la question et son buzzer sur son écran
    if (vueJoueur) vueJoueur.classList.remove("hidden");
    // Afficher la zone de question pour le mode classique
    if (questionJoueurContainer) questionJoueurContainer.classList.remove("hidden");
    console.log("Vue: Mode classique (joueur en ligne)");
  } else if (isHost && multiplayerMode === "spectator") {
    // Hôte spectateur (PC) - Affiche tout sauf le panneau joueur
    if (vueHote) vueHote.classList.remove("hidden");
    // Cacher la question joueur en mode spectator (l'hôte voit sur son écran)
    if (questionJoueurContainer) questionJoueurContainer.classList.add("hidden");
    console.log("Vue: Hôte spectateur");
  } else {
    // Joueur (téléphone) - Mode spectator, juste le buzzer
    if (vueJoueur) vueJoueur.classList.remove("hidden");
    // Cacher la question joueur en mode spectator (l'hôte affiche sur son écran)
    if (questionJoueurContainer) questionJoueurContainer.classList.add("hidden");
    console.log("Vue: Joueur mobile (mode spectator)");
  }

  updateMultiScores(multiState.players);
  updatePlayerCount(multiState.players.length);
}

// ============================================
// MODE CLASSIQUE - SETUP
// ============================================

function setupClassicModeBuzzers() {
  const container = document.getElementById("buzzers-classique");
  if (!container) return;
  
  container.innerHTML = "";
  
  multiState.players.forEach((player, index) => {
    const card = document.createElement("div");
    card.className = "classique-buzzer-card";
    card.id = `buzzer-card-${player.id}`;
    
    const colors = ['#ff5252', '#4caf50', '#2196f3', '#ffc107'];
    const color = colors[index % colors.length];
    
    card.innerHTML = `
      <h4>${player.name}</h4>
      <button class="buzzer-btn" id="buzzer-${player.id}" style="border-color: ${color};">
        BUZZ
      </button>
      <div class="score" id="score-${player.id}">${player.score || 0} pts</div>
    `;
    
    container.appendChild(card);
    
    // Ajouter l'event listener pour le buzzer
    const buzzerBtn = document.getElementById(`buzzer-${player.id}`);
    if (buzzerBtn) {
      buzzerBtn.addEventListener("click", () => {
        if (!multiState.buzzerEnabled) return;
        handleClassicBuzz(player.id, player.name);
      });
    }
  });
  
  // Ajouter les raccourcis clavier (1, 2, 3, 4)
  document.addEventListener("keydown", handleClassicKeyPress);
}

function handleClassicKeyPress(e) {
  if (!multiState.buzzerEnabled) return;
  
  const keyNum = parseInt(e.key);
  if (keyNum >= 1 && keyNum <= 4) {
    const playerIndex = keyNum - 1;
    if (multiState.players[playerIndex]) {
      const player = multiState.players[playerIndex];
      handleClassicBuzz(player.id, player.name);
    }
  }
}

function handleClassicBuzz(playerId, playerName) {
  if (!multiState.buzzerEnabled || !currentGameCode) return;
  
  jouerSonMulti("buzzer"); // Jouer le son du buzzer
  
  multiState.buzzerEnabled = false;
  multiState.answeringPlayer = playerId;
  
  // Marquer visuellement le buzzer
  const buzzerBtn = document.getElementById(`buzzer-${playerId}`);
  if (buzzerBtn) {
    buzzerBtn.classList.add("buzzed");
    buzzerBtn.textContent = "BUZZÉ!";
  }
  
  // Désactiver tous les buzzers
  multiState.players.forEach(p => {
    const btn = document.getElementById(`buzzer-${p.id}`);
    if (btn) btn.disabled = true;
  });
  
  // Afficher les options de réponse
  showClassicAnswerOptions(playerId, playerName);
  
  showNotification(`${playerName} a buzzé !`, "info");
}

function showClassicAnswerOptions(playerId, playerName) {
  const optionsContainer = document.getElementById("options-classique");
  if (!optionsContainer || !currentQuestionData) return;
  
  // Activer les boutons d'options
  const optionBtns = optionsContainer.querySelectorAll(".option-btn");
  optionBtns.forEach(btn => {
    btn.disabled = false;
    btn.classList.remove("selected", "correct", "incorrect");
    
    // Ajouter un event listener unique pour ce joueur
    btn.onclick = () => {
      if (multiState.answeringPlayer !== playerId) return;
      
      const answer = btn.dataset.answer;
      handleClassicAnswer(playerId, answer, optionBtns);
    };
  });
}

function handleClassicAnswer(playerId, answer, optionBtns) {
  const correctAnswer = currentQuestionData.correctAnswer;
  const isCorrect = answer === correctAnswer;
  
  // Marquer les réponses
  optionBtns.forEach(btn => {
    btn.disabled = true;
    if (btn.dataset.answer === answer) {
      btn.classList.add(isCorrect ? "correct" : "incorrect");
      btn.classList.add("selected");
    }
    if (btn.dataset.answer === correctAnswer) {
      btn.classList.add("correct");
    }
  });
  
  // Mettre à jour le score
  const player = multiState.players.find(p => p.id === playerId);
  if (player) {
    if (isCorrect) {
      player.score = (player.score || 0) + 10;
    } else {
      player.score = Math.max(0, (player.score || 0) - 5);
    }
    
    const scoreEl = document.getElementById(`score-${playerId}`);
    if (scoreEl) scoreEl.textContent = `${player.score} pts`;
  }
  
  // Afficher le résultat
  showClassicResult(isCorrect, correctAnswer, player?.name);
}

function showClassicResult(isCorrect, correctAnswer, playerName) {
  // Arrêter tous les sons et jouer le son approprié
  arreterTousLesSonsMulti();
  if (isCorrect) {
    jouerSonMulti("applaudissements"); // Son de bonne réponse
  } else {
    jouerSonMulti("hue"); // Son de mauvaise réponse
  }

  const resultatEl = document.getElementById("ecran-resultat-classique");
  const infoEl = document.getElementById("resultat-classique-info");
  
  if (infoEl) {
    infoEl.innerHTML = isCorrect 
      ? `<span style="color: var(--p-bleu);">✅ ${playerName} a bien répondu !</span><br>Réponse : ${correctAnswer}`
      : `<span style="color: var(--p-rose);">❌ ${playerName} s'est trompé</span><br>Réponse correcte : ${correctAnswer}`;
  }
  
  // Afficher l'illustration si disponible
  const illustrationContainer = document.getElementById("resultat-classique-illustration");
  const illustrationImage = document.getElementById("resultat-classique-image");
  const illustrationDesc = document.getElementById("resultat-classique-description");
  
  if (illustrationContainer && illustrationImage && currentQuestionData) {
    if (currentQuestionData.imageUrl) {
      illustrationImage.src = currentQuestionData.imageUrl;
      illustrationImage.alt = currentQuestionData.illustrationTexte || "Illustration";
      if (illustrationDesc) {
        illustrationDesc.textContent = currentQuestionData.illustrationTexte || "";
      }
      illustrationContainer.classList.remove("hidden");
    } else {
      illustrationContainer.classList.add("hidden");
    }
  }
  
  if (resultatEl) resultatEl.classList.remove("hidden");
  
  // Compte à rebours automatique de 5 secondes pour passer à la question suivante
  const btnContinuer = document.getElementById("btn-resultat-classique-continuer");
  if (btnContinuer) {
    let countdown = 5;
    btnContinuer.textContent = `Question suivante (${countdown}s)`;
    btnContinuer.disabled = true;
    
    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        btnContinuer.textContent = `Question suivante (${countdown}s)`;
      } else {
        clearInterval(countdownInterval);
        btnContinuer.textContent = "Question suivante";
        btnContinuer.disabled = false;
        // Passer automatiquement à la question suivante
        hideElement("ecran-resultat-classique");
        nextClassicQuestion();
      }
    }, 1000);
  }
}

function setupClassicContinueButton() {
  const btn = document.getElementById("btn-resultat-classique-continuer");
  if (btn) {
    btn.addEventListener("click", () => {
      hideElement("ecran-resultat-classique");
      nextClassicQuestion();
    });
  }
}

function nextClassicQuestion() {
  multiState.currentQuestionIndex++;
  
  if (multiState.currentQuestionIndex >= multiState.totalQuestions) {
    showClassicFinalResults();
  } else {
    // Demander la prochaine question au serveur ou utiliser les questions locales
    if (socket && currentGameCode) {
      socket.emit("next-question", { gameCode: currentGameCode });
    }
  }
}

function showClassicFinalResults() {
  // Trier les joueurs par score
  const rankings = [...multiState.players].sort((a, b) => (b.score || 0) - (a.score || 0));
  
  changerEcranMulti("resultat-multijoueur");
  
  const container = document.getElementById("grille-scores-resultat-multi");
  if (container) {
    container.innerHTML = "";
    rankings.forEach((player, idx) => {
      const div = document.createElement("div");
      div.className = "carte-joueur";
      
      let medal = "";
      if (idx === 0) medal = "🥇";
      else if (idx === 1) medal = "🥈";
      else if (idx === 2) medal = "🥉";
      
      div.innerHTML = `
        <h3>${medal} #${idx + 1} - ${player.name}</h3>
        <div class="points">${player.score || 0} points</div>
      `;
      container.appendChild(div);
    });
  }
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
  
  // Supprimer l'info répondant temporaire
  const infoTemp = document.getElementById("info-repondant-temp");
  if (infoTemp) infoTemp.remove();

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

  // Mode classique - chaque joueur voit la question et son buzzer
  if (multiplayerMode === "classic") {
    // Afficher la question dans la vue joueur
    const questionJoueurContainer = document.getElementById("question-joueur-container");
    const questionJoueur = document.getElementById("question-joueur");
    if (questionJoueurContainer) questionJoueurContainer.classList.remove("hidden");
    if (questionJoueur) questionJoueur.textContent = data.question;
    
    // Réinitialiser le buzzer et l'état
    const btnBuzz = document.getElementById("btn-buzz-player");
    if (btnBuzz) {
      btnBuzz.classList.remove("hidden");
      btnBuzz.style.display = "block";
      btnBuzz.disabled = false;
      btnBuzz.textContent = "BUZZ";
      btnBuzz.style.opacity = "1";
    }
    
    const etatBuzzer = document.getElementById("etat-buzzer-player");
    if (etatBuzzer) {
      etatBuzzer.style.display = "block";
      etatBuzzer.textContent = "Appuyez pour buzzer dès que vous êtes prêt.";
      etatBuzzer.style.color = "";
    }
    
    // Masquer les options de réponse jusqu'à ce qu'on buzze
    const optionsReponse = document.getElementById("options-reponse-multi");
    if (optionsReponse) optionsReponse.innerHTML = "";
    
    // Masquer le résultat
    const resultatJoueur = document.getElementById("resultat-joueur-multi");
    if (resultatJoueur) {
      resultatJoueur.classList.add("hidden");
      resultatJoueur.style.display = "none";
    }
    
    multiState.buzzerEnabled = true;
    multiState.answeringPlayer = null;
  }
  // Réinitialiser la vue joueur (téléphone) - mode spectateur
  else if (!isHost) {
    // Réafficher le buzzer
    const btnBuzz = document.getElementById("btn-buzz-player");
    if (btnBuzz) {
      btnBuzz.classList.remove("hidden");
      btnBuzz.style.display = "block";
      btnBuzz.disabled = false;
      btnBuzz.textContent = "BUZZ";
      btnBuzz.style.opacity = "1";
    }
    
    // Réafficher l'état du buzzer
    const etatBuzzer = document.getElementById("etat-buzzer-player");
    if (etatBuzzer) {
      etatBuzzer.style.display = "block";
      etatBuzzer.textContent = "Appuyez pour buzzer dès que vous êtes prêt.";
      etatBuzzer.style.color = "";
      etatBuzzer.style.fontWeight = "";
    }
    
    // Vider les options de réponse
    const optionsReponse = document.getElementById("options-reponse-multi");
    if (optionsReponse) optionsReponse.innerHTML = "";
    
    // Masquer le résultat joueur
    const resultatJoueur = document.getElementById("resultat-joueur-multi");
    if (resultatJoueur) {
      resultatJoueur.classList.add("hidden");
      resultatJoueur.style.display = "none";
    }
    
    // Masquer la question en mode non-classique (le joueur ne voit pas la question)
    const questionJoueurContainer = document.getElementById("question-joueur-container");
    if (questionJoueurContainer) questionJoueurContainer.classList.add("hidden");
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

  jouerSonMulti("buzzer"); // Jouer le son du buzzer
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

  // Mode classique ou spectateur avec vue hôte
  if (isHost && multiplayerMode === "spectator") {
    // Vue hôte spectateur - afficher qui répond
    const reponseScreen = document.getElementById("ecran-reponse-multi");
    const nomRepondant = document.getElementById("nom-repondant-multi");

    if (reponseScreen) {
      if (nomRepondant) nomRepondant.textContent = data.answeringPlayer;
      reponseScreen.classList.remove("hidden");
    }
  }

  // Demander les options SEULEMENT si c'est le joueur qui a buzzé
  // Le serveur vérifie que c'est bien le bon joueur
  if (socket && currentGameCode && multiState.answeringPlayer === socket.id) {
    console.log("📋 Je suis le joueur qui a buzzé, je demande les options");
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

  // Arrêter tous les sons et jouer le son approprié
  arreterTousLesSonsMulti();
  if (data.isCorrect) {
    jouerSonMulti("applaudissements"); // Son de bonne réponse
  } else {
    jouerSonMulti("hue"); // Son de mauvaise réponse
  }

  // Mise à jour scores
  updateScores(data.rankings);

  // Récupérer l'illustration depuis data ou currentQuestionData en secours
  const imageUrl = data.imageUrl || currentQuestionData?.imageUrl || null;
  const illustrationTexte = data.illustrationTexte || currentQuestionData?.illustrationTexte || null;

  // Vue hôte
  if (isHost) {
    const resultatScreen = document.getElementById("ecran-resultat-multi");
    const bonneReponse = document.getElementById("resultat-multi-bonne");
    const reponseScreen = document.getElementById("ecran-reponse-multi");

    if (reponseScreen) reponseScreen.classList.add("hidden");

    if (bonneReponse) {
      bonneReponse.innerHTML = data.isCorrect 
        ? `<span style="color: var(--p-bleu);">✅ Bonne réponse !</span><br>Réponse : ${data.correctAnswer}`
        : `<span style="color: var(--p-rose);">❌ Mauvaise réponse</span><br>Réponse correcte : ${data.correctAnswer}`;
    }

    // Afficher l'illustration (vue hôte)
    const illustrationContainer = document.getElementById("resultat-multi-illustration");
    const illustrationImage = document.getElementById("resultat-multi-image");
    const illustrationDescription = document.getElementById("resultat-multi-description");

    if (illustrationContainer && illustrationImage) {
      if (imageUrl) {
        illustrationImage.src = imageUrl;
        illustrationImage.alt = illustrationTexte || "Illustration";
        illustrationImage.onerror = () => {
          illustrationContainer.classList.add("hidden");
        };
        if (illustrationDescription) {
          illustrationDescription.textContent = illustrationTexte || "";
        }
        illustrationContainer.classList.remove("hidden");
      } else {
        illustrationContainer.classList.add("hidden");
      }
    }

    // Afficher qui a répondu
    const infoRepondant = document.createElement("p");
    infoRepondant.id = "info-repondant-temp";
    infoRepondant.innerHTML = `<strong>${data.playerName}</strong> a répondu : ${data.answer || "Temps écoulé"}`;
    infoRepondant.style.marginTop = "1rem";
    infoRepondant.style.color = "var(--p-rose-clair)";
    
    const existingInfo = document.getElementById("info-repondant-temp");
    if (existingInfo) existingInfo.remove();
    bonneReponse?.parentNode?.insertBefore(infoRepondant, bonneReponse.nextSibling);

    if (resultatScreen) resultatScreen.classList.remove("hidden");
    
    // Afficher le bouton question suivante
    const btnContinuer = document.getElementById("btn-resultat-multi-continuer");
    if (btnContinuer) {
      btnContinuer.classList.remove("hidden");
      btnContinuer.style.display = "inline-block";
    }
  }
  // Vue joueur (téléphone)
  else {
    const resultatJoueur = document.getElementById("resultat-joueur-multi");
    const titre = document.getElementById("titre-resultat-joueur");
    const correct = document.getElementById("resultat-joueur-correct");

    // Masquer le buzzer et les options
    hideElement("btn-buzz-player");
    const etatBuzzer = document.getElementById("etat-buzzer-player");
    if (etatBuzzer) etatBuzzer.style.display = "none";
    
    const optionsContainer = document.getElementById("options-reponse-multi");
    if (optionsContainer) optionsContainer.innerHTML = "";

    if (titre) {
      titre.textContent = data.isCorrect
        ? "✅ Bonne réponse !"
        : "❌ Mauvaise réponse";
      titre.style.color = data.isCorrect ? "var(--p-bleu)" : "var(--p-rose)";
    }

    if (correct) {
      correct.textContent = `Réponse correcte : ${data.correctAnswer}`;
    }

    // Afficher l'illustration (vue joueur)
    const illustrationImage = document.getElementById("resultat-joueur-image");
    const illustrationDescription = document.getElementById("resultat-joueur-description");
    const illustrationContainer = illustrationImage?.parentElement;

    if (illustrationImage) {
      if (imageUrl) {
        illustrationImage.src = imageUrl;
        illustrationImage.alt = illustrationTexte || "Illustration";
        illustrationImage.style.display = "block";
        illustrationImage.style.maxWidth = "100%";
        illustrationImage.style.maxHeight = "200px";
        illustrationImage.style.borderRadius = "10px";
        illustrationImage.style.margin = "1rem auto";
        illustrationImage.onerror = () => {
          illustrationImage.style.display = "none";
        };
        if (illustrationDescription) {
          illustrationDescription.textContent = illustrationTexte || "";
        }
        if (illustrationContainer) {
          illustrationContainer.classList.remove("hidden");
        }
      } else {
        illustrationImage.style.display = "none";
        if (illustrationDescription) {
          illustrationDescription.textContent = "";
        }
      }
    }

    // Afficher les scores côté joueur
    updatePlayerScoresDisplay(data.rankings);

    if (resultatJoueur) {
      resultatJoueur.classList.remove("hidden");
      resultatJoueur.style.display = "block";
    }

    // Message d'attente ou compte à rebours selon le mode
    const compteARebours = document.getElementById("compte-a-rebours-prochaine");
    if (compteARebours) {
      if (multiplayerMode === "classic") {
        // En mode classique, afficher un compte à rebours et passer automatiquement
        let countdown = 5;
        compteARebours.textContent = `Question suivante dans ${countdown} secondes...`;
        compteARebours.style.color = "var(--p-bleu)";
        
        const countdownInterval = setInterval(() => {
          countdown--;
          if (countdown > 0) {
            compteARebours.textContent = `Question suivante dans ${countdown} secondes...`;
          } else {
            clearInterval(countdownInterval);
            compteARebours.textContent = "Chargement...";
            // En mode classique côté joueur, attendre que le serveur envoie la prochaine question
            // Le serveur gère le passage automatique
          }
        }, 1000);
      } else {
        // En mode spectateur, attendre l'hôte
        compteARebours.textContent = "En attente de l'hôte pour la prochaine question...";
        compteARebours.style.color = "var(--p-violet)";
      }
    }
  }

  // NE PAS auto-masquer - l'hôte décide quand passer à la suite (sauf en mode classique)
}

// Nouvelle fonction pour afficher les scores côté joueur
function updatePlayerScoresDisplay(rankings) {
  const container = document.getElementById("liste-scores-joueur");
  if (!container || !rankings) return;

  // En mode spectateur, filtrer l'hôte des classements
  let rankingsToDisplay = rankings;
  if (multiplayerMode === "spectator") {
    rankingsToDisplay = rankings.filter(p => !p.isHost);
  }

  container.innerHTML = "";
  rankingsToDisplay.forEach((player, idx) => {
    const div = document.createElement("div");
    div.className = "score-item-joueur";
    div.style.cssText = `
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 1rem;
      margin: 0.3rem 0;
      background: rgba(128, 147, 241, 0.15);
      border-radius: 8px;
      border-left: 3px solid ${idx === 0 ? 'var(--p-bleu)' : 'var(--p-violet)'};
    `;
    
    let medal = "";
    if (idx === 0) medal = "🥇 ";
    else if (idx === 1) medal = "🥈 ";
    else if (idx === 2) medal = "🥉 ";
    
    div.innerHTML = `
      <span>${medal}${player.name}</span>
      <span style="color: var(--p-bleu); font-weight: bold;">${player.score} pts</span>
    `;
    container.appendChild(div);
  });
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

  // En mode spectateur, filtrer l'hôte des scores (l'hôte ne joue pas)
  let playersToDisplay = players;
  if (multiplayerMode === "spectator") {
    // Filtrer les joueurs qui sont marqués comme hôte
    playersToDisplay = players.filter(p => !p.isHost);
  }

  if (playersToDisplay.length === 0) {
    container.innerHTML = '<p class="texte-secondaire">En attente des joueurs...</p>';
    return;
  }

  // Trier par score décroissant
  const sorted = [...playersToDisplay].sort((a, b) => (b.score || 0) - (a.score || 0));

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

  // En mode spectateur, filtrer l'hôte des classements
  let rankingsToDisplay = data.rankings;
  if (multiplayerMode === "spectator") {
    rankingsToDisplay = data.rankings.filter(p => !p.isHost);
  }

  rankingsToDisplay.forEach((player, idx) => {
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
    const nomInput = document.getElementById("nom-joueur");
    const optionRejoindre = document.querySelector(".option-rejoindre");
    
    if (codeInput) {
      codeInput.value = joinCode.toUpperCase();
      codeInput.readOnly = true; // Le code est déjà rempli
      codeInput.style.background = "rgba(114, 221, 247, 0.2)";
      codeInput.style.borderColor = "var(--p-bleu)";
    }
    
    // Scroll vers la section rejoindre
    if (optionRejoindre) {
      setTimeout(() => {
        optionRejoindre.scrollIntoView({ behavior: "smooth", block: "center" });
        
        // Focus sur le champ nom après le scroll
        setTimeout(() => {
          if (nomInput) {
            nomInput.focus();
            nomInput.placeholder = "Entrez votre prénom pour rejoindre";
          }
        }, 500);
      }, 300);
    }
    
    // Ajouter un indicateur visuel
    if (optionRejoindre) {
      optionRejoindre.style.border = "2px solid var(--p-bleu)";
      optionRejoindre.style.boxShadow = "0 0 20px rgba(114, 221, 247, 0.3)";
    }
    
    showNotification(`Code ${joinCode} détecté ! Entrez votre nom pour rejoindre.`, "info");
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
      if (!isHost || !currentGameCode) return;
      
      // Envoyer l'événement au serveur pour passer à la question suivante
      socket.emit("next-question", { gameCode: currentGameCode });
      
      // Masquer l'écran résultat
      hideElement("ecran-resultat-multi");
      
      // Supprimer l'info du répondant temporaire
      const infoTemp = document.getElementById("info-repondant-temp");
      if (infoTemp) infoTemp.remove();
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
  setupClassicContinueButton();
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
