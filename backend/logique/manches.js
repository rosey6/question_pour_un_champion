"use strict";

// ============================================
// logique/manches.js — Machine d'etat des manches
// ============================================

const MANCHES = {
  ENTRAINEMENT:      "ENTRAINEMENT",
  NEUF_POINTS:       "NEUF_POINTS",
  QUATRE_A_LA_SUITE: "QUATRE_A_LA_SUITE",
  FACE_A_FACE:       "FACE_A_FACE",
  TERMINE:           "TERMINE",
};

const TITRES_MANCHES = {
  [MANCHES.ENTRAINEMENT]:      "Entraînement",
  [MANCHES.NEUF_POINTS]:       "Neuf points gagnants",
  [MANCHES.QUATRE_A_LA_SUITE]: "Quatre à la suite",
  [MANCHES.FACE_A_FACE]:       "Face-à-face",
  [MANCHES.TERMINE]:           "Partie terminée",
};

function idsJoueursReels(partie) {
  return Object.keys(partie.players || {}).filter((id) => {
    const joueur = partie.players[id];
    return joueur && !(partie.mode === "spectator" && joueur.isHost);
  });
}

function creerEtatManche(nom, numero, joueursActifs, objectif, extras = {}) {
  const manche = {
    nom,
    titre: TITRES_MANCHES[nom] || nom,
    numero,
    joueursActifs: [...joueursActifs],
    qualifies: [],
    elimines: [],
    scoresManche: {},
    streaksManche: {},
    objectif,
    ...extras,
  };

  joueursActifs.forEach((id) => {
    manche.scoresManche[id] = 0;
    manche.streaksManche[id] = 0;
  });

  return manche;
}

function initialiserManche(partie) {
  const joueurs = idsJoueursReels(partie);

  if (joueurs.length <= 1) {
    partie.manche = creerEtatManche(MANCHES.ENTRAINEMENT, 1, joueurs, null);
    return partie.manche;
  }

  if (joueurs.length <= 2) {
    partie.manche = creerEtatManche(MANCHES.FACE_A_FACE, 1, joueurs, 12);
    return partie.manche;
  }

  if (joueurs.length === 3) {
    partie.manche = creerEtatManche(MANCHES.QUATRE_A_LA_SUITE, 1, joueurs, 4);
    return partie.manche;
  }

  partie.manche = creerEtatManche(MANCHES.NEUF_POINTS, 1, joueurs, 9);
  return partie.manche;
}

/**
 * initialiserMancheDepuisNom — Crée un état de manche à partir d'un nom connu.
 * Utilisé quand le scénario impose une manche précise sans recalcul par joueurs.
 * @param {Object} partie
 * @param {string} nomManche - Constante MANCHES
 * @param {number} numeromanche - Numéro de manche (1, 2, 3...)
 */
function initialiserMancheDepuisNom(partie, nomManche, numeroManche) {
  const joueurs = idsJoueursReels(partie);
  switch (nomManche) {
    case MANCHES.ENTRAINEMENT:
      partie.manche = creerEtatManche(MANCHES.ENTRAINEMENT, numeroManche || 1, joueurs, null);
      break;
    case MANCHES.NEUF_POINTS:
      partie.manche = creerEtatManche(MANCHES.NEUF_POINTS, numeroManche || 1, joueurs, 9);
      break;
    case MANCHES.QUATRE_A_LA_SUITE:
      partie.manche = creerEtatManche(MANCHES.QUATRE_A_LA_SUITE, numeroManche || 1, joueurs, 4);
      break;
    case MANCHES.FACE_A_FACE:
      partie.manche = creerEtatManche(MANCHES.FACE_A_FACE, numeroManche || 1, joueurs, 12);
      break;
    default:
      partie.manche = creerEtatManche(MANCHES.NEUF_POINTS, numeroManche || 1, joueurs, 9);
  }
  return partie.manche;
}

function obtenirJoueursActifs(partie) {
  if (!partie?.manche || partie.manche.nom === MANCHES.TERMINE) {
    return idsJoueursReels(partie).map((id) => partie.players[id]).filter(Boolean);
  }

  return partie.manche.joueursActifs
    .map((id) => partie.players[id])
    .filter(Boolean);
}

function remplacerIdDansTableau(tableau, ancienId, nouveauId) {
  if (!Array.isArray(tableau) || !ancienId || !nouveauId || ancienId === nouveauId) {
    return tableau;
  }

  const remplaces = tableau.map((id) => (id === ancienId ? nouveauId : id));
  return [...new Set(remplaces)];
}

function remplacerCleDansMap(map, ancienId, nouveauId) {
  if (!map || !ancienId || !nouveauId || ancienId === nouveauId) return;
  if (!Object.prototype.hasOwnProperty.call(map, ancienId)) return;

  map[nouveauId] = map[ancienId];
  delete map[ancienId];
}

function remplacerIdJoueurManche(partie, ancienId, nouveauId) {
  const manche = partie?.manche;
  if (!manche || !ancienId || !nouveauId || ancienId === nouveauId) return;

  manche.joueursActifs = remplacerIdDansTableau(manche.joueursActifs, ancienId, nouveauId);
  manche.qualifies = remplacerIdDansTableau(manche.qualifies, ancienId, nouveauId);
  manche.elimines = remplacerIdDansTableau(manche.elimines, ancienId, nouveauId);
  remplacerCleDansMap(manche.scoresManche, ancienId, nouveauId);
  remplacerCleDansMap(manche.streaksManche, ancienId, nouveauId);

  if (manche.champion === ancienId) {
    manche.champion = nouveauId;
  }
}

function obtenirQualificationCible(partie, cibleTheorique) {
  const total = idsJoueursReels(partie).length;
  return Math.min(cibleTheorique, Math.max(1, total - 1));
}

function pointsQuestionNeufPoints(indexQuestion) {
  return [1, 2, 3][indexQuestion % 3];
}

function passerAQuatreALaSuite(partie) {
  const qualifies = partie.manche.qualifies.slice(0, 3);
  partie.manche = creerEtatManche(MANCHES.QUATRE_A_LA_SUITE, 2, qualifies, 4);
}

function passerAuFaceAFace(partie) {
  const finalistes = partie.manche.qualifies.slice(0, 2);
  partie.manche = creerEtatManche(MANCHES.FACE_A_FACE, 3, finalistes, 12);
}

function appliquerNeufPoints(partie, resultatsReponses) {
  const pointsQuestion = pointsQuestionNeufPoints(partie.currentQuestionIndex || 0);

  resultatsReponses.forEach((resultat) => {
    if (!resultat.isCorrect) return;

    const id = resultat.playerId;
    if (!partie.manche.joueursActifs.includes(id)) return;
    if (partie.manche.qualifies.includes(id)) return;

    partie.manche.scoresManche[id] = (partie.manche.scoresManche[id] || 0) + pointsQuestion;
    resultat.pointsManche = pointsQuestion;
    resultat.scoreManche = partie.manche.scoresManche[id];

    if (partie.manche.scoresManche[id] >= partie.manche.objectif) {
      partie.manche.qualifies.push(id);
      partie.manche.joueursActifs = partie.manche.joueursActifs.filter((joueurId) => joueurId !== id);
    }
  });

  if (partie.manche.qualifies.length >= obtenirQualificationCible(partie, 3)) {
    partie.manche.elimines.push(
      ...partie.manche.joueursActifs.filter((id) => !partie.manche.qualifies.includes(id))
    );
    passerAQuatreALaSuite(partie);
    return true;
  }

  return false;
}

function appliquerQuatreALaSuite(partie, resultatsReponses) {
  resultatsReponses.forEach((resultat) => {
    const id = resultat.playerId;
    if (!partie.manche.joueursActifs.includes(id)) return;
    if (partie.manche.qualifies.includes(id)) return;

    if (resultat.isCorrect) {
      partie.manche.streaksManche[id] = (partie.manche.streaksManche[id] || 0) + 1;
    } else {
      partie.manche.streaksManche[id] = 0;
    }

    partie.manche.scoresManche[id] = Math.max(
      partie.manche.scoresManche[id] || 0,
      partie.manche.streaksManche[id] || 0
    );
    resultat.streakManche = partie.manche.streaksManche[id];
    resultat.scoreManche = partie.manche.scoresManche[id];

    if (partie.manche.streaksManche[id] >= partie.manche.objectif) {
      partie.manche.qualifies.push(id);
      partie.manche.joueursActifs = partie.manche.joueursActifs.filter((joueurId) => joueurId !== id);
    }
  });

  if (partie.manche.qualifies.length >= obtenirQualificationCible(partie, 2)) {
    partie.manche.elimines.push(
      ...partie.manche.joueursActifs.filter((id) => !partie.manche.qualifies.includes(id))
    );
    passerAuFaceAFace(partie);
    return true;
  }

  return false;
}

function pointsFaceAFace(responseTimeMs) {
  const secondes = (responseTimeMs ?? 20000) / 1000;
  if (secondes <= 8) return 4;
  if (secondes <= 14) return 3;
  if (secondes <= 18) return 2;
  return 1;
}

function appliquerFaceAFace(partie, resultatsReponses) {
  resultatsReponses.forEach((resultat) => {
    if (!resultat.isCorrect) return;

    const id = resultat.playerId;
    if (!partie.manche.joueursActifs.includes(id)) return;

    const points = pointsFaceAFace(resultat.responseTimeMs);
    partie.manche.scoresManche[id] = (partie.manche.scoresManche[id] || 0) + points;
    resultat.pointsManche = points;
    resultat.scoreManche = partie.manche.scoresManche[id];

    if (partie.manche.scoresManche[id] >= partie.manche.objectif) {
      partie.manche.champion = id;
      partie.manche.nom = MANCHES.TERMINE;
      partie.manche.titre = TITRES_MANCHES[MANCHES.TERMINE];
    }
  });

  return partie.manche.nom === MANCHES.TERMINE;
}

function appliquerResultatsManche(partie, resultatsReponses) {
  if (!partie?.manche) return false;

  switch (partie.manche.nom) {
    case MANCHES.NEUF_POINTS:
      return appliquerNeufPoints(partie, resultatsReponses);
    case MANCHES.QUATRE_A_LA_SUITE:
      return appliquerQuatreALaSuite(partie, resultatsReponses);
    case MANCHES.FACE_A_FACE:
      return appliquerFaceAFace(partie, resultatsReponses);
    default:
      return false;
  }
}

module.exports = {
  MANCHES,
  TITRES_MANCHES,
  initialiserManche,
  initialiserMancheDepuisNom,
  obtenirJoueursActifs,
  remplacerIdJoueurManche,
  appliquerResultatsManche,
  pointsQuestionNeufPoints,
  pointsFaceAFace,
};
