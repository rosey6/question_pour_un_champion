// ============================================
// logique/minuteur.js — Gestion des minuteurs serveur
// ============================================

"use strict";

// Map interne : codePartie → identifiant d'intervalle
const minuteursActifs = new Map();

/**
 * gererMinuteur — Demarre un minuteur cote serveur pour une partie.
 * Emet "tick-minuteur" via Socket.IO a chaque seconde avec { secondesRestantes }.
 * Appelle callbackFin() quand le compteur atteint 0.
 * Si un minuteur est deja actif pour ce code de partie, il est d'abord arrete.
 *
 * @param {import("socket.io").Server} io - Instance Socket.IO
 * @param {string} codePartie - Code unique de la partie (identifiant de la room)
 * @param {number} dureeSecondes - Duree totale du minuteur en secondes
 * @param {Function} callbackFin - Fonction appelee quand le temps est ecoule
 */
function gererMinuteur(io, codePartie, dureeSecondes, callbackFin) {
  // Stopper un eventuel minuteur precedent pour cette partie
  arreterMinuteur(codePartie);

  let secondesRestantes = dureeSecondes;

  // Emettre le premier tick immediatement
  io.to(codePartie).emit("tick-minuteur", { secondesRestantes });

  const intervalle = setInterval(() => {
    secondesRestantes -= 1;

    io.to(codePartie).emit("tick-minuteur", { secondesRestantes });

    if (secondesRestantes <= 0) {
      arreterMinuteur(codePartie);
      if (typeof callbackFin === "function") {
        callbackFin();
      }
    }
  }, 1000);

  minuteursActifs.set(codePartie, intervalle);
}

/**
 * arreterMinuteur — Arrete et supprime le minuteur associe a un code de partie.
 * Sans effet si aucun minuteur n'est actif pour ce code.
 *
 * @param {string} codePartie - Code unique de la partie
 */
function arreterMinuteur(codePartie) {
  if (minuteursActifs.has(codePartie)) {
    clearInterval(minuteursActifs.get(codePartie));
    minuteursActifs.delete(codePartie);
  }
}

module.exports = {
  gererMinuteur,
  arreterMinuteur,
};
