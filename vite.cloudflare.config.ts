import path from 'node:path';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Cloudflare Workers 配備用のビルド設定（npm run build:cf → wrangler deploy）。
 * 開発時も vite.config.ts で同じ cloudflare プラグインを使うが、configPath で
 * wrangler-dev.jsonc（開発用D1）とここ（wrangler.jsonc、本番用D1）を切り替えている。
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
  // src/db/index.ts が読む cloudflare:workers（ambient env）は、@cloudflare/vite-plugin が
  // Workers組み込みモジュールとしてネイティブに解決する。resolve.external を明示すると
  // プラグイン自身のバリデーションに弾かれるため、何も指定しない。
});
