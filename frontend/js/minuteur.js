// ============================================
// MINUTEUR.JS — Compte à rebours + escalade sonore
// ============================================

import { Sons } from './sons.js';

let _intervalle        = null;
let _secondesRestantes = 0;

// Fréquences des bips d'escalade (secondes restantes → Hz)
const FREQUENCES_TIC = { 5: 440, 4: 523, 3: 659, 2: 784 };

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Démarre un compte à rebours.
 * Joue des bips à fréquence croissante dans les 5 dernières secondes.
 * @param {number}   dureeSecondes - Durée en secondes
 * @param {Function} [callbackFin] - Appelé quand le compteur atteint 0
 */
export function demarrerMinuteur(dureeSecondes, callbackFin) {
  arreterMinuteur();
  _secondesRestantes = Math.floor(dureeSecondes);
  _mettreAJourAffichage(_secondesRestantes);

  _intervalle = setInterval(() => {
    _secondesRestantes--;
    _mettreAJourAffichage(_secondesRestantes);

    if (_secondesRestantes > 0 && _secondesRestantes <= 5) {
      if (_secondesRestantes === 1) {
        Sons.jouer('minuteurTic', { frequence: 880 });
        if (typeof navigator.vibrate === 'function') navigator.vibrate([300]);
      } else {
        Sons.jouer('minuteurTic', { frequence: FREQUENCES_TIC[_secondesRestantes] ?? 440 });
      }
    }

    if (_secondesRestantes <= 0) {
      clearInterval(_intervalle);
      _intervalle = null;
      Sons.jouer('tempsEcoule');
      if (typeof callbackFin === 'function') callbackFin();
    }
  }, 1000);
}

/**
 * Arrête le compte à rebours en cours.
 */
export function arreterMinuteur() {
  if (_intervalle !== null) {
    clearInterval(_intervalle);
    _intervalle = null;
  }
}

/**
 * Retourne le nombre de secondes restantes.
 * @returns {number}
 */
export function getSecondesRestantes() {
  return _secondesRestantes;
}

// ─── Utilitaire interne ───────────────────────────────────────────────────────

function _mettreAJourAffichage(secondes) {
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
