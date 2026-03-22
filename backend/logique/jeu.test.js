"use strict";

// =====================================================
// jeu.test.js — Tests Vitest pour logique/jeu.js
// =====================================================

// describe / it / expect sont injectes automatiquement par Vitest en tant que globaux
const {
  calculerScore,
  obtenirClassement,
  gererPartie,
  POINTS_PAR_RANG,
  BONUS_SERIE,
  MALUS_MAUVAISE_REPONSE,
} = require("./jeu.js");

// ─────────────────────────────────────────────────────
// calculerScore
// ─────────────────────────────────────────────────────
describe("calculerScore", () => {
  it("bonne reponse rang 0 (premier) sans serie → 10 points, streak devient 1", () => {
    const resultat = calculerScore(0, true, 0, 0);
    expect(resultat.pointsGagnes).toBe(10);
    expect(resultat.nouveauStreak).toBe(1);
  });

  it("bonne reponse rang 2 (troisieme) → 6 points, streak incrémenté", () => {
    const resultat = calculerScore(2, true, 1, 6);
    expect(resultat.pointsGagnes).toBe(6);
    expect(resultat.nouveauStreak).toBe(2);
  });

  it("bonne reponse rang 1 avec streak = 2 (devient 3) → points + bonus serie +2", () => {
    // streak 2 → nouveau streak 3 → bonus activé
    const resultat = calculerScore(1, true, 2, 20);
    // POINTS_PAR_RANG[1] = 8, BONUS_SERIE = 2 → 10
    expect(resultat.pointsGagnes).toBe(8 + BONUS_SERIE);
    expect(resultat.nouveauStreak).toBe(3);
  });

  it("bonne reponse avec streak deja >= 3 (serie maintenue) → bonus inclus", () => {
    // streak 4 → nouveau streak 5 → bonus toujours actif
    const resultat = calculerScore(3, true, 4, 30);
    // POINTS_PAR_RANG[3] = 5, BONUS_SERIE = 2 → 7
    expect(resultat.pointsGagnes).toBe(5 + BONUS_SERIE);
    expect(resultat.nouveauStreak).toBe(5);
  });

  it("mauvaise reponse avec score suffisant → malus -3, streak reset a 0", () => {
    const resultat = calculerScore(-1, false, 3, 20);
    expect(resultat.pointsGagnes).toBe(-MALUS_MAUVAISE_REPONSE);
    expect(resultat.nouveauStreak).toBe(0);
  });

  it("mauvaise reponse avec score < 3 → plancher a 0, pas de points negatifs", () => {
    // score = 2, malus serait -3 mais plancher a 0
    const resultat = calculerScore(-1, false, 0, 2);
    // -Math.min(3, 2) = -2, donc score 2 - 2 = 0
    expect(resultat.pointsGagnes).toBe(-2);
    expect(resultat.nouveauStreak).toBe(0);
  });

  it("mauvaise reponse avec score = 0 → points gagnes = -0 (plancher : aucun changement de score)", () => {
    const resultat = calculerScore(-1, false, 0, 0);
    // -Math.min(3, 0) produit -0 en JavaScript (comportement natif)
    // Le score applique sera scoreActuel + (-0) = 0, donc pas de regression
    expect(Object.is(resultat.pointsGagnes, -0)).toBe(true);
    expect(resultat.nouveauStreak).toBe(0);
  });

  it("rang > 7 (hors tableau de 8 slots) → 1 point (fallback du tableau nullish)", () => {
    // POINTS_PAR_RANG[8] est undefined → ?? 1
    const resultat = calculerScore(8, true, 0, 0);
    expect(resultat.pointsGagnes).toBe(1);
    expect(resultat.nouveauStreak).toBe(1);
  });

  it("rang 7 (dernier slot defini) → 1 point exactement", () => {
    const resultat = calculerScore(7, true, 0, 0);
    expect(resultat.pointsGagnes).toBe(POINTS_PAR_RANG[7]); // 1
    expect(resultat.nouveauStreak).toBe(1);
  });

  it("pas de reponse (estCorrect=false, rangReponse=null) → malus ou plancher, streak 0", () => {
    // rangReponse null n'est pas utilise quand estCorrect=false
    const resultat = calculerScore(null, false, 2, 10);
    expect(resultat.pointsGagnes).toBe(-MALUS_MAUVAISE_REPONSE);
    expect(resultat.nouveauStreak).toBe(0);
  });

  it("scoreActuel absent (undefined) → traite comme 0 (valeur par defaut), pas d'erreur", () => {
    // scoreActuel a un defaut = 0 dans la signature
    // -Math.min(3, 0) produit -0 (meme comportement que score = 0)
    const resultat = calculerScore(-1, false, 0, undefined);
    expect(Object.is(resultat.pointsGagnes, -0)).toBe(true);
    expect(resultat.nouveauStreak).toBe(0);
  });

  it("streakActuel null → traite comme 0 (streak initial)", () => {
    const resultat = calculerScore(0, true, null, 0);
    expect(resultat.nouveauStreak).toBe(1);
    expect(resultat.pointsGagnes).toBe(10);
  });
});

// ─────────────────────────────────────────────────────
// obtenirClassement
// ─────────────────────────────────────────────────────
describe("obtenirClassement", () => {
  it("classement correct par score decroissant pour 3 joueurs", () => {
    const joueurs = {
      "id-alice": { id: "id-alice", name: "Alice", isHost: false },
      "id-bob":   { id: "id-bob",   name: "Bob",   isHost: false },
      "id-cara":  { id: "id-cara",  name: "Cara",  isHost: false },
    };
    const scores  = { "id-alice": 30, "id-bob": 50, "id-cara": 20 };
    const streaks = { "id-alice": 2,  "id-bob": 1,  "id-cara": 0  };

    const classement = obtenirClassement(joueurs, scores, streaks);

    expect(classement[0].name).toBe("Bob");
    expect(classement[0].position).toBe(1);
    expect(classement[0].score).toBe(50);

    expect(classement[1].name).toBe("Alice");
    expect(classement[1].position).toBe(2);

    expect(classement[2].name).toBe("Cara");
    expect(classement[2].position).toBe(3);
    expect(classement[2].score).toBe(20);
  });

  it("ex-aequo → positions sequentielles (ordre selon Object.values stable)", () => {
    const joueurs = {
      "id-x": { id: "id-x", name: "Xavier", isHost: false },
      "id-y": { id: "id-y", name: "Yasmine", isHost: false },
    };
    const scores  = { "id-x": 15, "id-y": 15 };
    const streaks = {};

    const classement = obtenirClassement(joueurs, scores, streaks);

    expect(classement).toHaveLength(2);
    // Les deux ont le meme score, les positions sont 1 et 2
    expect(classement[0].score).toBe(15);
    expect(classement[1].score).toBe(15);
    expect(classement[0].position).toBe(1);
    expect(classement[1].position).toBe(2);
  });

  it("tableau vide (aucun joueur) → retourne tableau vide", () => {
    const classement = obtenirClassement({}, {}, {});
    expect(classement).toEqual([]);
  });

  it("un seul joueur → retourne position 1", () => {
    const joueurs = { "id-solo": { id: "id-solo", name: "Solo", isHost: true } };
    const scores  = { "id-solo": 42 };
    const streaks = { "id-solo": 5 };

    const classement = obtenirClassement(joueurs, scores, streaks);

    expect(classement).toHaveLength(1);
    expect(classement[0].position).toBe(1);
    expect(classement[0].name).toBe("Solo");
    expect(classement[0].score).toBe(42);
    expect(classement[0].streak).toBe(5);
    expect(classement[0].isHost).toBe(true);
  });

  it("joueur avec score 0 → apparait en derniere position", () => {
    const joueurs = {
      "id-top":  { id: "id-top",  name: "Leader", isHost: false },
      "id-zero": { id: "id-zero", name: "Nul",    isHost: false },
    };
    const scores  = { "id-top": 25, "id-zero": 0 };
    const streaks = {};

    const classement = obtenirClassement(joueurs, scores, streaks);

    expect(classement[0].name).toBe("Leader");
    expect(classement[1].name).toBe("Nul");
    expect(classement[1].position).toBe(2);
    expect(classement[1].score).toBe(0);
  });

  it("N joueurs → tous ont un rang assigne (positions 1..N sans trou)", () => {
    const nbJoueurs = 5;
    const joueurs  = {};
    const scores   = {};
    const streaks  = {};
    for (let i = 0; i < nbJoueurs; i++) {
      const id = `id-j${i}`;
      joueurs[id] = { id, name: `Joueur${i}`, isHost: false };
      scores[id]  = i * 10;
      streaks[id] = 0;
    }

    const classement = obtenirClassement(joueurs, scores, streaks);

    expect(classement).toHaveLength(nbJoueurs);
    const positions = classement.map((j) => j.position);
    for (let rang = 1; rang <= nbJoueurs; rang++) {
      expect(positions).toContain(rang);
    }
  });

  it("score absent de la map scores → traite comme 0", () => {
    const joueurs = {
      "id-a": { id: "id-a", name: "Alain", isHost: false },
    };
    // scores vide, pas de cle pour id-a
    const classement = obtenirClassement(joueurs, {}, {});

    expect(classement[0].score).toBe(0);
  });

  it("streaks null → streak de chaque joueur vaut 0 sans erreur", () => {
    const joueurs = {
      "id-b": { id: "id-b", name: "Bruno", isHost: false },
    };
    const scores = { "id-b": 10 };

    const classement = obtenirClassement(joueurs, scores, null);

    expect(classement[0].streak).toBe(0);
  });
});

// ─────────────────────────────────────────────────────
// gererPartie
// ─────────────────────────────────────────────────────
describe("gererPartie", () => {
  it("ATTENTE + DEMARRER → succes, statut EN_COURS", () => {
    const resultat = gererPartie({ statut: "ATTENTE" }, "DEMARRER");
    expect(resultat.succes).toBe(true);
    expect(resultat.statut).toBe("EN_COURS");
  });

  it("EN_COURS + TERMINER → succes, statut TERMINEE", () => {
    const resultat = gererPartie({ statut: "EN_COURS" }, "TERMINER");
    expect(resultat.succes).toBe(true);
    expect(resultat.statut).toBe("TERMINEE");
  });

  it("ATTENTE + TERMINER → echec, statut inchange", () => {
    const resultat = gererPartie({ statut: "ATTENTE" }, "TERMINER");
    expect(resultat.succes).toBe(false);
    expect(resultat.statut).toBe("ATTENTE");
    expect(resultat.message).toMatch(/Impossible de terminer/);
  });

  it("TERMINEE + DEMARRER → echec, statut inchange", () => {
    const resultat = gererPartie({ statut: "TERMINEE" }, "DEMARRER");
    expect(resultat.succes).toBe(false);
    expect(resultat.statut).toBe("TERMINEE");
    expect(resultat.message).toMatch(/Impossible de demarrer/);
  });

  it("action inconnue → echec, statut inchange, message informatif", () => {
    const resultat = gererPartie({ statut: "ATTENTE" }, "ACTION_BIDON");
    expect(resultat.succes).toBe(false);
    expect(resultat.statut).toBe("ATTENTE");
    expect(resultat.message).toMatch(/Action inconnue/);
  });

  it("etatPartie null → statut null, echec gracieux sans exception", () => {
    expect(() => gererPartie(null, "DEMARRER")).not.toThrow();
    const resultat = gererPartie(null, "DEMARRER");
    expect(resultat.succes).toBe(false);
    expect(resultat.statut).toBeNull();
  });

  it("TERMINEE + TERMINER → echec, impossible de terminer une partie deja terminee", () => {
    const resultat = gererPartie({ statut: "TERMINEE" }, "TERMINER");
    expect(resultat.succes).toBe(false);
    expect(resultat.statut).toBe("TERMINEE");
  });

  it("etat inconnu + DEMARRER → echec defensif (pas ATTENTE)", () => {
    const resultat = gererPartie({ statut: "ETAT_BIZARRE" }, "DEMARRER");
    expect(resultat.succes).toBe(false);
    expect(resultat.statut).toBe("ETAT_BIZARRE");
  });

  it("retourne toujours un objet avec les cles succes, statut, message", () => {
    const cas = [
      [{ statut: "ATTENTE" },  "DEMARRER"],
      [{ statut: "EN_COURS" }, "TERMINER"],
      [{ statut: "ATTENTE" },  "INCONNU"],
      [null,                   "DEMARRER"],
    ];
    for (const [etat, action] of cas) {
      const res = gererPartie(etat, action);
      expect(res).toHaveProperty("succes");
      expect(res).toHaveProperty("statut");
      expect(res).toHaveProperty("message");
    }
  });
});
