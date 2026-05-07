// Service Worker — cache-first pour les assets statiques (Mission 8)
const CACHE_NOM = 'qpuc-v3';
// Ne pas inclure les pages HTML : Cloudflare Workers les redirige (clean URLs)
// ce qui provoque l'erreur "redirected response / redirect mode not follow"
const ASSETS_STATIQUES = [
  '/css/style.css',
  '/css/animations.css',
  '/js/principal.js',
  '/js/socket.js',
  '/js/interface.js',
  '/js/etat.js',
  '/js/sons.js',
  '/js/minuteur.js',
  '/js/theme.js',
  '/js/micro-sons.js',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NOM).then((cache) =>
      cache.addAll(ASSETS_STATIQUES).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cles) =>
      Promise.all(cles.filter((c) => c !== CACHE_NOM).map((c) => caches.delete(c)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Ne pas intercepter :
  // - requêtes non-GET
  // - navigations HTML (mode:'navigate') : Cloudflare Workers redirige les .html
  //   vers les clean URLs, ce qui génère l'erreur "redirected response not follow"
  // - Socket.IO
  // - CDNs externes
  if (
    event.request.method !== 'GET' ||
    event.request.mode === 'navigate' ||
    url.pathname.startsWith('/socket.io') ||
    url.hostname !== self.location.hostname
  ) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      // new Request(..., {redirect:'follow'}) est plus fiable que fetch(req, init)
      // car certains navigateurs n'écrasent pas le mode du Request original
      return fetch(new Request(event.request, { redirect: 'follow' })).then((response) => {
        // Ne cacher que les réponses complètes (status 200) :
        // - les réponses partielles 206 (audio Range) ne peuvent pas être mises en cache
        // - les réponses opaques (CDN cross-origin) sont déjà filtrées plus haut
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NOM).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
