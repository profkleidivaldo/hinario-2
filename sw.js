// Service worker do Hinário - cache offline completo
const VERSION = 'hinario-v4';
const SHELL = ['./', './index.html', './hinos.json', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];

// Copia "limpa" (sem flag de redirecionamento) para poder servir em navegações offline
async function clean(r){
  if(!r.redirected) return r;
  return new Response(await r.blob(), {status: 200, statusText: 'OK', headers: r.headers});
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // não deixa um único arquivo com problema impedir a instalação do service worker
    await Promise.allSettled(SHELL.map(async u => {
      const r = await fetch(u, {cache: 'reload'});
      if (r.ok) await c.put(u, await clean(r));
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Navegação (abrir o app): sempre responde com o index em cache se estiver offline
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      try {
        const r = await fetch(req);
        if (r.ok) c.put('./index.html', (await clean(r.clone())));
        return r.redirected ? await clean(r) : r;
      } catch {
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Demais arquivos: cache primeiro, atualiza em segundo plano
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const hit = await c.match(req, {ignoreSearch: true});
    const net = fetch(req).then(async r => { if (r.ok) await c.put(req, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
