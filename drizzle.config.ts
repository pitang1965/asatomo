import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit 設定（既定＝ローカル開発）。`generate` は差分生成のみでDB接続不要
 * （db:migrate は wrangler d1 migrations apply が行う。drizzle-kitはSQL生成専任）。
 * `db:studio` で開発D1をブラウザ確認したい場合のみ .env.local の
 * CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_DATABASE_ID(dev) / CLOUDFLARE_D1_TOKEN を使う（任意）。
 * 本番D1へは drizzle.config.production.ts からのみ触れる。
 */
loadDotenv({ path: '.env.local' });

export default defineConfig({
  dialect: 'sqlite',
  driver: 'd1-http',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    databaseId: process.env.CLOUDFLARE_DATABASE_ID ?? '',
    token: process.env.CLOUDFLARE_D1_TOKEN ?? '',
  },
});
