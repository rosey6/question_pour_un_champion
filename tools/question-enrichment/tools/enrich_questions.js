import fs from "node:fs";
import path from "node:path";

const LOG_PATH = path.resolve(process.cwd(), "enrich_log.txt");
function log(...args) {
  console.log(...args);
  try {
    fs.appendFileSync(
      LOG_PATH,
      args.map(a => (a instanceof Error ? a.stack : String(a))).join(" ") + "\n",
      "utf-8"
    );
  } catch (_) {}
}

// --------- CONFIG ---------

// Overrides très ciblés (facultatif). Utilisés en priorité si match (question + réponse).
const OVERRIDES_QA = [
  // Exemple:
  // { whenQuestionIncludes: "arc-en-ciel", answer: "7", query: "arc-en-ciel sept couleurs" },
];

const MIN_DELAY_MS = 450;          // un peu plus lent pour éviter 429
const MAX_RETRIES = 8;
const BACKOFF_BASE_MS = 900;
const JITTER_MS = 350;

const IMAGE_WIDTH = 900;

const CACHE_DIR = path.resolve(process.cwd(), ".cache_enrich");
const SEARCH_CACHE_FILE = path.join(CACHE_DIR, "search_cache.json");
const ENTITY_CACHE_FILE = path.join(CACHE_DIR, "entity_cache.json");

function ensureCache() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (!fs.existsSync(SEARCH_CACHE_FILE)) fs.writeFileSync(SEARCH_CACHE_FILE, "{}", "utf-8");
  if (!fs.existsSync(ENTITY_CACHE_FILE)) fs.writeFileSync(ENTITY_CACHE_FILE, "{}", "utf-8");
}
function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); }
  catch { return {}; }
}
function saveJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf-8");
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
let lastRequestAt = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, MIN_DELAY_MS - (now - lastRequestAt));
  if (wait) await sleep(wait);
  lastRequestAt = Date.now();
}

function getArg(flag, def = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return def;
  return process.argv[idx + 1] ?? def;
}
function normalizeText(s) { return String(s ?? "").trim(); }
function isProbablyYear(str) { return /^\d{3,4}$/.test(String(str).trim()); }

function makePlaceholder(answer) {
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
    ${String(answer).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
  </text>
</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function getOverrideQuery(question, answer) {
  const q = String(question || "").toLowerCase();
  const a = String(answer || "").trim();
  for (const o of OVERRIDES_QA) {
    if (a === o.answer && q.includes(String(o.whenQuestionIncludes).toLowerCase())) {
      return o.query;
    }
  }
  return null;
}

/**
 * ✅ Requête hybride: réponse + contexte extrait de la question (sans inventer de lien).
 * Objectif: réduire ambiguïtés ("C", "H", "7", "Rouge", "Mercure"...).
 */
function buildQueryFromQuestion(question, answer) {
  const q = String(question || "").toLowerCase();
  const a = String(answer || "").trim();

  const tags = [];

  if (q.includes("capitale")) tags.push("capitale");
  if (q.includes("pays")) tags.push("pays");
  if (q.includes("océan") || q.includes("ocean")) tags.push("océan");
  if (q.includes("fleuve") || q.includes("rivière") || q.includes("riviere")) tags.push("fleuve");
  if (q.includes("planète") || q.includes("planete") || q.includes("plus proche du soleil")) tags.push("planète");
  if (q.includes("symbole chimique")) tags.push("élément chimique symbole");
  if (q.includes("élément chimique") || q.includes("element chimique")) tags.push("élément chimique");
  if (q.includes("monnaie")) tags.push("monnaie");
  if (q.includes("langue")) tags.push("langue");
  if (q.includes("désert") || q.includes("desert")) tags.push("désert");
  if (q.includes("muraille")) tags.push("monument");
  if (q.includes("révolution française") || q.includes("revolution francaise")) tags.push("Révolution française");
  if (q.includes("internet") || q.includes("arpanet")) tags.push("ARPANET");
  if (q.includes("sang")) tags.push("sang");
  if (q.includes("continent")) tags.push("continents Terre");
  if (q.includes("arc-en-ciel") || q.includes("arc en ciel")) tags.push("arc-en-ciel");

  // Cas "année": on garde le contexte de la question + l'année (sinon "1969" est trop vague)
  if (isProbablyYear(a)) return `${question} ${a}`.trim();

  const extra = tags.length ? " " + tags.join(" ") : "";
  return (a + extra).trim();
}

async function fetchJsonWithRetry(url) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle();
    const res = await fetch(url, {
      headers: { "User-Agent": "qpu-champion-enricher/1.2 (free; wikidata+commons)" }
    });

    if (res.ok) return await res.json();

    if ([429, 502, 503, 504].includes(res.status)) {
      const retryAfter = res.headers.get("retry-after");
      const retryAfterMs = retryAfter ? (parseFloat(retryAfter) * 1000) : 0;
      const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt) + Math.floor(Math.random() * JITTER_MS);
      const wait = Math.max(backoff, retryAfterMs);

      if (attempt === MAX_RETRIES) {
        throw new Error(`HTTP ${res.status} ${res.statusText} after retries for ${url}`);
      }
      log(`⏳ HTTP ${res.status} - retry dans ${wait} ms (tentative ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(wait);
      continue;
    }

    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  throw new Error(`Fetch failed for ${url}`);
}

function wikidataSearchUrl(query) {
  const q = encodeURIComponent(query);
  return `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${q}&language=fr&uselang=fr&format=json&limit=10&origin=*`;
}
function wikidataGetEntitiesUrl(ids) {
  const q = encodeURIComponent(ids.join("|"));
  return `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${q}&props=claims|descriptions|labels&languages=fr&format=json&origin=*`;
}
function commonsFilePathUrl(fileName) {
  const enc = encodeURIComponent(fileName.replace(/^File:/i, ""));
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${enc}?width=${IMAGE_WIDTH}`;
}
function getClaimFileName(entity, prop) {
  const claims = entity?.claims?.[prop];
  if (!claims || !claims.length) return null;
  const dv = claims[0]?.mainsnak?.datavalue?.value;
  if (typeof dv === "string" && dv.trim()) return dv.trim();
  return null;
}

function scoreCandidate(searchItem, answer, question) {
  const label = (searchItem.label || "").toLowerCase();
  const desc = (searchItem.description || "").toLowerCase();
  const a = answer.toLowerCase();
  const q = question.toLowerCase();

  let s = 0;
  if (label === a) s += 80;
  if (label.includes(a)) s += 35;
  if (a.includes(label) && label.length > 2) s += 15;

  const hints = [
    ["capitale", q.includes("capitale")],
    ["océan", q.includes("océan") || q.includes("ocean")],
    ["fleuve", q.includes("fleuve") || q.includes("rivière") || q.includes("riviere")],
    ["planète", q.includes("planète") || q.includes("planete")],
    ["élément", q.includes("symbole chimique") || q.includes("élément chimique") || q.includes("element chimique")],
    ["désert", q.includes("désert") || q.includes("desert")],
    ["langue", q.includes("langue")],
    ["monnaie", q.includes("monnaie")],
  ];
  for (const [word, ok] of hints) if (ok && desc.includes(word)) s += 12;

  const bad = ["album","film","série","serie","jeu vidéo","jeu video","chanson","épisode","episode","comédie","comedie"];
  for (const b of bad) if (desc.includes(b)) s -= 35;

  if (!desc) s -= 5;
  return s;
}

async function pickBestWikidataEntity(query, answer, question, searchCache) {
  const key = `fr|${query}`;
  if (Object.prototype.hasOwnProperty.call(searchCache, key)) return searchCache[key];

  const search = await fetchJsonWithRetry(wikidataSearchUrl(query));
  const items = (search.search || []).filter(x => x.id && x.label);
  if (!items.length) {
    searchCache[key] = null;
    return null;
  }

  let best = items[0];
  let bestScore = -1e9;
  for (const it of items) {
    const sc = scoreCandidate(it, answer, question);
    if (sc > bestScore) { bestScore = sc; best = it; }
  }

  const out = { id: best.id, label: best.label, description: best.description || "" };
  searchCache[key] = out;
  return out;
}

async function getIllustrationFromWikidata(entityId, entityCache) {
  if (Object.prototype.hasOwnProperty.call(entityCache, entityId)) return entityCache[entityId];

  const data = await fetchJsonWithRetry(wikidataGetEntitiesUrl([entityId]));
  const entity = data?.entities?.[entityId];
  if (!entity) {
    entityCache[entityId] = null;
    return null;
  }

  const file =
    getClaimFileName(entity, "P18") ||
    getClaimFileName(entity, "P41") ||
    getClaimFileName(entity, "P154") ||
    getClaimFileName(entity, "P94") ||
    getClaimFileName(entity, "P242");

  if (!file) {
    entityCache[entityId] = null;
    return null;
  }

  const out = { imageUrl: commonsFilePathUrl(file) };
  entityCache[entityId] = out;
  return out;
}

function shortIllustrationText(answer, wikidataDesc) {
  const a = normalizeText(answer);
  const d = normalizeText(wikidataDesc);
  if (!d) return a;
  const txt = `${a} — ${d}`;
  return txt.length > 140 ? txt.slice(0, 137) + "…" : txt;
}

// --------- MAIN ---------
async function main() {
  try {
    ensureCache();
    const searchCache = loadJson(SEARCH_CACHE_FILE);
    const entityCache = loadJson(ENTITY_CACHE_FILE);

    log("🚀 enrich_questions_v3.3: démarrage");
    log("📁 Dossier courant:", process.cwd());
    log("📝 Log:", LOG_PATH);

    const inPath = getArg("--in");
    const outPath = getArg("--out");
    if (!inPath || !outPath) throw new Error("Arguments requis: --in <input.json> --out <output.json>");

    const inputFile = path.resolve(inPath);
    const outputFile = path.resolve(outPath);

    const raw = await fs.promises.readFile(inputFile, "utf-8");
    const questions = JSON.parse(raw);
    if (!Array.isArray(questions)) throw new Error("Le fichier d'entrée doit être un tableau JSON");

    log(`📊 ${questions.length} questions chargées`);

    const out = [];
    let ok = 0, placeholder = 0, netErr = 0;

    for (let i = 0; i < questions.length; i++) {
      const qObj = questions[i];
      const question = normalizeText(qObj.question);
      const answer = normalizeText(qObj.reponseCorrecte);

      const overrideQuery = getOverrideQuery(question, answer);
      const query = overrideQuery ?? buildQueryFromQuestion(question, answer);

      try {
        const best = await pickBestWikidataEntity(query, answer, question, searchCache);

        let imageUrl = null;
        let illustrationTexte = "";

        if (best?.id) {
          const ill = await getIllustrationFromWikidata(best.id, entityCache);
          imageUrl = ill?.imageUrl ?? null;
          illustrationTexte = shortIllustrationText(answer, best.description);
        }

        if (!imageUrl) {
          imageUrl = makePlaceholder(answer);
          illustrationTexte = illustrationTexte || answer;
          placeholder++;
        } else {
          ok++;
        }

        out.push({
          ...qObj,
          imageUrl,
          illustrationTexte,
          wikidataId: best?.id ?? null,
          wikidataLabel: best?.label ?? null,
          wikidataQuery: query
        });
      } catch (e) {
        netErr++;
        out.push({
          ...qObj,
          imageUrl: makePlaceholder(answer),
          illustrationTexte: answer,
          wikidataId: null,
          wikidataLabel: null,
          wikidataQuery: query
        });
        log("⚠️ Erreur question", i + 1, ":", e instanceof Error ? e.message : e);
      }

      if ((i + 1) % 10 === 0) {
        log(`⏳ Progression: ${i + 1}/${questions.length} (ok=${ok}, placeholder=${placeholder}, erreurs=${netErr})`);
        saveJson(SEARCH_CACHE_FILE, searchCache);
        saveJson(ENTITY_CACHE_FILE, entityCache);
      }
    }

    saveJson(SEARCH_CACHE_FILE, searchCache);
    saveJson(ENTITY_CACHE_FILE, entityCache);

    await fs.promises.writeFile(outputFile, JSON.stringify(out, null, 2), "utf-8");
    log("✅ Terminé. Fichier généré:", outputFile);
    log(`📌 Résumé: images Wikidata/Commons=${ok}, placeholders=${placeholder}, erreurs=${netErr}`);
    log("💾 Cache:", CACHE_DIR);
  } catch (e) {
    log("❌ Erreur fatale:", e instanceof Error ? e.stack : e);
    process.exit(1);
  }
}

main();
