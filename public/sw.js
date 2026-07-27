self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  // POST/PUT等、本文(body)を持つリクエストは横取りしない。
  // e.request を fetch(e.request) で再送信し直す実装だと、大きいファイルを
  // 含むボディが失われることがある（本番でiPhoneからの証跡写真アップロードが
  // 原因不明で失敗し続けた事象で実際に確認）。このSWはキャッシュ等は一切
  // 行っていないので、GET以外は素通しにしても失うものが無い。
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;
  e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
});
