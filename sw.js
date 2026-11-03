// Service Worker para modo 100% offline do Minhas Cifras (PWA)
const CACHE_NAME = 'minhas-cifras-offline-v6';

const CORE_ASSETS = [
  './',
  'index.html',
  'flutter_bootstrap.js',
  'flutter.js',
  'main.dart.js',
  'manifest.json',
  'favicon.png',
  'icons/Icon-192.png',
  'icons/Icon-512.png',
  'icons/Icon-maskable-192.png',
  'icons/Icon-maskable-512.png',
  'assets/FontManifest.json',
  'assets/fonts/MaterialIcons-Regular.otf',
  'canvaskit/canvaskit.js',
  'canvaskit/canvaskit.wasm',
  'canvaskit/chromium/canvaskit.js',
  'canvaskit/chromium/canvaskit.wasm'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[MinhasCifras SW] Armazenando arquivos para funcionamento offline...');
      for (const asset of CORE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (e) {
          console.warn('[MinhasCifras SW] Arquivo opcional ignorado no precache:', asset, e);
        }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        );
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Não intercepta chamadas de autenticação do Google nem Supabase
  if (
    url.origin.includes('googleapis.com') ||
    url.origin.includes('accounts.google.com') ||
    url.origin.includes('supabase.co')
  ) {
    return;
  }

  // Requisições de navegação (abertura do app / HTML)
  if (request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          // Quando offline, serve o index.html previamente salvo em cache
          const cache = await caches.open(CACHE_NAME);
          const cachedIndex = await cache.match('index.html') || await cache.match('./');
          if (cachedIndex) return cachedIndex;
          return new Response('Offline: Minhas Cifras carregando...', {
            headers: { 'Content-Type': 'text/html' }
          });
        })
    );
    return;
  }

  // Demais arquivos (JS, WASM, Fontes, Ícones) -> Cache Primeiro, fallback para Rede e cache dinâmico
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Atualiza o cache silenciosamente em background se houver rede
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      });
    })
  );
});
