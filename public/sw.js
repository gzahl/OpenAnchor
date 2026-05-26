const CACHE_NAME = 'openanchor-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './favicon.svg',
  './manifest.json'
];

// Install Service Worker and cache essential shell assets
self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('OpenAnchor: Caching app shell assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => (self as any).skipWaiting())
  );
});

// Activate event (cleaning old caches)
self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('OpenAnchor: Clearing legacy cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => (self as any).clients.claim())
  );
});

// Fetch event: Network-first falling back to cache strategy.
// Also dynamically caches loaded assets (Vite hashed bundles, maps fonts) so they work offline next time.
self.addEventListener('fetch', (event: any) => {
  const req = event.request;

  // Only handle local HTTP/HTTPS requests (avoid chrome-extension issues)
  if (!req.url.startsWith(self.location.origin) && !req.url.startsWith('https://fonts.googleapis.com') && !req.url.startsWith('https://fonts.gstatic.com')) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        // Only cache successful standard responses
        if (networkResponse.status === 200) {
          const clonedResponse = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, clonedResponse);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Offline fallback
        return caches.match(req).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If a major navigation falls back and isn't cached, return root index
          if (req.mode === 'navigate') {
            return caches.match('./index.html') as Promise<Response>;
          }
          return new Response('Offline: Resource not cached.', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});
