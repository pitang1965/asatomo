import path from 'node:path';
import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * TanStack Start（SSR + サーバールート）の開発サーバー設定。
 *   - ルートは src/routes/（ファイルベース、routeTree.gen.ts は自動生成）
 *   - /api/* はサーバールート（src/routes/api.$.tsx）で Web 標準 Request/Response を処理
 *   - D1バインディングはWorkers/Miniflareランタイム内でしか存在しないため、
 *     @cloudflare/vite-plugin（wrangler-dev.jsonc、ローカルMiniflareエミュレーション）を通す。
 *     サーバーランタイムのシークレットは .dev.vars（Miniflareが自動でprocess.envへ流し込む、
 *     nodejs_compat経由）。VITE_* のクライアント向け値はViteネイティブの.env.local読み込みに委ねる。
 * テストは vitest.config.ts（プラグインなし）で分離しており、この設定を読まない。
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  plugins: [
    cloudflare({
      configPath: 'wrangler-dev.jsonc',
      viteEnvironment: { name: 'ssr' },
    }),
    // src/server/instrument.server.ts を自動検出しworker.tsをラップする（SENTRY_DSN未設定の
    // 開発環境ではSentryは自動的に無効）。
    sentryCloudflareVitePlugin(),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
  // 認証は BETTER_AUTH_URL（5173）とオリジン一致が必須。ポートが 5174 等へ
  // 逃げると Invalid origin でログインが黙って失敗するため、固定して即失敗させる。
  // host は IPv4 で待ち受ける（既定だと ::1 のみになり、adb reverse（IPv4）が届かない。
  // ブラウザの localhost は IPv4 へフォールバックするので影響なし）。
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
});
