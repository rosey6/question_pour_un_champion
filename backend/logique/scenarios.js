"use strict";

// ============================================
// logique/scenarios.js — Choix du scénario de compétition
// ============================================
// Le scénario détermine le parcours complet d'une partie
// en fonction du mode de jeu et du nombre de joueurs.
// Il est distinct de la manche (étape interne du scénario).
// ============================================

const SCENARIOS = {
  ENTRAINEMENT:                    "ENTRAINEMENT",
  FACE_A_FACE_DIRECT:              "FACE_A_FACE_DIRECT",
  QUATRE_A_LA_SUITE_PUIS_FINALE:   "QUATRE_A_LA_SUITE_PUIS_FINALE",
  FORMAT_TV_COMPLET:               "FORMAT_TV_COMPLET",
};

const TITRES_SCENARIOS = {
  [SCENARIOS.ENTRAINEMENT]:                  "Entraînement solo",
  [SCENARIOS.FACE_A_FACE_DIRECT]:            "Face-à-face direct",
  [SCENARIOS.QUATRE_A_LA_SUITE_PUIS_FINALE]: "Quatre à la suite puis finale",
  [SCENARIOS.FORMAT_TV_COMPLET]:             "Format TV complet",
};

// Séquence de manches par scénario (ordre d'enchaînement)
const MANCHES_PAR_SCENARIO = {
  [SCENARIOS.ENTRAINEMENT]:                  ["ENTRAINEMENT"],
  [SCENARIOS.FACE_A_FACE_DIRECT]:            ["FACE_A_FACE"],
  [SCENARIOS.QUATRE_A_LA_SUITE_PUIS_FINALE]: ["QUATRE_A_LA_SUITE", "FACE_A_FACE"],
  [SCENARIOS.FORMAT_TV_COMPLET]:             ["NEUF_POINTS", "QUATRE_A_LA_SUITE", "FACE_A_FACE"],
};

/**
 * choisirScenario — Sélectionne le scénario automatiquement.
 * @param {string} mode - "classic" | "spectator"
 * @param {number} nombreJoueurs - Nombre de joueurs réels (hôte TV exclu)
 * @returns {string} Constante SCENARIOS
 */
function choisirScenario(mode, nombreJoueurs) {
  const n = Number(nombreJoueurs) || 1;
  if (n <= 1) return SCENARIOS.ENTRAINEMENT;
  if (n === 2) return SCENARIOS.FACE_A_FACE_DIRECT;
  if (n === 3) return SCENARIOS.QUATRE_A_LA_SUITE_PUIS_FINALE;
  return SCENARIOS.FORMAT_TV_COMPLET;
}

/**
 * getScenarioInitialManche — Retourne le nom de la première manche du scénario.
 * @param {string} scenario - Constante SCENARIOS
 * @returns {string} Nom de manche (ex: "NEUF_POINTS")
 */
function getScenarioInitialManche(scenario) {
  const manches = MANCHES_PAR_SCENARIO[scenario];
  return manches ? manches[0] : "NEUF_POINTS";
}

/**
 * getTitreScenario — Retourne le titre lisible du scénario.
 * @param {string} scenario - Constante SCENARIOS
 * @returns {string}
 */
function getTitreScenario(scenario) {
  return TITRES_SCENARIOS[scenario] || scenario;
}

module.exports = {
  SCENARIOS,
  TITRES_SCENARIOS,
  MANCHES_PAR_SCENARIO,
  choisirScenario,
  getScenarioInitialManche,
  getTitreScenario,
};
