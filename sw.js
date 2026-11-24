/* Service worker: precache the app shell, then stale-while-revalidate for same-origin GET requests. */
const VERSION = 'fc-research-v3.0.0';

const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/app.css',
  'js/main.js', 'js/views.js', 'js/blocks.js', 'js/doc.js', 'js/store.js', 'js/content.js',
  'js/progress.js', 'js/util.js', 'js/ai.js', 'js/icons.js',
  'content/fa/ui.json', 'content/fa/curriculum.json', 'content/fa/flows.json',
  'content/fa/library.json', 'content/fa/prompts.json',
  'assets/icon.svg', 'assets/icon-192.png', 'assets/icon-512.png',
  'assets/fonts/vazirmatn-arabic-wght-normal.woff2', 'assets/fonts/vazirmatn-latin-wght-normal.woff2',
  'assets/fonts/newsreader-latin-wght-normal.woff2', 'assets/fonts/newsreader-latin-wght-italic.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})))).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((res) => { if (res.ok) cache.put(request, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
