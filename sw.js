const CACHE_NAME = 'bordaveiro-v4'; // Mudar a versão força a atualização e apaga a cache antiga

const ASSETS = [
  './',
  './index.html',
  './calculos.js',
  './script.js',
  './chat.js',
  './excel.js',
  './style.css',
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

// 2. ATIVAÇÃO (Apaga as versões antigas da cache)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames.filter((cache) => cache !== CACHE_NAME).map((cache) => caches.delete(cache))
    ))
  );
});

// 3. ESTRATÉGIA "NETWORK FIRST" só para os ficheiros da app (páginas, scripts, estilos, imagens).
// Os pedidos à API (dados de pedidos e clientes) nunca ficam guardados no browser:
// são feitos com fetch(), que chega aqui com "destination" vazio.
self.addEventListener('fetch', (event) => {
  const pedido = event.request;
  if (pedido.method !== 'GET' || !pedido.destination) return;

  event.respondWith(
    fetch(pedido)
      .then((respostaDaRede) => {
        // Links assinados do Storage (imagens dos pedidos) mudam sempre: não vale a pena guardá-los
        const daApp = new URL(pedido.url).origin === self.location.origin;
        if (respostaDaRede.ok && daApp) {
          const copia = respostaDaRede.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(pedido, copia));
        }
        return respostaDaRede;
      })
      // Sem internet (ou com o servidor em baixo): usa a última versão guardada
      .catch(() => caches.match(pedido).then((guardada) => guardada || Response.error()))
  );
});
