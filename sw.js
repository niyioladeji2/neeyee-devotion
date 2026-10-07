// Neeyee's Annual Devotion – offline support
const SHELL = 'nad-shell-v5';
const AUDIO = 'nad-audio-v1';
const FONTS = 'nad-fonts-v1';
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, AUDIO, FONTS].includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Serve a byte range from a cached full response (audio players ask for ranges)
async function rangeFrom(resp, rangeHeader) {
  const buf = await resp.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader || '');
  const size = buf.byteLength;
  let start = m && m[1] ? +m[1] : 0;
  let end = m && m[2] ? +m[2] : size - 1;
  if (m && !m[1] && m[2]) { start = size - +m[2]; end = size - 1; }
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206, statusText: 'Partial Content',
    headers: { 'Content-Type': 'audio/mp4', 'Content-Range': `bytes ${start}-${end}/${size}`,
               'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' }
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.pathname.includes('/audio/')) {
    e.respondWith((async () => {
      const cache = await caches.open(AUDIO);
      const hit = await cache.match(url.pathname);
      if (hit) return req.headers.get('range') ? rangeFrom(hit, req.headers.get('range')) : hit;
      return fetch(req);
    })());
    return;
  }

  if (url.hostname.includes('fonts.g')) {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req); if (r.ok || r.type === 'opaque') await c.put(req, r.clone()); return r;
    }));
    return;
  }

  if (url.origin === location.origin) {
    // network first for the page (to get updates), cache fallback when offline
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
      return r;
    }).catch(() => caches.match(req).then(h => h || caches.match('./index.html'))));
  }
});
