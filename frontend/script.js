let jeu = {
  nombreJoueurs: 2,
  nomsJoueurs: [],
  scores: [],
  joueurActuel: null,
  questionActuelle: 0,
  enCours: false,
  chronometreQuestion: null,
  chronometreReponse: null,
  couleursJoueurs: ["#4D7CFE", "#7C4DFF", "#3B82F6", "#64748B"],
  nombreQuestionsParPartie: 10,
  dureeQuestion: 30,
  dureeReponse: 15,
  melangerQuestions: true,
  questionsTirees: [],
  questionsDejaPosees: [],
  toutesLesQuestions: [],
};

// ============================================
// ILLUSTRATIONS (affichées uniquement au résultat)
// - Ne modifie pas style.css
// - Taille et visibilité gérées en JS
// ============================================

function __setHiddenByClass(el, hidden) {
  if (!el) return;
  if (hidden) el.classList.add("hidden");
  else el.classList.remove("hidden");
}

function __applyResultImageSizing(img) {
  if (!img) return;
  // Plus petit, sans rognage
  img.style.display = "block";
  img.style.width = "100%";
  img.style.maxWidth = "520px";
  img.style.height = "auto";
  img.style.maxHeight = "220px";
  img.style.objectFit = "contain";
  img.style.objectPosition = "center";
  img.style.margin = "10px auto";
}

function __hideAnyInGameIllustrations() {
  // Si des anciens patches ont injecté une image dans l'écran "jeu", on la cache.
  try {
    const jeuScreen = document.getElementById("jeu");
    if (jeuScreen) {
      jeuScreen.querySelectorAll("img").forEach((img) => {
        // On ne touche pas aux images du résultat
        if (img && img.id && img.id.startsWith("resultat-")) return;
        // Cache uniquement les images injectées pour l'illustration
        if (img && (img.classList.contains("illustration") || img.closest(".illustration-container"))) {
          img.style.display = "none";
        }
      });
    }
  } catch (e) {}
}

function __renderSoloResultIllustration(questionObj) {
  const box = document.getElementById("resultat-illustration");
  const img = document.getElementById("resultat-image");
  const txt = document.getElementById("resultat-description");
  if (!box || !img || !txt) return;

  const url =
    (questionObj && (questionObj.imageUrl || questionObj.imageURL || questionObj.image)) || "";
  const caption =
    (questionObj &&
      (questionObj.illustrationTexte ||
        questionObj.illustrationText ||
        questionObj.texteIllustration)) ||
    "";

  if (!url) {
    __setHiddenByClass(box, true);
    return;
  }

  __applyResultImageSizing(img);
  img.onload = () => __setHiddenByClass(box, false);
  img.onerror = () => __setHiddenByClass(box, true);
  img.src = url;
  txt.textContent = caption;
  __setHiddenByClass(box, false);
}

// ============================================
// FONCTIONS EXPORTABLES POUR MULTIJOUEUR
// ============================================

function obtenirQuestionAleatoire() {
  if (jeu.toutesLesQuestions.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * jeu.toutesLesQuestions.length);
  return jeu.toutesLesQuestions[randomIndex];
}

function obtenirQuestionParIndex(index) {
  if (index >= 0 && index < jeu.toutesLesQuestions.length) {
    return jeu.toutesLesQuestions[index];
  }
  return null;
}

function obtenirQuestionsAleatoires(nombre) {
  if (nombre <= 0 || nombre > jeu.toutesLesQuestions.length) {
    nombre = jeu.toutesLesQuestions.length;
  }

  // Mélanger et prendre X questions
  const indicesMelanges = melangerTableau([
    ...Array(jeu.toutesLesQuestions.length).keys(),
  ]);
  return indicesMelanges
    .slice(0, nombre)
    .map((index) => jeu.toutesLesQuestions[index]);
}

function traiterReponseMultijoueur(
  indexJoueur,
  reponseDonnee,
  reponseCorrecte
) {
  if (reponseDonnee === reponseCorrecte) {
    jeu.scores[indexJoueur] += 10;
    return { correct: true, points: 10, nouveauScore: jeu.scores[indexJoueur] };
  } else {
    jeu.scores[indexJoueur] -= 5;
    if (jeu.scores[indexJoueur] < 0) jeu.scores[indexJoueur] = 0;
    return {
      correct: false,
      points: -5,
      nouveauScore: jeu.scores[indexJoueur],
    };
  }
}

function reinitialiserPartieMultijoueur(
  nomsJoueurs,
  nbQuestions,
  dureeQuestion,
  dureeReponse
) {
  jeu.nombreJoueurs = nomsJoueurs.length;
  jeu.nomsJoueurs = nomsJoueurs;
  jeu.scores = new Array(jeu.nombreJoueurs).fill(0);
  jeu.nombreQuestionsParPartie = nbQuestions;
  jeu.dureeQuestion = dureeQuestion;
  jeu.dureeReponse = dureeReponse;
  jeu.questionActuelle = 0;
  jeu.joueurActuel = null;
  jeu.enCours = true;

  return obtenirQuestionsAleatoires(nbQuestions);
}

// ============================================
// FONCTIONS ORIGINALES (inchangées)
// ============================================

async function chargerToutesLesQuestions() {
  try {
    const response = await fetch("questions.json");
    if (!response.ok) throw new Error("Erreur de chargement des questions");
    jeu.toutesLesQuestions = await response.json();
    console.log(`${jeu.toutesLesQuestions.length} questions chargées`);
  } catch (error) {
    console.error("Erreur:", error);
    jeu.toutesLesQuestions = [];
    console.warn("Assurez-vous que questions.json est présent");
  }
}

function melangerTableau(tableau) {
  const resultat = [...tableau];
  for (let i = resultat.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [resultat[i], resultat[j]] = [resultat[j], resultat[i]];
  }
  return resultat;
}

function preparerQuestionsPartie() {
  console.log("Préparation des questions pour la partie");
  console.log(`Questions demandées: ${jeu.nombreQuestionsParPartie}`);
  console.log(`Questions disponibles: ${jeu.toutesLesQuestions.length}`);

  jeu.questionsDejaPosees = [];
  jeu.questionsTirees = [];

  if (jeu.toutesLesQuestions.length === 0) {
    console.error("Aucune question disponible!");
    return;
  }

  let indicesDisponibles = Array.from(
    { length: jeu.toutesLesQuestions.length },
    (_, i) => i
  );

  let nombreQuestionsATirer = jeu.nombreQuestionsParPartie;
  if (
    nombreQuestionsATirer === 0 ||
    nombreQuestionsATirer > indicesDisponibles.length
  ) {
    nombreQuestionsATirer = indicesDisponibles.length;
  }

  indicesDisponibles = melangerTableau(indicesDisponibles);
  let indicesSelectionnes = indicesDisponibles.slice(0, nombreQuestionsATirer);

  if (!jeu.melangerQuestions) indicesSelectionnes.sort((a, b) => a - b);

  jeu.questionsTirees = indicesSelectionnes;
  console.log(`${jeu.questionsTirees.length} questions sélectionnées`);
}

function obtenirQuestionSuivante() {
  if (jeu.questionActuelle >= jeu.questionsTirees.length) {
    console.log("Plus de questions disponibles");
    return null;
  }

  const indiceQuestion = jeu.questionsTirees[jeu.questionActuelle];
  if (indiceQuestion >= jeu.toutesLesQuestions.length) {
    console.error(`Indice de question invalide: ${indiceQuestion}`);
    return null;
  }

  console.log(
    `Question ${jeu.questionActuelle + 1}/${
      jeu.questionsTirees.length
    }: indice ${indiceQuestion}`
  );

  if (!jeu.questionsDejaPosees.includes(indiceQuestion)) {
    jeu.questionsDejaPosees.push(indiceQuestion);
  }

  return jeu.toutesLesQuestions[indiceQuestion];
}

function changerEcran(idEcran) {
  console.log(`Changement vers écran: ${idEcran}`);

  document.querySelectorAll(".ecran").forEach((ecran) => {
    ecran.classList.remove("actif");
  });

  const ecranCible = document.getElementById(idEcran);
  if (ecranCible) {
    ecranCible.classList.add("actif");
  } else {
    console.error(`Écran ${idEcran} non trouvé!`);
  }

  if (idEcran !== "jeu") {
    clearInterval(jeu.chronometreQuestion);
    jeu.chronometreQuestion = null;
  }
  if (idEcran !== "reponses") {
    clearInterval(jeu.chronometreReponse);
    jeu.chronometreReponse = null;
  }
}

function recupererParametres() {
  const nombreQuestionsSelect = document.getElementById("nombre-questions");
  const dureeQuestionSelect = document.getElementById("duree-question-param");
  const dureeReponseSelect = document.getElementById("duree-reponse-param");

  if (nombreQuestionsSelect && dureeQuestionSelect && dureeReponseSelect) {
    jeu.nombreQuestionsParPartie = parseInt(nombreQuestionsSelect.value);
    jeu.dureeQuestion = parseInt(dureeQuestionSelect.value);
    jeu.dureeReponse = parseInt(dureeReponseSelect.value);

    console.log("Paramètres récupérés:", {
      nombreQuestions: jeu.nombreQuestionsParPartie,
      dureeQuestion: jeu.dureeQuestion,
      dureeReponse: jeu.dureeReponse,
    });
  }
}

function definirNombreJoueurs(nombre) {
  if (nombre < 1) nombre = 1;
  if (nombre > 4) nombre = 4;

  jeu.nombreJoueurs = nombre;
  console.log(`Nombre de joueurs défini à: ${nombre}`);

  document.querySelectorAll(".option-joueur").forEach((option) => {
    if (parseInt(option.dataset.joueurs) === nombre) {
      option.style.background = "rgba(253, 187, 45, 0.3)";
      option.style.border = "2px solid #fdbb2d";
    } else {
      option.style.background = "";
      option.style.border = "";
    }
  });

  genererChampsNoms();
}

function genererChampsNoms() {
  const formulaire = document.getElementById("formulaire-noms");
  formulaire.innerHTML = "";

  for (let i = 0; i < jeu.nombreJoueurs; i++) {
    const div = document.createElement("div");
    div.className = "groupe-nom";

    const label = document.createElement("label");
    label.textContent = `Joueur ${i + 1}`;
    label.htmlFor = `joueur-${i}`;

    const input = document.createElement("input");
    input.type = "text";
    input.id = `joueur-${i}`;
    input.placeholder = `Nom du joueur ${i + 1}`;
    input.value = jeu.nomsJoueurs[i] || `Joueur ${i + 1}`;

    div.appendChild(label);
    div.appendChild(input);
    formulaire.appendChild(div);
  }
}

function recupererNomsJoueurs() {
  jeu.nomsJoueurs = [];
  for (let i = 0; i < jeu.nombreJoueurs; i++) {
    const input = document.getElementById(`joueur-${i}`);
    if (input && input.value.trim() !== "") {
      jeu.nomsJoueurs.push(input.value.trim());
    } else {
      jeu.nomsJoueurs.push(`Joueur ${i + 1}`);
    }
  }
  console.log("Noms des joueurs:", jeu.nomsJoueurs);
}

function validerJoueursEtParametrer() {
  recupererNomsJoueurs();

  if (jeu.nomsJoueurs.length === 0) {
    alert("Veuillez entrer au moins un nom de joueur !");
    return;
  }

  changerEcran("parametres");
}

function demarrerPartie() {
  recupererParametres();

  if (jeu.toutesLesQuestions.length === 0) {
    alert("Erreur: Aucune question disponible !");
    return;
  }

  initialiserScores();
  preparerQuestionsPartie();

  if (jeu.questionsTirees.length === 0) {
    alert("Erreur: Impossible de préparer les questions !");
    return;
  }

  genererGrilleScores("grille-scores");
  genererBuzzers();

  const question = obtenirQuestionSuivante();
  if (question) {
    document.getElementById("question-actuelle").textContent =
      question.question;
  } else {
    alert("Erreur: Aucune question disponible !");
    return;
  }

  demarrerChronometreQuestion();
  // S'assure qu'aucune illustration ne s'affiche pendant la question
  __hideAnyInGameIllustrations();
  changerEcran("jeu");
}

function initialiserScores() {
  jeu.scores = new Array(jeu.nombreJoueurs).fill(0);
  jeu.questionActuelle = 0;
  jeu.joueurActuel = null;
  jeu.enCours = true;
}

function genererGrilleScores(conteneurId) {
  const conteneur = document.getElementById(conteneurId);
  if (!conteneur) return;

  let classeGrille = "scores-grid-4";
  if (jeu.nombreJoueurs === 1) classeGrille = "scores-grid-1";
  else if (jeu.nombreJoueurs === 2) classeGrille = "scores-grid-2";
  else if (jeu.nombreJoueurs === 3) classeGrille = "scores-grid-3";

  conteneur.className = `scores ${classeGrille}`;
  conteneur.innerHTML = "";

  for (let i = 0; i < jeu.nombreJoueurs; i++) {
    const carte = document.createElement("div");
    carte.className = "carte-joueur";

    const nom = document.createElement("h3");
    nom.textContent = jeu.nomsJoueurs[i];

    const points = document.createElement("div");
    points.className = "points";
    points.textContent = `${jeu.scores[i]} points`;

    carte.appendChild(nom);
    carte.appendChild(points);
    conteneur.appendChild(carte);
  }
}

function genererBuzzers() {
  const grilleBuzzers = document.getElementById("grille-buzzers");
  if (!grilleBuzzers) return;

  let classeGrille = `buzzers-grid-${jeu.nombreJoueurs}`;
  grilleBuzzers.className = `buzzers-grid ${classeGrille}`;
  grilleBuzzers.innerHTML = "";

  const raccourcisClavier = ["1", "2", "3", "4"];

  for (let i = 0; i < jeu.nombreJoueurs; i++) {
    const buzzerDiv = document.createElement("div");
    buzzerDiv.className = "buzzer-joueur";

    const nom = document.createElement("h3");
    nom.textContent = jeu.nomsJoueurs[i];

    const raccourci = document.createElement("div");
    raccourci.className = "raccourci-clavier";
    raccourci.textContent = `Touche ${raccourcisClavier[i]}`;

    const buzzer = document.createElement("button");
    buzzer.className = "bouton-buzzer";
    buzzer.innerHTML = `<span class="texte-buzzer">BUZZ !</span>`;

    const couleurIndex = i % jeu.couleursJoueurs.length;
    buzzer.style.background = `radial-gradient(circle at center, ${jeu.couleursJoueurs[couleurIndex]}, ${jeu.couleursJoueurs[couleurIndex]}80, ${jeu.couleursJoueurs[couleurIndex]}40)`;
    buzzer.style.borderColor = jeu.couleursJoueurs[couleurIndex];

    buzzer.addEventListener("click", () => {
      if (jeu.enCours && !jeu.joueurActuel) {
        buzzer.classList.add("buzzer-active");
        jeu.joueurActuel = i;
        console.log(`${jeu.nomsJoueurs[i]} a buzzé!`);

        document.querySelectorAll(".bouton-buzzer").forEach((btn) => {
          btn.disabled = true;
          btn.classList.add("desactive");
        });

        clearInterval(jeu.chronometreQuestion);

        setTimeout(() => {
          afficherEcranReponse();
        }, 1000);
      }
    });

    buzzerDiv.appendChild(nom);
    buzzerDiv.appendChild(buzzer);
    buzzerDiv.appendChild(raccourci);
    grilleBuzzers.appendChild(buzzerDiv);
  }
}

function initialiserControlesClavier() {
  document.addEventListener("keydown", function (event) {
    const ecranJeu = document.getElementById("jeu");
    if (!ecranJeu || !ecranJeu.classList.contains("actif")) return;
    if (!jeu.enCours || jeu.joueurActuel !== null) return;

    let indexJoueur = -1;
    switch (event.key) {
      case "1":
      case "&":
        indexJoueur = 0;
        break;
      case "2":
      case "é":
        indexJoueur = 1;
        break;
      case "3":
      case '"':
        indexJoueur = 2;
        break;
      case "4":
      case "'":
        indexJoueur = 3;
        break;
    }

    if (indexJoueur >= 0 && indexJoueur < jeu.nombreJoueurs) {
      activerBuzzerParClavier(indexJoueur);
    }
  });
}

function activerBuzzerParClavier(indexJoueur) {
  if (jeu.enCours && !jeu.joueurActuel) {
    console.log(`${jeu.nomsJoueurs[indexJoueur]} a buzzé avec le clavier!`);

    const boutonsBuzzer = document.querySelectorAll(".bouton-buzzer");
    if (boutonsBuzzer[indexJoueur]) {
      boutonsBuzzer[indexJoueur].classList.add("buzzer-active");

      document.querySelectorAll(".bouton-buzzer").forEach((btn) => {
        btn.disabled = true;
        btn.classList.add("desactive");
      });

      jeu.joueurActuel = indexJoueur;
      clearInterval(jeu.chronometreQuestion);

      setTimeout(() => {
        afficherEcranReponse();
      }, 1000);
    }
  }
}

function demarrerChronometreQuestion() {
  let tempsRestant = jeu.dureeQuestion;
  const elementTemps = document.getElementById("temps-restant");
  const elementUnite = document.querySelector(".unite-temps");

  if (!elementTemps || !elementUnite) return;

  elementUnite.textContent = "secondes";
  elementTemps.textContent = tempsRestant;

  jeu.chronometreQuestion = setInterval(() => {
    tempsRestant--;
    elementTemps.textContent = tempsRestant;

    if (tempsRestant <= 0) {
      clearInterval(jeu.chronometreQuestion);
      if (!jeu.joueurActuel) {
        console.log("Temps écoulé, personne n'a buzzé");
        passerQuestionSuivante();
      }
    }
  }, 1000);
}

function afficherEcranReponse() {
  const question = obtenirQuestionSuivante();
  if (!question) {
    terminerPartie();
    return;
  }

  document.getElementById("nom-repondant-reponses").textContent =
    jeu.nomsJoueurs[jeu.joueurActuel];
  document.getElementById("question-reponse").textContent = question.question;

  const optionsConteneur = document.getElementById("options-reponse");
  optionsConteneur.innerHTML = "";

  const optionsMelangees = melangerTableau(question.options);

  optionsMelangees.forEach((option) => {
    const boutonOption = document.createElement("button");
    boutonOption.className = "option-reponse";
    boutonOption.textContent = option;

    boutonOption.addEventListener("click", () => {
      verifierReponse(option, question.reponseCorrecte);
    });

    optionsConteneur.appendChild(boutonOption);
  });

  demarrerChronometreReponse();
  changerEcran("reponses");
}

function demarrerChronometreReponse() {
  let tempsRestant = jeu.dureeReponse;
  const elementTemps = document.getElementById("temps-reponse");

  if (!elementTemps) return;

  elementTemps.textContent = tempsRestant;

  jeu.chronometreReponse = setInterval(() => {
    tempsRestant--;
    elementTemps.textContent = tempsRestant;

    if (tempsRestant <= 0) {
      clearInterval(jeu.chronometreReponse);
      verifierReponse("", "", true);
    }
  }, 1000);
}

function verifierReponse(reponseDonnee, reponseCorrecte, tempsEcoule = false) {
  clearInterval(jeu.chronometreReponse);

  document.getElementById("question-resultat").textContent =
    jeu.toutesLesQuestions[jeu.questionsTirees[jeu.questionActuelle]].question;

  document.getElementById(
    "reponse-correcte"
  ).textContent = `Réponse correcte: ${reponseCorrecte}`;
  document.getElementById("nom-repondant").textContent =
    jeu.nomsJoueurs[jeu.joueurActuel];

  let bonneReponse = false;

  if (tempsEcoule) {
    document.getElementById("statut-reponse").textContent =
      "Temps écoulé! -5 points";
    document.getElementById("statut-reponse").className =
      "statut-reponse incorrect";
    jeu.scores[jeu.joueurActuel] -= 5;
    if (jeu.scores[jeu.joueurActuel] < 0) jeu.scores[jeu.joueurActuel] = 0;
  } else if (reponseDonnee === reponseCorrecte) {
    document.getElementById("statut-reponse").textContent =
      "Bonne réponse! +10 points";
    document.getElementById("statut-reponse").className = "statut-reponse";
    jeu.scores[jeu.joueurActuel] += 10;
    bonneReponse = true;
  } else {
    document.getElementById("statut-reponse").textContent =
      "Mauvaise réponse! -5 points";
    document.getElementById("statut-reponse").className =
      "statut-reponse incorrect";
    jeu.scores[jeu.joueurActuel] -= 5;
    if (jeu.scores[jeu.joueurActuel] < 0) jeu.scores[jeu.joueurActuel] = 0;
  }

  genererGrilleScores("grille-scores-resultat");

  // Illustration uniquement au résultat (solo)
  try {
    const qIndex = jeu.questionsTirees[jeu.questionActuelle];
    const qObj = jeu.toutesLesQuestions[qIndex];
    __renderSoloResultIllustration(qObj);
  } catch (e) {}

  changerEcran("resultat");
}

function passerQuestionSuivante() {
  jeu.questionActuelle++;
  jeu.joueurActuel = null;

  const question = obtenirQuestionSuivante();

  if (!question || jeu.questionActuelle >= jeu.questionsTirees.length) {
    terminerPartie();
    return;
  }

  document.querySelectorAll(".bouton-buzzer").forEach((btn) => {
    btn.disabled = false;
    btn.classList.remove("desactive");
    btn.classList.remove("buzzer-active");
  });

  document.getElementById("question-actuelle").textContent = question.question;
  genererGrilleScores("grille-scores");
  demarrerChronometreQuestion();
  // S'assure qu'aucune illustration ne s'affiche pendant la question
  __hideAnyInGameIllustrations();
  changerEcran("jeu");
}

function terminerPartie() {
  jeu.enCours = false;
  sauvegarderPartie();

  let maxScore = Math.max(...jeu.scores);
  let gagnants = jeu.nomsJoueurs.filter((_, i) => jeu.scores[i] === maxScore);

  if (gagnants.length === 1) {
    alert(
      `Partie terminée !\n\nLe gagnant est ${gagnants[0]} avec ${maxScore} points !`
    );
  } else {
    alert(
      `Partie terminée !\n\nÉgalité entre : ${gagnants.join(
        ", "
      )} avec ${maxScore} points chacun !`
    );
  }

  changerEcran("accueil");
}

function afficherHistorique() {
  const listeHistorique = document.getElementById("liste-historique");
  if (!listeHistorique) return;

  let historique = JSON.parse(localStorage.getItem("historiqueParties")) || [];

  if (historique.length === 0) {
    listeHistorique.innerHTML =
      "<p>Aucune partie enregistrée pour le moment.</p>";
    return;
  }

  listeHistorique.innerHTML = "";

  historique
    .slice(-10)
    .reverse()
    .forEach((partie) => {
      const divPartie = document.createElement("div");
      divPartie.className = "partie-historique";

      const titre = document.createElement("h3");
      titre.textContent = `Partie du ${partie.date}`;

      const scores = document.createElement("ul");

      const scoresValeurs = partie.scores.map((s) => s.points);
      const maxScore = Math.max(...scoresValeurs);

      partie.scores.forEach((score) => {
        const li = document.createElement("li");
        li.textContent = `${score.nom}: ${score.points} points`;
        if (score.points === maxScore && maxScore > 0) {
          li.style.color = "#fdbb2d";
          li.style.fontWeight = "bold";
        }
        scores.appendChild(li);
      });

      divPartie.appendChild(titre);
      divPartie.appendChild(scores);
      listeHistorique.appendChild(divPartie);
    });
}

function sauvegarderPartie() {
  const historique =
    JSON.parse(localStorage.getItem("historiqueParties")) || [];

  const partie = {
    date: new Date().toLocaleString(),
    scores: jeu.nomsJoueurs.map((nom, index) => ({
      nom: nom,
      points: jeu.scores[index],
    })),
  };

  historique.push(partie);

  if (historique.length > 50) {
    historique.splice(0, historique.length - 50);
  }

  localStorage.setItem("historiqueParties", JSON.stringify(historique));
}

function initialiserEvenements() {
  document.getElementById("btn-commencer").addEventListener("click", () => {
    changerEcran("selection-joueurs");
  });

  document.getElementById("btn-historique").addEventListener("click", () => {
    afficherHistorique();
    changerEcran("historique");
  });

  document
    .getElementById("btn-retour-historique")
    .addEventListener("click", () => {
      changerEcran("accueil");
    });

  document.querySelectorAll(".option-joueur").forEach((option) => {
    option.addEventListener("click", () => {
      const nombre = parseInt(option.dataset.joueurs);
      definirNombreJoueurs(nombre);
    });
  });

  document
    .getElementById("btn-valider-joueurs")
    .addEventListener("click", () => {
      validerJoueursEtParametrer();
    });

  document
    .getElementById("btn-retour-joueurs")
    .addEventListener("click", () => {
      changerEcran("accueil");
    });

  document.getElementById("btn-demarrer-jeu").addEventListener("click", () => {
    demarrerPartie();
  });

  document
    .getElementById("btn-retour-parametres")
    .addEventListener("click", () => {
      changerEcran("selection-joueurs");
    });

  document
    .getElementById("btn-retour-reponses")
    .addEventListener("click", () => {
      jeu.joueurActuel = null;
      document.querySelectorAll(".bouton-buzzer").forEach((btn) => {
        btn.disabled = false;
        btn.classList.remove("desactive");
        btn.classList.remove("buzzer-active");
      });
      changerEcran("jeu");
    });

  document
    .getElementById("btn-question-suivante")
    .addEventListener("click", () => {
      passerQuestionSuivante();
    });

  document
    .getElementById("btn-menu-principal")
    .addEventListener("click", () => {
      sauvegarderPartie();
      changerEcran("accueil");
    });

  initialiserControlesClavier();
}

document.addEventListener("DOMContentLoaded", async () => {
  await chargerToutesLesQuestions();
  initialiserEvenements();
  definirNombreJoueurs(2);
  console.log("Jeu initialisé avec succès!");
  console.log("Questions disponibles:", jeu.toutesLesQuestions.length);

  if (jeu.toutesLesQuestions.length === 0) {
    console.warn("ATTENTION: Aucune question chargée.");
  }
});
