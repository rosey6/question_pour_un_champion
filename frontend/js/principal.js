// ============================================
// PRINCIPAL.JS — Point d'entrée, orchestre tous les modules
// ============================================

import { restaurerSession, etat } from './etat.js';
import { connecter }               from './socket.js';
import { initialiserInterface }    from './interface.js';
import { Sons as SonsModule }      from './sons.js';
import { initialiserBoutonsTheme, initialiserTheme } from './theme.js';

/** URL du backend — détection automatique localhost vs production */
const URL_BACKEND = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '')
  ? `http://${location.hostname || 'localhost'}:3000`
  : 'https://questionpourunchampion-backend.onrender.com';

window.Sons = window.Sons || SonsModule;

function initialiserMicroSons() {
  if (window.__qpucMicroSonsInitialises) return;
  window.__qpucMicroSonsInitialises = true;

  document.addEventListener('click', (event) => {
    const elementSonore = event.target.closest('[data-sound]');
    if (!elementSonore) return;
    window.Sons?.jouer?.(elementSonore.dataset.sound);
  });
}

// ─── Service Worker (Mission 8) ────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ─── Widget volume (Mission 9) ─────────────────────────────────────────────────

function initialiserWidgetVolume() {
  const btn         = document.getElementById('btn-volume-toggle');
  const panneau     = document.getElementById('panneau-volume');
  const sliderSfx   = document.getElementById('slider-sfx');
  const sliderMus   = document.getElementById('slider-musique');
  const valSfx      = document.getElementById('val-sfx');
  const valMus      = document.getElementById('val-musique');
  const icone       = document.getElementById('vol-icone');
  if (!btn) return;

  // Restaurer volumes sauvegardés
  const vSfx = parseFloat(localStorage.getItem('qpuc_volume')         ?? '0.7');
  const vMus = parseFloat(localStorage.getItem('qpuc_volume_musique') ?? '0.35');
  if (sliderSfx) sliderSfx.value = Math.round(vSfx * 100);
  if (sliderMus) sliderMus.value = Math.round(vMus * 100);
  if (valSfx)   valSfx.textContent   = `${Math.round(vSfx * 100)}%`;
  if (valMus)   valMus.textContent   = `${Math.round(vMus * 100)}%`;
  _mettreAJourIconeVolume(icone, vSfx);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    panneau?.classList.toggle('hidden');
  });

  sliderSfx?.addEventListener('input', () => {
    const v = parseInt(sliderSfx.value) / 100;
    if (valSfx) valSfx.textContent = `${sliderSfx.value}%`;
    window.Sons?.setVolume?.(v);
    _mettreAJourIconeVolume(icone, v);
  });

  sliderMus?.addEventListener('input', () => {
    const v = parseInt(sliderMus.value) / 100;
    if (valMus) valMus.textContent = `${sliderMus.value}%`;
    window.Sons?.musique?.setVolume?.(v);
    try { localStorage.setItem('qpuc_volume_musique', v.toString()); } catch {}
  });

  document.addEventListener('click', (e) => {
    const widget = document.getElementById('widget-volume');
    if (widget && !widget.contains(e.target)) panneau?.classList.add('hidden');
  });
}

function _mettreAJourIconeVolume(icone, v) {
  if (!icone) return;
  icone.textContent = v === 0 ? '🔇' : v < 0.35 ? '🔉' : '🔊';
}

// ─── Démarrage ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[principal] Initialisation du jeu multijoueur (modules ES6)');
  initialiserTheme();
  initialiserBoutonsTheme();
  initialiserMicroSons();

  // 1. Lire les données de session (sessionStorage + multiGameData legacy)
  restaurerSession();

  // 2. Vérifier que des données de partie existent — sinon rediriger
  if (!etat.donneesPartie && !etat.idPartie) {
    console.error('[principal] Aucune donnée de partie — redirection');
    window.location.href = 'multijoueur.html';
    return;
  }

  // 3. Initialiser l'interface selon le rôle du joueur
  initialiserInterface();

  // 4. Précharger les assets audio (non bloquant si absent)
  const indicateur = document.createElement('div');
  indicateur.id = 'chargement-audio';
  indicateur.style.cssText = 'position:fixed;bottom:16px;right:16px;font-size:12px;color:rgba(255,255,255,0.4);font-family:var(--font-sans)';
  indicateur.textContent = 'Chargement audio…';
  document.body.appendChild(indicateur);

  try {
    await window.Sons?.chargerTout?.();
  } catch (e) {
    console.warn('[principal] Préchargement audio échoué (synthèse utilisée) :', e);
  } finally {
    indicateur.remove();
  }

  // 5. Initialiser le widget volume
  initialiserWidgetVolume();

  // 6. Connecter au serveur Socket.IO et brancher tous les handlers
  connecter(URL_BACKEND);

  console.log('[principal] Prêt — partie :', etat.idPartie, '| pseudo :', etat.pseudo);
});
