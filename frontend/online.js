/* global io, OnlineQr */
// Mode en ligne : 3 pages
// - online-home.html  : navigation
// - online-create.html: création + code + QR
// - online-join.html  : rejoindre + écran de jeu (buzzer/options/résultats)

(function () {
  "use strict";

  const BACKEND_URL = String(window.BACKEND_URL || "").trim();

  // Helpers DOM
  function $(id) {
    return document.getElementById(id);
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function show(id) {
    const el = $(id);
    if (!el) return;
    el.classList.remove("cache");
    el.style.display = "";
  }

  function hide(id) {
    const el = $(id);
    if (!el) return;
    el.classList.add("cache");
    el.style.display = "none";
  }

  function safeOn(el, event, handler) {
    if (el) el.addEventListener(event, handler);
  }

  function parseJoinCodeFromUrl() {
    try {
      const u = new URL(window.location.href);
      return (u.searchParams.get("code") || "").trim().toUpperCase();
    } catch {
      return "";
    }
  }

  function normalizeOptions(payload) {
    // On accepte plusieurs formats possibles
    const p = payload || {};
    const options = p.options || p.reponses || p.answers || p.choices || (p.question && (p.question.options || p.question.reponses)) || null;
    if (Array.isArray(options)) return options;
    // Certains backends envoient {A,B,C,D}
    if (options && typeof options === "object") {
      const arr = Object.values(options);
      if (arr.every((v) => typeof v === "string")) return arr;
    }
    return [];
  }

  function ensureBackendOrExplain() {
    if (BACKEND_URL) return true;
    const hint = "BACKEND_URL manquant. Vérifiez frontend/config.js (window.BACKEND_URL).";
    // create page
    setText("create-error", hint);
    show("create-error");
    // join page
    setText("join-error", hint);
    show("join-error");
    return false;
  }

  // Socket (lazy)
  let socket = null;
  function getSocket() {
    if (socket) return socket;
    if (!ensureBackendOrExplain()) return null;

    // IMPORTANT: on force websocket uniquement pour éviter des soucis CORS/polling
    socket = io(BACKEND_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      timeout: 10000,
    });

    socket.on("connect", () => {
      // eslint-disable-next-line no-console
      console.log("✅ Socket connecté:", socket.id);
    });

    socket.on("connect_error", (err) => {
      // eslint-disable-next-line no-console
      console.error("❌ Erreur connexion socket:", err);
      setText("create-error", "Erreur de connexion au serveur");
      show("create-error");
      setText("join-error", "Erreur de connexion au serveur");
      show("join-error");
    });

    return socket;
  }

  // --- Create page ---
  function initCreatePage() {
    const btnCreate = $("btn-create");
    const btnBack = $("btn-create-back");
    const outCode = $("created-code");
    const outLink = $("created-link");
    const qrBox = $("qrcode");
    const btnCopy = $("btn-copy-link");
    const btnGoJoin = $("btn-go-join");

    if (!btnCreate) return; // pas sur cette page

    safeOn(btnBack, "click", () => (window.location.href = "online-home.html"));

    safeOn(btnCreate, "click", async () => {
      hide("create-error");
      show("create-wait");

      const s = getSocket();
      if (!s) {
        hide("create-wait");
        return;
      }

      // Demande de création : on supporte ack (callback) et event retour
      try {
        const ack = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(null), 8000);
          s.emit("createGame", { mode: "online" }, (res) => {
            clearTimeout(timer);
            resolve(res || null);
          });
        });

        const code = (ack && (ack.code || ack.gameCode || ack.roomCode)) || null;

        if (!code) {
          // fallback : attendre un event
          // eslint-disable-next-line no-console
          console.warn("Aucun code en ACK. Attente d'un event gameCreated...");
          s.once("gameCreated", (payload) => {
            const c = (payload && (payload.code || payload.gameCode || payload.roomCode)) || "";
            renderCreated(c);
          });
          return;
        }

        renderCreated(code);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        setText("create-error", "Impossible de créer la partie.");
        show("create-error");
      } finally {
        hide("create-wait");
      }
    });

    function renderCreated(codeRaw) {
      const code = String(codeRaw || "").trim().toUpperCase();
      if (!code) {
        setText("create-error", "Code de partie invalide.");
        show("create-error");
        return;
      }

      outCode.textContent = code;
      show("create-result");

      // Lien de join
      const joinUrl = (window.OnlineQr && OnlineQr.buildJoinUrl) ? OnlineQr.buildJoinUrl(code) : ("online-join.html?code=" + encodeURIComponent(code));
      if (outLink) {
        outLink.value = joinUrl;
      }

      if (window.OnlineQr && OnlineQr.renderQrCode) {
        OnlineQr.renderQrCode(qrBox, joinUrl);
      }

      safeOn(btnCopy, "click", async () => {
        try {
          await navigator.clipboard.writeText(joinUrl);
          setText("create-success", "Lien copié.");
          show("create-success");
          setTimeout(() => hide("create-success"), 1500);
        } catch {
          // fallback
          if (outLink) {
            outLink.select();
            document.execCommand("copy");
          }
        }
      });

      safeOn(btnGoJoin, "click", () => {
        window.location.href = "online-join.html?code=" + encodeURIComponent(code);
      });
    }
  }

  // --- Join page / Player UI ---
  function initJoinPage() {
    const btnJoin = $("btn-join");
    if (!btnJoin) return; // pas sur cette page

    const inputCode = $("join-code");
    const inputName = $("join-name");

    const codeFromUrl = parseJoinCodeFromUrl();
    if (inputCode && codeFromUrl) inputCode.value = codeFromUrl;

    const btnBack = $("btn-join-back");
    safeOn(btnBack, "click", () => (window.location.href = "online-home.html"));

    let currentCode = "";
    let joined = false;

    // UI refs
    const gameScreen = $("game-screen");
    const buzzerBtn = $("btn-buzzer");
    const answerBox = $("answer-options");
    const resultBox = $("result-box");
    const resultText = $("result-text");
    const btnNextInfo = $("next-info");

    function resetForQuestion() {
      if (answerBox) {
        answerBox.innerHTML = "";
        hide("answer-options");
      }
      if (resultBox) hide("result-box");
      setText("next-info", "");
      enableBuzzer(false);
    }

    function enableBuzzer(enabled) {
      if (!buzzerBtn) return;
      buzzerBtn.disabled = !enabled;
      buzzerBtn.style.opacity = enabled ? "1" : "0.6";
    }

    function showAnswerOptions(payload) {
      const options = normalizeOptions(payload);
      if (!answerBox) return;

      answerBox.innerHTML = "";

      if (!options.length) {
        // On n'affiche rien si pas d'options
        setText("join-error", "Options de réponse indisponibles.");
        show("join-error");
        return;
      }

      options.slice(0, 4).forEach((opt, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bouton bouton-secondaire";
        btn.style.width = "100%";
        btn.style.margin = "6px 0";
        btn.textContent = String(opt);
        btn.addEventListener("click", () => {
          // Envoi réponse
          const s = getSocket();
          if (!s) return;
          s.emit("submitAnswer", {
            code: currentCode,
            answerIndex: idx,
            answer: String(opt),
          });
          // Désactive pour éviter double click
          Array.from(answerBox.querySelectorAll("button")).forEach((b) => (b.disabled = true));
        });
        answerBox.appendChild(btn);
      });

      show("answer-options");
    }

    function showResult(payload) {
      if (!resultBox) return;
      const p = payload || {};
      const msg = p.message || p.resultMessage || (p.isCorrect === true ? "Bonne réponse" : p.isCorrect === false ? "Mauvaise réponse" : "Résultat");
      const score = (typeof p.score === "number") ? p.score : null;
      const delta = (typeof p.delta === "number") ? p.delta : (typeof p.points === "number") ? p.points : null;

      const line = [
        String(msg),
        delta !== null ? (delta >= 0 ? `+${delta}` : `${delta}`) + " points" : "",
        score !== null ? "Score: " + score : "",
      ].filter(Boolean).join(" — ");

      if (resultText) resultText.textContent = line;
      show("result-box");
      // Cache options après résultat
      if (answerBox) {
        answerBox.innerHTML = "";
        hide("answer-options");
      }
      enableBuzzer(false);
      if (btnNextInfo) btnNextInfo.textContent = "Question suivante...";
    }

    safeOn(btnJoin, "click", async () => {
      hide("join-error");
      const code = String(inputCode?.value || "").trim().toUpperCase();
      const name = String(inputName?.value || "Joueur").trim() || "Joueur";

      if (!code) {
        setText("join-error", "Entrez un code de partie.");
        show("join-error");
        return;
      }

      const s = getSocket();
      if (!s) return;

      currentCode = code;

      const ok = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 8000);
        s.emit("joinGame", { code, playerName: name, mode: "online" }, (res) => {
          clearTimeout(timer);
          if (!res) return resolve(true);
          if (res.ok === false || res.success === false) return resolve(false);
          return resolve(true);
        });
      });

      if (!ok) {
        setText("join-error", "Impossible de rejoindre la partie.");
        show("join-error");
        return;
      }

      joined = true;
      hide("join-form");
      if (gameScreen) gameScreen.style.display = "";
      resetForQuestion();
    });

    // Buzzer
    safeOn(buzzerBtn, "click", () => {
      if (!joined) return;
      const s = getSocket();
      if (!s) return;
      enableBuzzer(false);
      s.emit("buzz", { code: currentCode });
    });

    // Events jeu (compat)
    const s = getSocket();
    if (s) {
      s.on("enableBuzzers", () => {
        if (!joined) return;
        resetForQuestion();
        enableBuzzer(true);
      });

      s.on("disableBuzzers", () => {
        if (!joined) return;
        enableBuzzer(false);
      });

      // Serveur -> seulement le 1er buzzer doit recevoir cet event
      s.on("showAnswerScreen", (payload) => {
        if (!joined) return;
        // On affiche options uniquement au joueur concerné
        showAnswerOptions(payload);
      });

      // Résultat pour tout le monde (après réponse ou timeout)
      s.on("answerResult", (payload) => {
        if (!joined) return;
        showResult(payload);
      });

      s.on("roundResult", (payload) => {
        if (!joined) return;
        showResult(payload);
      });

      // Nouvelle question -> on attend enableBuzzers
      s.on("newQuestion", () => {
        if (!joined) return;
        resetForQuestion();
      });

      // En cas d'erreur backend
      s.on("errorMessage", (payload) => {
        if (!joined) return;
        const msg = (payload && (payload.message || payload.error)) || "Erreur";
        setText("join-error", msg);
        show("join-error");
      });
    }
  }

  // Init
  document.addEventListener("DOMContentLoaded", () => {
    initCreatePage();
    initJoinPage();
  });
})();
