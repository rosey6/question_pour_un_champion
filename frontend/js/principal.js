// ============================================
// PRINCIPAL.JS — Point d'entrée, orchestre tous les modules
// ============================================

import { restaurerSession, etat } from './etat.js';
import { connecter }               from './socket.js';
import { initialiserInterface }    from './interface.js';

/** URL du backend (doit correspondre à BACKEND_URL dans server.js) */
const URL_BACKEND = 'https://questionpourunchampion-backend.onrender.com';

// ─── Démarrage ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  console.log('[principal] Initialisation du jeu multijoueur (modules ES6)');

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

  // 4. Connecter au serveur Socket.IO et brancher tous les handlers
  connecter(URL_BACKEND);

  console.log('[principal] Prêt — partie :', etat.idPartie, '| pseudo :', etat.pseudo);
});
