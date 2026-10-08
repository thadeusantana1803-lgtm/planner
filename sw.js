/* Service worker: deixa o app abrir sem internet e atualiza em segundo plano. */
const CACHE = 'planner-v1';
const ARQUIVOS = [
  './', 'index.html', 'styles.css', 'core.js', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((guardado) => {
      const rede = fetch(e.request).then((r) => {
        if (r && r.ok && new URL(e.request.url).origin === self.location.origin) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return r;
      }).catch(() => guardado);
      return guardado || rede;
    })
  );
});
