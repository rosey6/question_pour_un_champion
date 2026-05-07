// ============================================
// SONS.JS — Librairie audio structurée
// Support MP3 (BufferSource) + fallback synthèse Web Audio API
// ============================================

const CHEMIN_AUDIO = 'assets/audio/';

/** Volume global (0.0–1.0) */
let _volume = 0.7;
let _mute   = false;

/** AudioContext partagé (lazy init) */
let _contexte    = null;
/** GainNode maître — contrôle volume global */
let _gainMaitre  = null;
/** Buffers MP3 préchargés : nom → AudioBuffer */
const _buffers   = {};

// ─── Configuration des sons ───────────────────────────────────────────────────

const CONFIG_SONS = {
  bonneReponse: {
    fichier: null,
    synthese(ctx, t, vol) {
      _note(ctx, 523, t,        0.12, 'sine', vol);
      _note(ctx, 659, t + 0.13, 0.12, 'sine', vol);
      _note(ctx, 784, t + 0.26, 0.22, 'sine', vol);
    },
  },
  mauvaiseReponse: {
    fichier: null,
    synthese(ctx, t, vol) {
      _note(ctx, 220, t,       0.30, 'square', vol * 0.7);
      _note(ctx, 165, t + 0.3, 0.30, 'square', vol * 0.4);
    },
  },
  clic: {
    fichier: null,
    synthese(ctx, t, vol) {
      _note(ctx, 880, t, 0.05, 'sine', vol * 0.4);
    },
  },
  selectionReponse: {
    fichier: null,
    synthese(ctx, t, vol) {
      _note(ctx, 660, t,        0.05, 'triangle', vol * 0.45);
      _note(ctx, 990, t + 0.06, 0.06, 'triangle', vol * 0.35);
    },
  },
  toggle: {
    fichier: null,
    synthese(ctx, t, vol) {
      _note(ctx, 520, t,        0.04, 'sine', vol * 0.32);
      _note(ctx, 700, t + 0.05, 0.05, 'sine', vol * 0.28);
    },
  },
  popJoueur: {
    fichier: null,
    synthese(ctx, t, vol) {
      _note(ctx, 740, t, 0.07, 'sine', vol * 0.32);
    },
  },
  buzzerGagne: {
    fichier: null,
    synthese(ctx, t, vol) {
      _note(ctx, 523, t,        0.12, 'sine', vol * 0.7);
      _note(ctx, 659, t + 0.13, 0.12, 'sine', vol * 0.8);
      _note(ctx, 784, t + 0.26, 0.18, 'sine', vol);
    },
  },
  buzzerPris: {
    fichier: null,
    synthese(ctx, t, vol) {
      _note(ctx, 440, t, 0.15, 'square', vol * 0.4);
    },
  },
  indiceRevele: {
    fichier: null,
    synthese(ctx, t, vol) {
      _note(ctx, 392, t,        0.10, 'sine', vol * 0.5);
      _note(ctx, 440, t + 0.12, 0.15, 'sine', vol * 0.6);
    },
  },
  mancheDebut: {
    fichier: null,
    synthese(ctx, t, vol) {
      _note(ctx, 523, t,        0.15, 'sine', vol);
      _note(ctx, 659, t + 0.15, 0.15, 'sine', vol);
      _note(ctx, 784, t + 0.30, 0.20, 'sine', vol);
    },
  },
  mancheFin: {
    fichier: null,
    synthese(ctx, t, vol) {
      _note(ctx, 784, t,        0.12, 'sine', vol);
      _note(ctx, 659, t + 0.13, 0.12, 'sine', vol);
      _note(ctx, 523, t + 0.26, 0.30, 'sine', vol);
    },
  },
  scenarioAnnonce: {
    fichier: null,
    synthese(ctx, t, vol) {
      _note(ctx, 440, t,        0.10, 'sine', vol);
      _note(ctx, 554, t + 0.12, 0.10, 'sine', vol);
      _note(ctx, 659, t + 0.24, 0.10, 'sine', vol);
      _note(ctx, 880, t + 0.36, 0.30, 'sine', vol);
    },
  },
  podium1er: {
    fichier: null,
    synthese(ctx, t, vol) {
      _note(ctx, 523,  t,       0.18, 'sine', vol);
      _note(ctx, 784,  t + 0.2, 0.18, 'sine', vol);
      _note(ctx, 1046, t + 0.4, 0.50, 'sine', vol);
    },
  },
  quatreASuite: {
    fichier: null,
    synthese(ctx, t, vol) {
      [523, 659, 784, 1046].forEach((freq, i) => _note(ctx, freq, t + i * 0.11, 0.16, 'triangle', vol * 0.8));
    },
  },
  mainChange: {
    fichier: null,
    synthese(ctx, t, vol) {
      _note(ctx, 330, t, 0.10, 'sawtooth', vol * 0.35);
      _note(ctx, 660, t + 0.11, 0.12, 'sawtooth', vol * 0.35);
    },
  },
  streakMonte: {
    fichier: null,
    synthese(ctx, t, vol) {
      // Glissando 440→660 Hz
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(_gainMaitre);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.linearRampToValueAtTime(660, t + 0.3);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    },
  },
  streakBriser: {
    fichier: null,
    synthese(ctx, t, vol) {
      _note(ctx, 220, t, 0.6, 'square', vol * 0.5);
    },
  },
  minuteurTic: {
    fichier: null,
    synthese(ctx, t, vol, opts = {}) {
      _note(ctx, opts.frequence ?? 440, t, 0.10, 'sine', vol * 0.5);
    },
  },
  tempsEcoule: {
    fichier: null,
    synthese(ctx, t, vol) {
      _note(ctx, 200, t, 0.8, 'sine', vol * 0.6);
    },
  },
};

// ─── Utilitaires internes ─────────────────────────────────────────────────────

function _obtenirContexte() {
  if (_contexte) return _contexte;
  try {
    _contexte   = new (window.AudioContext || window.webkitAudioContext)();
    _gainMaitre = _contexte.createGain();
    _gainMaitre.gain.value = _mute ? 0 : _volume;
    _gainMaitre.connect(_contexte.destination);
  } catch (e) {
    console.warn('[sons] Web Audio API non disponible :', e);
    return null;
  }
  return _contexte;
}

async function _reprendreContexte() {
  const ctx = _obtenirContexte();
  if (!ctx) return null;
  if (ctx.state === 'suspended') await ctx.resume();
  return ctx;
}

function _note(ctx, freq, debut, duree, forme = 'sine', vol = 0.3) {
  try {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(_gainMaitre);
    osc.type = forme;
    osc.frequency.setValueAtTime(freq, debut);
    gain.gain.setValueAtTime(0, debut);
    gain.gain.linearRampToValueAtTime(vol, debut + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, debut + duree);
    osc.start(debut);
    osc.stop(debut + duree);
  } catch (e) {
    console.warn('[sons] Erreur note :', e);
  }
}

async function _chargerBuffer(nom, fichier) {
  try {
    const reponse = await fetch(`${CHEMIN_AUDIO}${fichier}`);
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const donneesBrutes = await reponse.arrayBuffer();
    const ctx = _obtenirContexte();
    if (!ctx) return;
    _buffers[nom] = await ctx.decodeAudioData(donneesBrutes);
  } catch (e) {
    console.warn(`[sons] "${fichier}" introuvable — synthèse utilisée (${e.message})`);
  }
}

function _jouerBuffer(buffer, ctx) {
  try {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(_gainMaitre);
    source.start(ctx.currentTime);
  } catch (e) {
    console.warn('[sons] Erreur lecture buffer :', e);
  }
}

// ─── API publique ─────────────────────────────────────────────────────────────

export const Sons = {
  /**
   * Joue un son par son nom.
   * Utilise le buffer MP3 si préchargé, sinon la synthèse oscillateur.
   * @param {string} nom - Identifiant du son (ex: 'bonneReponse')
   * @param {Object} [opts] - Options (ex: { frequence: 440 } pour minuteurTic)
   */
  async jouer(nom, opts = {}) {
    try {
      const ctx = await _reprendreContexte();
      if (!ctx) return;
      const config = CONFIG_SONS[nom];
      if (!config) {
        console.warn(`[sons] Son inconnu : "${nom}"`);
        return;
      }
      if (config.fichier && _buffers[nom]) {
        _jouerBuffer(_buffers[nom], ctx);
      } else {
        config.synthese(ctx, ctx.currentTime, _volume * 0.8, opts);
      }
    } catch (e) {
      console.warn(`[sons] Erreur jouer("${nom}") :`, e);
    }
  },

  /**
   * Définit le volume global (0.0–1.0) et le persiste dans localStorage.
   * @param {number} v
   */
  setVolume(v) {
    _volume = Math.max(0, Math.min(1, Number(v)));
    if (_gainMaitre) _gainMaitre.gain.value = _mute ? 0 : _volume;
    try { localStorage.setItem('qpuc_volume', _volume.toString()); } catch (_) {}
  },

  muter() {
    _mute = true;
    if (_gainMaitre) _gainMaitre.gain.value = 0;
  },

  demuter() {
    _mute = false;
    if (_gainMaitre) _gainMaitre.gain.value = _volume;
  },

  toggleMute() {
    _mute ? this.demuter() : this.muter();
  },

  estMute() {
    return _mute;
  },

  /**
   * Précharge tous les fichiers MP3 déclarés.
   * Les sons sans fichier MP3 utilisent la synthèse — pas d'erreur.
   * @returns {Promise<void>}
   */
  async chargerTout() {
    const ctx = _obtenirContexte();
    if (!ctx) return;
    const chargements = Object.entries(CONFIG_SONS)
      .filter(([, cfg]) => cfg.fichier)
      .map(([nom, cfg]) => _chargerBuffer(nom, cfg.fichier));
    await Promise.allSettled(chargements);
  },

  // ─── Musique de fond adaptative (Mission 6) ──────────────────────────────────
  musique: {
    _gain:   null,
    _source: null,
    _piste:  null,
    _volume: 0.35,

    _noeudGain() {
      const ctx = _obtenirContexte();
      if (!ctx) return null;
      if (!this._gain) {
        this._gain = ctx.createGain();
        this._gain.gain.value = this._volume;
        this._gain.connect(ctx.destination);
      }
      return this._gain;
    },

    async jouer(nom) {
      if (this._piste === nom) return;
      const PISTES = {
        attente:  'musique-attente.mp3',
        question: 'musique-question.mp3',
        finale:   'musique-finale.mp3',
      };
      const fichier = PISTES[nom];
      if (!fichier) return;

      await this._arreter(true);

      const ctx = await _reprendreContexte();
      if (!ctx) return;
      const gainNoeud = this._noeudGain();
      if (!gainNoeud) return;

      try {
        const rep = await fetch(`${CHEMIN_AUDIO}${fichier}`);
        if (!rep.ok) return;
        const buf = await ctx.decodeAudioData(await rep.arrayBuffer());
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(gainNoeud);
        src.start(0);
        this._source = src;
        this._piste  = nom;
        gainNoeud.gain.setValueAtTime(0, ctx.currentTime);
        gainNoeud.gain.linearRampToValueAtTime(this._volume, ctx.currentTime + 1.5);
      } catch { /* Fichier absent → silence gracieux */ }
    },

    async _arreter(fadeout = false) {
      if (!this._source) return;
      const src = this._source;
      this._source = null;
      this._piste  = null;
      const ctx = _obtenirContexte();
      if (fadeout && this._gain && ctx) {
        const t = ctx.currentTime;
        this._gain.gain.setValueAtTime(this._gain.gain.value, t);
        this._gain.gain.linearRampToValueAtTime(0, t + 0.8);
        await new Promise(r => setTimeout(r, 850));
      }
      try { src.stop(); } catch {}
    },

    arreter() { return this._arreter(true); },

    setVolume(v) {
      this._volume = Math.max(0, Math.min(1, Number(v)));
      const ctx = _obtenirContexte();
      if (this._gain && ctx) {
        this._gain.gain.linearRampToValueAtTime(this._volume, ctx.currentTime + 0.3);
      }
    },
  },
};

const ALIAS_SONS = {
  tic: 'minuteurTic',
  correct: 'bonneReponse',
  incorrect: 'mauvaiseReponse',
  fin: 'podium1er',
};

/**
 * Compatibilité avec les anciens modules qui appellent jouerSon('correct').
 * @param {string} type
 * @param {Object} [opts]
 */
export async function jouerSon(type, opts = {}) {
  return Sons.jouer(ALIAS_SONS[type] || type, opts);
}

// Restaurer le volume persisté au chargement du module
try {
  const volSauve = parseFloat(localStorage.getItem('qpuc_volume') ?? '0.7');
  if (!isNaN(volSauve)) _volume = Math.max(0, Math.min(1, volSauve));
} catch (_) {}
