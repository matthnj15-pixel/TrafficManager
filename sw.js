const prefix = `traffic-manager:${new URL(self.registration.scope).pathname}:`;
const revision = /* Pages revision */ "local-2";
const cacheName = `${prefix}${revision}`;
const files = ["./", "./index.html", "./styles.css", "./app.mjs", "./model.mjs", "./sumo-export.mjs", "./manifest.webmanifest", "./icon.svg"];

const shell = new Set(files.map(file => new URL(file, self.registration.scope).pathname));

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files)));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !shell.has(url.pathname)) return;
  event.respondWith(caches.open(cacheName).then(async cache =>
    await cache.match(event.request, { ignoreSearch: true }) ?? fetch(event.request)
  ));
});
