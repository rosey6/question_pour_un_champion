// ============================================
// ETAT.JS — État réactif global (source de vérité unique)
// ============================================

/** État central du jeu partagé entre tous les modules */
export const etat = {
  idPartie: null,
  pseudo: null,
  estHote: false,
  mode: 'spectator',
  scores: {},
  streaks: {},
  aRepondu: false,
  questionActuelle: null,
  totalJoueurs: 0,
  joueursAyantRepondu: 0,
  joueurs: [],
  indexQuestionCourante: 0,
  totalQuestions: 10,
  streakActuel: 0,
  donneesPartie: null,

  // === Buzzer (Neuf Points) ===
  buzzOuvert: false,
  jAiBuze: false,
  jAiLaMain: false,
  joueurAvecLaMain: null,

  // === Quatre à la Suite ===
  phaseChoixTheme: false,
  monTheme: null,
  themesRestants: [],
  joueurActifPassage: null,
  jePasseEnCeMoment: false,
  streakPassage: 0,

  // === Face à Face ===
  jAiLaMainFaceAFace: false,
  indiceActuel: null,
  niveauIndice: 0,
  pointsDisponibles: 4,
};

/**
 * Met à jour une clé de l'état global.
 * @param {string} cle - Nom de la propriété à modifier
 * @param {*} valeur - Nouvelle valeur
 */
export function mettreAJourEtat(cle, valeur) {
  if (!(cle in etat)) {
    console.warn(`[etat] Clé inconnue : "${cle}"`);
  }
  etat[cle] = valeur;
}

/**
 * Réinitialise toutes les valeurs mutable de l'état
 * (conserve idPartie et pseudo pour la reconnexion).
 */
export function reinitialiserEtat() {
  etat.scores = {};
  etat.streaks = {};
  etat.aRepondu = false;
  etat.questionActuelle = null;
  etat.totalJoueurs = 0;
  etat.joueursAyantRepondu = 0;
  etat.joueurs = [];
  etat.indexQuestionCourante = 0;
  etat.streakActuel = 0;
  // Buzzer
  etat.buzzOuvert        = false;
  etat.jAiBuze           = false;
  etat.jAiLaMain         = false;
  etat.joueurAvecLaMain  = null;
  // Quatre à la Suite
  etat.phaseChoixTheme      = false;
  etat.monTheme             = null;
  etat.themesRestants       = [];
  etat.joueurActifPassage   = null;
  etat.jePasseEnCeMoment    = false;
  etat.streakPassage        = 0;
  // Face à Face
  etat.jAiLaMainFaceAFace = false;
  etat.indiceActuel        = null;
  etat.niveauIndice        = 0;
  etat.pointsDisponibles   = 4;
}

// ─── Persistance sessionStorage ───────────────────────────────────────────────

/**
 * Sauvegarde idPartie et pseudo dans sessionStorage.
 * Appelé après une connexion réussie.
 */
export function sauvegarderSession() {
  if (etat.idPartie) {
    sessionStorage.setItem('idPartie', etat.idPartie);
  }
  if (etat.pseudo) {
    sessionStorage.setItem('pseudo', etat.pseudo);
  }
}

/**
 * Restaure idPartie et pseudo depuis sessionStorage au chargement.
 * Alimente aussi donneesPartie depuis la clé legacy multiGameData.
 */
export function restaurerSession() {
  // Lecture directe des clés du nouveau système
  const idPartie = sessionStorage.getItem('idPartie');
  const pseudo   = sessionStorage.getItem('pseudo');

  if (idPartie) etat.idPartie = idPartie;
  if (pseudo)   etat.pseudo   = pseudo;

  // Compatibilité avec l'ancienne clé multiGameData.
  const donneesBrutes = sessionStorage.getItem('multiGameData');
  if (donneesBrutes) {
    try {
      const donnees = JSON.parse(donneesBrutes);
      etat.donneesPartie = donnees;

      // Hydrate l'état depuis les données legacy si les nouvelles clés sont absentes
      if (!etat.idPartie && donnees.gameCode)   etat.idPartie = donnees.gameCode;
      if (!etat.pseudo   && donnees.playerName) etat.pseudo   = donnees.playerName;
      if (!etat.pseudo   && donnees.hostName)   etat.pseudo   = donnees.hostName;

      etat.estHote          = donnees.isHost   || false;
      etat.mode             = donnees.mode      || 'spectator';
      etat.joueurs          = donnees.players   || [];
      etat.totalQuestions   = donnees.settings?.questionsCount || 10;
    } catch (erreur) {
      console.error('[etat] Impossible de lire multiGameData :', erreur);
    }
  }
}
