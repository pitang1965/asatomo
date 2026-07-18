import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * TanStack Start（SSR + サーバールート）の本番土台。
 *   - ルートは src/routes/（ファイルベース、routeTree.gen.ts は自動生成）
 *   - /api/* はサーバールート（src/routes/api.$.tsx）で Web 標準 Request/Response を処理
 *   - Cloudflare Workers への配備は @cloudflare/vite-plugin を足して行う（次段）
 * テストは vitest.config.ts（プラグインなし）で分離しており、この設定を読まない。
 */
export default defineConfig({
  plugins: [tanstackStart(), react()],
  // 認証は BETTER_AUTH_URL（5173）とオリジン一致が必須。ポートが 5174 等へ
  // 逃げると Invalid origin でログインが黙って失敗するため、固定して即失敗させる。
  // host は IPv4 で待ち受ける（既定だと ::1 のみになり、adb reverse（IPv4）が届かない。
  // ブラウザの localhost は IPv4 へフォールバックするので影響なし）。
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
});
