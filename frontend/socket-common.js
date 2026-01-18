// socket-common.js
// ⚠️ Fichier partagé – NE PAS mettre de logique UI ici

let socket = null;
let currentGameCode = null;
let currentPlayerId = null;
let isHost = false;

function connectSocket() {
  if (socket) return socket;

  socket = io("https://question-pour-un-champion.onrender.com", {
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    currentPlayerId = socket.id;
    console.log("✅ Socket connecté :", socket.id);
  });

  socket.on("disconnect", () => {
    console.warn("❌ Socket déconnecté");
  });

  return socket;
}

// ===== Helpers globaux =====
function setGameCode(code) {
  currentGameCode = code;
}

function getGameCode() {
  return currentGameCode;
}

function setHost(value) {
  isHost = value;
}

function getIsHost() {
  return isHost;
}

function getSocket() {
  return socket;
}
