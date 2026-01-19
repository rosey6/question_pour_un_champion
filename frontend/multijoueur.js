// Configuration
const SERVER_URL = "https://question-pour-un-champion.onrender.com";

// Variables globales
let mpSocket = null;
let currentGame = {
  code: null,
  isHost: false,
  players: [],
  settings: {},
  currentPlayer: null,
  currentQuestion: null,
  questions: [],
  currentQuestionIndex: 0,
};
let playerId = null;
let playerName = null;

// ---------- QR code helper (stable) ----------
// Génère un QR code qui ouvre la page joueur avec le code pré-rempli.
// Ne dépend pas du CSS; n'altère pas les couleurs/thème.
function buildPlayerJoinUrl(gameCode) {
  try {
    const currentPath = window.location.pathname || "/";
    // Remplace le fichier courant par la page joueur si elle existe, sinon reste sur la page actuelle.
    const basePath = currentPath.replace(/\/[^/]*$/, "/");
    const candidate = `${basePath}multijoueur-player.html`;
    const url = new URL(candidate, window.location.origin);
    url.searchParams.set("code", String(gameCode || "").trim());
    // Indique au client qu'il s'agit d'une vue joueur sur mobile.
    url.searchParams.set("role", "player");
    return url.toString();
  } catch (e) {
    // Fallback minimal
    return `${window.location.origin}${window.location.pathname}?code=${encodeURIComponent(
      String(gameCode || "").trim()
    )}`;
  }
}

function renderJoinQrCode(gameCode) {
  const container = document.getElementById("qr-code");
  const containerBox = document.getElementById("qr-code-container");
  if (!container) return;

  // Affiche le bloc QR (si présent)
  if (containerBox) containerBox.classList.remove("hidden");

  const url = buildPlayerJoinUrl(gameCode);

  // Nettoie l'ancien rendu
  container.innerHTML = "";

  // 1) Si QRCode (qrcodejs) est chargé, on l'utilise
  if (typeof QRCode !== "undefined") {
    // eslint-disable-next-line no-new
    new QRCode(container, {
      text: url,
      width: 180,
      height: 180,
      correctLevel: QRCode.CorrectLevel ? QRCode.CorrectLevel.M : undefined,
    });
    return;
  }

  // 2) Fallback: image via API (stable, aucune dépendance)
  const img = document.createElement("img");
  img.alt = "QR code";
  img.loading = "lazy";
  img.decoding = "async";
  img.style.maxWidth = "180px";
  img.style.width = "180px";
  img.style.height = "180px";
  img.style.display = "block";
  img.style.margin = "0 auto";
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
    url
  )}`;
  container.appendChild(img);
}

// Référence aux fonctions de script.js
const GameLogic = {
  obtenirQuestionsAleatoires: (nombre) => {
    if (typeof obtenirQuestionsAleatoires === "function") {
      return obtenirQuestionsAleatoires(nombre);
    }
    console.warn("Fonction obtenirQuestionsAleatoires non trouvée, fallback");
    return obtenirQuestionsAleatoiresDepuisJSON(nombre);
  },

  traiterReponse: (indexJoueur, reponseDonnee, reponseCorrecte) => {
    if (typeof traiterReponseMultijoueur === "function") {
      return traiterReponseMultijoueur(
        indexJoueur,
        reponseDonnee,
        reponseCorrecte
      );
    }
    console.warn("Fonction traiterReponseMultijoueur non trouvée, fallback");
    return { correct: false, points: 0, nouveauScore: 0 };
  },

  obtenirQuestionAleatoire: () => {
    if (typeof obtenirQuestionAleatoire === "function") {
      return obtenirQuestionAleatoire();
    }
    console.warn("Fonction obtenirQuestionAleatoire non trouvée, fallback");
    return null;
  },

  reinitialiserPartie: (
    nomsJoueurs,
    nbQuestions,
    dureeQuestion,
    dureeReponse
  ) => {
    if (typeof reinitialiserPartieMultijoueur === "function") {
      return reinitialiserPartieMultijoueur(
        nomsJoueurs,
        nbQuestions,
        dureeQuestion,
        dureeReponse
      );
    }
    console.warn("Fonction reinitialiserPartieMultijoueur non trouvée");
    return [];
  },
};

// Fallback si script.js n'est pas chargé
function obtenirQuestionsAleatoiresDepuisJSON(nombre) {
  const questionsParDefaut = [
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
  ];

  return questionsParDefaut.slice(
    0,
    Math.min(nombre, questionsParDefaut.length)
  );
}

// Fonction pour mélanger un tableau
function melangerTableau(tableau) {
  if (typeof window.melangerTableau === "function") {
    return window.melangerTableau(tableau);
  }

  const resultat = [...tableau];
  for (let i = resultat.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [resultat[i], resultat[j]] = [resultat[j], resultat[i]];
  }
  return resultat;
}

// Récupérer les paramètres de jeu (mêmes réglages que le mode solo)
// Source principale : les <select> de l'écran "Paramètres du jeu" (solo)
// Fallback : l'objet global `jeu` (script.js)
function getMultiplayerSettingsFromUI() {
  const readInt = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const v = parseInt(el.value, 10);
    return Number.isFinite(v) ? v : null;
  };

  // IDs du mode solo
  const questionsCountFromUI = readInt("nombre-questions");
  const timePerQuestionFromUI = readInt("duree-question-param");
  const timePerAnswerFromUI = readInt("duree-reponse-param");

  // Fallback vers l'objet `jeu` si présent
  const questionsCountFallback =
    typeof window.jeu === "object" && window.jeu
      ? window.jeu.nombreQuestionsParPartie
      : null;
  const timePerQuestionFallback =
    typeof window.jeu === "object" && window.jeu ? window.jeu.dureeQuestion : null;
  const timePerAnswerFallback =
    typeof window.jeu === "object" && window.jeu ? window.jeu.dureeReponse : null;

  const questionsCount =
    questionsCountFromUI ?? (Number.isFinite(questionsCountFallback) ? questionsCountFallback : 10);
  const timePerQuestion =
    timePerQuestionFromUI ?? (Number.isFinite(timePerQuestionFallback) ? timePerQuestionFallback : 30);
  const timePerAnswer =
    timePerAnswerFromUI ?? (Number.isFinite(timePerAnswerFallback) ? timePerAnswerFallback : 15);

  return {
    questionsCount,
    timePerQuestion,
    timePerAnswer,
  };
}

// Connexion au serveur
function connectToServer() {
  console.log("Connexion au serveur:", SERVER_URL);

  mpSocket = io(SERVER_URL, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000,
  });

  mpSocket.on("connect", () => {
    console.log("✅ Connecté au serveur:", mpSocket.id);
    playerId = mpSocket.id;
    showNotification("Connecté au serveur", "success");
  });

  mpSocket.on("connect_error", (error) => {
    console.error("❌ Erreur connexion:", error);
    showNotification("Erreur de connexion au serveur", "error");
  });

  // Événements serveur (liaison défensive : évite les ReferenceError si un handler a été supprimé/renommé)
  const onSafe = (eventName, handlerName) => {
    mpSocket.on(eventName, (payload) => {
      const fn = typeof window[handlerName] === "function" ? window[handlerName] : null;
      if (!fn) {
        console.error(`❌ Handler manquant: ${handlerName} pour l'événement ${eventName}`);
        return;
      }
      fn(payload);
    });
  };

  onSafe("game-created", "handleGameCreated");
  onSafe("join-success", "handleJoinSuccess");
  onSafe("join-error", "handleJoinError");
  onSafe("player-joined", "handlePlayerJoined");
  onSafe("player-left", "handlePlayerLeft");
  onSafe("game-started", "handleGameStarted");
  onSafe("new-question", "handleNewQuestion");
  onSafe("player-buzzed", "handlePlayerBuzzed");
  onSafe("show-answer-screen", "handleShowAnswerScreen");
  onSafe("answer-result", "handleAnswerResult");
  onSafe("question-results", "handleQuestionResults");
  onSafe("game-finished", "handleGameFinished");
  onSafe("host-disconnected", "handleHostDisconnected");
  onSafe("buzzer-timeout", "handleBuzzerTimeout");
  onSafe("next-question-ready", "handleNextQuestionReady");
}

/**
 * Lit les paramètres de jeu depuis l'UI « Paramètres du jeu » (mode solo),
 * puis fallback sur l'objet global `jeu`.
 * Objectif : permettre de paramétrer AVANT de créer/démarrer une salle multijoueur.
 */
// Gestion des événements
function handleGameCreated(data) {
  console.log("🎮 Partie créée:", data);

  if (data.success) {
    currentGame.code = data.gameCode;
    currentGame.isHost = true;

    const codeEl = document.getElementById("code-partie");
    if (codeEl) codeEl.textContent = data.gameCode;

    const codeBox = document.getElementById("code-partie-container");
    if (codeBox) codeBox.classList.remove("hidden");

    // QR code (connexion rapide)
    // Objectif: rester stable et indépendant du reste de l'UI.
    // Le QR doit ouvrir la page joueur avec le code pré-rempli.
    try {
      renderJoinQrCode(data.gameCode);
    } catch (e) {
      console.warn("⚠️ Impossible de générer le QR code:", e);
    }
    document.getElementById("salle-attente").classList.add("hidden");

    showNotification(`Partie créée: ${data.gameCode}`, "success");
    updatePlayerList([
      { id: playerId, name: playerName, score: 0, isHost: true },
    ]);
  }
}

function handleJoinSuccess(data) {
  console.log("✅ Rejoint avec succès:", data);

  currentGame.code = data.gameCode;
  currentGame.isHost = false;
  currentGame.players = data.players;

  const codeSalleEl = document.getElementById("code-salle-jointe");
  if (codeSalleEl) codeSalleEl.textContent = data.gameCode;

  const nomHoteEl = document.getElementById("nom-hote");
  if (nomHoteEl) nomHoteEl.textContent = data.hostName;

  const salleAttenteEl = document.getElementById("salle-attente");
  if (salleAttenteEl) salleAttenteEl.classList.remove("hidden");

  showNotification(`Rejoint: ${data.gameCode}`, "success");
  updateWaitingPlayers(data.players);
}

function handleJoinError(data) {
  console.error("❌ Erreur de rejoindre:", data);
  showNotification(data.message, "error");
}

function handlePlayerJoined(data) {
  console.log("👤 Joueur rejoint:", data);

  currentGame.players = data.players;

  if (currentGame.isHost) {
    updatePlayerList(data.players);
    document.getElementById("btn-demarrer-partie").disabled =
      data.players.length < 2;
    document.getElementById(
      "btn-demarrer-partie"
    ).innerHTML = `<i class="fas fa-play"></i> Démarrer (${data.players.length}/4)`;
  } else {
    updateWaitingPlayers(data.players);
  }
}

function handlePlayerLeft(data) {
  console.log("👤 Joueur parti:", data);

  currentGame.players = data.players;

  if (currentGame.isHost) {
    updatePlayerList(data.players);
    document.getElementById("btn-demarrer-partie").disabled =
      data.players.length < 2;
    document.getElementById(
      "btn-demarrer-partie"
    ).innerHTML = `<i class="fas fa-play"></i> Démarrer (${data.players.length}/4)`;
  } else {
    updateWaitingPlayers(data.players);
  }
}

function handleGameStarted(data) {
  console.log("🚀 Partie démarrée:", data);

  // Stocker les données de la partie
  currentGame.questions = data.questions || [];
  currentGame.settings = data.settings || {};
  currentGame.currentQuestionIndex = 0;

  // Cacher les écrans d'attente
  document.getElementById("multijoueur").classList.remove("actif");
  document.getElementById("jeu-multijoueur").classList.add("actif");

  // Initialiser le jeu
  initMultiplayerGame(data.players);

  showNotification("La partie commence !", "success");
}

function handleNewQuestion(data) {
  console.log("📩 Nouvelle question reçue:", data);

  // Afficher la question
  const questionElement = document.getElementById("question-multijoueur");
  if (questionElement) {
    questionElement.textContent = data.question;
    console.log(
      "✅ Question affichée:",
      data.question.substring(0, 50) + "..."
    );
  } else {
    console.error("❌ Élément question-multijoueur non trouvé!");
  }

  // Mettre à jour le compteur de questions
  const infoQuestion = document.getElementById("info-question-multi");
  if (infoQuestion && data.questionNumber && data.totalQuestions) {
    infoQuestion.textContent = `Question ${data.questionNumber}/${data.totalQuestions}`;
  }

  // Stocker la question pour les réponses
  currentGame.currentQuestion = data;

  // Activer les buzzers
  enableBuzzers();

  // Démarrer le chrono
  // Le serveur peut envoyer timeLimit (ms) ou seulement les settings (s).
  let timeLimitMs = data.timeLimit;
  if (typeof timeLimitMs !== "number" || !Number.isFinite(timeLimitMs) || timeLimitMs <= 0) {
    const fallbackSeconds =
      (currentGame.settings && Number(currentGame.settings.timePerQuestion)) ||
      (currentGame.settings && Number(currentGame.settings.timePerQuestionSeconds)) ||
      30;
    timeLimitMs = Math.max(1, Math.round(fallbackSeconds * 1000));
  }
  startQuestionTimer(timeLimitMs);
}

function handlePlayerBuzzed(data) {
  console.log("🔔 Joueur a buzzé:", data);

  // Désactiver les buzzers
  disableBuzzers();

  // Marquer le joueur qui a buzzé
  highlightPlayer(data.playerId);

  showNotification(`${data.playerName} a buzzé !`, "info");
}

function handleShowAnswerScreen(data) {
  console.log("📝 Écran de réponse:", data);

  // Afficher l'écran de réponse
  document.getElementById("ecran-reponse-multi").classList.remove("hidden");
  document.getElementById("nom-repondant-multi").textContent =
    data.answeringPlayer;

  // Si c'est nous qui répondons, afficher les options
  if (data.answeringPlayer === playerName) {
    showAnswerOptions();
  }
}

function handleAnswerResult(data) {
  console.log("✅ Résultat réponse:", data);

  // Mettre à jour les scores
  updatePlayerScore(data.playerId, data.score);

  // Afficher le résultat
  const message = data.isCorrect
    ? `${data.playerName}: ✓ Correct! +10 points`
    : `${data.playerName}: ✗ Incorrect! -5 points`;

  showNotification(message, data.isCorrect ? "success" : "error");
}

function handleQuestionResults(data) {
  console.log("📊 Résultats question:", data);

  // Afficher les résultats
  showQuestionResults(data.rankings);
}

function handleGameFinished(data) {
  console.log("🏁 Partie terminée:", data);

  // Afficher les résultats finaux
  showFinalResults(data.rankings);
}

function handleHostDisconnected() {
  console.warn("👑 Hôte déconnecté");
  showNotification("L'hôte a quitté la partie", "error");
  returnToMainMenu();
}

function handleBuzzerTimeout() {
  console.log("⏰ Timeout buzzer");
  showNotification("Personne n'a buzzé !", "warning");
}

function handleNextQuestionReady() {
  console.log("➡️ Question suivante prête");

  // Préparer la question suivante
  if (currentGame.isHost) {
    // L'hôte envoie la question suivante
    sendNextQuestion();
  }
}

// Fonctions utilitaires
function updatePlayerList(players) {
  const container = document.getElementById("liste-joueurs-salle");
  container.innerHTML = "";

  players.forEach((player) => {
    const div = document.createElement("div");
    div.className = "joueur-item";
    div.innerHTML = `
            <i class="fas fa-user${player.isHost ? "-crown" : ""}"></i>
            <span>${player.name}</span>
            ${player.isHost ? '<span class="badge-hote">Hôte</span>' : ""}
        `;
    container.appendChild(div);
  });
}

function updateWaitingPlayers(players) {
  const container = document.getElementById("joueurs-attente");
  if (!container) return; // page joueur téléphone n'affiche pas cette liste
  container.innerHTML = "";

  players.forEach((player) => {
    const div = document.createElement("div");
    div.className = "joueur-item";
    div.innerHTML = `
            <i class="fas fa-user${player.isHost ? "-crown" : ""}"></i>
            <span>${player.name}</span>
            ${player.isHost ? '<span class="badge-hote">Hôte</span>' : ""}
        `;
    container.appendChild(div);
  });
}

function initMultiplayerGame(players) {
  console.log("🎮 Initialisation jeu multijoueur avec joueurs:", players);

  // Créer la grille de scores
  const scoresContainer = document.getElementById("grille-scores-multi");
  if (!scoresContainer) return; // page joueur téléphone n'a pas la grille hôte
  scoresContainer.innerHTML = "";

  players.forEach((player, index) => {
    const card = document.createElement("div");
    card.className = `carte-joueur-multi ${player.isHost ? "hote" : ""}`;
    card.id = `joueur-${player.id}`;
    card.innerHTML = `
            <h3>${player.name}</h3>
            <div class="points">${player.score} pts</div>
        `;
    scoresContainer.appendChild(card);
  });

  // Créer les buzzers
  const buzzersContainer = document.getElementById("grille-buzzers-multi");
  if (!buzzersContainer) return;
  buzzersContainer.innerHTML = "";

  players.forEach((player, index) => {
    const buzzerDiv = document.createElement("div");
    buzzerDiv.className = "buzzer-joueur-multi";
    buzzerDiv.innerHTML = `
            <h3>${player.name}</h3>
            <button class="bouton-buzzer-multi" data-player-id="${player.id}">
                BUZZ !
            </button>
            <div class="raccourci">Touche ${index + 1}</div>
        `;

    const button = buzzerDiv.querySelector(".bouton-buzzer-multi");
    const colors = ["#FF5252", "#4CAF50", "#2196F3", "#FFC107"];
    button.style.setProperty("--color", colors[index]);
    button.style.borderColor = colors[index];

    button.addEventListener("click", () => {
      console.log(`🎯 ${player.name} buzz via bouton`);
      buzz(player.id);
    });

    buzzersContainer.appendChild(buzzerDiv);
  });
}

function enableBuzzers() {
  console.log("✅ Activation des buzzers");
  const buttons = document.querySelectorAll(".bouton-buzzer-multi");
  buttons.forEach((btn) => {
    btn.disabled = false;
    btn.classList.remove("buzzed");
    btn.style.opacity = "1";
  });
}

function disableBuzzers() {
  console.log("❌ Désactivation des buzzers");
  const buttons = document.querySelectorAll(".bouton-buzzer-multi");
  buttons.forEach((btn) => {
    btn.disabled = true;
    btn.style.opacity = "0.7";
  });
}

function highlightPlayer(playerId) {
  console.log("🌟 Surbrillance joueur:", playerId);
  const buttons = document.querySelectorAll(".bouton-buzzer-multi");
  buttons.forEach((btn) => {
    if (btn.dataset.playerId === playerId) {
      btn.classList.add("buzzed");
      btn.style.animation = "buzz 0.5s ease-in-out 3";
    }
  });
}

function updatePlayerScore(playerId, score) {
  console.log("📈 Mise à jour score:", playerId, score);
  const card = document.getElementById(`joueur-${playerId}`);
  if (card) {
    const pointsElement = card.querySelector(".points");
    if (pointsElement) {
      pointsElement.textContent = `${score} pts`;
    }
  }
}

function buzz(playerId) {
  console.log("🔊 Buzz envoyé pour:", playerId);

  if (mpSocket && mpSocket.connected && currentGame.code) {
    mpSocket.emit("buzz", { gameCode: currentGame.code });
  } else {
    console.error("❌ Impossible de buzzer: mpSocket non connecté");
    showNotification("Erreur de connexion", "error");
  }
}

function startQuestionTimer(duration) {
  console.log("⏱️ Démarrage chrono:", duration, "ms");

  let timeLeft = duration / 1000;
  const timerElement = document.getElementById("temps-multijoueur");

  if (!timerElement) {
    console.error("❌ Élément temps-multijoueur non trouvé!");
    return;
  }

  timerElement.textContent = timeLeft;

  const timer = setInterval(() => {
    timeLeft--;
    timerElement.textContent = timeLeft;

    if (timeLeft <= 0) {
      clearInterval(timer);
      console.log("⏰ Temps écoulé!");
    }
  }, 1000);
}

function showAnswerOptions() {
  console.log("📝 Affichage options de réponse");

  if (!currentGame.currentQuestion) {
    console.error("❌ Aucune question disponible");
    showNotification("Erreur: question non disponible", "error");
    return;
  }

  const container = document.getElementById("options-reponse-multi");
  container.innerHTML = "";

  currentGame.currentQuestion.options.forEach((option) => {
    const button = document.createElement("button");
    button.className = "option-reponse-multi";
    button.textContent = option;
    button.addEventListener("click", () => {
      const isCorrect = option === currentGame.currentQuestion.correctAnswer;
      console.log(`✅ Réponse soumise: ${option}, correcte: ${isCorrect}`);

      mpSocket.emit("submit-answer", {
        gameCode: currentGame.code,
        answer: option,
        isCorrect: isCorrect,
      });

      // Désactiver les boutons après clic
      container.querySelectorAll("button").forEach((btn) => {
        btn.disabled = true;
        btn.style.opacity = "0.7";
      });
    });
    container.appendChild(button);
  });
}

function showQuestionResults(rankings) {
  console.log("📊 Affichage résultats question:", rankings);

  let message = "Résultats de la question :\n";
  rankings.forEach((player) => {
    message += `${player.position}. ${player.name}: ${player.score} pts\n`;
  });

  // Utiliser une notification au lieu d'alerte
  showNotification(message.substring(0, 100) + "...", "info");
}

function showFinalResults(rankings) {
  console.log("🏆 Affichage résultats finaux:", rankings);

  // Si l'écran "resultat" du mode solo existe, on le réutilise pour afficher le classement final
  const hasSoloResultScreen =
    document.getElementById("resultat") &&
    document.getElementById("grille-scores-resultat");

  if (hasSoloResultScreen && typeof window.changerEcran === "function") {
    // Basculer sur l'écran résultat
    window.changerEcran("resultat");

    // Titre / contenus
    const qEl = document.getElementById("question-resultat");
    if (qEl) qEl.textContent = "Résultats finaux (Multijoueur)";

    const repCorrecte = document.getElementById("reponse-correcte");
    if (repCorrecte) repCorrecte.textContent = "";

    const statut = document.getElementById("statut-reponse");
    if (statut) statut.textContent = "Classement final";

    const nomRepondant = document.getElementById("nom-repondant");
    if (nomRepondant) nomRepondant.textContent = "";

    // Grille scores
    const grid = document.getElementById("grille-scores-resultat");
    if (grid) {
      grid.innerHTML = "";
      rankings.forEach((p, index) => {
        const div = document.createElement("div");
        div.className = "score-item";
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "";
        div.innerHTML = `<span class="nom-joueur">${medal} ${p.position}. ${p.name}</span><span class="score">${p.score}</span>`;
        grid.appendChild(div);
      });
    }

    // Boutons : masquer "question suivante" et activer "menu principal"
    const btnNext = document.getElementById("btn-question-suivante");
    if (btnNext) {
      btnNext.style.display = "none";
    }

    const btnMenu = document.getElementById("btn-menu-principal");
    if (btnMenu) {
      btnMenu.style.display = "inline-block";
      btnMenu.onclick = () => returnToMainMenu();
    }
    return;
  }

  // Fallback : notification/alert si la page résultat n'est pas disponible
  let message = "RÉSULTATS FINAUX\n\n";
  rankings.forEach((player) => {
    message += `${player.position}. ${player.name}: ${player.score} pts\n`;
  });
  alert(message);
  setTimeout(() => returnToMainMenu(), 2000);
}

function returnToMainMenu() {
  console.log("🏠 Retour au menu principal");

  const jeuEl = document.getElementById("jeu-multijoueur");
  const multiEl = document.getElementById("multijoueur");
  const accueilEl = document.getElementById("accueil");
  if (jeuEl) jeuEl.classList.remove("actif");
  if (multiEl) multiEl.classList.remove("actif");
  if (accueilEl) accueilEl.classList.add("actif");
}

function showNotification(message, type = "info") {
  console.log(`📢 Notification [${type}]: ${message}`);

  // Créer une notification temporaire
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${
          type === "success"
            ? "#4CAF50"
            : type === "error"
            ? "#F44336"
            : "#2196F3"
        };
        color: white;
        border-radius: 5px;
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-weight: bold;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease-out forwards";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Fonctions pour gérer les questions
function sendNextQuestion() {
  console.log("➡️ Envoi question suivante");

  if (
    currentGame.isHost &&
    currentGame.questions &&
    currentGame.currentQuestionIndex < currentGame.questions.length
  ) {
    const nextQuestion =
      currentGame.questions[currentGame.currentQuestionIndex];
    currentGame.currentQuestionIndex++;

    mpSocket.emit("send-question", {
      gameCode: currentGame.code,
      question: nextQuestion.question,
      options: nextQuestion.options,
      correctAnswer: nextQuestion.reponseCorrecte,
      questionNumber: currentGame.currentQuestionIndex,
      totalQuestions: currentGame.questions.length,
      timeLimit: (currentGame.settings.timePerQuestion || 30) * 1000,
    });

    // Mettre à jour l'affichage pour l'hôte
    document.getElementById("question-multijoueur").textContent =
      nextQuestion.question;
    document.getElementById(
      "info-question-multi"
    ).textContent = `Question ${currentGame.currentQuestionIndex}/${currentGame.questions.length}`;

    enableBuzzers();
    startQuestionTimer((currentGame.settings.timePerQuestion || 30) * 1000);
  }
}

// Initialisation
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Initialisation multijoueur...");

  connectToServer();

  // Pré-remplissage du code de partie si présent dans l'URL (QR code)
  try {
    const url = new URL(window.location.href);
    const codeParam = (url.searchParams.get("code") || "").trim().toUpperCase();
    if (codeParam) {
      const codeInput = document.getElementById("code-rejoindre");
      if (codeInput) codeInput.value = codeParam;
    }
  } catch (e) {
    // Ignorer silencieusement (URL invalide)
  }

  // Bouton multijoueur : uniquement si la page contient l'écran d'accueil.
  // Sur les pages téléphone (multijoueur-player.html) ce bloc ne doit pas s'exécuter.
  const accueilActions = document.querySelector("#accueil .actions");

  // Ajouter un bouton multijoueur si non présent (et si la cible existe)
  if (accueilActions && !document.getElementById("btn-multijoueur")) {
    const btnMultijoueur = document.createElement("button");
    btnMultijoueur.id = "btn-multijoueur";
    btnMultijoueur.className = "bouton bouton-principal";
    btnMultijoueur.innerHTML = '<i class="fas fa-users"></i> Mode Multijoueur';
    btnMultijoueur.addEventListener("click", () => {
      console.log("🎮 Clic sur mode multijoueur");
      changerEcran("multijoueur");
    });
    accueilActions.insertBefore(btnMultijoueur, accueilActions.firstChild);
  }

  // Créer une partie
  const btnCreerPartie = document.getElementById("btn-creer-partie");
  if (btnCreerPartie) btnCreerPartie.addEventListener("click", () => {
    playerName = document.getElementById("nom-createur").value.trim();
    if (!playerName) {
      showNotification("Entrez votre nom", "error");
      return;
    }

    // Paramètres : mêmes réglages que le mode solo (écran Paramètres)
    const settings = getMultiplayerSettingsFromUI();

    console.log("🎮 Création partie avec paramètres:", settings);

    mpSocket.emit("create-game", {
      playerName: playerName,
      settings: settings,
    });
  });

  // Rejoindre une partie
  const btnRejoindrePartie = document.getElementById("btn-rejoindre-partie");
  if (btnRejoindrePartie) btnRejoindrePartie.addEventListener("click", () => {
      playerName = document.getElementById("nom-joueur").value.trim();
      const gameCode = document
        .getElementById("code-rejoindre")
        .value.trim()
        .toUpperCase();

      if (!playerName || !gameCode) {
        showNotification("Remplissez tous les champs", "error");
        return;
      }

      console.log("🎮 Tentative de rejoindre:", gameCode);

      mpSocket.emit("join-game", {
        gameCode: gameCode,
        playerName: playerName,
      });
  });

  // Démarrer la partie (hôte)
  const btnDemarrerPartie = document.getElementById("btn-demarrer-partie");
  if (btnDemarrerPartie) btnDemarrerPartie.addEventListener("click", () => {
      if (currentGame.isHost && currentGame.code) {
        // Paramètres : mêmes réglages que le mode solo (écran Paramètres)
        const settings = getMultiplayerSettingsFromUI();

        // Obtenir les questions depuis script.js
        const questions = GameLogic.obtenirQuestionsAleatoires(
          settings.questionsCount
        );

        console.log("🚀 Démarrage partie avec", questions.length, "questions");

        // Envoyer au serveur
        mpSocket.emit("start-game", {
          gameCode: currentGame.code,
          settings: settings,
          questions: questions,
        });
      }
  });

  // Boutons retour
  const btnRetourMultijoueur = document.getElementById("btn-retour-multijoueur");
  if (btnRetourMultijoueur) btnRetourMultijoueur.addEventListener("click", () => {
      console.log("🔙 Retour à l'accueil depuis multijoueur");
      changerEcran("accueil");
  });

  // Raccourcis clavier pour buzzer
  document.addEventListener("keydown", (e) => {
    const jeuMulti = document.getElementById("jeu-multijoueur");
    if (jeuMulti && jeuMulti.classList.contains("actif")) {
      const key = e.key;
      if (key >= "1" && key <= "4") {
        const playerIndex = parseInt(key) - 1;
        if (currentGame.players[playerIndex]) {
          console.log(
            "⌨️ Buzz via clavier:",
            key,
            "joueur:",
            currentGame.players[playerIndex].name
          );
          buzz(currentGame.players[playerIndex].id);
        }
      }
    }
  });

  console.log("✅ Multijoueur initialisé avec succès");
});
