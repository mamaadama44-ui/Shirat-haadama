// Service Worker for שירת האדמה PWA
// Strategy: Network First with Cache Fallback
// Allows offline access while always preferring fresh content

const CACHE_VERSION = 'shirat-v1';
const CACHE_NAME = `shirat-cache-${CACHE_VERSION}`;

// Files that make up the app shell (cached on install)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// External resources we want to cache when accessed
const EXTERNAL_DOMAINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
];

// Install: precache the app shell
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL).catch(err => {
        console.error('[SW] Precache failed for some items:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('shirat-cache-') && name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network First, then Cache
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (Firebase write operations, etc.)
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip Firebase Firestore live sync (always need network for real-time)
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('emailjs.com')) {
    return; // Let browser handle these directly
  }

  // For HTML/JS/CSS/Images: try network first, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Only cache successful responses
        if (response && response.status === 200) {
          const isOurDomain = url.origin === self.location.origin;
          const isCacheableExternal = EXTERNAL_DOMAINS.some(d => url.hostname.includes(d));

          if (isOurDomain || isCacheableExternal) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
        }
        return response;
      })
      .catch(() => {
        // Network failed - try cache
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // No cache - if it's a navigation request, return the cached index
          if (event.request.mode === 'navigate') {
            return caches.match('./') || caches.match('./index.html');
          }
          // Last resort: failed response
          return new Response('Offline - content not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' })
          });
        });
      })
  );
});

// Listen for messages (e.g., skip waiting on update)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
