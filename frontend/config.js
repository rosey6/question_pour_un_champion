// Configuration front-end (centralisée)
//
// - window.BACKEND_URL : URL du serveur Render (Socket.IO)
// - window.BASE_URL    : base pour construire des liens locaux (QR code)
//
// Vous pouvez surcharger l'URL backend en définissant window.__BACKEND_URL
// avant de charger ce fichier.

(function () {
  "use strict";

  const DEFAULT_BACKEND_URL = "https://questionpourunchampion-backend.onrender.com";

  const override = typeof window.__BACKEND_URL === "string" ? window.__BACKEND_URL : "";
  window.BACKEND_URL = (override || window.BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/$/, "");

  // BASE_URL = répertoire actuel (ex: https://.../frontend/)
  const href = String(window.location.href);
  const base = href.substring(0, href.lastIndexOf("/") + 1);
  window.BASE_URL = window.BASE_URL || base;
})();
