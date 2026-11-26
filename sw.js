// 研究タスク帳 service worker: makes the app open instantly and work offline.
// When you change index.html, bump VERSION so phones pick up the new files.
const VERSION = 'v3';
const APP_CACHE = 'rtasks-app-' + VERSION;
const FONT_CACHE = 'rtasks-fonts';
const APP_FILES = [
  './',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// Hosts like Cloudflare Pages redirect /index.html to /. A redirected response
// must never be handed back for a page load, so store a clean copy instead.
async function clean(res) {
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(APP_CACHE);
    await Promise.all(APP_FILES.map(async u => {
      try {
        const r = await fetch(u, { cache: 'reload' });
        if (r.ok) await c.put(u, await clean(r));
      } catch (err) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('rtasks-app-') && k !== APP_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: keep a copy once downloaded
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // App files: show the saved copy immediately, refresh it in the background
  const isPage = req.mode === 'navigate';
  e.respondWith((async () => {
    const c = await caches.open(APP_CACHE);
    const key = isPage ? './' : req;
    const hit = await c.match(key, { ignoreSearch: true });
    const refresh = fetch(isPage ? './' : req).then(async res => {
      const ok = await clean(res);
      if (ok.ok) await c.put(key, ok.clone());
      return ok;
    });
    if (hit && !hit.redirected) { refresh.catch(() => {}); return hit; }
    try { return await refresh; }
    catch (err) { return hit || Response.error(); }
  })());
});
