// ============================================
// SOCKET.JS — Connexion Socket.IO + handlers d'événements
// ============================================

import { etat, mettreAJourEtat, sauvegarderSession } from './etat.js';
import * as ui from './interface.js';
import { demarrerMinuteur, arreterMinuteur } from './minuteur.js';
import { jouerSon } from './sons.js';

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
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    timeout: 20000,
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
  socket.on('theme-vote-started',    _surVoteThemeDemarre);
  socket.on('theme-vote-update',     _surMiseAJourVote);
  socket.on('theme-vote-result',     _surResultatVote);
  socket.on('questions-ready',       _surQuestionsPretes);
  socket.on('error',                 _surErreur);

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
  ui.afficherNotification('Connexion perdue...', 'warning');
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

  // Démarrer le minuteur client (sauf si joueur en mode spectateur)
  const afficherMinuteur = !(etat.mode === 'spectator' && !etat.estHote);
  if (afficherMinuteur) {
    demarrerMinuteur(donnees.timeLimit);
  }

  // Afficher la question avec un callback de soumission de réponse
  ui.afficherQuestion(donnees, (optionChoisie) => {
    _soumettreReponse(optionChoisie);
  });
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

  // Mettre à jour la liste des joueurs depuis les classements
  if (donnees.rankings) {
    const joueursMisAJour = donnees.rankings.map(r => ({
      id:     r.name,
      name:   r.name,
      score:  r.score,
      isHost: r.isHost,
    }));
    mettreAJourEtat('joueurs', joueursMisAJour);
    ui.mettreAJourListeJoueurs(joueursMisAJour);
  }

  // Son selon le résultat du joueur courant
  if (!etat.estHote) {
    const monResultat = donnees.answers?.find(a => a.playerId === socket.id);
    jouerSon(monResultat?.isCorrect ? 'correct' : 'incorrect');
  }

  ui.afficherResultatsQuestion(donnees, socket.id);
}

/** Un joueur a répondu — mise à jour du compteur */
function _surJoueurARepondu(donnees) {
  const totalRepondu  = donnees.totalAnswered || 0;
  const totalJoueurs  = donnees.totalPlayers  || etat.totalJoueurs;

  mettreAJourEtat('joueursAyantRepondu', totalRepondu);
  mettreAJourEtat('totalJoueurs', totalJoueurs);

  ui.mettreAJourCompteurReponses(totalRepondu, totalJoueurs);
}

/** La partie a démarré (reçu côté joueur en salle d'attente) */
function _surPartieDemarree(donnees) {
  console.log('[socket] Partie démarrée :', donnees);
  // Cette page est multijoueur-jeu.html — normalement la redirection
  // est déjà faite par multijoueur-rejoindre.html.
  // Ici on met à jour les données si on est déjà sur la page de jeu.
  if (donnees.players) {
    mettreAJourEtat('joueurs', donnees.players);
    ui.mettreAJourListeJoueurs(donnees.players);
  }
  ui.afficherEcranJeu();
}

/** La partie est terminée */
function _surPartieTerminee(donnees) {
  console.log('[socket] Partie terminée :', donnees);
  jouerSon('fin');
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

/** Vote de thème démarré */
function _surVoteThemeDemarre(donnees) {
  console.log('[socket] Vote de thème démarré :', donnees);
  ui.afficherVoteTheme(donnees.options || donnees);
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
