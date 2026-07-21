// Service Worker de KioscoPro
// - HTML: network-first (si hay internet, siempre la versión nueva; si no, la cacheada)
// - CDNs (Tailwind, Chart.js, SheetJS, JsBarcode, Font Awesome, Google Fonts): cache-first con actualización en segundo plano
// - Firebase/API: nunca se cachea (va siempre a la red)
const CACHE_NAME = 'kioscopro-v1';

const PRECACHE = ['./', './index.html', './manifest.webmanifest'];

const CDN_HOSTS = [
    'cdn.tailwindcss.com',
    'cdnjs.cloudflare.com',
    'cdn.sheetjs.com',
    'cdn.jsdelivr.net',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Solo GET; el resto (POST a Firebase, etc.) va directo a la red
    if (event.request.method !== 'GET') return;

    // Firebase y APIs: nunca cachear
    if (url.hostname.includes('googleapis.com') && !url.hostname.includes('fonts')) return;
    if (url.hostname.includes('firebase') || url.hostname.includes('firestore')) return;

    // Navegación (el HTML de la app): network-first
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                    return response;
                })
                .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
        );
        return;
    }

    // CDNs y fuentes: cache-first + revalidación en segundo plano
    if (CDN_HOSTS.includes(url.hostname)) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                const networkFetch = fetch(event.request).then((response) => {
                    if (response && (response.ok || response.type === 'opaque')) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                    }
                    return response;
                }).catch(() => cached);
                return cached || networkFetch;
            })
        );
        return;
    }

    // Resto de archivos locales (íconos, manifest): cache-first
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                return response;
            }))
        );
    }
});
