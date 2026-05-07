// ============================================
// INTERFACE.JS — Toutes les manipulations DOM
// Aucune logique métier ici.
// ============================================

import { etat } from './etat.js';

const joueursRepondusQuestion = new Set();
let minuterieTransitionManche = null;

// ─── Utilitaires internes ──────────────────────────────────────────────────────

/**
 * Affiche un élément en retirant la classe 'hidden'.
 * @param {string} identifiant - ID de l'élément
 */
function afficherElement(identifiant) {
  const el = document.getElementById(identifiant);
  if (el) el.classList.remove('hidden');
}

/**
 * Masque un élément en ajoutant la classe 'hidden'.
 * @param {string} identifiant - ID de l'élément
 */
function masquerElement(identifiant) {
  const el = document.getElementById(identifiant);
  if (el) el.classList.add('hidden');
}

function appendIcon(parent, className) {
  const icon = document.createElement('i');
  icon.className = className;
  icon.setAttribute('aria-hidden', 'true');
  parent.appendChild(icon);
  return icon;
}

function appendText(parent, text, tagName = 'span', className = '') {
  const el = document.createElement(tagName);
  if (className) el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

// ─── Initialisation ────────────────────────────────────────────────────────────

/**
 * Initialise l'interface selon le rôle du joueur (hôte spectateur ou joueur).
 * Doit être appelée après restaurerSession() pour que etat soit hydraté.
 */
export function initialiserInterface() {
  const vueHote   = document.getElementById('vue-hote');
  const vueJoueur = document.getElementById('vue-joueur');
  const estVueHote = etat.estHote && etat.mode === 'spectator';

  if (estVueHote) {
    if (vueHote)   vueHote.classList.remove('hidden');
    if (vueJoueur) vueJoueur.classList.add('hidden');
    _initialiserBoutonSuivant();
  } else {
    if (vueHote)   vueHote.classList.add('hidden');
    if (vueJoueur) vueJoueur.classList.remove('hidden');
  }

  // En mode spectateur, les joueurs n'affichent pas le timer
  if (etat.mode === 'spectator' && !etat.estHote) {
    const conteneurTimer = document.getElementById('timer-container');
    if (conteneurTimer) conteneurTimer.style.display = 'none';
  }

  mettreAJourScores();
}

/**
 * Branche l'écouteur du bouton "Question suivante" (hôte uniquement).
 * Utilisation interne.
 */
function _initialiserBoutonSuivant() {
  const btnSuivant = document.getElementById('btn-next');
  if (!btnSuivant) return;

  // Importer socket dynamiquement pour éviter la dépendance circulaire
  btnSuivant.addEventListener('click', () => {
    masquerElement('result-zone');
    // L'événement 'next-question' est émis par socket.js via l'événement DOM custom
    document.dispatchEvent(new CustomEvent('ui:questionSuivante'));
  });
}

// ─── Question ──────────────────────────────────────────────────────────────────

/**
 * Affiche une nouvelle question dans la vue appropriée (hôte ou joueur).
 * @param {Object} donneesQuestion - Données envoyées par l'event 'new-question'
 * @param {Function} callbackReponse - Callback (option) → (optionChoisie) quand le joueur clique
 */
export function afficherQuestion(donneesQuestion, callbackReponse) {
  masquerElement('result-zone');
  masquerElement('player-result');
  masquerElement('answer-zone');
  masquerElement('player-wait-zone');
  joueursRepondusQuestion.clear();
  afficherManche(donneesQuestion.manche);

  const infoQuestion = document.getElementById('info-question');
  if (infoQuestion) {
    infoQuestion.textContent =
      `Question ${donneesQuestion.questionNumber}/${donneesQuestion.totalQuestions}`;
  }

  const estVueHote = etat.estHote && etat.mode === 'spectator';

  if (estVueHote) {
    _afficherQuestionHote(donneesQuestion);
  } else {
    _afficherQuestionJoueur(donneesQuestion, callbackReponse);
  }

  mettreAJourScores();
}

export function afficherManche(manche) {
  if (!manche) return;

  const zoneManche = document.getElementById('zone-manche');
  if (!zoneManche) return;

  const titres = {
    ENTRAINEMENT:      'Entraînement',
    NEUF_POINTS:       'Manche 1 — Neuf points gagnants',
    QUATRE_A_LA_SUITE: 'Manche 2 — Quatre à la suite',
    FACE_A_FACE:       'Finale — Face-à-face',
    TERMINE:           'Champion désigné',
  };

  const titre = titres[manche.nom] || manche.titre || `Manche ${manche.numero || ''}`;
  const objectif = manche.objectif ? `Objectif ${manche.objectif}` : '';
  zoneManche.textContent = objectif ? `${titre} | ${objectif}` : titre;
}

/**
 * Vue hôte : affichage lecture seule de la question et des options.
 * @param {Object} donneesQuestion
 */
function _afficherQuestionHote(donneesQuestion) {
  const texteQuestion = document.getElementById('question-text');
  if (texteQuestion) texteQuestion.textContent = donneesQuestion.question;

  const affichageOptions = document.getElementById('options-display');
  if (affichageOptions && donneesQuestion.options) {
    affichageOptions.innerHTML = '';
    donneesQuestion.options.forEach(option => {
      const div = document.createElement('div');
      div.className = 'option-card';
      div.textContent = option;
      affichageOptions.appendChild(div);
    });
  }
}

/**
 * Vue joueur : options cliquables.
 * @param {Object}   donneesQuestion
 * @param {Function} callbackReponse
 */
function _afficherQuestionJoueur(donneesQuestion, callbackReponse) {
  afficherElement('player-question-zone');
  masquerElement('buzzer-zone');
  afficherElement('player-options');

  const texteJoueur = document.getElementById('player-question-text');
  if (texteJoueur) texteJoueur.textContent = donneesQuestion.question;

  const conteneurOptions = document.getElementById('player-options');
  if (!conteneurOptions) return;

  conteneurOptions.innerHTML = '';

  donneesQuestion.options.forEach(option => {
    const btn = document.createElement('button');
    btn.className = 'player-option';
    btn.dataset.sound = 'selectionReponse';
    btn.textContent = option;

    btn.addEventListener('click', () => {
      if (btn.dataset.clique === 'oui') return;
      btn.dataset.clique = 'oui';

      navigator.vibrate?.(50);

      // Bloquer les clics multiples
      conteneurOptions.querySelectorAll('.player-option').forEach(b => {
        b.disabled = true;
      });
      btn.classList.add('selected');

      // Feedback textuel immédiat
      const statutBuzzer = document.getElementById('buzzer-status');
      if (statutBuzzer) {
        statutBuzzer.textContent = 'Réponse envoyée ! En attente des autres...';
        statutBuzzer.classList.add('success');
      }

      afficherAttenteReponses(etat.pseudo);

      // Notifier le module appelant
      if (typeof callbackReponse === 'function') {
        callbackReponse(option);
      }
    });

    conteneurOptions.appendChild(btn);
  });

  // Réinitialiser le statut buzzer
  const statutBuzzer = document.getElementById('buzzer-status');
  if (statutBuzzer) {
    statutBuzzer.textContent = 'Choisissez votre réponse !';
    statutBuzzer.classList.remove('success');
  }
}

// ─── Résultats de question ─────────────────────────────────────────────────────

/**
 * Affiche les résultats d'une question — dispatche vers la vue hôte ou joueur.
 * @param {Object}  donnees  - Données de l'event 'question-results'
 * @param {string}  socketId - ID socket du joueur courant (pour retrouver son résultat)
 */
export function afficherResultatsQuestion(donnees, socketId) {
  const estVueHote = etat.estHote && etat.mode === 'spectator';

  if (estVueHote) {
    _afficherResultatsHote(donnees);
  } else {
    const monResultat = donnees.answers?.find(a => a.playerId === socketId) ?? null;
    afficherOverlayReponse(monResultat).then(() => {
      _afficherResultatsJoueur(donnees, monResultat);
    });
  }
}

function _obtenirOverlayReponse() {
  let overlay = document.getElementById('overlay-reponse');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'overlay-reponse';
  overlay.className = 'overlay-reponse';
  overlay.style.display = 'none';
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-hidden', 'true');

  const icone = document.createElement('div');
  icone.id = 'overlay-icone';
  icone.className = 'overlay-icone';

  const score = document.createElement('div');
  score.id = 'overlay-score';
  score.className = 'overlay-score';

  const combo = document.createElement('div');
  combo.id = 'overlay-combo';
  combo.className = 'overlay-combo';
  combo.style.display = 'none';

  overlay.append(icone, score, combo);
  document.body.appendChild(overlay);
  return overlay;
}

function _obtenirComboJoueur(monResultat) {
  if (!monResultat?.isCorrect) return 0;
  const classement = etat.joueurs || [];
  const joueur = classement.find((j) => j.name === monResultat.playerName || j.id === monResultat.playerId);
  return Number(joueur?.streak || joueur?.streakManche || 0);
}

function _declencherConfettisCombo() {
  if (typeof window.confetti !== 'function') return;
  window.confetti({
    particleCount: 20,
    spread: 46,
    startVelocity: 18,
    scalar: 0.65,
    ticks: 80,
    colors: ['#FFD700', '#72DDF7', '#8093F1'],
    origin: { y: 0.62 },
    disableForReducedMotion: true,
  });
}

/**
 * Affiche un feedback dramatique court avant le résultat détaillé du joueur.
 * @param {Object|null} monResultat
 * @returns {Promise<void>}
 */
export function afficherOverlayReponse(monResultat) {
  const overlay = _obtenirOverlayReponse();
  const icone = document.getElementById('overlay-icone');
  const score = document.getElementById('overlay-score');
  const combo = document.getElementById('overlay-combo');
  const bonneReponse = Boolean(monResultat?.isCorrect);
  const points = Number(monResultat?.pointsEarned || 0);
  const comboActif = _obtenirComboJoueur(monResultat);

  overlay.className = `overlay-reponse ${bonneReponse ? 'overlay-reponse--correcte' : 'overlay-reponse--incorrecte'}`;
  overlay.style.display = 'flex';
  overlay.setAttribute('aria-hidden', 'false');

  if (icone) {
    icone.textContent = bonneReponse ? '✓' : '✕';
    icone.className = `overlay-icone ${bonneReponse ? 'overlay-icone--correcte' : 'overlay-icone--incorrecte'}`;
  }

  if (score) {
    const prefixe = points > 0 ? '+' : '';
    score.textContent = `${prefixe}${points} pts`;
    score.className = `overlay-score ${bonneReponse ? 'overlay-score--gain' : 'overlay-score--perte'}`;
  }

  if (combo) {
    if (bonneReponse && comboActif >= 3) {
      combo.textContent = `Combo x${comboActif} !`;
      combo.style.display = 'block';
      _declencherConfettisCombo();
    } else {
      combo.textContent = '';
      combo.style.display = 'none';
    }
  }

  if (!bonneReponse) {
    document.body.classList.add('secousse-reponse');
  }

  return new Promise((resolve) => {
    setTimeout(() => {
      overlay.style.display = 'none';
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('secousse-reponse');
      resolve();
    }, 800);
  });
}

/**
 * Vue hôte : affiche la bonne réponse, l'illustration et le résumé.
 * @param {Object} donnees
 */
function _afficherResultatsHote(donnees) {
  masquerElement('answer-zone');
  afficherElement('result-zone');

  const statutResultat = document.getElementById('result-status');
  if (statutResultat) {
    statutResultat.className = 'result-status correct';
    statutResultat.replaceChildren();
    appendIcon(statutResultat, 'fas fa-check-circle');
    const texte = appendText(statutResultat, 'Bonne réponse : ');
    appendText(texte, donnees.correctAnswer, 'strong');
  }

  const bonneReponse = document.getElementById('correct-answer');
  if (bonneReponse) bonneReponse.textContent = donnees.correctAnswer;

  // Illustration
  _afficherIllustration(
    'result-illustration',
    'result-image',
    'result-description',
    donnees.imageUrl,
    donnees.illustrationTexte
  );

  // Résumé des réponses
  const resumeReponse = document.getElementById('result-answer');
  if (resumeReponse && donnees.answers) {
    const bonnes = donnees.answers.filter(a => a.isCorrect).length;
    const total  = donnees.answers.filter(a => a.answer !== null).length;
    resumeReponse.replaceChildren();
    appendText(resumeReponse, `${bonnes}/${total}`, 'strong');
    resumeReponse.append(' bonnes réponses');
  }
}

/**
 * Vue joueur : affiche son résultat personnel, l'illustration et le classement.
 * @param {Object}      donnees
 * @param {Object|null} monResultat - Résultat personnel du joueur courant
 */
function _afficherResultatsJoueur(donnees, monResultat) {
  masquerElement('player-options');
  masquerElement('buzzer-zone');
  masquerElement('player-wait-zone');
  afficherElement('player-result');

  const statutResultat = document.getElementById('player-result-status');
  if (statutResultat) {
    if (monResultat?.isCorrect) {
      const pts = monResultat.pointsEarned;
      const tableauPoints = [10, 8, 6, 5, 4, 3, 2, 1];
      const pointsBase    = monResultat.rank <= 8 ? tableauPoints[monResultat.rank - 1] : 1;
      const msgSerie      = pts > pointsBase ? ' Série !' : '';
      statutResultat.className = 'result-status correct';
      statutResultat.replaceChildren();
      appendIcon(statutResultat, 'fas fa-check-circle');
      appendText(statutResultat, `Bonne réponse ! +${pts} pts${msgSerie}`);
    } else if (monResultat && monResultat.answer !== null) {
      statutResultat.className = 'result-status incorrect';
      statutResultat.replaceChildren();
      appendIcon(statutResultat, 'fas fa-times-circle');
      appendText(statutResultat, `Mauvaise réponse (${monResultat.pointsEarned} pts)`);
    } else {
      statutResultat.className = 'result-status incorrect';
      statutResultat.replaceChildren();
      appendIcon(statutResultat, 'fas fa-clock');
      appendText(statutResultat, 'Temps écoulé ! (0 pts)');
    }
  }

  const reponseAffichee = document.getElementById('player-result-answer');
  if (reponseAffichee) {
    reponseAffichee.textContent = `Réponse : ${donnees.correctAnswer}`;
  }

  // Illustration
  _afficherIllustration(
    'player-result-illustration',
    'player-result-image',
    'player-result-description',
    donnees.imageUrl,
    donnees.illustrationTexte
  );

  // Classement top 5
  const listeScores = document.getElementById('player-scores-list');
  if (listeScores && donnees.rankings) {
    listeScores.innerHTML = '';
    const medailles = ['🥇', '🥈', '🥉'];
    donnees.rankings.slice(0, 5).forEach((joueur, idx) => {
      const ligne = document.createElement('div');
      ligne.className = 'score-row' + (idx === 0 ? ' first' : '');
      appendText(ligne, `${medailles[idx] || `#${idx + 1}`} ${joueur.name}${joueur.streak >= 3 ? ' 🔥' : ''}`, 'span', 'score-row-name');
      appendText(ligne, `${joueur.score} pts`, 'span', 'score-row-points');
      listeScores.appendChild(ligne);
    });
  }

  // Compte à rebours (mode classique uniquement)
  if (etat.mode === 'classic') {
    let decompte = 5;
    const decompteEl = document.getElementById('countdown');
    if (decompteEl) decompteEl.textContent = decompte;
    const intervalle = setInterval(() => {
      decompte--;
      if (decompteEl) decompteEl.textContent = decompte;
      if (decompte <= 0) clearInterval(intervalle);
    }, 1000);
  } else {
    const texteAttente = document.getElementById('player-waiting-text');
    if (texteAttente) texteAttente.style.display = 'none';
  }
}

/**
 * Utilitaire interne : affiche ou masque un bloc illustration.
 */
function _afficherIllustration(idConteneur, idImage, idDescription, urlImage, texteIllustration) {
  const conteneur  = document.getElementById(idConteneur);
  const image      = document.getElementById(idImage);
  const description = document.getElementById(idDescription);

  if (conteneur && image && urlImage) {
    image.src = urlImage;
    image.alt = texteIllustration || 'Illustration';
    if (description) description.textContent = texteIllustration || '';
    conteneur.classList.remove('hidden');
  } else if (conteneur) {
    conteneur.classList.add('hidden');
  }
}

// ─── Compteur de réponses ──────────────────────────────────────────────────────

/**
 * Met à jour l'élément #compteur-reponses.
 * @param {number} repondu - Nombre de joueurs ayant répondu
 * @param {number} total   - Nombre total de joueurs
 */
export function mettreAJourCompteurReponses(repondu, total) {
  const el = document.getElementById('compteur-reponses');
  if (el) {
    el.textContent = `${repondu}/${total} joueurs ont répondu`;
  }
}

function _joueursVisiblesPourAttente() {
  let joueurs = [...(etat.joueurs || [])].filter((j) => !j.isHost);
  if (!joueurs.length && etat.pseudo) {
    joueurs = [{ name: etat.pseudo }];
  }
  return joueurs;
}

function _normaliserNomJoueur(joueurOuNom) {
  if (!joueurOuNom) return '';
  if (typeof joueurOuNom === 'string') return joueurOuNom;
  return joueurOuNom.name || joueurOuNom.playerName || joueurOuNom.pseudo || joueurOuNom.id || '';
}

function _rendreAttenteReponses(totalForce = null, reponduForce = null) {
  const liste = document.getElementById('liste-attente-joueurs');
  const barre = document.getElementById('barre-attente-reponses');
  const texte = document.getElementById('texte-attente-reponses');
  const joueurs = _joueursVisiblesPourAttente();
  const total = Number(totalForce || etat.totalJoueurs || joueurs.length || 0);
  const repondusCalcules = joueurs.filter((joueur) => joueursRepondusQuestion.has(_normaliserNomJoueur(joueur))).length;
  const repondus = Number.isFinite(Number(reponduForce)) ? Number(reponduForce) : repondusCalcules;
  const totalAffiche = Math.max(total, joueurs.length, repondus);

  if (liste) {
    liste.innerHTML = '';
    joueurs.forEach((joueur) => {
      const nom = _normaliserNomJoueur(joueur);
      const aRepondu = joueursRepondusQuestion.has(nom);
      const ligne = document.createElement('div');
      ligne.className = `avatar-joueur${aRepondu ? ' repondu' : ''}`;

      const dot = document.createElement('span');
      dot.className = 'avatar-dot';
      dot.setAttribute('aria-hidden', 'true');

      appendText(ligne, nom || 'Joueur', 'span', 'avatar-nom');
      appendText(ligne, aRepondu ? 'répondu ✓' : '...', 'span', 'avatar-statut');
      ligne.prepend(dot);
      liste.appendChild(ligne);
    });
  }

  if (barre) {
    const ratio = totalAffiche > 0 ? Math.min(1, repondus / totalAffiche) : 0;
    barre.style.width = `${Math.round(ratio * 100)}%`;
  }

  if (texte) {
    texte.textContent = `${repondus} / ${totalAffiche} joueurs`;
  }
}

export function afficherAttenteReponses(pseudoJoueur = etat.pseudo) {
  const nom = _normaliserNomJoueur(pseudoJoueur);
  if (nom) joueursRepondusQuestion.add(nom);

  masquerElement('player-options');
  masquerElement('buzzer-zone');
  masquerElement('player-result');
  afficherElement('player-wait-zone');
  _rendreAttenteReponses();
}

export function mettreAJourAttenteReponses(donnees = {}) {
  const nom = _normaliserNomJoueur(donnees.playerName || donnees.pseudo || donnees);
  const dejaRepondu = nom && joueursRepondusQuestion.has(nom);
  if (nom) joueursRepondusQuestion.add(nom);

  if (document.getElementById('player-wait-zone')?.classList.contains('hidden')) {
    _rendreAttenteReponses(donnees.totalPlayers, donnees.totalAnswered);
    return;
  }

  _rendreAttenteReponses(donnees.totalPlayers, donnees.totalAnswered);

  if (nom && !dejaRepondu) {
    window.Sons?.jouer?.('popJoueur');
  }
}

// ─── Minuteur ──────────────────────────────────────────────────────────────────

/**
 * Met à jour l'affichage du minuteur (délégué à minuteur.js via l'élément DOM).
 * @param {number} secondes
 */
export function mettreAJourMinuteur(secondes) {
  const valeurEl    = document.getElementById('timer-value');
  const conteneurEl = document.getElementById('timer-container');
  if (valeurEl) valeurEl.textContent = secondes > 0 ? secondes : 0;
  if (conteneurEl) {
    if (secondes <= 5 && secondes > 0) {
      conteneurEl.classList.add('warning');
    } else {
      conteneurEl.classList.remove('warning');
    }
  }
}

// ─── Écran de jeu ─────────────────────────────────────────────────────────────

/**
 * Affiche l'écran de jeu (masque les autres écrans).
 */
export function afficherEcranJeu() {
  const ecranJeu = document.getElementById('jeu-multijoueur');
  if (ecranJeu) ecranJeu.classList.add('actif');
}

// ─── Scores ────────────────────────────────────────────────────────────────────

/**
 * Met à jour la barre de scores depuis etat.joueurs.
 */
export function mettreAJourScores() {
  const conteneur    = document.getElementById('scores-grid');
  const nbJoueurs    = document.getElementById('player-count');
  if (!conteneur) return;

  let joueursAffiches = [...etat.joueurs];

  // En mode spectateur, exclure l'hôte de la barre de scores
  if (etat.mode === 'spectator') {
    joueursAffiches = joueursAffiches.filter(j => !j.isHost);
  }

  joueursAffiches.sort((a, b) => (b.score || 0) - (a.score || 0));

  conteneur.innerHTML = '';
  joueursAffiches.forEach((joueur, idx) => {
    const puce = document.createElement('div');
    puce.className = 'score-chip' + (idx === 0 && joueur.score > 0 ? ' leader' : '');
    appendText(puce, joueur.name, 'span', 'score-name');
    appendText(puce, joueur.score || 0, 'span', 'score-points');
    conteneur.appendChild(puce);
  });

  if (nbJoueurs) {
    nbJoueurs.textContent = joueursAffiches.length;
  }
}

/**
 * Met à jour la liste des joueurs (alias publique vers mettreAJourScores).
 * @param {Array} joueurs - Tableau de joueurs reçu depuis le serveur
 */
export function mettreAJourListeJoueurs(joueurs) {
  etat.joueurs = joueurs || [];
  mettreAJourScores();
}

// ─── Résultats finaux ──────────────────────────────────────────────────────────

/**
 * Affiche l'écran de résultats finaux (podium, graphe, stats).
 * Nécessite Chart.js chargé globalement (CDN).
 * @param {Object} donnees - Données de l'event 'game-finished'
 */
export function afficherResultatsFinaux(donnees) {
  document.getElementById('jeu-multijoueur')?.classList.remove('actif');
  document.getElementById('resultats-finaux')?.classList.add('actif');

  let classement = donnees.rankings || [];
  const historique = donnees.history || [];

  if (etat.mode === 'spectator') {
    classement = classement.filter(j => !j.isHost);
  }

  _rendrePodium(classement);
  _rendreAutresClassements(classement);
  _rendreGraphiqueScores(classement, historique);
  _rendreCartesStats(classement, historique);
  _animerPodiumFinal();
}

/** Podium top 3 (ordre visuel : 2e gauche, 1er centre, 3e droite) */
function _rendrePodium(classement) {
  const positionsAffichees = [2, 1, 3];

  positionsAffichees.forEach(position => {
    const joueur   = classement[position - 1];
    const nomEl    = document.getElementById(`podium-name-${position}`);
    const scoreEl  = document.getElementById(`podium-score-${position}`);
    const slotEl   = document.getElementById(`podium-${position}`);

    if (!joueur) {
      if (slotEl) slotEl.style.visibility = 'hidden';
      return;
    }
    if (nomEl)   nomEl.textContent   = joueur.name;
    if (scoreEl) scoreEl.textContent = `${joueur.score} pts`;
  });
}

function _animerPodiumFinal() {
  const podium = document.getElementById('podium');
  if (!podium) return;

  const actions = document.querySelector('#resultats-finaux .actions');
  const titre = document.querySelector('#resultats-finaux .final-header h1');
  const slots = {
    troisieme: document.getElementById('podium-3'),
    deuxieme: document.getElementById('podium-2'),
    premier: document.getElementById('podium-1'),
  };
  const barres = {
    troisieme: document.querySelector('#podium-3 .podium-bar'),
    deuxieme: document.querySelector('#podium-2 .podium-bar'),
    premier: document.querySelector('#podium-1 .podium-bar'),
  };
  const hauteurs = {
    troisieme: barres.troisieme?.offsetHeight || 50,
    deuxieme: barres.deuxieme?.offsetHeight || 70,
    premier: barres.premier?.offsetHeight || 100,
  };

  [slots.troisieme, slots.deuxieme, slots.premier].forEach((slot) => {
    if (!slot || slot.style.visibility === 'hidden') return;
    slot.style.opacity = '0';
    slot.style.transform = 'translateY(40px)';
  });
  Object.entries(barres).forEach(([cle, barre]) => {
    if (!barre) return;
    barre.style.height = '0px';
    barre.dataset.hauteurFinale = String(hauteurs[cle]);
  });
  if (actions) {
    actions.style.opacity = '0';
    actions.style.transform = 'translateY(12px)';
  }

  const lancerConfettis = () => {
    window.Sons?.jouer?.('podium1er');
    if (typeof window.confetti === 'function') {
      window.confetti({
        particleCount: 200,
        spread: 72,
        startVelocity: 38,
        colors: ['#8093F1', '#72DDF7', '#FFD700'],
        origin: { y: 0.58 },
        disableForReducedMotion: true,
      });
    }
  };

  if (!window.anime) {
    Object.entries(barres).forEach(([cle, barre]) => {
      if (barre) barre.style.height = `${hauteurs[cle]}px`;
    });
    [slots.troisieme, slots.deuxieme, slots.premier].forEach((slot) => {
      if (slot) {
        slot.style.opacity = '1';
        slot.style.transform = '';
      }
    });
    if (actions) {
      actions.style.opacity = '1';
      actions.style.transform = '';
    }
    lancerConfettis();
    return;
  }

  const timeline = window.anime.timeline({ autoplay: true });
  timeline
    .add({
      targets: titre,
      translateY: [-36, 0],
      opacity: [0, 1],
      duration: 500,
      easing: 'easeOutQuad',
    })
    .add({
      targets: slots.troisieme,
      translateY: [60, 0],
      opacity: [0, 1],
      duration: 600,
      easing: 'easeOutElastic(1, .75)',
    }, 1000)
    .add({
      targets: barres.troisieme,
      height: [0, hauteurs.troisieme],
      duration: 600,
      easing: 'easeOutElastic(1, .75)',
    }, 1000)
    .add({
      targets: slots.deuxieme,
      translateY: [60, 0],
      opacity: [0, 1],
      duration: 600,
      easing: 'easeOutElastic(1, .75)',
    }, 1800)
    .add({
      targets: barres.deuxieme,
      height: [0, hauteurs.deuxieme],
      duration: 600,
      easing: 'easeOutElastic(1, .75)',
    }, 1800)
    .add({
      targets: slots.premier,
      translateY: [60, 0],
      opacity: [0, 1],
      duration: 650,
      easing: 'easeOutElastic(1, .75)',
      begin: lancerConfettis,
    }, 2600)
    .add({
      targets: barres.premier,
      height: [0, hauteurs.premier],
      duration: 650,
      easing: 'easeOutElastic(1, .75)',
    }, 2600)
    .add({
      targets: '#podium-1 .podium-crown',
      translateY: [-40, 0],
      opacity: [0, 1],
      duration: 700,
      easing: 'easeOutElastic(1, .6)',
    }, 3000)
    .add({
      targets: actions,
      translateY: [12, 0],
      opacity: [0, 1],
      duration: 420,
      easing: 'easeOutQuad',
    }, 4000);
}

/** Joueurs de rang 4 et plus */
function _rendreAutresClassements(classement) {
  const conteneur = document.getElementById('other-rankings');
  if (!conteneur) return;
  conteneur.innerHTML = '';

  classement.slice(3).forEach((joueur, idx) => {
    const ligne = document.createElement('div');
    ligne.className = 'other-rank-row';
    appendText(ligne, `#${idx + 4}`, 'span', 'other-rank-pos');
    appendText(ligne, joueur.name, 'span', 'other-rank-name');
    appendText(ligne, `${joueur.score} pts`, 'span', 'other-rank-score');
    conteneur.appendChild(ligne);
  });
}

/** Référence globale Chart.js pour éviter les doublons d'instance */
let instanceGraphique = null;

/** Graphique d'évolution des scores (Chart.js) */
function _rendreGraphiqueScores(classement, historique) {
  const canvas = document.getElementById('scores-chart');
  if (!canvas || !historique.length) return;

  // Détruire l'instance précédente si elle existe
  if (instanceGraphique) {
    instanceGraphique.destroy();
    instanceGraphique = null;
  }

  const COULEURS    = ['#00D4FF', '#FF3366', '#00FF88', '#FFD700'];
  const nomsJoueurs = classement.slice(0, 4).map(j => j.name);

  const totauxCumulatifs = {};
  nomsJoueurs.forEach(nom => { totauxCumulatifs[nom] = 0; });

  const jeusDonnees = nomsJoueurs.map((nom, idx) => ({
    label: nom,
    data: [],
    borderColor: COULEURS[idx],
    backgroundColor: COULEURS[idx] + '22',
    borderWidth: 2.5,
    pointRadius: 4,
    pointHoverRadius: 6,
    tension: 0.35,
    fill: false,
  }));

  historique.forEach(question => {
    question.answers.forEach(reponse => {
      if (totauxCumulatifs[reponse.playerName] !== undefined) {
        totauxCumulatifs[reponse.playerName] = Math.max(0,
          totauxCumulatifs[reponse.playerName] + (reponse.pointsEarned || 0)
        );
      }
    });
    nomsJoueurs.forEach((nom, idx) => {
      jeusDonnees[idx].data.push(totauxCumulatifs[nom]);
    });
  });

  const etiquettes = historique.map((_, i) => `Q${i + 1}`);

  // Vérifier que Chart.js est disponible (chargé via CDN)
  if (typeof Chart === 'undefined') {
    console.warn('[interface] Chart.js non disponible — graphique ignoré');
    return;
  }

  instanceGraphique = new Chart(canvas, {
    type: 'line',
    data: { labels: etiquettes, datasets: jeusDonnees },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: historique.length > 8 ? 2.5 : 2,
      animation: { duration: 800 },
      plugins: {
        legend: {
          labels: { color: '#b0b8c8', font: { size: 12 }, boxWidth: 16 }
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
          grid:  { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#6a7a8a', font: { size: 11 } },
          grid:  { color: 'rgba(255,255,255,0.07)' }
        }
      }
    }
  });
}

/** Cartes de statistiques : meilleure série et joueur le plus rapide */
function _rendreCartesStats(classement, historique) {
  if (!historique.length) return;

  const nomsJoueurs = classement.map(j => j.name);

  // --- Meilleure série (calculée depuis l'historique) ---
  const seriesActuelles = {};
  const seriesMax       = {};
  nomsJoueurs.forEach(nom => { seriesActuelles[nom] = 0; seriesMax[nom] = 0; });

  historique.forEach(question => {
    question.answers.forEach(reponse => {
      if (!(reponse.playerName in seriesActuelles)) return;
      if (reponse.isCorrect) {
        seriesActuelles[reponse.playerName]++;
        if (seriesActuelles[reponse.playerName] > seriesMax[reponse.playerName]) {
          seriesMax[reponse.playerName] = seriesActuelles[reponse.playerName];
        }
      } else {
        seriesActuelles[reponse.playerName] = 0;
      }
    });
  });

  let meilleureSerieJoueur = nomsJoueurs[0] || '---';
  let meilleureSerieValeur = 0;
  nomsJoueurs.forEach(nom => {
    if (seriesMax[nom] > meilleureSerieValeur) {
      meilleureSerieValeur  = seriesMax[nom];
      meilleureSerieJoueur  = nom;
    }
  });

  const joueurSerieEl = document.getElementById('streak-player');
  const valeurSerieEl = document.getElementById('streak-value');
  if (joueurSerieEl) joueurSerieEl.textContent = meilleureSerieJoueur;
  if (valeurSerieEl) {
    valeurSerieEl.textContent = meilleureSerieValeur > 0
      ? `${meilleureSerieValeur} bonne${meilleureSerieValeur > 1 ? 's' : ''} d'affilée`
      : 'Aucune série';
  }

  // --- Le plus rapide (moyenne sur les bonnes réponses) ---
  const tempsParJoueur = {};
  nomsJoueurs.forEach(nom => { tempsParJoueur[nom] = []; });

  historique.forEach(question => {
    question.answers.forEach(reponse => {
      if (
        reponse.isCorrect &&
        reponse.responseTimeMs !== null &&
        reponse.responseTimeMs !== undefined &&
        reponse.playerName in tempsParJoueur
      ) {
        tempsParJoueur[reponse.playerName].push(reponse.responseTimeMs);
      }
    });
  });

  let joueurPlusRapide = null;
  let moyenneMinimale  = Infinity;
  nomsJoueurs.forEach(nom => {
    const temps = tempsParJoueur[nom];
    if (temps.length > 0) {
      const moyenne = temps.reduce((s, t) => s + t, 0) / temps.length;
      if (moyenne < moyenneMinimale) {
        moyenneMinimale   = moyenne;
        joueurPlusRapide  = nom;
      }
    }
  });

  const joueurVitesseEl = document.getElementById('speed-player');
  const valeurVitesseEl = document.getElementById('speed-value');
  if (joueurVitesseEl) joueurVitesseEl.textContent = joueurPlusRapide || '---';
  if (valeurVitesseEl) {
    if (joueurPlusRapide) {
      const secondes = (moyenneMinimale / 1000).toFixed(2);
      valeurVitesseEl.textContent = `${secondes}s en moyenne`;
    } else {
      valeurVitesseEl.textContent = 'Données insuffisantes';
    }
  }
}

// ─── Vote du thème ─────────────────────────────────────────────────────────────

/**
 * Affiche la modale de vote de thème.
 * @param {string[]} options - Liste des thèmes proposés
 */
export function afficherVoteTheme(options) {
  const modal = document.getElementById('vote-modal');
  if (!modal) return;

  const conteneurBoutons = modal.querySelector('#vote-options');
  if (conteneurBoutons && options) {
    conteneurBoutons.innerHTML = '';
    options.forEach(theme => {
      const btn = document.createElement('button');
      btn.className = 'vote-theme-btn';
      btn.dataset.sound = 'toggle';
      btn.textContent = theme;
      btn.dataset.theme = theme;
      conteneurBoutons.appendChild(btn);
    });
  }

  modal.classList.remove('hidden');
}

/**
 * Met à jour les barres de progression du vote en cours.
 * @param {Object} votes - { [theme]: nombreVotes }
 */
export function mettreAJourVoteTheme(votes) {
  const total = Object.values(votes).reduce((s, n) => s + n, 0) || 1;

  Object.entries(votes).forEach(([theme, nombreVotes]) => {
    // Sélection par attribut data-theme sur la barre de progression
    const barre = document.querySelector(`[data-theme-bar="${theme}"]`);
    if (barre) {
      const pourcentage = Math.round((nombreVotes / total) * 100);
      barre.style.width = `${pourcentage}%`;
      barre.textContent = `${pourcentage}%`;
    }
  });
}

/**
 * Affiche le thème gagnant et masque la modale.
 * @param {string} theme - Thème sélectionné
 */
export function afficherResultatVote(theme) {
  const modal = document.getElementById('vote-modal');
  if (modal) modal.classList.add('hidden');

  const banner = document.getElementById('vote-result-banner');
  if (banner) {
    banner.classList.remove('hidden');
    const texte = banner.querySelector('#vote-result-theme');
    if (texte) texte.textContent = theme;
  }
}

/**
 * Active le bouton Démarrer après génération des questions IA.
 */
export function activerBoutonDemarrer() {
  const banner = document.getElementById('vote-result-banner');
  if (banner) {
    const spinner = banner.querySelector('.spinner');
    if (spinner) spinner.style.display = 'none';
  }

  setTimeout(() => {
    const btn = document.getElementById('btn-demarrer');
    if (btn) btn.disabled = false;
  }, 1500);
}

// ─── Notifications ─────────────────────────────────────────────────────────────

/**
 * Affiche une notification temporaire en haut à droite.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} type
 */
export function afficherNotification(message, type = 'info') {
  const couleurs = {
    success: '#00FF88',
    error:   '#FF3366',
    warning: '#FFD700',
    info:    '#00F5FF',
  };

  const notif = document.createElement('div');
  notif.setAttribute('role', 'status');
  notif.setAttribute('aria-live', 'polite');
  notif.setAttribute('aria-atomic', 'true');
  notif.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${couleurs[type] || couleurs.info};
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

/**
 * Affiche un message d'erreur générique.
 * @param {string} message
 */
export function afficherErreur(message) {
  afficherNotification(message, 'error');
}

/**
 * Affiche un message d'erreur de limite de taux.
 * @param {number} attente - Secondes à attendre
 */
export function afficherErreurLimite(attente) {
  afficherNotification(
    `Limite atteinte. Attendez ${attente}s avant de réessayer.`,
    'warning'
  );
}

// ─── Scénario & transitions de manche ─────────────────────────────────────────

/**
 * Affiche la bannière du scénario pendant 5 secondes.
 * @param {string} titre - Titre lisible du scénario
 */
export function afficherBanniereScenario(titre) {
  const banner = document.getElementById('scenario-banner');
  if (!banner) return;
  banner.textContent = titre;
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 5000);
}

/**
 * Affiche l'overlay de transition inter-manche avec qualifiés/éliminés.
 * @param {Object} donnees - Données de l'event 'manche-ended'
 */
export function afficherTransitionManche(donnees) {
  const overlay = document.getElementById('overlay-manche');
  if (!overlay) return;

  const titreEl = document.getElementById('manche-titre');
  const eliminesEl = document.getElementById('manche-elimines');
  const qualifiesEl = document.getElementById('manche-qualifies');
  const separateur = overlay.querySelector('.manche-separateur');
  const countdown = document.getElementById('manche-countdown');

  if (minuterieTransitionManche) clearTimeout(minuterieTransitionManche);
  if (titreEl) titreEl.textContent = 'FIN DE MANCHE';
  if (countdown) countdown.textContent = '';
  if (separateur) separateur.style.width = '0';

  _remplirListeTransition(eliminesEl, donnees.elimines, 'joueur-elimine', '✕', 'Aucun éliminé');
  _remplirListeTransition(qualifiesEl, donnees.qualifies, 'joueur-qualifie', '✓', 'Qualification en cours');

  overlay.classList.remove('hidden');
  overlay.style.opacity = '1';
  window.Sons?.jouer?.('mancheFin');
  _jouerAnimationTransitionManche(overlay);

  setTimeout(() => { if (countdown) countdown.textContent = 'Prochain round dans 2...'; }, 3500);
  setTimeout(() => { if (countdown) countdown.textContent = 'Prochain round dans 1...'; }, 4300);
  minuterieTransitionManche = setTimeout(() => masquerTransitionManche(), 5000);
}

/**
 * Masque l'overlay de transition inter-manche.
 */
export function masquerTransitionManche() {
  const overlay = document.getElementById('overlay-manche');
  if (!overlay) return;

  if (minuterieTransitionManche) {
    clearTimeout(minuterieTransitionManche);
    minuterieTransitionManche = null;
  }

  if (window.anime) {
    window.anime({
      targets: overlay,
      opacity: [1, 0],
      duration: 320,
      easing: 'easeInQuad',
      complete: () => {
        overlay.classList.add('hidden');
        overlay.style.opacity = '';
      },
    });
  } else {
    overlay.classList.add('hidden');
    overlay.style.opacity = '';
  }
}

function _libelleParticipant(participant) {
  if (!participant) return '';
  if (typeof participant === 'string') return participant;
  return participant.name || participant.playerName || participant.pseudo || participant.id || '';
}

function _remplirListeTransition(conteneur, participants, classe, icone, messageVide) {
  if (!conteneur) return;
  conteneur.innerHTML = '';
  const noms = (participants || []).map(_libelleParticipant).filter(Boolean);

  if (!noms.length) {
    const vide = document.createElement('span');
    vide.className = classe;
    vide.textContent = messageVide;
    conteneur.appendChild(vide);
    return;
  }

  noms.forEach((nom) => {
    const ligne = document.createElement('span');
    ligne.className = classe;
    appendText(ligne, icone, 'span');
    appendText(ligne, nom, 'strong');
    conteneur.appendChild(ligne);
  });
}

function _jouerAnimationTransitionManche(overlay) {
  const elements = {
    titre: overlay.querySelector('.manche-titre'),
    elimines: overlay.querySelectorAll('.joueur-elimine'),
    separateur: overlay.querySelector('.manche-separateur'),
    qualifies: overlay.querySelectorAll('.joueur-qualifie'),
    libelles: overlay.querySelectorAll('.manche-libelle'),
  };

  if (!window.anime) {
    if (elements.separateur) elements.separateur.style.width = '100%';
    return;
  }

  window.anime.set(overlay, { opacity: 0 });
  window.anime.set(elements.titre, { translateY: -60, opacity: 0 });
  window.anime.set(elements.elimines, { translateY: 24, opacity: 0 });
  window.anime.set(elements.qualifies, { translateY: 24, opacity: 0 });
  window.anime.set(elements.libelles, { translateY: 18, opacity: 0 });
  window.anime.set(elements.separateur, { width: '0%' });

  const sequence = window.anime.timeline({ autoplay: true });
  sequence
    .add({
      targets: overlay,
      opacity: [0, 1],
      duration: 400,
      easing: 'easeOutQuad',
    })
    .add({
      targets: elements.titre,
      translateY: [-60, 0],
      opacity: [0, 1],
      duration: 650,
      easing: 'easeOutElastic(1, .75)',
    }, 400)
    .add({
      targets: [elements.libelles[0], ...elements.elimines],
      translateY: [24, 0],
      opacity: [0, 1],
      delay: window.anime.stagger(150),
      duration: 420,
      easing: 'easeOutQuad',
    }, 800)
    .add({
      targets: elements.separateur,
      width: ['0%', '100%'],
      duration: 300,
      easing: 'easeOutQuad',
    }, 1500)
    .add({
      targets: [elements.libelles[1], ...elements.qualifies],
      translateY: [30, 0],
      opacity: [0, 1],
      delay: window.anime.stagger(150),
      duration: 420,
      easing: 'easeOutQuad',
    }, 1800);
}

// ─── Ping indicator (Mission 7) ───────────────────────────────────────────────

/**
 * Met à jour l'indicateur de latence réseau (dot coloré dans le header).
 * @param {number} latence - Temps aller-retour en ms
 */
export function mettreAJourPing(latence) {
  const dot    = document.getElementById('ping-dot');
  const valeur = document.getElementById('ping-valeur');
  if (!dot) return;

  let couleur, titre;
  if (latence < 100) {
    couleur = '#64DC78'; titre = `Excellent (${latence}ms)`;
  } else if (latence < 250) {
    couleur = '#FFD700'; titre = `Moyen (${latence}ms)`;
  } else {
    couleur = '#FF6B6B'; titre = `Mauvais (${latence}ms)`;
  }

  dot.style.background = couleur;
  dot.style.boxShadow  = `0 0 6px ${couleur}`;
  dot.title = titre;
  if (valeur) valeur.textContent = `${latence}ms`;
}

// ─── Streak indicator ─────────────────────────────────────────────────────────

/**
 * Met à jour l'indicateur de série visible dans le header.
 * @param {number} n - Nombre de bonnes réponses consécutives dans la manche
 */
export function mettreAJourStreak(n) {
  const badge = document.getElementById('indicateur-streak');
  if (!badge) return;

  badge.dataset.streak = n;
  const count = badge.querySelector('.streak-count');
  const label = badge.querySelector('.streak-label');

  if (count) count.textContent = n;
  if (label) label.textContent = n >= 5 ? 'EN FEU !' : 'Série';

  if (n >= 3) {
    badge.classList.add('actif');
    badge.classList.remove('cascade-animee');
    void badge.offsetWidth;
    badge.classList.add('cascade-animee');
  } else {
    badge.classList.remove('actif', 'cascade-animee');
  }
}

// ─── Animations de réponse ─────────────────────────────────────────────────────

/**
 * Applique la classe 'correcte' à un élément DOM pour déclencher l'animation CSS.
 * @param {HTMLElement} element
 */
export function animerReponseCorrecte(element) {
  if (!element) return;
  element.classList.add('correcte');
  element.addEventListener('animationend', () => {
    element.classList.remove('correcte');
  }, { once: true });
}

/**
 * Applique la classe 'incorrecte' à un élément DOM pour déclencher l'animation CSS.
 * @param {HTMLElement} element
 */
export function animerReponseIncorrecte(element) {
  if (!element) return;
  element.classList.add('incorrecte');
  element.addEventListener('animationend', () => {
    element.classList.remove('incorrecte');
  }, { once: true });
}
