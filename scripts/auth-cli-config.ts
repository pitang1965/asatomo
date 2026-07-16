import { createAuth } from '../src/lib/auth';

/**
 * `npx @better-auth/cli generate` 専用の設定。スキーマ生成だけが目的で、DB へは接続しない
 * （資格情報はダミー）。生成結果を src/db/schema.ts の auth 節（プレースホルダ）に反映する。
 */
export const auth = createAuth({
  DATABASE_URL:
    process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/db',
  BETTER_AUTH_SECRET: 'cli-schema-generation-only',
  BETTER_AUTH_URL: 'http://localhost:3000',
  GOOGLE_CLIENT_ID: 'x',
  GOOGLE_CLIENT_SECRET: 'x',
  FACEBOOK_CLIENT_ID: 'x',
  FACEBOOK_CLIENT_SECRET: 'x',
  LINE_CLIENT_ID: 'x',
  LINE_CLIENT_SECRET: 'x',
});
