/*
  QR CODE (ISOLE)
  ------------------------------------------------------------------
  Objectif : éviter que des modifications du code multijoueur cassent
  l'affichage du QR code. Toute la logique QR est regroupée ici.

  Dépendance : la librairie "qrcodejs" doit être chargée avant ce fichier.
  (ex : <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>)
*/

(function () {
  "use strict";

  function buildJoinUrl(gameCode) {
    // Pointe vers la page joueur téléphone.
    // Utilise une URL relative pour rester compatible Vercel / sous-dossiers.
    const url = new URL("multijoueur-player.html", window.location.href);
    url.searchParams.set("code", String(gameCode || "").trim());
    return url.toString();
  }

  function renderInto(container, urlText) {
    if (!container) return;

    // Nettoyage du conteneur (évite accumulation)
    container.innerHTML = "";

    // Si la lib n'est pas chargée, on laisse le texte d'aide.
    if (typeof window.QRCode !== "function") {
      const p = document.createElement("p");
      p.textContent = "QR code indisponible (librairie manquante).";
      container.appendChild(p);
      return;
    }

    // Génération QR
    // Dimensions : cohérentes avec le bloc de la page multijoueur.
    // IMPORTANT : on n'applique aucune couleur custom ici.
    // (le style global du projet gère le thème)
    // qrcodejs utilise canvas/img en interne.
    // eslint-disable-next-line no-new
    new window.QRCode(container, {
      text: urlText,
      width: 160,
      height: 160,
      correctLevel: window.QRCode.CorrectLevel.M,
    });
  }

  /**
   * Rend (ou re-rend) le QR code de connexion.
   * @param {string} gameCode
   * @param {string=} containerId (par défaut "qr-code")
   * @returns {string} url générée
   */
  function renderGameQrCode(gameCode, containerId) {
    const code = String(gameCode || "").trim();
    const url = buildJoinUrl(code);
    // Compat : selon les versions du front, le conteneur a pu s'appeler
    // "qr-code" (prévu) ou "qrcode" (déjà présent dans certains HTML).
    // On supporte les deux pour éviter la disparition du QR code.
    const targetId = containerId || "qr-code";
    const container =
      document.getElementById(targetId) ||
      document.getElementById("qrcode") ||
      document.getElementById("qr-code");

    renderInto(container, url);
    return url;
  }

  // Expose volontairement une API simple, stable.
  window.renderGameQrCode = renderGameQrCode;
})();
