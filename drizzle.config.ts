import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit 設定（既定＝ローカル開発）。.env.local の DATABASE_URL（開発DB）を使う。
 * 本番へは drizzle.config.production.ts（`npm run db:migrate:prod`）からのみ触れる。
 * `generate` は差分生成のみで DB 接続不要。
 */
loadDotenv({ path: '.env.local' });

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://placeholder',
  },
});
