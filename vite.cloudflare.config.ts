import { cloudflare } from '@cloudflare/vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Cloudflare Workers 配備用のビルド設定（npm run build:cf → wrangler deploy）。
 * 開発は vite.config.ts（プラグインなし・Node 実行）のまま — adb reverse や .env の
 * 読み込みなど既存の開発フローを壊さないため、デプロイ時だけこの設定を使う。
 */
export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    react(),
  ],
});
