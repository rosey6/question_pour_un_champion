// ============================================
// MULTIJOUEUR-GAME.JS
// Système de points par rapidité (Phase 1)
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
  isHost: false,
  mode: 'spectator',
  hasAnsweredCurrentQuestion: false,
};

// Timers
let questionTimer = null;

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

  const shouldShowHostView = gameState.isHost && gameState.mode === 'spectator';

  if (shouldShowHostView) {
    if (vueHote) vueHote.classList.remove('hidden');
    if (vueJoueur) vueJoueur.classList.add('hidden');
    setupHostUI();
  } else {
    if (vueHote) vueHote.classList.add('hidden');
    if (vueJoueur) vueJoueur.classList.remove('hidden');
  }

  updateScoresDisplay();
}

function setupHostUI() {
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

  // Nouvelle question — tout le monde peut répondre
  socket.on('new-question', (data) => {
    console.log('Nouvelle question:', data);
    currentQuestionData = data;
    gameState.currentQuestionIndex = data.questionNumber - 1;
    gameState.hasAnsweredCurrentQuestion = false;

    displayQuestion(data);
    startQuestionTimer(data.timeLimit);
  });

  // Résultats de la question
  socket.on('question-results', (data) => {
    console.log('Resultats question:', data);
    stopAllSounds();

    if (data.rankings) {
      gameState.players = data.rankings.map(r => ({
        id: r.name,
        name: r.name,
        score: r.score,
        isHost: r.isHost
      }));
    }
    updateScoresDisplay();

    const myResult = data.answers.find(a => a.playerId === socket.id);
    const shouldShowHostView = gameState.isHost && gameState.mode === 'spectator';

    if (shouldShowHostView) {
      displayHostResults(data);
    } else {
      playSound(myResult?.isCorrect ? 'correct' : 'incorrect');
      displayPlayerResults(data, myResult);
    }
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
  hideElement('result-zone');
  hideElement('player-result');
  hideElement('answer-zone');

  const infoQuestion = document.getElementById('info-question');
  if (infoQuestion) {
    infoQuestion.textContent = `Question ${data.questionNumber}/${data.totalQuestions}`;
  }

  const shouldShowHostView = gameState.isHost && gameState.mode === 'spectator';

  if (shouldShowHostView) {
    // Hote : affichage lecture seule
    const questionText = document.getElementById('question-text');
    if (questionText) questionText.textContent = data.question;

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
  } else {
    // Joueur : question + options cliquables
    showElement('player-question-zone');
    hideElement('buzzer-zone');
    showElement('player-options');

    const playerQuestionText = document.getElementById('player-question-text');
    if (playerQuestionText) playerQuestionText.textContent = data.question;

    const container = document.getElementById('player-options');
    if (container) {
      container.innerHTML = '';
      data.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'player-option';
        btn.textContent = opt;
        btn.addEventListener('click', () => {
          if (gameState.hasAnsweredCurrentQuestion) return;
          gameState.hasAnsweredCurrentQuestion = true;

          socket.emit('submit-answer', {
            gameCode: gameData.gameCode,
            answer: opt
          });

          // Feedback visuel immédiat
          container.querySelectorAll('.player-option').forEach(b => {
            b.disabled = true;
          });
          btn.classList.add('selected');

          const status = document.getElementById('buzzer-status');
          if (status) {
            status.textContent = 'Réponse envoyée ! En attente des autres...';
            status.classList.add('success');
          }
        });
        container.appendChild(btn);
      });
    }

    // Reset du statut buzzer
    const buzzerStatus = document.getElementById('buzzer-status');
    if (buzzerStatus) {
      buzzerStatus.textContent = 'Choisissez votre réponse !';
      buzzerStatus.classList.remove('success');
    }
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

// ============================================
// AFFICHAGE RÉSULTATS QUESTION
// ============================================

function displayHostResults(data) {
  hideElement('answer-zone');
  showElement('result-zone');

  const resultStatus = document.getElementById('result-status');
  if (resultStatus) {
    resultStatus.className = 'result-status correct';
    resultStatus.innerHTML = `<i class="fas fa-check-circle"></i><span>Bonne réponse : <strong>${data.correctAnswer}</strong></span>`;
  }

  const correctAnswer = document.getElementById('correct-answer');
  if (correctAnswer) correctAnswer.textContent = data.correctAnswer;

  // Illustration
  const illustrationContainer = document.getElementById('result-illustration');
  const illustrationImage = document.getElementById('result-image');
  const illustrationDesc = document.getElementById('result-description');

  if (illustrationContainer && illustrationImage && data.imageUrl) {
    illustrationImage.src = data.imageUrl;
    illustrationImage.alt = data.illustrationTexte || 'Illustration';
    if (illustrationDesc) illustrationDesc.textContent = data.illustrationTexte || '';
    illustrationContainer.classList.remove('hidden');
  } else if (illustrationContainer) {
    illustrationContainer.classList.add('hidden');
  }

  // Résumé des réponses sous l'illustration
  const resultAnswer = document.getElementById('result-answer');
  if (resultAnswer && data.answers) {
    const correctCount = data.answers.filter(a => a.isCorrect).length;
    const total = data.answers.filter(a => a.answer !== null).length;
    resultAnswer.innerHTML = `<strong>${correctCount}/${total}</strong> bonnes réponses`;
  }
}

function displayPlayerResults(data, myResult) {
  hideElement('player-options');
  hideElement('buzzer-zone');
  showElement('player-result');

  const resultStatus = document.getElementById('player-result-status');
  if (resultStatus) {
    if (myResult?.isCorrect) {
      const pts = myResult.pointsEarned;
      const streakMsg = pts > (myResult.rank <= 8 ? [10,8,6,5,4,3,2,1][myResult.rank-1] : 1) ? ' 🔥 Série !' : '';
      resultStatus.className = 'result-status correct';
      resultStatus.innerHTML = `<i class="fas fa-check-circle"></i><span>Bonne réponse ! +${pts} pts${streakMsg}</span>`;
    } else if (myResult && myResult.answer !== null) {
      resultStatus.className = 'result-status incorrect';
      resultStatus.innerHTML = `<i class="fas fa-times-circle"></i><span>Mauvaise réponse (${myResult.pointsEarned} pts)</span>`;
    } else {
      resultStatus.className = 'result-status incorrect';
      resultStatus.innerHTML = `<i class="fas fa-clock"></i><span>Temps écoulé ! (0 pts)</span>`;
    }
  }

  const resultAnswer = document.getElementById('player-result-answer');
  if (resultAnswer) {
    resultAnswer.textContent = `Réponse : ${data.correctAnswer}`;
  }

  // Illustration
  const illustrationContainer = document.getElementById('player-result-illustration');
  const illustrationImage = document.getElementById('player-result-image');
  const illustrationDesc = document.getElementById('player-result-description');

  if (illustrationContainer && illustrationImage && data.imageUrl) {
    illustrationImage.src = data.imageUrl;
    illustrationImage.alt = data.illustrationTexte || 'Illustration';
    if (illustrationDesc) illustrationDesc.textContent = data.illustrationTexte || '';
    illustrationContainer.classList.remove('hidden');
  } else if (illustrationContainer) {
    illustrationContainer.classList.add('hidden');
  }

  // Classement
  const scoresList = document.getElementById('player-scores-list');
  if (scoresList && data.rankings) {
    scoresList.innerHTML = '';
    data.rankings.slice(0, 5).forEach((player, idx) => {
      const medals = ['🥇', '🥈', '🥉'];
      const row = document.createElement('div');
      row.className = 'score-row' + (idx === 0 ? ' first' : '');
      row.innerHTML = `
        <span class="score-row-name">${medals[idx] || `#${idx+1}`} ${player.name}${player.streak >= 3 ? ' 🔥' : ''}</span>
        <span class="score-row-points">${player.score} pts</span>
      `;
      scoresList.appendChild(row);
    });
  }

  // Compte à rebours (mode classique uniquement)
  if (gameState.mode === 'classic') {
    let countdown = 5;
    const countdownEl = document.getElementById('countdown');
    if (countdownEl) countdownEl.textContent = countdown;
    const interval = setInterval(() => {
      countdown--;
      if (countdownEl) countdownEl.textContent = countdown;
      if (countdown <= 0) clearInterval(interval);
    }, 1000);
  } else {
    // Mode spectateur : masquer le texte de compte à rebours
    const waitingText = document.getElementById('player-waiting-text');
    if (waitingText) waitingText.style.display = 'none';
  }
}

// ============================================
// SCORES
// ============================================

function updateScoresDisplay() {
  const container = document.getElementById('scores-grid');
  const playerCount = document.getElementById('player-count');

  if (!container) return;

  let playersToShow = gameState.players;
  if (gameState.mode === 'spectator') {
    playersToShow = playersToShow.filter(p => !p.isHost);
  }

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
// RESULTATS FINAUX — Phase 4
// ============================================

let scoresChart = null; // référence Chart.js pour éviter les doublons

function showFinalResults(data) {
  document.getElementById('jeu-multijoueur')?.classList.remove('actif');
  document.getElementById('resultats-finaux')?.classList.add('actif');

  let rankings = data.rankings || [];
  const history = data.history || [];

  // Filtrer l'hôte en mode spectateur
  if (gameState.mode === 'spectator') {
    rankings = rankings.filter(p => !p.isHost);
  }

  renderPodium(rankings);
  renderOtherRankings(rankings);
  renderScoresChart(rankings, history);
  renderStatCards(rankings, history);
}

// --- Podium top 3 ---
function renderPodium(rankings) {
  // Ordre d'affichage : 2e à gauche, 1er au centre, 3e à droite
  const slots = [2, 1, 3];
  slots.forEach(pos => {
    const player = rankings[pos - 1];
    const nameEl = document.getElementById(`podium-name-${pos}`);
    const scoreEl = document.getElementById(`podium-score-${pos}`);
    const slotEl = document.getElementById(`podium-${pos}`);

    if (!player) {
      if (slotEl) slotEl.style.visibility = 'hidden';
      return;
    }
    if (nameEl) nameEl.textContent = player.name;
    if (scoreEl) scoreEl.textContent = `${player.score} pts`;
  });
}

// --- Rang 4+ ---
function renderOtherRankings(rankings) {
  const container = document.getElementById('other-rankings');
  if (!container) return;
  container.innerHTML = '';

  rankings.slice(3).forEach((player, idx) => {
    const row = document.createElement('div');
    row.className = 'other-rank-row';
    row.innerHTML = `
      <span class="other-rank-pos">#${idx + 4}</span>
      <span class="other-rank-name">${player.name}</span>
      <span class="other-rank-score">${player.score} pts</span>
    `;
    container.appendChild(row);
  });
}

// --- Graphe Chart.js ---
function renderScoresChart(rankings, history) {
  const canvas = document.getElementById('scores-chart');
  if (!canvas || !history.length) return;

  // Détruire l'instance précédente si elle existe
  if (scoresChart) {
    scoresChart.destroy();
    scoresChart = null;
  }

  const COLORS = ['#00D4FF', '#FF3366', '#00FF88', '#FFD700'];
  const playerNames = rankings.slice(0, 4).map(r => r.name);

  // Calculer les scores cumulés question par question
  const runningTotals = {};
  playerNames.forEach(name => runningTotals[name] = 0);

  const datasets = playerNames.map((name, idx) => ({
    label: name,
    data: [],
    borderColor: COLORS[idx],
    backgroundColor: COLORS[idx] + '22',
    borderWidth: 2.5,
    pointRadius: 4,
    pointHoverRadius: 6,
    tension: 0.35,
    fill: false,
  }));

  history.forEach((q, qIdx) => {
    // Appliquer les points de cette question
    q.answers.forEach(a => {
      if (runningTotals[a.playerName] !== undefined) {
        runningTotals[a.playerName] = Math.max(0,
          runningTotals[a.playerName] + (a.pointsEarned || 0)
        );
      }
    });
    // Snapshot après cette question
    playerNames.forEach((name, idx) => {
      datasets[idx].data.push(runningTotals[name]);
    });
  });

  const labels = history.map((_, i) => `Q${i + 1}`);

  scoresChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: history.length > 8 ? 2.5 : 2,
      animation: { duration: 800 },
      plugins: {
        legend: {
          labels: {
            color: '#b0b8c8',
            font: { size: 12 },
            boxWidth: 16,
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} pts`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#6a7a8a', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#6a7a8a', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.07)' }
        }
      }
    }
  });
}

// --- Cartes stats ---
function renderStatCards(rankings, history) {
  if (!history.length) return;

  const playerNames = rankings.map(r => r.name);

  // --- Meilleure série (calcul depuis l'historique) ---
  const currentStreaks = {};
  const maxStreaks = {};
  playerNames.forEach(name => { currentStreaks[name] = 0; maxStreaks[name] = 0; });

  history.forEach(q => {
    q.answers.forEach(a => {
      if (!(a.playerName in currentStreaks)) return;
      if (a.isCorrect) {
        currentStreaks[a.playerName]++;
        if (currentStreaks[a.playerName] > maxStreaks[a.playerName]) {
          maxStreaks[a.playerName] = currentStreaks[a.playerName];
        }
      } else {
        currentStreaks[a.playerName] = 0;
      }
    });
  });

  let bestStreakPlayer = playerNames[0] || '---';
  let bestStreak = 0;
  playerNames.forEach(name => {
    if (maxStreaks[name] > bestStreak) {
      bestStreak = maxStreaks[name];
      bestStreakPlayer = name;
    }
  });

  const streakPlayerEl = document.getElementById('streak-player');
  const streakValueEl = document.getElementById('streak-value');
  if (streakPlayerEl) streakPlayerEl.textContent = bestStreakPlayer;
  if (streakValueEl) streakValueEl.textContent =
    bestStreak > 0 ? `${bestStreak} bonne${bestStreak > 1 ? 's' : ''} d'affilée` : 'Aucune série';

  // --- Le plus rapide (moyenne des temps sur les bonnes réponses) ---
  const responseTimes = {};
  playerNames.forEach(name => responseTimes[name] = []);

  history.forEach(q => {
    q.answers.forEach(a => {
      if (a.isCorrect && a.responseTimeMs !== null && a.responseTimeMs !== undefined) {
        if (a.playerName in responseTimes) {
          responseTimes[a.playerName].push(a.responseTimeMs);
        }
      }
    });
  });

  let fastestPlayer = null;
  let fastestAvg = Infinity;
  playerNames.forEach(name => {
    const times = responseTimes[name];
    if (times.length > 0) {
      const avg = times.reduce((s, t) => s + t, 0) / times.length;
      if (avg < fastestAvg) {
        fastestAvg = avg;
        fastestPlayer = name;
      }
    }
  });

  const speedPlayerEl = document.getElementById('speed-player');
  const speedValueEl = document.getElementById('speed-value');
  if (speedPlayerEl) speedPlayerEl.textContent = fastestPlayer || '---';
  if (speedValueEl) {
    if (fastestPlayer) {
      const sec = (fastestAvg / 1000).toFixed(2);
      speedValueEl.textContent = `${sec}s en moyenne`;
    } else {
      speedValueEl.textContent = 'Données insuffisantes';
    }
  }
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

console.log('multijoueur-game.js charge (Phase 1 — points par rapidite)');
