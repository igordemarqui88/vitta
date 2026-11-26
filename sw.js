// Service worker: deixa o app abrir rÃƒÂ¡pido e funcionar offline.
// Ao alterar arquivos do app, aumente a versÃƒÂ£o abaixo para forÃƒÂ§ar a atualizaÃƒÂ§ÃƒÂ£o.
const CACHE = 'vitta-pub21';
const ARQUIVOS = [
  './', './index.html', './styles.css', './app.js', './foods.js', './historico.js', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro (pega a versÃƒÂ£o mais nova), cache como reserva quando offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    // 'no-cache' obriga a conferir com o servidor: sem isso o navegador podia reaproveitar
    // um arquivo antigo do prÃƒÂ³prio cache HTTP e o app nÃƒÂ£o atualizava
    fetch(req, { cache: 'no-cache' })
      .then((res) => { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});













