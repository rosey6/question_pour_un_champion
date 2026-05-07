"use strict";

const {
  MANCHES,
  initialiserManche,
  obtenirJoueursActifs,
  remplacerIdJoueurManche,
  appliquerResultatsManche,
  pointsQuestionNeufPoints,
  pointsFaceAFace,
} = require("../logique/manches.js");

function creerPartie(ids, mode = "classic") {
  const players = {};
  ids.forEach((id) => {
    players[id] = { id, name: id, isHost: false };
  });
  return {
    mode,
    players,
    currentQuestionIndex: 0,
  };
}

function bonne(playerId, responseTimeMs = 3000) {
  return { playerId, playerName: playerId, isCorrect: true, responseTimeMs };
}

function mauvaise(playerId) {
  return { playerId, playerName: playerId, isCorrect: false, responseTimeMs: 5000 };
}

describe("manches", () => {
  it("initialise la manche 1 avec 4 joueurs reels", () => {
    const partie = creerPartie(["a", "b", "c", "d"]);
    initialiserManche(partie);

    expect(partie.manche.nom).toBe(MANCHES.NEUF_POINTS);
    expect(partie.manche.numero).toBe(1);
    expect(partie.manche.objectif).toBe(9);
    expect(obtenirJoueursActifs(partie).map((j) => j.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("ignore l'hote spectateur dans les joueurs actifs", () => {
    const partie = creerPartie(["host", "a", "b"], "spectator");
    partie.players.host.isHost = true;
    initialiserManche(partie);

    expect(partie.manche.nom).toBe(MANCHES.FACE_A_FACE);
    expect(partie.manche.joueursActifs).toEqual(["a", "b"]);
  });

  it("calcule le cycle 1, 2, 3 points de la manche neuf points", () => {
    expect(pointsQuestionNeufPoints(0)).toBe(1);
    expect(pointsQuestionNeufPoints(1)).toBe(2);
    expect(pointsQuestionNeufPoints(2)).toBe(3);
    expect(pointsQuestionNeufPoints(3)).toBe(1);
  });

  it("passe de neuf points a quatre a la suite quand 3 joueurs sont qualifies", () => {
    const partie = creerPartie(["a", "b", "c", "d"]);
    initialiserManche(partie);
    partie.manche.scoresManche = { a: 8, b: 8, c: 8, d: 0 };
    partie.currentQuestionIndex = 0;

    const changee = appliquerResultatsManche(partie, [bonne("a"), bonne("b"), bonne("c")]);

    expect(changee).toBe(true);
    expect(partie.manche.nom).toBe(MANCHES.QUATRE_A_LA_SUITE);
    expect(partie.manche.joueursActifs).toEqual(["a", "b", "c"]);
  });

  it("passe de quatre a la suite au face-a-face avec deux qualifies", () => {
    const partie = creerPartie(["a", "b", "c"]);
    initialiserManche(partie);
    partie.manche.streaksManche = { a: 3, b: 3, c: 0 };
    partie.manche.scoresManche = { a: 3, b: 3, c: 0 };

    const changee = appliquerResultatsManche(partie, [bonne("a"), bonne("b"), mauvaise("c")]);

    expect(changee).toBe(true);
    expect(partie.manche.nom).toBe(MANCHES.FACE_A_FACE);
    expect(partie.manche.joueursActifs).toEqual(["a", "b"]);
  });

  it("marque le champion en face-a-face au seuil de 12 points", () => {
    const partie = creerPartie(["a", "b"]);
    initialiserManche(partie);
    partie.manche.scoresManche = { a: 8, b: 0 };

    const terminee = appliquerResultatsManche(partie, [bonne("a", 7000)]);

    expect(terminee).toBe(true);
    expect(partie.manche.nom).toBe(MANCHES.TERMINE);
    expect(partie.manche.champion).toBe("a");
  });

  it("remplace l'id socket d'un joueur reconnecte dans tout l'etat de manche", () => {
    const partie = creerPartie(["old", "b"]);
    initialiserManche(partie);
    partie.manche.qualifies = ["old"];
    partie.manche.elimines = ["b", "old"];
    partie.manche.scoresManche = { old: 8, b: 0 };
    partie.manche.streaksManche = { old: 3, b: 0 };
    partie.manche.champion = "old";

    remplacerIdJoueurManche(partie, "old", "new");

    expect(partie.manche.joueursActifs).toEqual(["new", "b"]);
    expect(partie.manche.qualifies).toEqual(["new"]);
    expect(partie.manche.elimines).toEqual(["b", "new"]);
    expect(partie.manche.scoresManche).toEqual({ b: 0, new: 8 });
    expect(partie.manche.streaksManche).toEqual({ b: 0, new: 3 });
    expect(partie.manche.champion).toBe("new");
  });

  it("calcule les points du face-a-face selon le temps", () => {
    expect(pointsFaceAFace(7000)).toBe(4);
    expect(pointsFaceAFace(12000)).toBe(3);
    expect(pointsFaceAFace(17000)).toBe(2);
    expect(pointsFaceAFace(22000)).toBe(1);
  });
});
