const prefix = `traffic-manager:${new URL(self.registration.scope).pathname}:`;
const cacheName = `${prefix}1`;
const files = ["./", "./index.html", "./styles.css", "./app.mjs", "./model.mjs", "./manifest.webmanifest", "./icon.svg"];

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
  if (event.request.method !== "GET" || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith(fetch(event.request).catch(async () => {
    const cache = await caches.open(cacheName);
    const response = await cache.match(event.request, { ignoreSearch: true });
    return response ?? (event.request.mode === "navigate" ? cache.match("./") : Response.error());
  }));
});
