import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

/**
 * 本番DB用の drizzle-kit 設定（nafuda と同じ file-per-env・staging なし）。
 * `.env.production` の DATABASE_URL（本番）を使う。実行は `npm run db:migrate:prod` のみ。
 * ⚠ .env.production は本番の接続情報を持つ。コミットしない（.gitignore 済み）。
 */
loadDotenv({ path: '.env.production' });

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // biome-ignore lint/style/noNonNullAssertion: 本番マイグレーションは .env.production 必須。
    url: process.env.DATABASE_URL!,
  },
});
