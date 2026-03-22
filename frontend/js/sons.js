// ============================================
// SONS.JS — Web Audio API (zéro fichier externe)
// ============================================

/** Instance AudioContext partagée (lazy init) */
let contexteAudio = null;

/**
 * Retourne le contexte audio, en le créant si nécessaire.
 * La création est différée pour respecter la politique autoplay des navigateurs.
 * @returns {AudioContext|null}
 */
function obtenirContexte() {
  if (contexteAudio) return contexteAudio;
  try {
    contexteAudio = new (window.AudioContext || window.webkitAudioContext)();
  } catch (erreur) {
    console.warn('[sons] Web Audio API non disponible :', erreur);
    return null;
  }
  return contexteAudio;
}

/**
 * Reprend le contexte audio s'il est suspendu (politique autoplay).
 */
async function reprendreContexte() {
  const ctx = obtenirContexte();
  if (!ctx) return null;
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  return ctx;
}

// ─── Utilitaire interne ────────────────────────────────────────────────────────

/**
 * Crée un oscillateur simple et le connecte à la sortie audio.
 * @param {AudioContext} ctx
 * @param {number} frequence - Fréquence en Hz
 * @param {number} debutSec  - Temps de début (ctx.currentTime + offset)
 * @param {number} dureeSec  - Durée de la note en secondes
 * @param {string} forme     - Forme d'onde ('sine'|'square'|'triangle'|'sawtooth')
 * @param {number} volume    - Gain de 0 à 1
 */
function jouerNote(ctx, frequence, debutSec, dureeSec, forme = 'sine', volume = 0.3) {
  const oscillateur = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillateur.connect(gain);
  gain.connect(ctx.destination);

  oscillateur.type = forme;
  oscillateur.frequency.setValueAtTime(frequence, debutSec);

  // Enveloppe : attaque instantanée, release sur la fin
  gain.gain.setValueAtTime(0, debutSec);
  gain.gain.linearRampToValueAtTime(volume, debutSec + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, debutSec + dureeSec);

  oscillateur.start(debutSec);
  oscillateur.stop(debutSec + dureeSec);
}

// ─── Sons par type ─────────────────────────────────────────────────────────────

/**
 * Bip court de minuteur (440 Hz, 80 ms).
 * @param {AudioContext} ctx
 */
function sonTic(ctx) {
  const t = ctx.currentTime;
  jouerNote(ctx, 440, t, 0.08, 'sine', 0.25);
}

/**
 * Mélodie montante do-mi-sol (bonne réponse).
 * @param {AudioContext} ctx
 */
function sonCorrect(ctx) {
  const t = ctx.currentTime;
  // do4 - mi4 - sol4
  jouerNote(ctx, 523.25, t,        0.12, 'sine', 0.4);
  jouerNote(ctx, 659.25, t + 0.13, 0.12, 'sine', 0.4);
  jouerNote(ctx, 783.99, t + 0.26, 0.22, 'sine', 0.4);
}

/**
 * Descente courte (mauvaise réponse).
 * @param {AudioContext} ctx
 */
function sonIncorrect(ctx) {
  const t = ctx.currentTime;
  // si3 descendant vers sol3
  jouerNote(ctx, 493.88, t,        0.15, 'sawtooth', 0.3);
  jouerNote(ctx, 369.99, t + 0.16, 0.25, 'sawtooth', 0.3);
}

/**
 * Jingle 3 notes de fin de partie.
 * @param {AudioContext} ctx
 */
function sonFin(ctx) {
  const t = ctx.currentTime;
  // do5 - sol4 - do5 (long)
  jouerNote(ctx, 1046.5, t,        0.18, 'sine', 0.45);
  jouerNote(ctx, 783.99, t + 0.2,  0.18, 'sine', 0.45);
  jouerNote(ctx, 1046.5, t + 0.4,  0.5,  'sine', 0.45);
}

// ─── API publique ──────────────────────────────────────────────────────────────

/**
 * Joue un son identifié par son type.
 * @param {'tic'|'correct'|'incorrect'|'fin'} type
 */
export async function jouerSon(type) {
  const ctx = await reprendreContexte();
  if (!ctx) return;

  switch (type) {
    case 'tic':       sonTic(ctx);       break;
    case 'correct':   sonCorrect(ctx);   break;
    case 'incorrect': sonIncorrect(ctx); break;
    case 'fin':       sonFin(ctx);       break;
    default:
      console.warn(`[sons] Type de son inconnu : "${type}"`);
  }
}
