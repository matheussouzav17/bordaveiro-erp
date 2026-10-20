const CACHE_NAME = 'bordaveiro-v2'; // Mudamos a versão para forçar a atualização

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './logo.png'
];

// 1. INSTALAÇÃO (Força a app a atualizar imediatamente)
self.addEventListener('install', (event) => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 2. ATIVAÇÃO (Limpa o lixo e versões antigas)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// 3. ESTRATÉGIA "NETWORK FIRST" (A Internet primeiro, a Cache se falhar)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    // Tenta sempre ir buscar o teu código mais recente primeiro
    fetch(event.request)
      .then((respostaDaRede) => {
        // Se a internet estiver a funcionar, guarda esta versão nova na memória
        return caches.open(CACHE_NAME).then((cache) => {
          // Não guardamos em cache os pedidos à base de dados (porta 3000)
          if (!event.request.url.includes(':3000')) {
             cache.put(event.request, respostaDaRede.clone());
          }
          return respostaDaRede;
        });
      })
      .catch(() => {
        // SE ESTIVER OFFLINE (Sem net ou se o teu servidor for abaixo), 
        // vai buscar a última versão guardada na memória!
        return caches.match(event.request);
      })
  );
});