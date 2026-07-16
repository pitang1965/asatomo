import { defineConfig } from 'vitest/config';

/**
 * テストは TanStack Start プラグイン（vite.config.ts）を通さない。
 * ドメイン・API・通知は pglite + 純関数で完結しており、プラグインは不要かつ干渉しうる。
 */
export default defineConfig({
  test: {},
});
