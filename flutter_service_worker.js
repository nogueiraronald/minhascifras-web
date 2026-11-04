// Service Worker para modo 100% offline do Minhas Cifras (PWA)
// O nome do cache e a lista de assets são injetados automaticamente no deploy.
const CACHE_NAME = 'minhas-cifras-offline-main-1793804078';

const CORE_ASSETS = [
  "./",
  "index.html",
  "/minhascifras-web/",
  "/minhascifras-web",
  "/minhascifras-web/index.html",
  "flutter_bootstrap.js",
  "version.json",
  "main.dart.js",
  "flutter.js",
  "favicon.png",
  "manifest.json",
  "icons/Icon-192.png",
  "icons/Icon-maskable-192.png",
  "icons/Icon-maskable-512.png",
  "icons/Icon-512.png",
  "assets/NOTICES",
  "assets/FontManifest.json",
  "assets/AssetManifest.bin.json",
  "assets/AssetManifest.bin",
  "assets/shaders/ink_sparkle.frag",
  "assets/shaders/stretch_effect.frag",
  "assets/fonts/MaterialIcons-Regular.otf",
  "assets/assets/logo.png",
  "canvaskit/wimp.wasm",
  "canvaskit/skwasm.js",
  "canvaskit/skwasm_heavy.js",
  "canvaskit/skwasm.wasm",
  "canvaskit/canvaskit.js",
  "canvaskit/wimp.js",
  "canvaskit/canvaskit.wasm",
  "canvaskit/skwasm_heavy.wasm",
  "canvaskit/chromium/canvaskit.js",
  "canvaskit/chromium/canvaskit.wasm"
];

// Evento de Instalação: baixa e armazena todos os assets essenciais em cache
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[MinhasCifras SW] Iniciando precache offline completo (' + CACHE_NAME + ')...');
      
      const assetsToCache = Array.isArray(CORE_ASSETS) ? CORE_ASSETS : [
        './',
        'index.html',
        '/minhascifras-web/',
        '/minhascifras-web',
        '/minhascifras-web/index.html',
        'flutter_bootstrap.js',
        'flutter.js',
        'main.dart.js',
        'manifest.json',
        'favicon.png',
        'version.json',
        'icons/Icon-192.png',
        'icons/Icon-512.png',
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

      for (const asset of assetsToCache) {
        try {
          await cache.add(new Request(asset, { cache: 'reload' }));
        } catch (e) {
          // Tenta sem reload caso falhe
          try {
            await cache.add(asset);
          } catch (err2) {
            console.warn('[MinhasCifras SW] Arquivo não pôde ser pré-cacheado:', asset, err2);
          }
        }
      }

      // Garante que o index.html seja clonado para todas as chaves comuns de rota
      try {
        const indexResponse = await cache.match('index.html') || await cache.match('./');
        if (indexResponse) {
          await cache.put('./', indexResponse.clone());
          await cache.put('index.html', indexResponse.clone());
          await cache.put('/minhascifras-web/', indexResponse.clone());
          await cache.put('/minhascifras-web', indexResponse.clone());
          await cache.put('/minhascifras-web/index.html', indexResponse.clone());
        }
      } catch (errClone) {
        console.warn('[MinhasCifras SW] Aviso ao clonar chaves de navegação:', errClone);
      }

      console.log('[MinhasCifras SW] Precache offline concluído com sucesso!');
    })
  );
});

// Evento de Ativação: assume o controle de todos os clientes e deleta caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => {
            console.log('[MinhasCifras SW] Removendo cache legado:', key);
            return caches.delete(key);
          })
        );
      })
    ])
  );
});

// Mensagens vindas da aplicação
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Evento Fetch: Estratégias especializadas para navegação e assets estáticos
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Não intercepta chamadas de APIs externas ou streaming
  if (
    url.origin.includes('supabase.co') ||
    url.origin.includes('googleapis.com') ||
    url.origin.includes('googlevideo.com') ||
    url.origin.includes('youtube.com') ||
    url.origin.includes('youtu.be')
  ) {
    return;
  }

  // 1. Requisições de Navegação (HTML da página)
  // Estratégia: Stale-While-Revalidate com Cache Prioritário quando offline
  const isNavigate = request.mode === 'navigate' ||
                     (request.headers.get('accept') && request.headers.get('accept').includes('text/html'));

  if (isNavigate) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        // Busca o index.html previamente guardado no cache
        const cachedResponse = await cache.match('index.html') ||
                               await cache.match('./') ||
                               await cache.match('/minhascifras-web/') ||
                               await cache.match('/minhascifras-web') ||
                               await cache.match(request);

        // Se o navegador reportar que está offline e tivermos o cache, retorna imediatamente!
        if (typeof navigator !== 'undefined' && navigator.onLine === false && cachedResponse) {
          return cachedResponse;
        }

        // Tenta buscar da rede com timeout de 1.2s para atualizar o cache em background
        const networkFetch = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            cache.put(request, clone);
            cache.put('index.html', networkResponse.clone());
            cache.put('./', networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => null);

        // Se temos cache salvo, corre contra um timeout curto para não travar o Safari no iOS
        if (cachedResponse) {
          const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 1200));
          const winner = await Promise.race([networkFetch, timeoutPromise]);
          if (winner && winner.status === 200) {
            return winner;
          }
          // Se a rede demorou ou falhou, entrega o cache imediatamente (offline instantâneo!)
          return cachedResponse;
        }

        // Se não havia cache, aguarda a rede
        const finalNetworkResponse = await networkFetch;
        if (finalNetworkResponse) {
          return finalNetworkResponse;
        }

        // Fallback resiliente
        return new Response('Offline: Minhas Cifras carregando...', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      })()
    );
    return;
  }

  // 2. Arquivos de Código, CanvasKit e Assets Locais
  // Estratégia: Cache First com fallback para a rede e revalidação
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
      // Se já temos em cache, entrega instantaneamente (0ms de latência e 100% offline)
      if (cachedResponse) {
        return cachedResponse;
      }

      // Se não temos, busca na rede e armazena para as próximas vezes
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => {
        // Fallback para arquivos estáticos não encontrados offline
        return new Response('', { status: 404, statusText: 'Offline Asset Not Found' });
      });
    })
  );
});
