/*
 * アサトモWeb サービスワーカー — インストール可能・オフライン非対応（network-only）。
 * ADR-0010（docs/adr/0010-watch-web-pwa-installable-no-offline.md）。
 *
 * 意図的に「何もキャッシュしない」。理由:
 *   - 見守りWeb は生死に関わる安全網。近況をキャッシュして圏外で古い「元気です」を
 *     “今”として見せると、異常なのに正常に見える誤提示になる（ADR-0009 と同種のハザード）。
 *   - 認証済みページを残すとログアウト後・共有端末で残渣が出る。
 *   - 静的アセットもキャッシュしないことで「古いJSが張り付いて更新が反映されない」
 *     PWA 定番のバグを避ける。
 *
 * fetch ハンドラは存在するが respondWith を呼ばない no-op。これで
 *   (1) インストール要件（SW＋fetchハンドラ）を満たしつつ、
 *   (2) リダイレクト・range・ストリーミングはブラウザ既定のまま、
 *   (3) キャッシュを一切作らない。
 * オフライン時はブラウザ既定の「接続できません」表示になる。
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 過去に別方針でキャッシュした残渣があれば一掃する（防御的）。
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// 介入しない（素通し）。ハンドラの存在自体がインストール要件のため置く。
self.addEventListener('fetch', () => {});
