import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * テストは TanStack Start プラグイン（vite.config.ts）を通さない。
 * ドメイン・API・通知は better-sqlite3 + 純関数で完結しており、プラグインは不要かつ干渉しうる。
 * ルートのテスト（test/routes.test.tsx）が `@/` 付き import を解決できるよう alias だけ揃える。
 */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {},
});
