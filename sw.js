const CACHE_NAME = 'melatex-v2';
const ASSETS = [
  'index.html',
  'melate_retro_results.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting(); // Activa la nueva versión del SW de inmediato
});

self.addEventListener('activate', e => {
  // Borra cachés viejas de versiones anteriores
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Si la red responde bien, guardamos copia fresca y la devolvemos
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
        return res;
      })
      .catch(() => caches.match(e.request)) // Solo usa caché si no hay internet
  );
});
