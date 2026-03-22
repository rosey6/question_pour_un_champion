// ============================================
// MINUTEUR.JS — Compte à rebours animé côté client
// ============================================

import { jouerSon } from './sons.js';

/** Référence à l'intervalle courant */
let intervalMinuteur = null;

// ─── API publique ──────────────────────────────────────────────────────────────

/**
 * Démarre un compte à rebours client.
 * Met à jour l'affichage via mettreAJourAffichage() à chaque seconde.
 *
 * @param {number}   dureeMs      - Durée totale en millisecondes
 * @param {Function} [callbackFin] - Fonction appelée quand le compteur atteint 0
 */
export function demarrerMinuteur(dureeMs, callbackFin) {
  arreterMinuteur();

  let secondesRestantes = Math.floor(dureeMs / 1000);
  mettreAJourAffichage(secondesRestantes);

  intervalMinuteur = setInterval(() => {
    secondesRestantes--;
    mettreAJourAffichage(secondesRestantes);

    // Bip sur les 5 dernières secondes
    if (secondesRestantes > 0 && secondesRestantes <= 5) {
      jouerSon('tic');
    }

    if (secondesRestantes <= 0) {
      clearInterval(intervalMinuteur);
      intervalMinuteur = null;
      if (typeof callbackFin === 'function') {
        callbackFin();
      }
    }
  }, 1000);
}

/**
 * Arrête le compte à rebours en cours.
 */
export function arreterMinuteur() {
  if (intervalMinuteur !== null) {
    clearInterval(intervalMinuteur);
    intervalMinuteur = null;
  }
}

/**
 * Met à jour l'élément #timer-value et applique la classe
 * 'minuteur-urgent' (CSS) quand les secondes sont <= 5.
 * N'anime QUE transform et opacity via la classe CSS.
 *
 * @param {number} secondes - Secondes restantes à afficher
 */
export function mettreAJourAffichage(secondes) {
  const valeurEl    = document.getElementById('timer-value');
  const conteneurEl = document.getElementById('timer-container');

  if (valeurEl) {
    valeurEl.textContent = secondes > 0 ? secondes : 0;
  }

  if (conteneurEl) {
    if (secondes <= 5 && secondes > 0) {
      conteneurEl.classList.add('warning');
    } else {
      conteneurEl.classList.remove('warning');
    }
  }
}
