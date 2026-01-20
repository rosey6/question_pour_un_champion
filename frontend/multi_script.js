// ==========================================
// CONFIGURATION DE LA CONNEXION (Render <-> Cloudflare)
// ==========================================
// On se connecte à votre backend Render
const BACKEND_URL = "https://questionpourunchampion-backend.onrender.com";
const socket = io(BACKEND_URL);

// --- Variables Globales ---
let monPseudo = "";
let maRoom = "";
let estHote = false;

// --- DOM Elements ---
const ecrans = {
  connexion: document.getElementById("ecran-connexion"),
  lobby: document.getElementById("ecran-lobby"),
  jeu: document.getElementById("ecran-jeu-multi"),
  fin: document.getElementById("ecran-fin"),
};

// --- Initialisation ---
window.onload = () => {
  // Vérifier si un code de salle est dans l'URL (via QR Code)
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get("room");
  if (roomParam) {
    document.getElementById("input-room-code").value = roomParam;
    document.getElementById("pseudo").focus();
  }
};

// --- Gestion des Écrans ---
function afficherEcran(nom) {
  Object.values(ecrans).forEach((e) => {
    e.classList.remove("actif");
    e.style.display = "none";
  });
  const cible = ecrans[nom];
  cible.style.display = "flex";
  setTimeout(() => cible.classList.add("actif"), 10);
}

// --- Logique QR Code ---
function genererQRCode(code) {
  const container = document.getElementById("qr-container");
  container.innerHTML = "";

  // L'URL du frontend actuel (Cloudflare) + le paramètre room
  const urlJoin = `${window.location.origin}${window.location.pathname}?room=${code}`;

  new QRCode(container, {
    text: urlJoin,
    width: 150,
    height: 150,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M,
  });
}

// ==========================================
// BOUTONS / ACTIONS JOUEUR
// ==========================================

document.getElementById("btn-creer").addEventListener("click", () => {
  monPseudo = document.getElementById("pseudo").value.trim();
  if (!monPseudo) return alert("Merci de choisir un pseudo !");

  // Émission vers le serveur
  socket.emit("create-game", monPseudo);
});

document.getElementById("btn-rejoindre").addEventListener("click", () => {
  monPseudo = document.getElementById("pseudo").value.trim();
  const codeInput = document
    .getElementById("input-room-code")
    .value.trim()
    .toUpperCase();

  if (!monPseudo || !codeInput) return alert("Pseudo et Code requis !");

  maRoom = codeInput;
  socket.emit("join-game", { gameCode: maRoom, playerName: monPseudo });
});

document.getElementById("btn-lancer-partie").addEventListener("click", () => {
  socket.emit("start-game", maRoom);
});

// ==========================================
// ÉVÉNEMENTS SOCKET (Réception du Serveur)
// ==========================================

// 1. Partie Créée
socket.on("game-created", (code) => {
  maRoom = code;
  estHote = true;
  setupLobby(code);
});

// 2. Partie Rejointe
socket.on("game-joined", () => {
  if (!estHote) setupLobby(maRoom);
});

// 3. Mise à jour liste joueurs
socket.on("player-list-update", (players) => {
  const ul = document.getElementById("ul-joueurs");
  ul.innerHTML = "";
  players.forEach((p) => {
    const li = document.createElement("li");
    // Marquer mon propre nom
    const isMe = p.id === socket.id;
    li.innerHTML = `<span>${p.name} ${isMe ? "(Moi)" : ""}</span> <span>${p.score} pts</span>`;
    if (isMe) li.style.fontWeight = "bold";
    ul.appendChild(li);
  });
});

// 4. Erreur (ex: salle pleine)
socket.on("error", (msg) => {
  alert("Erreur: " + msg);
  afficherEcran("connexion");
});

// 5. Début de partie
socket.on("game-started", () => {
  afficherEcran("jeu");
});

// 6. Nouvelle Question
socket.on("question", (data) => {
  // data = { question, options, imageUrl (optionnel), ... }
  const qTitle = document.getElementById("question-texte");
  const optsDiv = document.getElementById("options-container");
  const imgContainer = document.getElementById("media-container");
  const img = document.getElementById("img-question");
  const feedback = document.getElementById("feedback-reponse");

  // Reset UI
  qTitle.innerText = data.question;
  optsDiv.innerHTML = "";
  feedback.innerText = "";

  // Image
  if (data.imageUrl) {
    img.src = data.imageUrl;
    imgContainer.classList.remove("hidden");
  } else {
    imgContainer.classList.add("hidden");
  }

  // Création Boutons
  data.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "bouton bouton-secondaire";
    btn.innerText = opt;
    btn.onclick = () => {
      // Désactiver après clic
      Array.from(optsDiv.children).forEach((b) => (b.disabled = true));
      socket.emit("submit-answer", { gameCode: maRoom, answer: opt });
      feedback.innerText = "Réponse envoyée...";
      feedback.style.color = "orange";
    };
    optsDiv.appendChild(btn);
  });
});

// 7. Fin de partie
socket.on("game-finished", (data) => {
  afficherEcran("fin");
  const divScores = document.getElementById("classement-final");
  divScores.innerHTML = "";

  // data.rankings provient de server.js
  if (data.rankings) {
    data.rankings.forEach((r, index) => {
      const p = document.createElement("div");
      p.className = "joueur-item"; // Utilise une classe CSS si existante
      p.style.padding = "10px";
      p.style.borderBottom = "1px solid rgba(255,255,255,0.2)";

      let medaille = "";
      if (index === 0) medaille = "🥇 ";
      if (index === 1) medaille = "🥈 ";
      if (index === 2) medaille = "🥉 ";

      p.innerHTML = `<span style="font-size:1.2em">${medaille} <strong>${r.name}</strong></span> : ${r.score} points`;
      divScores.appendChild(p);
    });
  }
});

// --- Fonctions Utilitaires ---

function setupLobby(code) {
  afficherEcran("lobby");
  document.getElementById("display-room-code").innerText = code;
  genererQRCode(code);

  if (estHote) {
    document.getElementById("zone-hote").classList.remove("hidden");
    document.getElementById("zone-invite").classList.add("hidden");
  } else {
    document.getElementById("zone-hote").classList.add("hidden");
    document.getElementById("zone-invite").classList.remove("hidden");
  }
}
