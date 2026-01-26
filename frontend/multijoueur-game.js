// ============================================
// MULTIJOUEUR-GAME.JS
// Gestion du jeu multijoueur (nouvelle version multi-pages)
// ============================================

const BACKEND_URL = "https://questionpourunchampion-backend.onrender.com";
let socket = null;
let gameData = null;
let currentQuestionData = null;

// Etat du jeu
let gameState = {
  players: [],
  scores: {},
  currentQuestionIndex: 0,
  totalQuestions: 10,
  buzzerEnabled: false,
  answeringPlayer: null,
  isHost: false,
  mode: 'spectator'
};

// Timers
let questionTimer = null;
let answerTimer = null;

// Sons
const sounds = {
  buzzer: null,
  correct: null,
  incorrect: null
};

// Initialiser les sons
function initSounds() {
  try {
    sounds.buzzer = new Audio('buzzer.mp3');
    sounds.correct = new Audio('Applaudissements.mp3');
    sounds.incorrect = new Audio('hue.mp3');
    Object.values(sounds).forEach(s => {
      if (s) {
        s.load();
        s.volume = 0.7;
      }
    });
  } catch (e) {
    console.log('Sons non disponibles');
  }
}

function playSound(name) {
  try {
    const sound = sounds[name];
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
  } catch (e) {}
}

function stopAllSounds() {
  Object.values(sounds).forEach(s => {
    if (s) {
      s.pause();
      s.currentTime = 0;
    }
  });
}

// ============================================
// INITIALISATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('Initialisation du jeu multijoueur');

  // Recuperer les donnees de session
  const storedData = sessionStorage.getItem('multiGameData');
  if (!storedData) {
    console.error('Pas de donnees de jeu');
    window.location.href = 'multijoueur.html';
    return;
  }

  gameData = JSON.parse(storedData);
  console.log('Game data:', gameData);

  gameState.isHost = gameData.isHost || false;
  gameState.mode = gameData.mode || 'spectator';
  gameState.players = gameData.players || [];
  gameState.totalQuestions = gameData.settings?.questionsCount || 10;

  initSounds();
  setupUI();
  connectToGame();
});

// ============================================
// CONFIGURATION UI
// ============================================

function setupUI() {
  const vueHote = document.getElementById('vue-hote');
  const vueJoueur = document.getElementById('vue-joueur');
  const playerQuestionZone = document.getElementById('player-question-zone');

  // En mode classique, tout le monde est joueur (pas d'hôte)
  // En mode spectateur, seul l'hôte a la vue hôte
  const shouldShowHostView = gameState.isHost && gameState.mode === 'spectator';

  if (shouldShowHostView) {
    // Vue hote (uniquement en mode spectateur)
    if (vueHote) vueHote.classList.remove('hidden');
    if (vueJoueur) vueJoueur.classList.add('hidden');
    setupHostUI();
  } else {
    // Vue joueur (mode classique pour tous, ou joueurs en mode spectateur)
    if (vueHote) vueHote.classList.add('hidden');
    if (vueJoueur) vueJoueur.classList.remove('hidden');

    // En mode classique, afficher la question
    if (gameState.mode === 'classic' && playerQuestionZone) {
      playerQuestionZone.classList.remove('hidden');
    }

    setupPlayerUI();
  }

  updateScoresDisplay();
}

function setupHostUI() {
  // Bouton question suivante
  const btnNext = document.getElementById('btn-next');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      if (socket) {
        socket.emit('next-question', { gameCode: gameData.gameCode });
        hideElement('result-zone');
      }
    });
  }
}

function setupPlayerUI() {
  // Bouton buzzer
  const btnBuzzer = document.getElementById('btn-buzzer');
  if (btnBuzzer) {
    btnBuzzer.addEventListener('click', () => {
      if (!gameState.buzzerEnabled) return;

      socket.emit('buzz', { gameCode: gameData.gameCode });
      btnBuzzer.disabled = true;
      btnBuzzer.classList.add('buzzed');
      btnBuzzer.querySelector('.buzzer-text').textContent = 'BUZZE!';

      const status = document.getElementById('buzzer-status');
      if (status) {
        status.textContent = 'Vous avez buzze!';
        status.classList.add('success');
      }

      playSound('buzzer');
    });
  }
}

// ============================================
// CONNEXION SOCKET
// ============================================

function connectToGame() {
  socket = io(BACKEND_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    timeout: 20000
  });

  socket.on('connect', () => {
    console.log('Connecte au serveur');
    showNotification('Connecte!', 'success');

    // Rejoindre la partie
    if (gameState.isHost) {
      socket.emit('rejoin-as-host', {
        gameCode: gameData.gameCode,
        playerName: gameData.hostName
      });
    } else {
      socket.emit('rejoin-game', {
        gameCode: gameData.gameCode,
        playerName: gameData.playerName
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Deconnecte');
    showNotification('Connexion perdue...', 'warning');
  });

  socket.on('rejoin-success', (data) => {
    console.log('Rejoint avec succes');
    gameState.players = data.players || [];
    updateScoresDisplay();
  });

  // Nouvelle question
  socket.on('new-question', (data) => {
    console.log('Nouvelle question:', data);
    currentQuestionData = data;
    gameState.currentQuestionIndex = data.questionNumber - 1;
    gameState.buzzerEnabled = true;
    gameState.answeringPlayer = null;

    displayQuestion(data);
    startQuestionTimer(data.timeLimit);
  });

  // Joueur a buzze
  socket.on('player-buzzed', (data) => {
    console.log('Joueur buzze:', data);
    gameState.buzzerEnabled = false;
    gameState.answeringPlayer = data.playerId;

    playSound('buzzer');
    handlePlayerBuzzed(data);
  });

  // Ecran de reponse
  socket.on('show-answer-screen', (data) => {
    console.log('Ecran reponse:', data);
    showAnswerScreen(data);
  });

  // Options de reponse (pour le joueur qui a buzze)
  socket.on('answer-options', (data) => {
    console.log('Options recues:', data);
    displayAnswerOptions(data.options);
  });

  // Resultat
  socket.on('answer-result', (data) => {
    console.log('Resultat:', data);
    stopAllSounds();
    playSound(data.isCorrect ? 'correct' : 'incorrect');
    displayResult(data);
  });

  // Timeout buzzer
  socket.on('buzzer-timeout', () => {
    console.log('Timeout buzzer');
    gameState.buzzerEnabled = false;
    showNotification('Temps ecoule!', 'warning');
  });

  // Timeout buzzer avec résultats (quand personne ne buzz)
  socket.on('buzzer-timeout-result', (data) => {
    console.log('Timeout buzzer avec résultats:', data);
    gameState.buzzerEnabled = false;
    stopAllSounds();
    playSound('incorrect');
    displayTimeoutResult(data);
  });

  // Partie terminee
  socket.on('game-finished', (data) => {
    console.log('Partie terminee:', data);
    showFinalResults(data);
  });

  // Hote deconnecte
  socket.on('host-disconnected', () => {
    showNotification('L\'hote a quitte la partie', 'error');
    setTimeout(() => {
      window.location.href = 'multijoueur.html';
    }, 3000);
  });

  // Erreur
  socket.on('error', (data) => {
    console.error('Erreur:', data);
    showNotification(data.message || 'Erreur', 'error');
  });
}

// ============================================
// AFFICHAGE QUESTION
// ============================================

function displayQuestion(data) {
  // Reset UI
  hideElement('answer-zone');
  hideElement('result-zone');
  hideElement('player-result');
  showElement('buzzer-zone');
  hideElement('player-options');

  // Mettre a jour le numero de question
  const infoQuestion = document.getElementById('info-question');
  if (infoQuestion) {
    infoQuestion.textContent = `Question ${data.questionNumber}/${data.totalQuestions}`;
  }

  // Afficher la question (vue hote)
  const questionText = document.getElementById('question-text');
  if (questionText) {
    questionText.textContent = data.question;
  }

  // Afficher la question (vue joueur en mode classique)
  const playerQuestionText = document.getElementById('player-question-text');
  if (playerQuestionText && gameState.mode === 'classic') {
    playerQuestionText.textContent = data.question;
  }

  // Afficher les options (vue hote)
  const optionsDisplay = document.getElementById('options-display');
  if (optionsDisplay && data.options) {
    optionsDisplay.innerHTML = '';
    data.options.forEach(opt => {
      const div = document.createElement('div');
      div.className = 'option-card';
      div.textContent = opt;
      optionsDisplay.appendChild(div);
    });
  }

  // Reset buzzer joueur
  const btnBuzzer = document.getElementById('btn-buzzer');
  if (btnBuzzer) {
    btnBuzzer.disabled = false;
    btnBuzzer.classList.remove('buzzed');
    btnBuzzer.querySelector('.buzzer-text').textContent = 'BUZZ';
  }

  const buzzerStatus = document.getElementById('buzzer-status');
  if (buzzerStatus) {
    buzzerStatus.textContent = 'Appuyez pour buzzer!';
    buzzerStatus.classList.remove('success');
  }

  updateScoresDisplay();
}

// ============================================
// TIMERS
// ============================================

function startQuestionTimer(timeLimit) {
  if (questionTimer) clearInterval(questionTimer);

  let remaining = Math.floor(timeLimit / 1000);
  const timerValue = document.getElementById('timer-value');
  const timerContainer = document.getElementById('timer-container');

  if (timerValue) timerValue.textContent = remaining;
  if (timerContainer) timerContainer.classList.remove('warning');

  questionTimer = setInterval(() => {
    remaining--;
    if (timerValue) timerValue.textContent = remaining;

    if (remaining <= 5 && timerContainer) {
      timerContainer.classList.add('warning');
    }

    if (remaining <= 0) {
      clearInterval(questionTimer);
    }
  }, 1000);
}

function startAnswerTimer(duration) {
  if (answerTimer) clearInterval(answerTimer);

  let remaining = duration;
  const timerValue = document.getElementById('answer-timer-value');

  if (timerValue) timerValue.textContent = remaining;

  answerTimer = setInterval(() => {
    remaining--;
    if (timerValue) timerValue.textContent = remaining;

    if (remaining <= 0) {
      clearInterval(answerTimer);
    }
  }, 1000);
}

// ============================================
// GESTION BUZZER
// ============================================

function handlePlayerBuzzed(data) {
  // Desactiver tous les buzzers
  const btnBuzzer = document.getElementById('btn-buzzer');
  if (btnBuzzer) {
    btnBuzzer.disabled = true;
  }

  const buzzerStatus = document.getElementById('buzzer-status');
  if (buzzerStatus) {
    buzzerStatus.textContent = `${data.playerName} a buzze!`;
  }

  // Mettre en surbrillance le joueur
  highlightAnsweringPlayer(data.playerName);

  // Vue hote: afficher la zone de reponse
  if (gameState.isHost) {
    showElement('answer-zone');
    const answeringName = document.getElementById('answering-name');
    if (answeringName) {
      answeringName.textContent = data.playerName;
    }
    startAnswerTimer(gameData.settings?.timePerAnswer || 15);
  }

  showNotification(`${data.playerName} a buzze!`, 'info');
}

function highlightAnsweringPlayer(playerName) {
  document.querySelectorAll('.score-chip').forEach(chip => {
    chip.classList.remove('answering');
    if (chip.querySelector('.score-name')?.textContent === playerName) {
      chip.classList.add('answering');
    }
  });
}

// ============================================
// ECRAN REPONSE
// ============================================

function showAnswerScreen(data) {
  // Si c'est le joueur qui a buzze, demander les options
  if (socket && gameState.answeringPlayer === socket.id) {
    socket.emit('request-answer-options', { gameCode: gameData.gameCode });
  }
}

function displayAnswerOptions(options) {
  const container = document.getElementById('player-options');
  if (!container) return;

  hideElement('buzzer-zone');
  showElement('player-options');

  container.innerHTML = '';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'player-option';
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      // Envoyer la reponse
      socket.emit('submit-answer', {
        gameCode: gameData.gameCode,
        answer: opt
      });

      // Desactiver les boutons
      container.querySelectorAll('.player-option').forEach(b => {
        b.disabled = true;
      });
      btn.classList.add('selected');
    });
    container.appendChild(btn);
  });
}

// ============================================
// AFFICHAGE RESULTAT
// ============================================

function displayResult(data) {
  // Mettre a jour les scores
  if (data.rankings) {
    gameState.players = data.rankings.map((r, i) => ({
      id: `player-${i}`,
      name: r.name,
      score: r.score
    }));
  }
  updateScoresDisplay();

  // En mode classique, tout le monde a la vue joueur
  // En mode spectateur, seul l'hôte a la vue hôte
  const shouldShowHostView = gameState.isHost && gameState.mode === 'spectator';

  if (shouldShowHostView) {
    displayHostResult(data);
  } else {
    displayPlayerResult(data);
  }
}

function displayHostResult(data) {
  hideElement('answer-zone');
  showElement('result-zone');

  const resultStatus = document.getElementById('result-status');
  if (resultStatus) {
    resultStatus.className = 'result-status ' + (data.isCorrect ? 'correct' : 'incorrect');
    resultStatus.innerHTML = data.isCorrect
      ? '<i class="fas fa-check-circle"></i><span>Bonne reponse!</span>'
      : '<i class="fas fa-times-circle"></i><span>Mauvaise reponse</span>';
  }

  const correctAnswer = document.getElementById('correct-answer');
  if (correctAnswer) {
    correctAnswer.textContent = data.correctAnswer;
  }

  // Illustration
  const illustrationContainer = document.getElementById('result-illustration');
  const illustrationImage = document.getElementById('result-image');
  const illustrationDesc = document.getElementById('result-description');

  const imageUrl = data.imageUrl || currentQuestionData?.imageUrl;
  const description = data.illustrationTexte || currentQuestionData?.illustrationTexte;

  if (illustrationContainer && illustrationImage && imageUrl) {
    illustrationImage.src = imageUrl;
    illustrationImage.alt = description || 'Illustration';
    if (illustrationDesc) illustrationDesc.textContent = description || '';
    illustrationContainer.classList.remove('hidden');
  } else if (illustrationContainer) {
    illustrationContainer.classList.add('hidden');
  }
}

function displayPlayerResult(data) {
  hideElement('buzzer-zone');
  hideElement('player-options');
  showElement('player-result');

  const resultStatus = document.getElementById('player-result-status');
  if (resultStatus) {
    resultStatus.className = 'result-status ' + (data.isCorrect ? 'correct' : 'incorrect');
    resultStatus.innerHTML = data.isCorrect
      ? '<i class="fas fa-check-circle"></i><span>Bonne reponse!</span>'
      : '<i class="fas fa-times-circle"></i><span>Mauvaise reponse</span>';
  }

  const resultAnswer = document.getElementById('player-result-answer');
  if (resultAnswer) {
    resultAnswer.textContent = `Reponse: ${data.correctAnswer}`;
  }

  // Illustration (mode classique)
  const illustrationContainer = document.getElementById('player-result-illustration');
  const illustrationImage = document.getElementById('player-result-image');
  const illustrationDesc = document.getElementById('player-result-description');

  const imageUrl = data.imageUrl || currentQuestionData?.imageUrl;
  const description = data.illustrationTexte || currentQuestionData?.illustrationTexte;

  if (illustrationContainer && illustrationImage && imageUrl) {
    illustrationImage.src = imageUrl;
    illustrationImage.alt = description || 'Illustration';
    if (illustrationDesc) illustrationDesc.textContent = description || '';
    illustrationContainer.classList.remove('hidden');
  } else if (illustrationContainer) {
    illustrationContainer.classList.add('hidden');
  }

  // Afficher les scores
  const scoresList = document.getElementById('player-scores-list');
  if (scoresList && data.rankings) {
    scoresList.innerHTML = '';
    data.rankings.slice(0, 4).forEach((player, idx) => {
      const row = document.createElement('div');
      row.className = 'score-row' + (idx === 0 ? ' first' : '');
      row.innerHTML = `
        <span class="score-row-name">${idx === 0 ? '🥇' : ''} ${player.name}</span>
        <span class="score-row-points">${player.score} pts</span>
      `;
      scoresList.appendChild(row);
    });
  }

  // Compte a rebours
  let countdown = 5;
  const countdownEl = document.getElementById('countdown');
  const interval = setInterval(() => {
    countdown--;
    if (countdownEl) countdownEl.textContent = countdown;
    if (countdown <= 0) clearInterval(interval);
  }, 1000);
}

// Afficher les résultats quand personne n'a buzzé (timeout)
function displayTimeoutResult(data) {
  // Mettre a jour les scores
  if (data.rankings) {
    gameState.players = data.rankings.map((r, i) => ({
      id: `player-${i}`,
      name: r.name,
      score: r.score
    }));
  }
  updateScoresDisplay();

  // En mode classique, tout le monde a la vue joueur
  // En mode spectateur, seul l'hôte a la vue hôte
  const shouldShowHostView = gameState.isHost && gameState.mode === 'spectator';

  if (shouldShowHostView) {
    displayHostTimeoutResult(data);
  } else {
    displayPlayerTimeoutResult(data);
  }
}

function displayHostTimeoutResult(data) {
  hideElement('answer-zone');
  showElement('result-zone');

  const resultStatus = document.getElementById('result-status');
  if (resultStatus) {
    resultStatus.className = 'result-status incorrect';
    resultStatus.innerHTML = '<i class="fas fa-clock"></i><span>Temps ecoule! Personne n\'a buzze</span>';
  }

  const correctAnswer = document.getElementById('correct-answer');
  if (correctAnswer) {
    correctAnswer.textContent = data.correctAnswer;
  }

  // Illustration
  const illustrationContainer = document.getElementById('result-illustration');
  const illustrationImage = document.getElementById('result-image');
  const illustrationDesc = document.getElementById('result-description');

  const imageUrl = data.imageUrl || currentQuestionData?.imageUrl;
  const description = data.illustrationTexte || currentQuestionData?.illustrationTexte;

  if (illustrationContainer && illustrationImage && imageUrl) {
    illustrationImage.src = imageUrl;
    illustrationImage.alt = description || 'Illustration';
    if (illustrationDesc) illustrationDesc.textContent = description || '';
    illustrationContainer.classList.remove('hidden');
  } else if (illustrationContainer) {
    illustrationContainer.classList.add('hidden');
  }
}

function displayPlayerTimeoutResult(data) {
  hideElement('buzzer-zone');
  hideElement('player-options');
  showElement('player-result');

  const resultStatus = document.getElementById('player-result-status');
  if (resultStatus) {
    resultStatus.className = 'result-status incorrect';
    resultStatus.innerHTML = '<i class="fas fa-clock"></i><span>Temps ecoule!</span>';
  }

  const resultAnswer = document.getElementById('player-result-answer');
  if (resultAnswer) {
    resultAnswer.textContent = `Reponse: ${data.correctAnswer}`;
  }

  // Illustration (mode classique)
  const illustrationContainer = document.getElementById('player-result-illustration');
  const illustrationImage = document.getElementById('player-result-image');
  const illustrationDesc = document.getElementById('player-result-description');

  const imageUrl = data.imageUrl || currentQuestionData?.imageUrl;
  const description = data.illustrationTexte || currentQuestionData?.illustrationTexte;

  if (illustrationContainer && illustrationImage && imageUrl) {
    illustrationImage.src = imageUrl;
    illustrationImage.alt = description || 'Illustration';
    if (illustrationDesc) illustrationDesc.textContent = description || '';
    illustrationContainer.classList.remove('hidden');
  } else if (illustrationContainer) {
    illustrationContainer.classList.add('hidden');
  }

  // Afficher les scores
  const scoresList = document.getElementById('player-scores-list');
  if (scoresList && data.rankings) {
    scoresList.innerHTML = '';
    data.rankings.slice(0, 4).forEach((player, idx) => {
      const row = document.createElement('div');
      row.className = 'score-row' + (idx === 0 ? ' first' : '');
      row.innerHTML = `
        <span class="score-row-name">${idx === 0 ? '🥇' : ''} ${player.name}</span>
        <span class="score-row-points">${player.score} pts</span>
      `;
      scoresList.appendChild(row);
    });
  }

  // Compte a rebours
  let countdown = 5;
  const countdownEl = document.getElementById('countdown');
  const interval = setInterval(() => {
    countdown--;
    if (countdownEl) countdownEl.textContent = countdown;
    if (countdown <= 0) clearInterval(interval);
  }, 1000);
}

// ============================================
// SCORES
// ============================================

function updateScoresDisplay() {
  const container = document.getElementById('scores-grid');
  const playerCount = document.getElementById('player-count');

  if (!container) return;

  // Filtrer l'hote en mode spectator
  let playersToShow = gameState.players;
  if (gameState.mode === 'spectator') {
    playersToShow = playersToShow.filter(p => !p.isHost);
  }

  // Trier par score
  playersToShow.sort((a, b) => (b.score || 0) - (a.score || 0));

  container.innerHTML = '';
  playersToShow.forEach((player, idx) => {
    const chip = document.createElement('div');
    chip.className = 'score-chip' + (idx === 0 && player.score > 0 ? ' leader' : '');
    chip.innerHTML = `
      <span class="score-name">${player.name}</span>
      <span class="score-points">${player.score || 0}</span>
    `;
    container.appendChild(chip);
  });

  if (playerCount) {
    playerCount.textContent = playersToShow.length;
  }
}

// ============================================
// RESULTATS FINAUX
// ============================================

function showFinalResults(data) {
  // Changer d'ecran
  document.getElementById('jeu-multijoueur')?.classList.remove('actif');
  document.getElementById('resultats-finaux')?.classList.add('actif');

  const container = document.getElementById('final-rankings');
  if (!container) return;

  container.innerHTML = '';

  // Filtrer l'hote en mode spectator
  let rankings = data.rankings || [];
  if (gameState.mode === 'spectator') {
    rankings = rankings.filter(p => !p.isHost);
  }

  const medals = ['🥇', '🥈', '🥉'];
  const classes = ['first', 'second', 'third'];

  rankings.forEach((player, idx) => {
    const card = document.createElement('div');
    card.className = 'ranking-card ' + (classes[idx] || '');
    card.innerHTML = `
      <div class="ranking-position">${medals[idx] || `#${idx + 1}`}</div>
      <div class="ranking-info">
        <div class="ranking-name">${player.name}</div>
      </div>
      <div class="ranking-score">${player.score} pts</div>
    `;
    container.appendChild(card);
  });
}

// ============================================
// UTILITAIRES
// ============================================

function showElement(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function hideElement(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function showNotification(message, type = 'info') {
  const notif = document.createElement('div');
  const colors = {
    success: '#00FF88',
    error: '#FF3366',
    warning: '#FFD700',
    info: '#00F5FF'
  };

  notif.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${colors[type] || colors.info};
    color: ${type === 'warning' || type === 'success' ? '#000' : '#fff'};
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    z-index: 10001;
    font-weight: 600;
    font-size: 0.9rem;
    animation: slideIn 0.3s ease;
  `;
  notif.textContent = message;
  document.body.appendChild(notif);

  setTimeout(() => {
    notif.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notif.remove(), 300);
  }, 2500);
}

// Animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

console.log('multijoueur-game.js charge');
