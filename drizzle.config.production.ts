import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

/**
 * 本番D1用の drizzle-kit 設定（nafuda と同じ file-per-env・staging なし）。
 * マイグレーション適用自体は `npm run db:migrate:prod`（wrangler d1 migrations apply）が行う
 * ため、ここは任意の `drizzle-kit studio` 用（本番D1をブラウザで覗く）にのみ使う。
 * `.env.production` の CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_DATABASE_ID / CLOUDFLARE_D1_TOKEN を使う。
 * ⚠ .env.production は本番の接続情報を持つ。コミットしない（.gitignore 済み）。
 */
loadDotenv({ path: '.env.production' });

export default defineConfig({
  dialect: 'sqlite',
  driver: 'd1-http',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // biome-ignore lint/style/noNonNullAssertion: db:studio用途は .env.production 必須。
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    // biome-ignore lint/style/noNonNullAssertion: db:studio用途は .env.production 必須。
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    // biome-ignore lint/style/noNonNullAssertion: db:studio用途は .env.production 必須。
    token: process.env.CLOUDFLARE_D1_TOKEN!,
  },
});
