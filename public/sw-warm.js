// Pulled into sw.js via workbox.importScripts. The 'pages' name must match
// the NetworkFirst cacheName in astro.config.mjs

// Seed offline copies of the pages before first visit; best-effort only
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('pages')
      .then((cache) => cache.addAll(['/calendar/', '/courses/', '/information/']))
      .catch(() => {}),
  );
});

// Runtime caches left from when fonts came from Google
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all(
    ['google-fonts-stylesheets', 'google-fonts-webfonts'].map((name) => caches.delete(name)),
  ));
});
