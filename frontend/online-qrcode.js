// QR code helper pour le mode en ligne
// Dépend de qrcodejs (https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js)

(function () {
  "use strict";

  function getDirFromUrl(urlStr) {
    try {
      const u = new URL(urlStr, window.location.href);
      // Retire le nom de fichier si présent
      const path = u.pathname;
      const dirPath = path.endsWith("/") ? path : path.substring(0, path.lastIndexOf("/") + 1);
      u.pathname = dirPath;
      u.search = "";
      u.hash = "";
      return u.toString();
    } catch {
      return window.location.origin + "/";
    }
  }

  function buildJoinUrl(code) {
    const dir = getDirFromUrl(window.location.href);
    const join = new URL("online-join.html", dir);
    join.searchParams.set("code", String(code || "").trim());
    return join.toString();
  }

  function canUseQrLib() {
    return typeof window.QRCode === "function";
  }

  function renderQrCode(targetEl, text) {
    if (!targetEl) return;
    targetEl.innerHTML = "";
    if (!canUseQrLib()) {
      targetEl.textContent = "QR code indisponible (lib manquante)";
      return;
    }
    // eslint-disable-next-line no-new
    new window.QRCode(targetEl, {
      text,
      width: 220,
      height: 220,
      correctLevel: window.QRCode.CorrectLevel.M,
    });
  }

  window.OnlineQr = {
    buildJoinUrl,
    renderQrCode,
  };
})();
