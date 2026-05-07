"use strict";

const {
  MANCHES,
  creerEtatManche,
  // Buzzer
  gererBuzzer,
  gererReponseApressBuzz,
  reinitialiserBuzzQuestion,
  prochaineCyclePts,
  ajusterCyclePtsSelon,
  // Quatre à la Suite
  initialiserChoixThemes,
  enregistrerChoixTheme,
  demarrerPassageJoueur,
  gererReponsePassage,
  terminerPassageJoueur,
  determinerQualifiesQuatreASuite,
  // Face à Face
  initialiserFaceAFace,
  revelerIndice,
  gererChoixMain,
  gererReponseFaceAFace,
} = require("../logique/manches.js");

// ─── helpers ──────────────────────────────────────────────────────────────────

function mancheNeufPoints(pseudos) {
  const m = creerEtatManche(MANCHES.NEUF_POINTS, 1, pseudos, 9);
  reinitialiserBuzzQuestion(m); // ouvrir le buzzer
  return m;
}

function mancheQuatreASuite(pseudos) {
  return creerEtatManche(MANCHES.QUATRE_A_LA_SUITE, 2, pseudos, 4);
}

function mancheFaceAFace(pseudos) {
  return creerEtatManche(MANCHES.FACE_A_FACE, 3, pseudos, 12);
}

function questionAvecIndices(question = "Q?", bonneReponse = "Paris") {
  return {
    question,
    options:         [bonneReponse, "Lyon", "Nice", "Bordeaux"],
    reponseCorrecte: bonneReponse,
    indices: [
      "Je suis dans l'Hexagone",
      "Je suis au bord d'un fleuve célèbre",
      "Ma tour la plus célèbre date de 1889",
      "Je suis la capitale de la France",
    ],
  };
}

// ─── Buzzer — Neuf Points ──────────────────────────────────────────────────────

describe("Buzzer — Manche Neuf Points", () => {
  test("premier buzz gagne la main", () => {
    const m = mancheNeufPoints(["alice", "bob"]);
    const res = gererBuzzer(m, "alice", 1000);
    expect(res.succes).toBe(true);
    expect(res.gagne).toBe(true);
    expect(res.pseudo).toBe("alice");
    expect(m.buzzOuvert).toBe(false);
  });

  test("deuxième buzz sur la même question est refusé", () => {
    const m = mancheNeufPoints(["alice", "bob"]);
    gererBuzzer(m, "alice", 1000); // alice gagne
    const res = gererBuzzer(m, "bob", 1100);
    expect(res.succes).toBe(false);
    expect(res.raison).toBe("buzz_ferme");
  });

  test("buzz fermé → refus avec raison buzz_ferme", () => {
    const m = mancheNeufPoints(["alice", "bob"]);
    m.buzzOuvert = false;
    const res = gererBuzzer(m, "alice", 1000);
    expect(res.succes).toBe(false);
    expect(res.raison).toBe("buzz_ferme");
  });

  test("joueur exclu ne peut pas buzzer", () => {
    const m = mancheNeufPoints(["alice", "bob"]);
    m.joueurExcluQuestion = "alice";
    const res = gererBuzzer(m, "alice", 1000);
    expect(res.succes).toBe(false);
    expect(res.raison).toBe("exclu");
  });

  test("joueur inactif ne peut pas buzzer", () => {
    const m = mancheNeufPoints(["alice", "bob"]);
    const res = gererBuzzer(m, "charlie", 1000);
    expect(res.succes).toBe(false);
    expect(res.raison).toBe("pas_actif");
  });

  test("mauvaise réponse rouvre le buzzer et exclut le joueur", () => {
    const m = mancheNeufPoints(["alice", "bob"]);
    gererBuzzer(m, "alice", 1000);
    const res = gererReponseApressBuzz(m, "alice", "Lyon", "Paris");
    expect(res.correct).toBe(false);
    expect(res.buzzReouvre).toBe(true);
    expect(m.buzzOuvert).toBe(true);
    expect(m.joueurExcluQuestion).toBe("alice");
  });

  test("bonne réponse donne les points du cycle et réinitialise le buzzer", () => {
    const m = mancheNeufPoints(["alice", "bob"]);
    gererBuzzer(m, "alice", 1000);
    const res = gererReponseApressBuzz(m, "alice", "Paris", "Paris");
    expect(res.correct).toBe(true);
    expect(res.points).toBe(1); // premier cycle = 1 pt
    expect(m.scoresManche.alice).toBe(1);
    expect(m.buzzOuvert).toBe(true); // rouvert pour la prochaine question
  });

  test("cycle de points 1 → 2 → 3 → 1", () => {
    const m = mancheNeufPoints(["alice"]);
    expect(prochaineCyclePts(m)).toBe(1);
    expect(prochaineCyclePts(m)).toBe(2);
    expect(prochaineCyclePts(m)).toBe(3);
    expect(prochaineCyclePts(m)).toBe(1); // cycle
  });

  test("ajustement cycle à 3 pts fixes quand 2 joueurs restants", () => {
    const m = mancheNeufPoints(["alice", "bob"]);
    m.valeurQuestionActuelle = 2;
    ajusterCyclePtsSelon(2, m);
    expect(m.valeurQuestionActuelle).toBe(3);
  });

  test("ajustement cycle : sauter la valeur 1 quand 3 joueurs restants", () => {
    const m = mancheNeufPoints(["a", "b", "c"]);
    m.valeurQuestionActuelle = 1;
    ajusterCyclePtsSelon(3, m);
    expect(m.valeurQuestionActuelle).toBe(2);
  });
});

// ─── Quatre à la Suite — Passage individuel ───────────────────────────────────

describe("Quatre à la Suite — Passage individuel", () => {
  test("initialiserChoixThemes retourne le premier joueur et fixe l'ordre", () => {
    const m = mancheQuatreASuite(["alice", "bob", "charlie"]);
    const premier = initialiserChoixThemes(m, ["alice", "bob", "charlie"]);
    expect(premier).toBe("alice");
    expect(m.ordrePassage).toEqual(["alice", "bob", "charlie"]);
    expect(m.themesRestants).toHaveLength(5);
  });

  test("choix de thème dans le bon ordre", () => {
    const m = mancheQuatreASuite(["alice", "bob"]);
    initialiserChoixThemes(m, ["alice", "bob"]);
    const theme0 = m.themesRestants[0];

    const res1 = enregistrerChoixTheme(m, "alice", theme0);
    expect(res1.succes).toBe(true);
    expect(res1.prochainJoueur).toBe("bob");
    expect(m.themesChoisis.alice).toBe(theme0);

    const theme1 = m.themesRestants[0];
    const res2 = enregistrerChoixTheme(m, "bob", theme1);
    expect(res2.succes).toBe(true);
    expect(res2.prochainJoueur).toBeNull();
    expect(m.phaseChoixTheme).toBe(false);
  });

  test("choisir hors tour est refusé", () => {
    const m = mancheQuatreASuite(["alice", "bob"]);
    initialiserChoixThemes(m, ["alice", "bob"]);
    const res = enregistrerChoixTheme(m, "bob", m.themesRestants[0]);
    expect(res.succes).toBe(false);
    expect(res.raison).toBe("pas_ton_tour");
  });

  test("choisir un thème indisponible est refusé", () => {
    const m = mancheQuatreASuite(["alice", "bob"]);
    initialiserChoixThemes(m, ["alice", "bob"]);
    const res = enregistrerChoixTheme(m, "alice", "Thème inexistant");
    expect(res.succes).toBe(false);
    expect(res.raison).toBe("theme_indisponible");
  });

  test("streak reset à 0 après mauvaise réponse", () => {
    const m = mancheQuatreASuite(["alice"]);
    initialiserChoixThemes(m, ["alice"]);
    demarrerPassageJoueur(m);
    gererReponsePassage(m, "Paris",  "Paris");  // streak 1
    gererReponsePassage(m, "Paris",  "Paris");  // streak 2
    const res = gererReponsePassage(m, "Lyon", "Paris"); // mauvaise
    expect(res.correct).toBe(false);
    expect(res.streak).toBe(0);
    expect(m.streakPassageActuel).toBe(0);
  });

  test("le score garde le meilleur streak atteint (avant l'erreur)", () => {
    const m = mancheQuatreASuite(["alice"]);
    initialiserChoixThemes(m, ["alice"]);
    demarrerPassageJoueur(m);
    gererReponsePassage(m, "Paris", "Paris"); // streak 1
    gererReponsePassage(m, "Paris", "Paris"); // streak 2
    gererReponsePassage(m, "Paris", "Paris"); // streak 3
    gererReponsePassage(m, "Lyon",  "Paris"); // erreur → streak 0 mais score = 3
    expect(m.scorePassage.alice).toBe(3);
  });

  test("quatreASuite détecté quand streak atteint 4", () => {
    const m = mancheQuatreASuite(["alice"]);
    initialiserChoixThemes(m, ["alice"]);
    demarrerPassageJoueur(m);
    for (let i = 0; i < 3; i++) gererReponsePassage(m, "Paris", "Paris");
    const res = gererReponsePassage(m, "Paris", "Paris"); // 4e
    expect(res.quatreASuite).toBe(true);
  });

  test("terminerPassageJoueur indique tousOntJoue correctement", () => {
    const m = mancheQuatreASuite(["alice", "bob"]);
    initialiserChoixThemes(m, ["alice", "bob"]);
    demarrerPassageJoueur(m);
    const r1 = terminerPassageJoueur(m);
    expect(r1.tousOntJoue).toBe(false);
    expect(r1.prochainJoueur).toBe("bob");

    demarrerPassageJoueur(m);
    const r2 = terminerPassageJoueur(m);
    expect(r2.tousOntJoue).toBe(true);
    expect(r2.prochainJoueur).toBeNull();
  });

  test("égalité détectée quand 2 joueurs partagent le 2e rang", () => {
    const m = mancheQuatreASuite(["alice", "bob", "charlie"]);
    m.scorePassage = { alice: 4, bob: 2, charlie: 2 };
    const res = determinerQualifiesQuatreASuite(m);
    expect(res.egalite).toBe(true);
    expect(res.candidatsEgalite).toEqual(["bob", "charlie"]);
  });

  test("sans égalité : 2 qualifiés et 1 éliminé", () => {
    const m = mancheQuatreASuite(["alice", "bob", "charlie"]);
    m.scorePassage = { alice: 4, bob: 3, charlie: 1 };
    const res = determinerQualifiesQuatreASuite(m);
    expect(res.egalite).toBe(false);
    expect(res.qualifies).toEqual(["alice", "bob"]);
    expect(res.elimine).toBe("charlie");
  });
});

// ─── Face à Face — Indices et la main ─────────────────────────────────────────

describe("Face à Face — Indices et la main", () => {
  test("main attribuée au mieux classé du 4àLS", () => {
    const m = mancheFaceAFace(["alice", "bob"]);
    initialiserFaceAFace(m, ["alice", "bob"], { alice: 4, bob: 2 });
    expect(m.mainActuelle).toBe("alice");
  });

  test("indice 1 vaut 4 pts, indice 4 vaut 1 pt", () => {
    const m = mancheFaceAFace(["alice", "bob"]);
    initialiserFaceAFace(m, ["alice", "bob"], {});
    m.mainActuelle = "alice";
    const q = questionAvecIndices();

    const i1 = revelerIndice(m, q);
    expect(i1.numero).toBe(1);
    expect(i1.points).toBe(4);

    m.indiceActuel = 3;
    const i4 = revelerIndice(m, q);
    expect(i4.numero).toBe(4);
    expect(i4.points).toBe(1);
  });

  test("passer main → main change et indice suivant", () => {
    const m = mancheFaceAFace(["alice", "bob"]);
    initialiserFaceAFace(m, ["alice", "bob"], {});
    m.mainActuelle = "alice";
    const res = gererChoixMain(m, "alice", "passer");
    expect(res.succes).toBe(true);
    expect(res.nouvelleMain).toBe("bob");
    expect(m.indiceActuel).toBe(1);
  });

  test("passer main par le mauvais joueur est refusé", () => {
    const m = mancheFaceAFace(["alice", "bob"]);
    m.mainActuelle = "alice";
    const res = gererChoixMain(m, "bob", "passer");
    expect(res.succes).toBe(false);
  });

  test("mauvaise réponse → main change et indice suivant révélé", () => {
    const m = mancheFaceAFace(["alice", "bob"]);
    initialiserFaceAFace(m, ["alice", "bob"], {});
    m.mainActuelle = "alice";
    const res = gererReponseFaceAFace(m, "alice", "Lyon", "Paris");
    expect(res.correct).toBe(false);
    expect(res.mainChange).toBe(true);
    expect(res.nouvelleMain).toBe("bob");
    expect(res.nouvelIndice).toBe(1);
    expect(m.mainActuelle).toBe("bob");
  });

  test("bonne réponse → score mis à jour, main conservée", () => {
    const m = mancheFaceAFace(["alice", "bob"]);
    initialiserFaceAFace(m, ["alice", "bob"], {});
    m.mainActuelle = "alice";
    const res = gererReponseFaceAFace(m, "alice", "Paris", "Paris");
    expect(res.correct).toBe(true);
    expect(res.points).toBe(4); // indice 1 = 4 pts
    expect(m.scoresManche.alice).toBe(4);
    expect(m.mainActuelle).toBe("alice"); // main conservée
    expect(m.indiceActuel).toBe(0);        // réinitialisé pour prochaine question
  });

  test("4 indices épuisés → tousIndicesEpuises, 0 point, indice reset", () => {
    const m = mancheFaceAFace(["alice", "bob"]);
    initialiserFaceAFace(m, ["alice", "bob"], {});
    m.mainActuelle  = "alice";
    m.indiceActuel  = 3;
    const res = gererReponseFaceAFace(m, "alice", "Lyon", "Paris");
    expect(res.correct).toBe(false);
    expect(res.tousIndicesEpuises).toBe(true);
    expect(m.indiceActuel).toBe(0);
  });

  test("objectif 12 pts atteint → champion désigné, manche TERMINE", () => {
    const m = mancheFaceAFace(["alice", "bob"]);
    initialiserFaceAFace(m, ["alice", "bob"], {});
    m.mainActuelle            = "alice";
    m.scoresManche.alice      = 8;
    const res = gererReponseFaceAFace(m, "alice", "Paris", "Paris");
    expect(res.correct).toBe(true);
    expect(res.champion).toBe(true);
    expect(m.champion).toBe("alice");
    expect(m.nom).toBe(MANCHES.TERMINE);
  });

  test("réponse ignorée si le joueur n'a pas la main", () => {
    const m = mancheFaceAFace(["alice", "bob"]);
    m.mainActuelle = "alice";
    const res = gererReponseFaceAFace(m, "bob", "Paris", "Paris");
    expect(res.ignore).toBe(true);
  });
});
