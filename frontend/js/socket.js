// ============================================
// SOCKET.JS — Connexion Socket.IO + handlers d'événements
// ============================================

import { etat, mettreAJourEtat, sauvegarderSession } from './etat.js';
import * as ui from './interface.js';
import { demarrerMinuteur, arreterMinuteur } from './minuteur.js';
import { Sons } from './sons.js';

/** Instance Socket.IO partagée */
export let socket = null;

function _payloadPartie(extra = {}) {
  const payload = {
    gameCode: etat.donneesPartie?.gameCode || etat.idPartie,
    ...extra,
  };
  if (etat.estHote && etat.donneesPartie?.hostToken) {
    payload.hostToken = etat.donneesPartie.hostToken;
  }
  if (!etat.estHote && etat.donneesPartie?.playerToken) {
    payload.playerToken = etat.donneesPartie.playerToken;
  }
  return payload;
}

function _sauvegarderTokens(donnees) {
  if (!donnees || !etat.donneesPartie) return;
  if (donnees.hostToken) etat.donneesPartie.hostToken = donnees.hostToken;
  if (donnees.playerToken) etat.donneesPartie.playerToken = donnees.playerToken;
  sessionStorage.setItem('multiGameData', JSON.stringify(etat.donneesPartie));
}

// ─── Connexion ─────────────────────────────────────────────────────────────────

/**
 * Initialise la connexion Socket.IO et branche tous les handlers.
 * @param {string} urlBackend - URL du serveur backend (ex: https://...)
 */
export function connecter(urlBackend) {
  // io() est exposé globalement par le CDN Socket.IO
  socket = io(urlBackend, {
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    timeout: 20000,
  });

  // Bannière de reconnexion (Mission 5)
  _injecterBanniereConnexion();
  socket.io.on('reconnect_attempt', (n) => {
    _afficherBanniere('warning', `Reconnexion en cours… (tentative ${n})`);
  });
  socket.io.on('reconnect', () => {
    _afficherBanniere('success', 'Reconnecté au serveur !');
  });
  socket.io.on('reconnect_failed', () => {
    _afficherBanniere('danger', 'Connexion perdue. Rechargez la page.');
  });

  // Brancher les handlers système
  socket.on('connect',    _gererConnexion);
  socket.on('disconnect', _gererDeconnexion);

  // Brancher les handlers métier
  socket.on('rejoin-success',        _surRejoindreSucces);
  socket.on('new-question',          _surNouvelleQuestion);
  socket.on('question-results',      _surResultatsQuestion);
  socket.on('player-answered',       _surJoueurARepondu);
  socket.on('game-started',          _surPartieDemarree);
  socket.on('game-finished',         _surPartieTerminee);
  socket.on('host-disconnected',     _surHoteDeconnecte);
  socket.on('player-joined',         _surJoueurRejoint);
  socket.on('erreur-validation',     _surErreurValidation);
  socket.on('erreur-limite',         _surErreurLimite);
  socket.on('scenario-selected',     _surScenarioSelectionne);
  socket.on('manche-ended',          _surMancheTerminee);
  socket.on('manche-started',        _surMancheDemarree);
  socket.on('theme-vote-started',    _surVoteThemeDemarre);
  socket.on('theme-vote-update',     _surMiseAJourVote);
  socket.on('theme-vote-result',     _surResultatVote);
  socket.on('questions-ready',       _surQuestionsPretes);
  socket.on('buzzer-gagne',          _surBuzzerGagne);
  socket.on('buzzer-pris',           _surBuzzerPris);
  socket.on('buzzer-reouvre',        _surBuzzerReouvre);
  socket.on('prochain-choix-theme',  _surProchainChoixTheme);
  socket.on('theme-choisi',          _surThemeChoisi);
  socket.on('debut-passage',         _surDebutPassage);
  socket.on('resultat-reponse-passage', _surResultatReponsePassage);
  socket.on('passage-termine',       _surPassageTermine);
  socket.on('choix-main',            _surChoixMain);
  socket.on('indice-revele',         _surIndiceRevele);
  socket.on('main-change',           _surMainChange);
  socket.on('resultat-face-a-face',  _surResultatFaceAFace);
  socket.on('error',                 _surErreur);
  socket.on('server-pong',           _surServerPong);

  _exposerActionsManches();

  // Mission 7 — Mesure de latence (ping toutes les 5s)
  _demarrerMesurePing();

  // Écouter l'événement DOM émis par interface.js (bouton suivant de l'hôte)
  document.addEventListener('ui:questionSuivante', () => {
    if (socket && etat.donneesPartie?.gameCode) {
      socket.emit('next-question', _payloadPartie());
    }
  });
}

// ─── Reconnexion ───────────────────────────────────────────────────────────────

/**
 * Gère la reconnexion automatique en rééméttant join-game ou rejoin-as-host
 * si les données de session sont disponibles.
 */
export function gererReconnexion() {
  const idPartie = etat.idPartie || sessionStorage.getItem('idPartie');
  const pseudo   = etat.pseudo   || sessionStorage.getItem('pseudo');

  if (!idPartie || !pseudo) return; // Nouvelle session, rien à faire

  if (etat.estHote) {
    socket.emit('rejoin-as-host', {
      ..._payloadPartie({ gameCode: idPartie }),
      playerName: pseudo,
    });
  } else {
    socket.emit('rejoin-game', {
      ..._payloadPartie({ gameCode: idPartie }),
      playerName: pseudo,
    });
  }
}

// ─── Handlers internes ─────────────────────────────────────────────────────────

/** Connexion établie */
function _gererConnexion() {
  console.log('[socket] Connecté au serveur');
  ui.afficherNotification('Connecté !', 'success');
  gererReconnexion();
}

/** Déconnexion */
function _gererDeconnexion() {
  console.log('[socket] Déconnecté');
  _afficherBanniere('danger', 'Connexion perdue… Reconnexion en cours');
}

/** Rejoindre la partie avec succès */
function _surRejoindreSucces(donnees) {
  console.log('[socket] Rejoint avec succès');
  _sauvegarderTokens(donnees);
  const joueursFiltres = donnees.players || [];
  mettreAJourEtat('joueurs', joueursFiltres);
  ui.mettreAJourListeJoueurs(joueursFiltres);
}

/** Nouvelle question reçue */
function _surNouvelleQuestion(donnees) {
  console.log('[socket] Nouvelle question :', donnees);

  // Réinitialiser le flag de réponse
  mettreAJourEtat('aRepondu', false);
  mettreAJourEtat('questionActuelle', donnees);
  mettreAJourEtat('indexQuestionCourante', donnees.questionNumber - 1);

  // Réinitialiser le compteur de réponses
  if (donnees.totalPlayers !== undefined) {
    mettreAJourEtat('totalJoueurs', donnees.totalPlayers);
  }
  ui.mettreAJourCompteurReponses(0, etat.totalJoueurs || donnees.totalPlayers || 0);

  Sons.musique.jouer('question');

  // Démarrer le minuteur client (sauf si joueur en mode spectateur)
  const afficherMinuteur = !(etat.mode === 'spectator' && !etat.estHote);
  if (afficherMinuteur) {
    demarrerMinuteur(donnees.timeLimit / 1000);
  }

  const estQuestionBuzzer = donnees.manche?.nom === 'NEUF_POINTS' || donnees.mancheType === 'BUZZER';
  if (estQuestionBuzzer && !(etat.estHote && etat.mode === 'spectator')) {
    ui.afficherQuestion(donnees, () => {});
    ui.afficherZoneBuzzer(donnees.question, donnees.points || donnees.valeurPts || 1);
  } else {
    ui.afficherQuestion(donnees, (optionChoisie) => {
      _soumettreReponse(optionChoisie);
    });
  }
}

/**
 * Soumet la réponse du joueur au serveur.
 * Protège contre les doubles soumissions via etat.aRepondu.
 * @param {string} optionChoisie
 */
function _soumettreReponse(optionChoisie) {
  if (etat.aRepondu) return;
  mettreAJourEtat('aRepondu', true);

  if (socket && etat.donneesPartie?.gameCode) {
    socket.emit('submit-answer', {
      ..._payloadPartie(),
      answer:   optionChoisie,
    });
  }
}

/** Résultats de la question */
function _surResultatsQuestion(donnees) {
  console.log('[socket] Résultats question :', donnees);

  arreterMinuteur();
  ui.afficherManche(donnees.manche);

  // Mettre à jour la liste des joueurs depuis les classements
  if (donnees.rankings) {
    const joueursMisAJour = donnees.rankings.map(r => ({
      id:     r.name,
      name:   r.name,
      score:  r.score,
      isHost: r.isHost,
      streak: r.streak,
      streakManche: r.streakManche,
    }));
    mettreAJourEtat('joueurs', joueursMisAJour);
    ui.mettreAJourListeJoueurs(joueursMisAJour);
  }

  // Streak du joueur courant (par son pseudo)
  if (!etat.estHote && etat.pseudo) {
    const ancienStreak = etat.streakActuel || 0;
    const streakN = donnees.streaksManche?.[etat.pseudo] ?? 0;
    mettreAJourEtat('streakActuel', streakN);
    ui.mettreAJourStreak(streakN);
    if (ancienStreak >= 3 && streakN < ancienStreak) Sons.jouer('streakBriser');
    else if (streakN > ancienStreak && streakN >= 3) Sons.jouer('streakMonte');
  }

  // Son selon le résultat du joueur courant
  if (!etat.estHote) {
    const monResultat = donnees.answers?.find(a => a.playerId === socket.id);
    Sons.jouer(monResultat?.isCorrect ? 'bonneReponse' : 'mauvaiseReponse');
  }

  Sons.musique.jouer('attente');
  ui.afficherResultatsQuestion(donnees, socket.id);
}

/** Un joueur a répondu — mise à jour du compteur */
function _surJoueurARepondu(donnees) {
  const totalRepondu  = donnees.totalAnswered || 0;
  const totalJoueurs  = donnees.totalPlayers  || etat.totalJoueurs;

  mettreAJourEtat('joueursAyantRepondu', totalRepondu);
  mettreAJourEtat('totalJoueurs', totalJoueurs);

  ui.mettreAJourCompteurReponses(totalRepondu, totalJoueurs);
  ui.mettreAJourAttenteReponses(donnees);
}

/** La partie a démarré (reçu côté joueur en salle d'attente) */
function _surPartieDemarree(donnees) {
  console.log('[socket] Partie démarrée :', donnees);
  if (donnees.players) {
    mettreAJourEtat('joueurs', donnees.players);
    ui.mettreAJourListeJoueurs(donnees.players);
  }
  ui.afficherManche(donnees.manche);
  ui.afficherEcranJeu();
  ui.afficherAnnonceManche(donnees.manche || {});
}

/** La partie est terminée */
function _surPartieTerminee(donnees) {
  console.log('[socket] Partie terminée :', donnees);
  Sons.musique.jouer('finale');
  ui.afficherResultatsFinaux(donnees);
}

/** L'hôte s'est déconnecté */
function _surHoteDeconnecte() {
  ui.afficherErreur("L'hôte a quitté la partie");
  setTimeout(() => {
    window.location.href = 'multijoueur.html';
  }, 3000);
}

/** Un nouveau joueur a rejoint */
function _surJoueurRejoint(donnees) {
  console.log('[socket] Joueur rejoint :', donnees);
  if (donnees.players) {
    mettreAJourEtat('joueurs', donnees.players);
    ui.mettreAJourListeJoueurs(donnees.players);
  }
}

/** Scénario sélectionné — affiché 5s au démarrage */
function _surScenarioSelectionne(donnees) {
  console.log('[socket] Scénario sélectionné :', donnees);
  Sons.jouer('scenarioAnnonce');
  ui.afficherBanniereScenario(donnees.titre || donnees.scenario);
}

/** Fin d'une manche — afficher l'overlay de transition */
function _surMancheTerminee(donnees) {
  console.log('[socket] Manche terminée :', donnees);
  Sons.jouer('mancheFin');
  ui.afficherTransitionManche(donnees);
}

/** Début d'une nouvelle manche — masquer l'overlay transition et annoncer */
function _surMancheDemarree(donnees) {
  console.log('[socket] Manche démarrée :', donnees);
  Sons.jouer('mancheDebut');
  ui.masquerTransitionManche();
  ui.afficherManche(donnees.manche);
  ui.afficherAnnonceManche(donnees.manche || {});
}

/** Vote de thème démarré */
function _surVoteThemeDemarre(donnees) {
  console.log('[socket] Vote de thème démarré :', donnees);
  ui.afficherVoteTheme(donnees.themes || donnees.options || donnees);
}

/** Mise à jour live des votes */
function _surMiseAJourVote(donnees) {
  ui.mettreAJourVoteTheme(donnees.votes || donnees);
}

/** Résultat du vote de thème */
function _surResultatVote(donnees) {
  console.log('[socket] Résultat vote :', donnees);
  ui.afficherResultatVote(donnees.winner || donnees.theme || donnees);
}

/** Questions IA prêtes */
function _surQuestionsPretes() {
  console.log('[socket] Questions prêtes');
  ui.activerBoutonDemarrer();
}

function _surBuzzerGagne(donnees) {
  ui.afficherBuzzerGagne(donnees.options || [], donnees.duree || 8, donnees.points || 1, (option) => {
    _soumettreReponse(option);
  });
}

function _surBuzzerPris(donnees) {
  ui.afficherBuzzerPris(donnees.pseudo || donnees.playerName || 'Un joueur', donnees.points || 1);
}

function _surBuzzerReouvre(donnees) {
  ui.rouvrirBuzzer(donnees.points || 1);
}

function _surProchainChoixTheme(donnees) {
  const pseudo = donnees.pseudo || donnees.playerName;
  const themes = donnees.themesRestants || donnees.themes || [];
  if (pseudo === etat.pseudo) ui.afficherChoixTheme(themes);
  else ui.afficherAttenteChoixTheme(pseudo, themes);
}

function _surThemeChoisi(donnees) {
  ui.afficherThemeChoisi(donnees.pseudo || donnees.playerName || 'Joueur', donnees.theme);
}

function _surDebutPassage(donnees) {
  const pseudo = donnees.pseudo || donnees.playerName;
  const options = donnees.options || donnees.reponses || [];
  if (pseudo === etat.pseudo) {
    ui.afficherVuePassageActif(donnees.theme, donnees.duree || 40, donnees.question || '', options, (reponse) => {
      repondrePassage(reponse);
    });
  } else {
    ui.afficherVuePassageSpectateur(pseudo, donnees.theme, donnees.duree || 40, donnees.question || '', options);
  }
}

function _surResultatReponsePassage(donnees) {
  ui.mettreAJourStreakPassage(donnees.streak || 0, Boolean(donnees.correct), Boolean(donnees.quatreASuite), donnees.pseudo || donnees.playerName);
}

function _surPassageTermine(donnees) {
  const message = donnees.tousOntJoue
    ? `${donnees.pseudo || 'Joueur'} termine son passage avec ${donnees.score || 0}`
    : `Prochain passage : ${donnees.prochainJoueur || 'joueur suivant'}`;
  ui.afficherNotification(message, 'info');
}

function _surChoixMain(donnees) {
  const pseudo = donnees.pseudo || donnees.playerName;
  const joueurs = donnees.joueurs || donnees.finalistes || [];
  if (joueurs.length || donnees.scores) ui.initialiserFaceAFace(joueurs, donnees.scores || {});
  if (pseudo === etat.pseudo) ui.afficherChoixGarderPasser();
  else ui.afficherAttenteChoixMain(pseudo);
}

function _surIndiceRevele(donnees) {
  const joueurActif = donnees.joueurActif || donnees.pseudo;
  const jaiLaMain = joueurActif === etat.pseudo;
  ui.afficherIndice(donnees.numero || 1, donnees.texte || '', donnees.points || 1, jaiLaMain, donnees.options || [], (reponse) => {
    repondreFaceAFace(reponse);
  });
}

function _surMainChange(donnees) {
  ui.afficherChangementMain(donnees.ancienneMain, donnees.nouvelleMain);
}

function _surResultatFaceAFace(donnees) {
  ui.afficherResultatFaceAFace(
    Boolean(donnees.correct),
    donnees.points || 0,
    donnees.pseudo || donnees.playerName,
    donnees.bonneReponse,
    donnees.scores || {}
  );
}

/** Erreur serveur */
function _surErreur(donnees) {
  console.error('[socket] Erreur serveur :', donnees);
  const message = donnees?.message || donnees || 'Une erreur est survenue';

  // Distinguer erreur de limite de taux
  if (donnees?.type === 'rate-limit' || donnees?.attente) {
    ui.afficherErreurLimite(donnees.attente || 30);
  } else {
    ui.afficherErreur(message);
  }
}

function _surErreurValidation(donnees) {
  console.error('[socket] Erreur validation :', donnees);
  ui.afficherErreur(donnees?.message || 'Données invalides');
}

function _surErreurLimite(donnees) {
  console.error('[socket] Erreur limite :', donnees);
  if (donnees?.message && !donnees?.attente && !donnees?.retryAfter) {
    ui.afficherNotification(donnees.message, 'warning');
  } else {
    ui.afficherErreurLimite(donnees?.attente || donnees?.retryAfter || 30);
  }
}

/**
 * Émet l'événement 'vote-theme' pour voter pour un thème.
 * @param {string} theme - Le thème choisi
 */
export function voterTheme(theme) {
  if (socket && etat.donneesPartie?.gameCode) {
    socket.emit('vote-theme', {
      ..._payloadPartie(),
      theme,
    });
  }
}

export function appuyerBuzzer() {
  if (!socket) return;
  socket.emit('buzzer-appuye', {
    ..._payloadPartie(),
    pseudo: etat.pseudo,
    timestamp: Date.now(),
  });
}

export function choisirTheme(theme) {
  if (!socket) return;
  socket.emit('choisir-theme', {
    ..._payloadPartie(),
    pseudo: etat.pseudo,
    theme,
  });
}

export function repondrePassage(reponse) {
  if (!socket) return;
  socket.emit('reponse-passage', {
    ..._payloadPartie(),
    pseudo: etat.pseudo,
    reponse,
  });
}

export function garderMain() {
  if (!socket) return;
  socket.emit('garder-main', {
    ..._payloadPartie(),
    pseudo: etat.pseudo,
  });
}

export function passerMain() {
  if (!socket) return;
  socket.emit('passer-main', {
    ..._payloadPartie(),
    pseudo: etat.pseudo,
  });
}

export function repondreFaceAFace(reponse) {
  if (!socket) return;
  socket.emit('reponse-face-a-face', {
    ..._payloadPartie(),
    pseudo: etat.pseudo,
    reponse,
  });
}

function _exposerActionsManches() {
  window.appuyerBuzzer = appuyerBuzzer;
  window.choisirTheme = choisirTheme;
  window.repondrePassage = repondrePassage;
  window.garderMain = garderMain;
  window.passerMain = passerMain;
  window.repondreFaceAFace = repondreFaceAFace;
}

/**
 * Sauvegarde les données de session dans sessionStorage et dans etat.
 * Utile après une connexion réussie depuis multijoueur-rejoindre.html.
 */
export function sauvegarderDonneesPartie(donnees) {
  mettreAJourEtat('donneesPartie', donnees);
  mettreAJourEtat('idPartie', donnees.gameCode);
  mettreAJourEtat('pseudo',   donnees.playerName || donnees.hostName);
  mettreAJourEtat('estHote',  donnees.isHost || false);
  mettreAJourEtat('mode',     donnees.mode || 'spectator');
  _sauvegarderTokens(donnees);
  sauvegarderSession();
}

// ─── Ping / latence (Mission 7) ────────────────────────────────────────────────

let _intervalPing = null;

function _demarrerMesurePing() {
  clearInterval(_intervalPing);
  _intervalPing = setInterval(() => {
    if (socket?.connected) socket.emit('client-ping', Date.now());
  }, 5000);
}

function _surServerPong(timestamp) {
  const latence = Date.now() - timestamp;
  ui.mettreAJourPing(latence);
}

// ─── Bannière de reconnexion (Mission 5) ───────────────────────────────────────

const _COULEURS_BANNIERE = {
  warning: { fond: '#FFB400', texte: '#000' },
  success: { fond: '#64DC78', texte: '#000' },
  danger:  { fond: '#FF6B6B', texte: '#fff' },
};
let _timerBanniere = null;

function _injecterBanniereConnexion() {
  if (document.getElementById('banniere-connexion')) return;
  const el = document.createElement('div');
  el.id = 'banniere-connexion';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  Object.assign(el.style, {
    position: 'fixed', top: '0', left: '0', right: '0',
    zIndex: '10002', padding: '10px 20px', textAlign: 'center',
    fontSize: '0.9rem', fontWeight: '600',
    transition: 'transform 0.3s ease, opacity 0.3s ease',
    transform: 'translateY(-100%)', opacity: '0',
  });
  document.body.prepend(el);
}

function _afficherBanniere(type, contenu) {
  const el = document.getElementById('banniere-connexion');
  if (!el) return;
  const { fond, texte } = _COULEURS_BANNIERE[type] ?? _COULEURS_BANNIERE.warning;
  el.style.background = fond;
  el.style.color = texte;
  el.textContent = contenu;
  el.style.transform = 'translateY(0)';
  el.style.opacity = '1';
  clearTimeout(_timerBanniere);
  if (type === 'success') {
    _timerBanniere = setTimeout(() => {
      el.style.transform = 'translateY(-100%)';
      el.style.opacity = '0';
    }, 2500);
  }
}
