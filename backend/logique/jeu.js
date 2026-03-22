// ============================================
// logique/jeu.js — Regles et calculs du jeu
// ============================================

"use strict";

// Tableau de points par rang de rapidite (1er, 2e, 3e, ... correct)
const POINTS_PAR_RANG = [10, 8, 6, 5, 4, 3, 2, 1];

// Bonus de serie si le joueur enchaîne 3 bonnes reponses ou plus
const BONUS_SERIE = 2;

// Malus pour une mauvaise reponse
const MALUS_MAUVAISE_REPONSE = 3;

// Score minimum (ne peut pas etre negatif)
const SCORE_MINIMUM = 0;

/**
 * calculerScore — Calcule les points gagnes et la nouvelle serie pour une reponse.
 * @param {number} rangReponse - Rang de la reponse correcte (0 = premier, 1 = deuxieme, etc.) ; -1 si incorrect
 * @param {boolean} estCorrect - Vrai si la reponse est correcte
 * @param {number} streakActuel - Serie courante du joueur avant cette reponse
 * @param {number} scoreActuel - Score actuel du joueur (pour appliquer le plancher a 0)
 * @returns {{ pointsGagnes: number, nouveauStreak: number }}
 */
function calculerScore(rangReponse, estCorrect, streakActuel, scoreActuel = 0) {
  if (estCorrect) {
    const pointsBase = POINTS_PAR_RANG[rangReponse] ?? 1;
    const nouveauStreak = (streakActuel || 0) + 1;
    const bonusSerie = nouveauStreak >= 3 ? BONUS_SERIE : 0;
    const pointsGagnes = pointsBase + bonusSerie;
    return { pointsGagnes, nouveauStreak };
  }

  // Mauvaise reponse : malus, mais le score ne peut pas descendre sous SCORE_MINIMUM
  const pointsGagnes = -Math.min(MALUS_MAUVAISE_REPONSE, scoreActuel);
  return { pointsGagnes, nouveauStreak: 0 };
}

/**
 * obtenirClassement — Trie les joueurs par score decroissant et leur attribue un rang.
 * @param {Object} joueurs - Map des joueurs { socketId: { id, name, score, isHost, ... } }
 * @param {Object} scores - Map des scores { socketId: number }
 * @param {Object} streaks - Map des series { socketId: number }
 * @returns {Array<{ position: number, name: string, score: number, streak: number, isHost: boolean }>}
 */
function obtenirClassement(joueurs, scores, streaks) {
  return Object.values(joueurs)
    .sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0))
    .map((joueur, index) => ({
      position: index + 1,
      name: joueur.name,
      score: scores[joueur.id] || 0,
      streak: streaks ? (streaks[joueur.id] || 0) : 0,
      isHost: joueur.isHost || false,
    }));
}

/**
 * gererPartie — Machine a etats pour les transitions de statut de partie.
 * Etats valides : "ATTENTE" → "EN_COURS" → "TERMINEE"
 * @param {{ statut: string }} etatPartie - Objet contenant le statut actuel de la partie
 * @param {"DEMARRER"|"TERMINER"} action - L'action a effectuer
 * @returns {{ succes: boolean, statut: string, message: string }}
 */
function gererPartie(etatPartie, action) {
  const statut = etatPartie ? etatPartie.statut : null;

  if (action === "DEMARRER") {
    if (statut !== "ATTENTE") {
      return {
        succes: false,
        statut,
        message: `Impossible de demarrer : statut actuel "${statut}", attendu "ATTENTE"`,
      };
    }
    return { succes: true, statut: "EN_COURS", message: "Partie demarree" };
  }

  if (action === "TERMINER") {
    if (statut !== "EN_COURS") {
      return {
        succes: false,
        statut,
        message: `Impossible de terminer : statut actuel "${statut}", attendu "EN_COURS"`,
      };
    }
    return { succes: true, statut: "TERMINEE", message: "Partie terminee" };
  }

  return { succes: false, statut, message: `Action inconnue : "${action}"` };
}

module.exports = {
  POINTS_PAR_RANG,
  BONUS_SERIE,
  MALUS_MAUVAISE_REPONSE,
  SCORE_MINIMUM,
  calculerScore,
  obtenirClassement,
  gererPartie,
};
