const BACKEND_URL = window.__BACKEND_URL || "https://questionpourunchampion-backend.onrender.com";
const socket = io(BACKEND_URL, { transports: ["websocket", "polling"] });
