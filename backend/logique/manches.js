"use strict";

// ============================================
// logique/manches.js — Machine d'état des manches
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

const THEMES_DISPONIBLES = [
  "Histoire",
  "Géographie",
  "Sciences",
  "Littérature",
  "Cinéma & Séries",
  "Sport",
  "Musique",
  "Art & Culture",
  "Gastronomie",
  "Thème mystère",
];

// ============================================
// UTILITAIRES
// ============================================

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

  // Champs spécifiques au buzzer (Neuf Points)
  if (nom === MANCHES.NEUF_POINTS) {
    manche.valeurQuestionActuelle = 1;
    manche.joueursBuzzes = {};
    manche.joueurExcluQuestion = null;
    manche.buzzOuvert = false;
  }

  // Champs spécifiques au passage individuel (Quatre à la Suite)
  if (nom === MANCHES.QUATRE_A_LA_SUITE) {
    manche.themesChoisis = {};
    manche.ordrePassage = [];
    manche.indexPassageActuel = 0;
    manche.joueurActif = null;
    manche.streakPassageActuel = 0;
    manche.scorePassage = {};
    manche.phaseChoixTheme = true;
    manche.themesRestants = [...THEMES_DISPONIBLES];
    manche.indexChoixActuel = 0;
  }

  // Champs spécifiques au Face à Face avec indices
  if (nom === MANCHES.FACE_A_FACE) {
    manche.mainActuelle = null;
    manche.indiceActuel = 0;
    manche.pointsIndice = [4, 3, 2, 1];
    manche.joueurExcluIndice = null;
    manche.questionSansReponse = false;
  }

  return manche;
}

function initialiserManche(partie) {
  const joueurs = idsJoueursReels(partie);

  if (joueurs.length <= 1) {
    partie.manche = creerEtatManche(MANCHES.ENTRAINEMENT, 1, joueurs, null);
    return partie.manche;
  }
  if (joueurs.length <= 2) {
    partie.manche = creerEtatManche(MANCHES.FACE_A_FACE, 1, joueurs, 5);
    const noms = joueurs.map((id) => partie.players[id]?.name).filter(Boolean);
    initialiserFaceAFace(partie.manche, noms, {});
    return partie.manche;
  }
  if (joueurs.length === 3) {
    partie.manche = creerEtatManche(MANCHES.QUATRE_A_LA_SUITE, 1, joueurs, 4);
    return partie.manche;
  }

  partie.manche = creerEtatManche(MANCHES.NEUF_POINTS, 1, joueurs, 9);
  return partie.manche;
}

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
      partie.manche = creerEtatManche(MANCHES.FACE_A_FACE, numeroManche || 1, joueurs, 5);
      { const noms = joueurs.map((id) => partie.players[id]?.name).filter(Boolean);
        initialiserFaceAFace(partie.manche, noms, {}); }
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
  return partie.manche.joueursActifs.map((id) => partie.players[id]).filter(Boolean);
}

function remplacerIdDansTableau(tableau, ancienId, nouveauId) {
  if (!Array.isArray(tableau) || !ancienId || !nouveauId || ancienId === nouveauId) return tableau;
  return [...new Set(tableau.map((id) => (id === ancienId ? nouveauId : id)))];
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
  manche.qualifies     = remplacerIdDansTableau(manche.qualifies,     ancienId, nouveauId);
  manche.elimines      = remplacerIdDansTableau(manche.elimines,      ancienId, nouveauId);
  remplacerCleDansMap(manche.scoresManche,  ancienId, nouveauId);
  remplacerCleDansMap(manche.streaksManche, ancienId, nouveauId);

  if (manche.champion === ancienId) manche.champion = nouveauId;

  // Champs spécifiques selon le type de manche
  if (manche.joueurExcluQuestion === ancienId) manche.joueurExcluQuestion = nouveauId;
  if (manche.mainActuelle         === ancienId) manche.mainActuelle        = nouveauId;
  if (manche.joueurExcluIndice    === ancienId) manche.joueurExcluIndice   = nouveauId;
  if (manche.joueurActif          === ancienId) manche.joueurActif         = nouveauId;

  if (manche.joueursBuzzes)   remplacerCleDansMap(manche.joueursBuzzes,   ancienId, nouveauId);
  if (manche.themesChoisis)   remplacerCleDansMap(manche.themesChoisis,   ancienId, nouveauId);
  if (manche.scorePassage)    remplacerCleDansMap(manche.scorePassage,    ancienId, nouveauId);

  if (Array.isArray(manche.ordrePassage)) {
    manche.ordrePassage = remplacerIdDansTableau(manche.ordrePassage, ancienId, nouveauId);
  }
}

function obtenirQualificationCible(partie, cibleTheorique) {
  const total = idsJoueursReels(partie).length;
  return Math.min(cibleTheorique, Math.max(1, total - 1));
}

// ============================================
// ANCIENNE LOGIQUE (mode classique — rétrocompatible)
// ============================================

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
    resultat.scoreManche  = partie.manche.scoresManche[id];

    if (partie.manche.scoresManche[id] >= partie.manche.objectif) {
      partie.manche.qualifies.push(id);
      partie.manche.joueursActifs = partie.manche.joueursActifs.filter((j) => j !== id);
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
    resultat.scoreManche  = partie.manche.scoresManche[id];

    if (partie.manche.streaksManche[id] >= partie.manche.objectif) {
      partie.manche.qualifies.push(id);
      partie.manche.joueursActifs = partie.manche.joueursActifs.filter((j) => j !== id);
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
  if (secondes <= 8)  return 4;
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
    resultat.scoreManche  = partie.manche.scoresManche[id];

    if (partie.manche.scoresManche[id] >= partie.manche.objectif) {
      partie.manche.champion = id;
      partie.manche.nom   = MANCHES.TERMINE;
      partie.manche.titre = TITRES_MANCHES[MANCHES.TERMINE];
    }
  });
  return partie.manche.nom === MANCHES.TERMINE;
}

function appliquerResultatsManche(partie, resultatsReponses) {
  if (!partie?.manche) return false;
  switch (partie.manche.nom) {
    case MANCHES.NEUF_POINTS:       return appliquerNeufPoints(partie, resultatsReponses);
    case MANCHES.QUATRE_A_LA_SUITE: return appliquerQuatreALaSuite(partie, resultatsReponses);
    case MANCHES.FACE_A_FACE:       return appliquerFaceAFace(partie, resultatsReponses);
    default: return false;
  }
}

// ============================================
// MANCHE 1 — NEUF POINTS / BUZZER (nouveau)
// ============================================

// Avance le cycle 1→2→3 et retourne la valeur AVANT l'avance
function prochaineCyclePts(manche) {
  const cycle = [1, 2, 3];
  const actuel = manche.valeurQuestionActuelle;
  const idx = cycle.indexOf(actuel);
  manche.valeurQuestionActuelle = cycle[(idx + 1) % 3];
  return actuel;
}

// Ajuste le cycle selon le nombre de joueurs restants
function ajusterCyclePtsSelon(nbJoueursRestants, manche) {
  if (nbJoueursRestants === 2) {
    manche.valeurQuestionActuelle = 3;
  } else if (nbJoueursRestants === 3 && manche.valeurQuestionActuelle === 1) {
    manche.valeurQuestionActuelle = 2;
  }
}

function gererBuzzer(manche, pseudo, timestamp) {
  if (!manche.buzzOuvert)                        return { succes: false, raison: "buzz_ferme" };
  if (manche.joueurExcluQuestion === pseudo)      return { succes: false, raison: "exclu" };
  if (manche.joueursBuzzes[pseudo])               return { succes: false, raison: "deja_buzze" };
  if (!manche.joueursActifs.includes(pseudo))     return { succes: false, raison: "pas_actif" };

  manche.joueursBuzzes[pseudo] = timestamp;
  const nbBuzzes = Object.keys(manche.joueursBuzzes).length;

  if (nbBuzzes === 1) {
    manche.buzzOuvert = false; // fermer pour les autres
    return { succes: true, gagne: true, pseudo };
  }
  return { succes: true, gagne: false };
}

function gererReponseApressBuzz(manche, pseudo, reponse, bonneReponse) {
  if (reponse === bonneReponse) {
    manche.scoresManche[pseudo] = (manche.scoresManche[pseudo] || 0) + 1;
    reinitialiserBuzzQuestion(manche);
    return { correct: true, points: 1 };
  }
  // Mauvaise réponse → exclure ce joueur, rouvrir le buzzer
  manche.joueurExcluQuestion = pseudo;
  manche.joueursBuzzes = {};
  manche.buzzOuvert = true;
  return { correct: false, buzzReouvre: true };
}

function reinitialiserBuzzQuestion(manche) {
  manche.joueursBuzzes       = {};
  manche.joueurExcluQuestion = null;
  manche.buzzOuvert          = true;
}

// ============================================
// MANCHE 2 — QUATRE À LA SUITE INDIVIDUEL (nouveau)
// ============================================

function initialiserChoixThemes(manche, ordreQualification) {
  manche.ordrePassage      = [...ordreQualification];
  manche.themesRestants    = [...THEMES_DISPONIBLES].slice(0, 5);
  manche.phaseChoixTheme   = true;
  manche.indexChoixActuel  = 0;
  return manche.ordrePassage[0];
}

function enregistrerChoixTheme(manche, pseudo, theme) {
  const joueurAttendu = manche.ordrePassage[manche.indexChoixActuel];
  if (pseudo !== joueurAttendu)               return { succes: false, raison: "pas_ton_tour" };
  if (!manche.themesRestants.includes(theme)) return { succes: false, raison: "theme_indisponible" };

  manche.themesChoisis[pseudo] = theme;
  manche.themesRestants = manche.themesRestants.filter((t) => t !== theme);
  manche.indexChoixActuel++;

  const tousOntChoisi = manche.indexChoixActuel >= manche.ordrePassage.length;
  if (tousOntChoisi) manche.phaseChoixTheme = false;

  return {
    succes: true,
    prochainJoueur: tousOntChoisi ? null : manche.ordrePassage[manche.indexChoixActuel],
  };
}

function demarrerPassageJoueur(manche) {
  const pseudo = manche.ordrePassage[manche.indexPassageActuel];
  manche.joueurActif          = pseudo;
  manche.streakPassageActuel  = 0;
  manche.scorePassage[pseudo] = 0;
  return { pseudo, theme: manche.themesChoisis[pseudo] };
}

function gererReponsePassage(manche, reponse, bonneReponse) {
  const pseudo = manche.joueurActif;
  if (reponse === bonneReponse) {
    manche.streakPassageActuel++;
    manche.scorePassage[pseudo] = manche.streakPassageActuel;
    const quatreASuite = manche.streakPassageActuel >= 4;
    return { correct: true, streak: manche.streakPassageActuel, quatreASuite };
  }
  manche.streakPassageActuel = 0;
  return { correct: false, streak: 0 };
}

function terminerPassageJoueur(manche) {
  const pseudo = manche.joueurActif;
  const score  = manche.scorePassage[pseudo] || 0;
  manche.indexPassageActuel++;

  const tousOntJoue = manche.indexPassageActuel >= manche.ordrePassage.length;
  return {
    pseudo,
    score,
    quatreASuite:  score >= 4,
    tousOntJoue,
    prochainJoueur: tousOntJoue ? null : manche.ordrePassage[manche.indexPassageActuel],
  };
}

function determinerQualifiesQuatreASuite(manche) {
  const classes = Object.entries(manche.scorePassage).sort(([, a], [, b]) => b - a);

  if (classes.length >= 3 && classes[1][1] === classes[2][1]) {
    return { egalite: true, candidatsEgalite: [classes[1][0], classes[2][0]] };
  }
  return {
    egalite:  false,
    qualifies: [classes[0]?.[0], classes[1]?.[0]].filter(Boolean),
    elimine:  classes[2]?.[0] || null,
  };
}

// ============================================
// MANCHE 3 — FACE À FACE AVEC INDICES (nouveau)
// ============================================

// scores = { pseudo: scoreDu4àLS } pour déterminer qui a la main en premier
function initialiserFaceAFace(manche, qualifies, scores) {
  const scoremap = scores || {};
  manche.mainActuelle = qualifies.slice().sort(
    (a, b) => (scoremap[b] || 0) - (scoremap[a] || 0)
  )[0];
  manche.indiceActuel     = 0;
  manche.joueurExcluIndice = null;
  return manche.mainActuelle;
}

// Retourne les données de l'indice courant (null si tous épuisés)
function revelerIndice(manche, question) {
  const i       = manche.indiceActuel;
  const indices = question.indices || question._indices;
  if (!indices || i >= indices.length) return null;

  return {
    numero:      i + 1,
    texte:       indices[i],
    points:      1,
    joueurActif: manche.mainActuelle,
  };
}

// choix = 'garder' | 'passer'
function gererChoixMain(manche, pseudo, choix) {
  if (pseudo !== manche.mainActuelle) return { succes: false };

  if (choix === "passer") {
    const adversaire = manche.joueursActifs.find((j) => j !== pseudo);
    manche.mainActuelle = adversaire;
    manche.indiceActuel++;
    return { succes: true, nouvelleMain: adversaire };
  }
  return { succes: true, rester: true };
}

function gererReponseFaceAFace(manche, pseudo, reponse, bonneReponse) {
  if (pseudo !== manche.mainActuelle) return { ignore: true };

  if (reponse === bonneReponse) {
    const pts = 1;
    manche.scoresManche[pseudo] = (manche.scoresManche[pseudo] || 0) + pts;
    // La main reste au gagnant; on réinitialise pour la question suivante
    manche.indiceActuel      = 0;
    manche.joueurExcluIndice = null;

    const champion = manche.scoresManche[pseudo] >= manche.objectif;
    if (champion) {
      manche.champion = pseudo;
      manche.nom      = MANCHES.TERMINE;
      manche.titre    = TITRES_MANCHES[MANCHES.TERMINE];
    }
    return { correct: true, points: pts, mainChange: false, champion };
  }

  // Mauvaise réponse → main change + indice suivant
  manche.joueurExcluIndice = pseudo;
  manche.indiceActuel++;

  if (manche.indiceActuel >= 4) {
    manche.indiceActuel      = 0;
    manche.joueurExcluIndice = null;
    return { correct: false, tousIndicesEpuises: true };
  }

  const adversaire = manche.joueursActifs.find((j) => j !== pseudo);
  manche.mainActuelle = adversaire;
  return {
    correct:      false,
    mainChange:   true,
    nouvelleMain: adversaire,
    nouvelIndice: manche.indiceActuel,
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  MANCHES,
  TITRES_MANCHES,
  THEMES_DISPONIBLES,

  // Création / initialisation
  creerEtatManche,
  initialiserManche,
  initialiserMancheDepuisNom,

  // Lecture d'état
  obtenirJoueursActifs,
  remplacerIdJoueurManche,

  // Logique classique (rétrocompatible)
  appliquerResultatsManche,
  pointsQuestionNeufPoints,
  pointsFaceAFace,

  // Manche 1 — Buzzer
  gererBuzzer,
  gererReponseApressBuzz,
  reinitialiserBuzzQuestion,
  prochaineCyclePts,
  ajusterCyclePtsSelon,

  // Manche 2 — Quatre à la Suite individuel
  initialiserChoixThemes,
  enregistrerChoixTheme,
  demarrerPassageJoueur,
  gererReponsePassage,
  terminerPassageJoueur,
  determinerQualifiesQuatreASuite,

  // Manche 3 — Face à Face avec indices
  initialiserFaceAFace,
  revelerIndice,
  gererChoixMain,
  gererReponseFaceAFace,
};
