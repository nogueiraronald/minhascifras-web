// Service Worker para modo 100% offline do Minhas Cifras (PWA)
const CACHE_NAME = 'minhas-cifras-offline-v11';

const CORE_ASSETS = [
  './',
  'index.html',
  'flutter_bootstrap.js',
  'flutter.js',
  'main.dart.js',
  'manifest.json',
  'favicon.png',
  'version.json',
  'icons/Icon-192.png',
  'icons/Icon-512.png',
  'icons/Icon-maskable-192.png',
  'icons/Icon-maskable-512.png',
  'assets/FontManifest.json',
  'assets/AssetManifest.bin.json',
  'assets/AssetManifest.bin',
  'assets/fonts/MaterialIcons-Regular.otf',
  'assets/assets/logo.png',
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

  // Não intercepta chamadas externas (Supabase, Google APIs, YouTube)
  if (
    url.origin.includes('supabase.co') ||
    url.origin.includes('googleapis.com') ||
    url.origin.includes('googlevideo.com') ||
    url.origin.includes('youtube.com') ||
    url.origin.includes('youtu.be')
  ) {
    return;
  }

  // 1. Requisições de navegação (abertura do app / páginas HTML)
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
          const cachedIndex = await cache.match('index.html', { ignoreSearch: true }) ||
                              await cache.match('./', { ignoreSearch: true }) ||
                              await cache.match(request, { ignoreSearch: true });
          if (cachedIndex) return cachedIndex;

          const anyIndex = await caches.match('index.html', { ignoreSearch: true });
          if (anyIndex) return anyIndex;

          return new Response('Offline: Minhas Cifras carregando...', {
            headers: { 'Content-Type': 'text/html' }
          });
        })
    );
    return;
  }

  // 2. Arquivos de código (JS e WASM) -> Cache primeiro se disponível (com revalidação em segundo plano)
  const isCode = url.pathname.endsWith('.js') || url.pathname.endsWith('.wasm');
  if (isCode) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((cached) => {
        // Tenta buscar na rede para atualizar o cache
        const networkFetch = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        }).catch(() => null);

        // Se já temos em cache, entrega imediatamente para velocidade e suporte offline total
        if (cached) return cached;

        // Se não tínhamos, aguarda a rede
        return networkFetch.then((res) => res || new Response('', { status: 503, statusText: 'Offline' }));
      })
    );
    return;
  }

  // 3. Demais arquivos estáticos (Fontes, Ícones, Imagens, JSONs) -> Cache primeiro, fallback rede
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => {
        return new Response('', { status: 404, statusText: 'Not found offline' });
      });
    })
  );
});
