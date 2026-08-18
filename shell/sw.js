/* NovaOS — service worker: offline con strategia network-first.
   Network-first tiene la shell aggiornata durante lo sviluppo e mantiene
   il funzionamento offline (fallback su cache quando la rete non risponde). */
const CACHE = "novaos-v30";
const ASSETS = [
  "index.html",
  "css/style.css",
  "js/version.js",
  "js/os.js",
  "js/apps.js",
  "js/icons.js",
  "icon.svg",
  "manifest.webmanifest",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then(res => { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); return res; })
      .catch(() => caches.match(e.request))
  );
});
