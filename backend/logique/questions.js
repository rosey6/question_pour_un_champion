// ============================================
// logique/questions.js — Gestion et generation des questions
// ============================================

"use strict";

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ============================================
// UTILITAIRES
// ============================================

/**
 * melangerTableau — Melange un tableau en place avec l'algorithme Fisher-Yates.
 * @param {Array} tableau - Le tableau a melanger
 * @returns {Array} Le meme tableau, melange
 */
function melangerTableau(tableau) {
  for (let i = tableau.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tableau[i], tableau[j]] = [tableau[j], tableau[i]];
  }
  return tableau;
}

/**
 * piocherQuestion — Retourne la question a l'index donne, ou null si la liste est epuisee.
 * @param {Array} questions - Tableau de questions
 * @param {number} indexActuel - Index de la question a retourner
 * @returns {Object|null} La question ou null
 */
function piocherQuestion(questions, indexActuel) {
  if (!Array.isArray(questions) || indexActuel < 0 || indexActuel >= questions.length) {
    return null;
  }
  return questions[indexActuel];
}

// ============================================
// CONSTRUCTION DU PROMPT GROQ
// ============================================

/**
 * construirePrompt — Genere le prompt envoye a Groq pour la generation de questions.
 * @param {string} theme - Theme des questions
 * @param {number} nombre - Nombre de questions a generer
 * @returns {string}
 */
function construirePrompt(theme, nombre) {
  return `Génère exactement ${nombre} questions de quiz de culture générale sur le thème "${theme}".

IMPORTANT: Ta réponse doit être UNIQUEMENT un tableau JSON valide, sans aucun texte avant ou après.

Format JSON requis:
[
  {
    "question": "La question complète en français avec un point d'interrogation",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "reponseCorrecte": "La bonne réponse (doit être exactement une des 4 options)"
  }
]

Règles strictes:
- Exactement ${nombre} questions
- Questions en français
- Chaque question a exactement 4 options
- Une seule réponse correcte par question
- La reponseCorrecte doit correspondre EXACTEMENT à une des options
- Difficulté variée (facile, moyen, difficile)
- Questions factuelles avec des réponses vérifiables
- Évite les questions trop obscures ou controversées

Génère maintenant les ${nombre} questions sur "${theme}":`;
}

// ============================================
// ENRICHISSEMENT WIKIDATA
// ============================================

/**
 * construireRequeteRecherche — Fabrique la requete de recherche Wikidata a partir d'une question et de sa reponse.
 * @param {string} question
 * @param {string} reponse
 * @returns {string}
 */
function construireRequeteRecherche(question, reponse) {
  const q = String(question || "").toLowerCase();
  const r = String(reponse || "").trim();
  const etiquettes = [];

  if (q.includes("capitale")) etiquettes.push("capitale");
  if (q.includes("pays")) etiquettes.push("pays");
  if (q.includes("océan") || q.includes("ocean")) etiquettes.push("océan");
  if (q.includes("fleuve") || q.includes("rivière")) etiquettes.push("fleuve");
  if (q.includes("planète") || q.includes("planete")) etiquettes.push("planète");
  if (q.includes("symbole chimique")) etiquettes.push("élément chimique symbole");
  if (q.includes("élément chimique")) etiquettes.push("élément chimique");
  if (q.includes("monnaie")) etiquettes.push("monnaie");
  if (q.includes("langue")) etiquettes.push("langue");
  if (q.includes("désert")) etiquettes.push("désert");
  if (q.includes("monument")) etiquettes.push("monument");

  // Si c'est une annee, inclure le contexte de la question
  if (/^\d{3,4}$/.test(r)) {
    return `${question} ${r}`.trim();
  }

  const complement = etiquettes.length ? " " + etiquettes.join(" ") : "";
  return (r + complement).trim();
}

/**
 * rechercherWikidata — Cherche une entite sur Wikidata.
 * @param {string} requete
 * @returns {Promise<Object|null>}
 */
async function rechercherWikidata(requete) {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(requete)}&language=fr&uselang=fr&format=json&limit=5&origin=*`;
    const reponse = await fetch(url, {
      headers: { "User-Agent": "qpu-champion-backend/1.0" },
    });
    if (!reponse.ok) return null;
    const donnees = await reponse.json();
    return donnees.search?.[0] || null;
  } catch {
    return null;
  }
}

/**
 * obtenirImageWikidata — Recupere l'URL d'image associee a une entite Wikidata.
 * @param {string} idEntite - Identifiant Wikidata (ex: "Q142")
 * @returns {Promise<string|null>}
 */
async function obtenirImageWikidata(idEntite) {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${idEntite}&props=claims&format=json&origin=*`;
    const reponse = await fetch(url, {
      headers: { "User-Agent": "qpu-champion-backend/1.0" },
    });
    if (!reponse.ok) return null;
    const donnees = await reponse.json();
    const entite = donnees.entities?.[idEntite];
    if (!entite) return null;

    const proprieteImages = ["P18", "P41", "P154", "P94", "P242"];
    for (const prop of proprieteImages) {
      const affirmation = entite.claims?.[prop]?.[0];
      const nomFichier = affirmation?.mainsnak?.datavalue?.value;
      if (nomFichier) {
        return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(nomFichier)}?width=900`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * creerPlaceholderSvg — Cree une image placeholder SVG encodee en data URI.
 * @param {string} reponse - Texte a afficher dans le placeholder
 * @returns {string} Data URI SVG
 */
function creerPlaceholderSvg(reponse) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#72DDF7"/>
      <stop offset="35%" stop-color="#8093F1"/>
      <stop offset="70%" stop-color="#B388EB"/>
      <stop offset="100%" stop-color="#F7AEF8"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="64" fill="#111">
    ${String(reponse).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
  </text>
</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

/**
 * enrichirQuestion — Ajoute illustration Wikidata (image + description) a une question.
 * Retourne toujours un objet question enrichi, avec placeholder si Wikidata echoue.
 * @param {Object} questionObj - Question brute issue de Groq
 * @returns {Promise<Object>} Question enrichie
 */
async function enrichirQuestion(questionObj) {
  const question = questionObj.question || "";
  const reponse = questionObj.reponseCorrecte || "";
  const requete = construireRequeteRecherche(question, reponse);

  try {
    const entite = await rechercherWikidata(requete);
    if (entite?.id) {
      const urlImage = await obtenirImageWikidata(entite.id);
      return {
        ...questionObj,
        wikidataId: entite.id,
        wikidataLabel: entite.label,
        illustrationTexte: entite.description
          ? `${reponse} — ${entite.description}`.slice(0, 140)
          : reponse,
        imageUrl: urlImage || creerPlaceholderSvg(reponse),
      };
    }
  } catch (erreur) {
    console.log("[questions] Erreur enrichissement:", erreur.message);
  }

  return {
    ...questionObj,
    wikidataId: null,
    wikidataLabel: null,
    illustrationTexte: reponse,
    imageUrl: creerPlaceholderSvg(reponse),
  };
}

// ============================================
// GENERATION VIA GROQ
// ============================================

/**
 * genererQuestionsViaGroq — Genere et enrichit des questions via l'API Groq (IA).
 * Utilise llama-3.3-70b-versatile (modele gratuit).
 * @param {string} theme - Theme des questions
 * @param {number} nombre - Nombre de questions souhaitees (max 30)
 * @returns {Promise<Array>} Tableau de questions enrichies
 * @throws {Error} Si la cle API est absente, si Groq repond une erreur, ou si le JSON est invalide
 */
async function genererQuestionsViaGroq(theme, nombre) {
  const nombreQuestions = Math.min(Math.max(1, parseInt(nombre) || 10), 30);

  console.log(`[questions] Generation de ${nombreQuestions} questions sur "${theme}"...`);

  if (!GROQ_API_KEY) {
    throw new Error("La cle API Groq n'est pas configuree (variable GROQ_API_KEY manquante)");
  }

  const reponseGroq = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: construirePrompt(theme, nombreQuestions) }],
      max_tokens: 4096,
      temperature: 0.7,
    }),
  });

  if (!reponseGroq.ok) {
    const donneesErreur = await reponseGroq.json().catch(() => ({}));
    throw new Error(donneesErreur.error?.message || `Erreur Groq: ${reponseGroq.status}`);
  }

  const donneesGroq = await reponseGroq.json();
  let texteReponse = donneesGroq.choices?.[0]?.message?.content?.trim() || "";

  if (!texteReponse) {
    throw new Error("Reponse vide de Groq");
  }

  // Nettoyer les blocs de code markdown si presents
  if (texteReponse.startsWith("```")) {
    const lignes = texteReponse.split("\n");
    const lignesJson = [];
    let dansJson = false;
    for (const ligne of lignes) {
      if (ligne.startsWith("```") && !dansJson) {
        dansJson = true;
        continue;
      } else if (ligne.startsWith("```") && dansJson) {
        break;
      } else if (dansJson) {
        lignesJson.push(ligne);
      }
    }
    texteReponse = lignesJson.join("\n");
  }

  const questions = JSON.parse(texteReponse);

  if (!Array.isArray(questions)) {
    throw new Error("La reponse n'est pas un tableau JSON");
  }

  // Valider et corriger les questions
  for (const q of questions) {
    if (!q.question || !q.options || !q.reponseCorrecte) {
      throw new Error("Question mal formatee");
    }
    if (q.options.length !== 4) {
      throw new Error("Chaque question doit avoir 4 options");
    }
    if (!q.options.includes(q.reponseCorrecte)) {
      q.reponseCorrecte = q.options[0];
    }
  }

  console.log(`[questions] ${questions.length} questions generees, enrichissement Wikidata...`);

  // Enrichir en lot de 3 (respecte le rate limiting Wikidata)
  const questionsEnrichies = [];
  for (let i = 0; i < questions.length; i += 3) {
    const lot = questions.slice(i, i + 3);
    const lotEnrichi = await Promise.all(lot.map(enrichirQuestion));
    questionsEnrichies.push(...lotEnrichi);
    if (i + 3 < questions.length) {
      await new Promise((resoudre) => setTimeout(resoudre, 500));
    }
  }

  console.log(`[questions] Enrichissement termine (${questionsEnrichies.length} questions)`);
  return questionsEnrichies;
}

module.exports = {
  melangerTableau,
  piocherQuestion,
  genererQuestionsViaGroq,
  enrichirQuestion,
  creerPlaceholderSvg,
};
