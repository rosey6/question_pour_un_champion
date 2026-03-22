// ============================================
// stockage/redis.js — Persistance via Upstash Redis
// ============================================

"use strict";

// Les variables d'environnement sont lues au premier require du module.
// En l'absence de configuration, toutes les operations retournent null
// sans provoquer d'erreur — la partie continue de fonctionner en memoire.

const URL_REDIS = process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN_REDIS = process.env.UPSTASH_REDIS_REST_TOKEN || "";

let clientRedis = null;

// Tentative d'initialisation du client Upstash Redis
if (URL_REDIS && TOKEN_REDIS) {
  try {
    const { Redis } = require("@upstash/redis");
    clientRedis = new Redis({ url: URL_REDIS, token: TOKEN_REDIS });
    console.log("[redis] Client Upstash Redis initialise");
  } catch (erreur) {
    console.warn("[redis] Impossible d'initialiser le client Redis :", erreur.message);
    clientRedis = null;
  }
} else {
  console.warn(
    "[redis] Variables UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN absentes — " +
      "le stockage Redis est desactive, les parties sont uniquement en memoire"
  );
}

// ============================================
// HELPERS INTERNES
// ============================================

/**
 * estDisponible — Verifie si le client Redis est pret a etre utilise.
 * @returns {boolean}
 */
function estDisponible() {
  return clientRedis !== null;
}

// ============================================
// API PUBLIQUE
// ============================================

/**
 * sauvegarderPartie — Sérialise et sauvegarde l'etat d'une partie dans Redis.
 * @param {string} codePartie - Code unique de la partie
 * @param {Object} etatPartie - Objet represantant l'etat complet de la partie
 * @param {number} [ttlSecondes=3600] - Duree de vie en secondes (defaut : 1 heure)
 * @returns {Promise<boolean>} true si la sauvegarde a reussi, false sinon
 */
async function sauvegarderPartie(codePartie, etatPartie, ttlSecondes = 3600) {
  if (!estDisponible()) return false;

  try {
    const cle = `partie:${codePartie}`;
    const valeur = JSON.stringify(etatPartie);
    await clientRedis.set(cle, valeur, { ex: ttlSecondes });
    return true;
  } catch (erreur) {
    console.error(`[redis] Erreur sauvegarderPartie(${codePartie}) :`, erreur.message);
    return false;
  }
}

/**
 * recupererPartie — Recupere et desérialise l'etat d'une partie depuis Redis.
 * @param {string} codePartie - Code unique de la partie
 * @returns {Promise<Object|null>} L'etat de la partie ou null si absent / erreur
 */
async function recupererPartie(codePartie) {
  if (!estDisponible()) return null;

  try {
    const cle = `partie:${codePartie}`;
    const valeur = await clientRedis.get(cle);
    if (valeur === null || valeur === undefined) return null;
    // Upstash deserialise automatiquement le JSON ; si c'est deja un objet on le retourne directement
    if (typeof valeur === "object") return valeur;
    return JSON.parse(valeur);
  } catch (erreur) {
    console.error(`[redis] Erreur recupererPartie(${codePartie}) :`, erreur.message);
    return null;
  }
}

/**
 * supprimerPartie — Supprime l'etat d'une partie de Redis.
 * @param {string} codePartie - Code unique de la partie
 * @returns {Promise<boolean>} true si la suppression a reussi, false sinon
 */
async function supprimerPartie(codePartie) {
  if (!estDisponible()) return false;

  try {
    const cle = `partie:${codePartie}`;
    await clientRedis.del(cle);
    return true;
  } catch (erreur) {
    console.error(`[redis] Erreur supprimerPartie(${codePartie}) :`, erreur.message);
    return false;
  }
}

module.exports = {
  sauvegarderPartie,
  recupererPartie,
  supprimerPartie,
};
