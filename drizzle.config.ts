import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit 設定。`generate` はスキーマ差分から SQL を生成するだけで DB 接続は不要。
 * `migrate` / `studio` を使う段階で DATABASE_URL（Neon）を設定する。
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://placeholder',
  },
});
