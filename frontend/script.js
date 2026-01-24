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
  // Nouvelles propriétés pour la génération IA
  sourceQuestions: "existantes", // "existantes" ou "ia"
  themeSelectionne: null,
  questionsGenerees: [],
};

// URL du backend pour la génération IA
const BACKEND_URL = "https://questionpourunchampion-backend.onrender.com";

// ============================================
// GESTIONNAIRE DE SONS
// ============================================

const sons = {
  buzzer: new Audio("buzzer.mp3"),
  applaudissements: new Audio("Applaudissements.mp3"),
  hue: new Audio("hue.mp3"),
};

// Précharger les sons
Object.values(sons).forEach((son) => {
  son.load();
  son.volume = 0.7; // Volume par défaut à 70%
});

function jouerSon(nomSon) {
  try {
    const son = sons[nomSon];
    if (son) {
      son.currentTime = 0; // Remettre au début
      son.play().catch((e) => console.log("Erreur audio:", e));
    }
  } catch (e) {
    console.log("Erreur son:", e);
  }
}

function arreterSon(nomSon) {
  try {
    const son = sons[nomSon];
    if (son) {
      son.pause();
      son.currentTime = 0;
    }
  } catch (e) {}
}

function arreterTousLesSons() {
  Object.keys(sons).forEach((nomSon) => arreterSon(nomSon));
}

// ============================================
// ILLUSTRATIONS
// ============================================

function __setHiddenByClass(el, hidden) {
  if (!el) return;
  if (hidden) el.classList.add("hidden");
  else el.classList.remove("hidden");
}

function __applyResultImageSizing(img) {
  if (!img) return;
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
  try {
    const jeuScreen = document.getElementById("jeu");
    if (jeuScreen) {
      jeuScreen.querySelectorAll("img").forEach((img) => {
        if (img && img.id && img.id.startsWith("resultat-")) return;
        if (
          img &&
          (img.classList.contains("illustration") ||
            img.closest(".illustration-container"))
        ) {
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
    (questionObj &&
      (questionObj.imageUrl || questionObj.imageURL || questionObj.image)) ||
    "";
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
  reponseCorrecte,
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
  dureeReponse,
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
// CHARGEMENT QUESTIONS
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
  jeu.questionsDejaPosees = [];
  jeu.questionsTirees = [];

  if (jeu.toutesLesQuestions.length === 0) return;

  let indicesDisponibles = Array.from(
    { length: jeu.toutesLesQuestions.length },
    (_, i) => i,
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
}

function obtenirQuestionSuivante() {
  if (jeu.questionActuelle >= jeu.questionsTirees.length) return null;

  const indiceQuestion = jeu.questionsTirees[jeu.questionActuelle];
  if (indiceQuestion >= jeu.toutesLesQuestions.length) return null;

  if (!jeu.questionsDejaPosees.includes(indiceQuestion)) {
    jeu.questionsDejaPosees.push(indiceQuestion);
  }

  return jeu.toutesLesQuestions[indiceQuestion];
}

function changerEcran(idEcran) {
  document
    .querySelectorAll(".ecran")
    .forEach((ecran) => ecran.classList.remove("actif"));

  const ecranCible = document.getElementById(idEcran);
  if (ecranCible) {
    ecranCible.classList.add("actif");
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
  }
}

function definirNombreJoueurs(nombre) {
  if (nombre < 1) nombre = 1;
  if (nombre > 4) nombre = 4;

  jeu.nombreJoueurs = nombre;

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
  if (!formulaire) return;

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
}

function validerJoueursEtParametrer() {
  recupererNomsJoueurs();
  if (jeu.nomsJoueurs.length === 0) {
    alert("Veuillez entrer au moins un nom de joueur !");
    return;
  }
  // Aller à l'écran de sélection de thème au lieu des paramètres
  changerEcran("selection-theme");
  initialiserEcranTheme();
}

// ============================================
// GÉNÉRATION DE QUESTIONS PAR IA
// ============================================

function initialiserEcranTheme() {
  // Réinitialiser l'état
  jeu.sourceQuestions = "existantes";
  jeu.themeSelectionne = null;

  // Masquer la section des thèmes par défaut
  const sectionThemes = document.getElementById("section-themes");
  const chargementIa = document.getElementById("chargement-ia");
  const erreurIa = document.getElementById("erreur-ia");

  if (sectionThemes) sectionThemes.classList.add("hidden");
  if (chargementIa) chargementIa.classList.add("hidden");
  if (erreurIa) erreurIa.classList.add("hidden");

  // Activer le bouton "Questions existantes" par défaut
  document.querySelectorAll(".option-source").forEach((btn) => {
    btn.classList.remove("actif");
  });
  const btnExistantes = document.getElementById("btn-source-existantes");
  if (btnExistantes) btnExistantes.classList.add("actif");

  // Réinitialiser les thèmes
  document.querySelectorAll(".bouton-theme").forEach((btn) => {
    btn.classList.remove("actif");
  });

  const themeSelectionneDiv = document.getElementById("theme-selectionne");
  if (themeSelectionneDiv) themeSelectionneDiv.classList.add("hidden");

  const inputTheme = document.getElementById("input-theme-personnalise");
  if (inputTheme) inputTheme.value = "";
}

function selectionnerSourceQuestions(source) {
  jeu.sourceQuestions = source;

  // Mettre à jour l'UI
  document.querySelectorAll(".option-source").forEach((btn) => {
    btn.classList.remove("actif");
  });

  const btnSource = document.querySelector(`[data-source="${source}"]`);
  if (btnSource) btnSource.classList.add("actif");

  const sectionThemes = document.getElementById("section-themes");
  if (source === "ia") {
    sectionThemes?.classList.remove("hidden");
  } else {
    sectionThemes?.classList.add("hidden");
    jeu.themeSelectionne = null;
  }
}

function selectionnerTheme(theme) {
  jeu.themeSelectionne = theme;

  // Mettre à jour l'UI
  document.querySelectorAll(".bouton-theme").forEach((btn) => {
    btn.classList.remove("actif");
    if (btn.dataset.theme === theme) {
      btn.classList.add("actif");
    }
  });

  // Afficher le thème sélectionné
  const themeSelectionneDiv = document.getElementById("theme-selectionne");
  const nomTheme = document.getElementById("nom-theme-selectionne");
  if (themeSelectionneDiv && nomTheme) {
    nomTheme.textContent = theme;
    themeSelectionneDiv.classList.remove("hidden");
  }

  // Vider l'input personnalisé
  const inputTheme = document.getElementById("input-theme-personnalise");
  if (inputTheme) inputTheme.value = "";
}

function validerThemePersonnalise() {
  const inputTheme = document.getElementById("input-theme-personnalise");
  if (!inputTheme) return;

  const theme = inputTheme.value.trim();
  if (theme.length < 2) {
    alert("Veuillez entrer un thème valide (au moins 2 caractères)");
    return;
  }

  // Désélectionner les thèmes prédéfinis
  document.querySelectorAll(".bouton-theme").forEach((btn) => {
    btn.classList.remove("actif");
  });

  jeu.themeSelectionne = theme;

  // Afficher le thème sélectionné
  const themeSelectionneDiv = document.getElementById("theme-selectionne");
  const nomTheme = document.getElementById("nom-theme-selectionne");
  if (themeSelectionneDiv && nomTheme) {
    nomTheme.textContent = theme;
    themeSelectionneDiv.classList.remove("hidden");
  }
}

async function genererQuestionsIA(theme, count) {
  const chargementIa = document.getElementById("chargement-ia");
  const erreurIa = document.getElementById("erreur-ia");
  const sectionThemes = document.getElementById("section-themes");

  // Afficher le chargement
  sectionThemes?.classList.add("hidden");
  erreurIa?.classList.add("hidden");
  chargementIa?.classList.remove("hidden");

  try {
    const response = await fetch(`${BACKEND_URL}/api/generate-questions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        theme: theme,
        count: count,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Erreur lors de la génération");
    }

    jeu.questionsGenerees = data.questions;
    console.log(`${data.questions.length} questions générées sur "${theme}"`);

    // Masquer le chargement et continuer
    chargementIa?.classList.add("hidden");
    return data.questions;

  } catch (error) {
    console.error("Erreur génération IA:", error);

    // Afficher l'erreur
    chargementIa?.classList.add("hidden");
    if (erreurIa) {
      const messageErreur = erreurIa.querySelector(".message-erreur");
      if (messageErreur) {
        messageErreur.textContent = error.message || "Impossible de générer les questions. Vérifiez votre connexion.";
      }
      erreurIa.classList.remove("hidden");
    }

    return null;
  }
}

async function validerThemeEtContinuer() {
  if (jeu.sourceQuestions === "existantes") {
    // Utiliser les questions existantes
    changerEcran("parametres");
    return;
  }

  // Vérifier qu'un thème est sélectionné
  if (!jeu.themeSelectionne) {
    alert("Veuillez sélectionner un thème pour générer les questions");
    return;
  }

  // Générer les questions
  const questions = await genererQuestionsIA(
    jeu.themeSelectionne,
    jeu.nombreQuestionsParPartie || 10
  );

  if (questions && questions.length > 0) {
    // Remplacer les questions par celles générées
    jeu.toutesLesQuestions = questions;
    changerEcran("parametres");
  }
}

function reessayerGeneration() {
  const erreurIa = document.getElementById("erreur-ia");
  const sectionThemes = document.getElementById("section-themes");

  erreurIa?.classList.add("hidden");
  sectionThemes?.classList.remove("hidden");
}

async function demarrerPartie() {
  recupererParametres();

  // Si on utilise les questions existantes et qu'elles ont été remplacées par l'IA,
  // les recharger
  if (jeu.sourceQuestions === "existantes" && jeu.questionsGenerees.length > 0) {
    await chargerToutesLesQuestions();
    jeu.questionsGenerees = [];
  }

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
    const questionEl = document.getElementById("question-actuelle");
    if (questionEl) questionEl.textContent = question.question;
  } else {
    alert("Erreur: Aucune question disponible !");
    return;
  }

  demarrerChronometreQuestion();
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
        jouerSon("buzzer"); // Jouer le son du buzzer
        buzzer.classList.add("buzzer-active");
        jeu.joueurActuel = i;

        document.querySelectorAll(".bouton-buzzer").forEach((btn) => {
          btn.disabled = true;
          btn.classList.add("desactive");
        });

        clearInterval(jeu.chronometreQuestion);
        setTimeout(() => afficherEcranReponse(), 1000);
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
    const boutonsBuzzer = document.querySelectorAll(".bouton-buzzer");
    if (boutonsBuzzer[indexJoueur]) {
      jouerSon("buzzer"); // Jouer le son du buzzer
      boutonsBuzzer[indexJoueur].classList.add("buzzer-active");

      document.querySelectorAll(".bouton-buzzer").forEach((btn) => {
        btn.disabled = true;
        btn.classList.add("desactive");
      });

      jeu.joueurActuel = indexJoueur;
      clearInterval(jeu.chronometreQuestion);
      setTimeout(() => afficherEcranReponse(), 1000);
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
      if (!jeu.joueurActuel) passerQuestionSuivante();
    }
  }, 1000);
}

function afficherEcranReponse() {
  const question = obtenirQuestionSuivante();
  if (!question) {
    terminerPartie();
    return;
  }

  const nomRepondantEl = document.getElementById("nom-repondant-reponses");
  const questionReponseEl = document.getElementById("question-reponse");

  if (nomRepondantEl)
    nomRepondantEl.textContent = jeu.nomsJoueurs[jeu.joueurActuel];
  if (questionReponseEl) questionReponseEl.textContent = question.question;

  const optionsConteneur = document.getElementById("options-reponse");
  if (optionsConteneur) {
    optionsConteneur.innerHTML = "";

    const optionsMelangees = melangerTableau(question.options);

    optionsMelangees.forEach((option) => {
      const boutonOption = document.createElement("button");
      boutonOption.className = "option-reponse";
      boutonOption.textContent = option;
      boutonOption.addEventListener("click", () =>
        verifierReponse(option, question.reponseCorrecte),
      );
      optionsConteneur.appendChild(boutonOption);
    });
  }

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

  const questionResultatEl = document.getElementById("question-resultat");
  const reponseCorrecteEl = document.getElementById("reponse-correcte");
  const nomRepondantEl = document.getElementById("nom-repondant");
  const statutReponseEl = document.getElementById("statut-reponse");

  if (
    questionResultatEl &&
    jeu.questionsTirees[jeu.questionActuelle] !== undefined
  ) {
    questionResultatEl.textContent =
      jeu.toutesLesQuestions[
        jeu.questionsTirees[jeu.questionActuelle]
      ].question;
  }

  if (reponseCorrecteEl)
    reponseCorrecteEl.textContent = `Réponse correcte: ${reponseCorrecte}`;
  if (nomRepondantEl)
    nomRepondantEl.textContent = jeu.nomsJoueurs[jeu.joueurActuel];

  // Arrêter tous les sons avant de jouer le nouveau
  arreterTousLesSons();

  if (tempsEcoule) {
    jouerSon("hue"); // Son de mauvaise réponse
    if (statutReponseEl) {
      statutReponseEl.textContent = "Temps écoulé! -5 points";
      statutReponseEl.className = "statut-reponse incorrect";
    }
    jeu.scores[jeu.joueurActuel] -= 5;
    if (jeu.scores[jeu.joueurActuel] < 0) jeu.scores[jeu.joueurActuel] = 0;
  } else if (reponseDonnee === reponseCorrecte) {
    jouerSon("applaudissements"); // Son de bonne réponse
    if (statutReponseEl) {
      statutReponseEl.textContent = "Bonne réponse! +10 points";
      statutReponseEl.className = "statut-reponse";
    }
    jeu.scores[jeu.joueurActuel] += 10;
  } else {
    jouerSon("hue"); // Son de mauvaise réponse
    if (statutReponseEl) {
      statutReponseEl.textContent = "Mauvaise réponse! -5 points";
      statutReponseEl.className = "statut-reponse incorrect";
    }
    jeu.scores[jeu.joueurActuel] -= 5;
    if (jeu.scores[jeu.joueurActuel] < 0) jeu.scores[jeu.joueurActuel] = 0;
  }

  genererGrilleScores("grille-scores-resultat");

  try {
    const qIndex = jeu.questionsTirees[jeu.questionActuelle];
    const qObj = jeu.toutesLesQuestions[qIndex];
    __renderSoloResultIllustration(qObj);
  } catch (e) {}

  changerEcran("resultat");

  // Afficher un compte à rebours de 5 secondes avant de passer à la question suivante
  const btnQuestionSuivante = document.getElementById("btn-question-suivante");
  if (btnQuestionSuivante) {
    let countdown = 5;
    btnQuestionSuivante.textContent = `Question suivante (${countdown}s)`;
    btnQuestionSuivante.disabled = true;
    
    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        btnQuestionSuivante.textContent = `Question suivante (${countdown}s)`;
      } else {
        clearInterval(countdownInterval);
        btnQuestionSuivante.textContent = "Question suivante";
        btnQuestionSuivante.disabled = false;
        // Passer automatiquement à la question suivante
        passerQuestionSuivante();
      }
    }, 1000);
  }
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

  const questionEl = document.getElementById("question-actuelle");
  if (questionEl) questionEl.textContent = question.question;

  genererGrilleScores("grille-scores");
  demarrerChronometreQuestion();
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
      `Partie terminée !\n\nLe gagnant est ${gagnants[0]} avec ${maxScore} points !`,
    );
  } else {
    alert(
      `Partie terminée !\n\nÉgalité entre : ${gagnants.join(", ")} avec ${maxScore} points chacun !`,
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
  const btnCommencer = document.getElementById("btn-commencer");
  if (btnCommencer) {
    btnCommencer.addEventListener("click", () =>
      changerEcran("selection-joueurs"),
    );
  }

  const btnHistorique = document.getElementById("btn-historique");
  if (btnHistorique) {
    btnHistorique.addEventListener("click", () => {
      afficherHistorique();
      changerEcran("historique");
    });
  }

  const btnRetourHistorique = document.getElementById("btn-retour-historique");
  if (btnRetourHistorique) {
    btnRetourHistorique.addEventListener("click", () =>
      changerEcran("accueil"),
    );
  }

  document.querySelectorAll(".option-joueur").forEach((option) => {
    option.addEventListener("click", () => {
      const nombre = parseInt(option.dataset.joueurs);
      definirNombreJoueurs(nombre);
    });
  });

  const btnValiderJoueurs = document.getElementById("btn-valider-joueurs");
  if (btnValiderJoueurs) {
    btnValiderJoueurs.addEventListener("click", () =>
      validerJoueursEtParametrer(),
    );
  }

  const btnRetourJoueurs = document.getElementById("btn-retour-joueurs");
  if (btnRetourJoueurs) {
    btnRetourJoueurs.addEventListener("click", () => changerEcran("accueil"));
  }

  const btnDemarrerJeu = document.getElementById("btn-demarrer-jeu");
  if (btnDemarrerJeu) {
    btnDemarrerJeu.addEventListener("click", () => demarrerPartie());
  }

  const btnRetourParametres = document.getElementById("btn-retour-parametres");
  if (btnRetourParametres) {
    btnRetourParametres.addEventListener("click", () =>
      changerEcran("selection-theme"),
    );
  }

  // ========== ÉCRAN SÉLECTION THÈME ==========
  const btnSourceExistantes = document.getElementById("btn-source-existantes");
  if (btnSourceExistantes) {
    btnSourceExistantes.addEventListener("click", () =>
      selectionnerSourceQuestions("existantes")
    );
  }

  const btnSourceIa = document.getElementById("btn-source-ia");
  if (btnSourceIa) {
    btnSourceIa.addEventListener("click", () =>
      selectionnerSourceQuestions("ia")
    );
  }

  // Boutons de thème prédéfinis
  document.querySelectorAll(".bouton-theme").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectionnerTheme(btn.dataset.theme);
    });
  });

  // Thème personnalisé
  const btnThemePerso = document.getElementById("btn-theme-personnalise");
  if (btnThemePerso) {
    btnThemePerso.addEventListener("click", validerThemePersonnalise);
  }

  const inputThemePerso = document.getElementById("input-theme-personnalise");
  if (inputThemePerso) {
    inputThemePerso.addEventListener("keypress", (e) => {
      if (e.key === "Enter") validerThemePersonnalise();
    });
  }

  // Valider le thème
  const btnValiderTheme = document.getElementById("btn-valider-theme");
  if (btnValiderTheme) {
    btnValiderTheme.addEventListener("click", validerThemeEtContinuer);
  }

  // Retour depuis thème
  const btnRetourTheme = document.getElementById("btn-retour-theme");
  if (btnRetourTheme) {
    btnRetourTheme.addEventListener("click", () =>
      changerEcran("selection-joueurs")
    );
  }

  // Réessayer la génération
  const btnReessayer = document.getElementById("btn-reessayer");
  if (btnReessayer) {
    btnReessayer.addEventListener("click", reessayerGeneration);
  }

  const btnRetourReponses = document.getElementById("btn-retour-reponses");
  if (btnRetourReponses) {
    btnRetourReponses.addEventListener("click", () => {
      jeu.joueurActuel = null;
      document.querySelectorAll(".bouton-buzzer").forEach((btn) => {
        btn.disabled = false;
        btn.classList.remove("desactive");
        btn.classList.remove("buzzer-active");
      });
      changerEcran("jeu");
    });
  }

  const btnQuestionSuivante = document.getElementById("btn-question-suivante");
  if (btnQuestionSuivante) {
    btnQuestionSuivante.addEventListener("click", () =>
      passerQuestionSuivante(),
    );
  }

  const btnMenuPrincipal = document.getElementById("btn-menu-principal");
  if (btnMenuPrincipal) {
    btnMenuPrincipal.addEventListener("click", () => {
      sauvegarderPartie();
      changerEcran("accueil");
    });
  }

  initialiserControlesClavier();
}

document.addEventListener("DOMContentLoaded", async () => {
  await chargerToutesLesQuestions();
  initialiserEvenements();
  definirNombreJoueurs(2);
  console.log("Jeu initialisé avec succès!");

  if (jeu.toutesLesQuestions.length === 0) {
    console.warn("ATTENTION: Aucune question chargée.");
  }
});
